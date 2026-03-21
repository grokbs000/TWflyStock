import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startScreenJob, getJob, cancelJob } from "../stockEngine";
import { getDb } from "../db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export async function createApp(server?: any) {
  const app = express();

  // Configure body parser with larger size limit
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // 診斷端點
  app.get("/api/health", async (req: any, res: any) => {
    try {
      const db = await getDb();
      res.json({ status: "ok", db: "connected", env: process.env.NODE_ENV });
    } catch (e: any) {
      res.status(500).json({ 
        status: "error", 
        message: e.message, 
        stack: e.stack,
        code: e.code 
      });
    }
  });

  // ─── 篩選 API 端點
  app.post("/api/screen-start", (req: any, res: any) => {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const body = req.body || {};
    void startScreenJob(jobId, {
      maPeriods: body.maPeriods ?? [5, 10, 20, 40, 60],
      volumeMultiplier: body.volumeMultiplier ?? 1.5,
      vrThreshold: body.vrThreshold ?? 80,
      vrPeriod: body.vrPeriod ?? 26,
      bullishMinPct: body.bullishCandleMinPct ?? 2.0,
      scanLimit: body.scanLimit ?? 900,
      minConditions: body.minConditions ?? 5,
    });
    res.json({ jobId });
  });

  app.get("/api/screen-status/:jobId", (req: any, res: any) => {
    const job = getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({
      status: job.status,
      scanned: job.scanned,
      total: job.total,
      matched: job.results.length,
      totalScanned: job.scanned,
      totalMatched: job.results.length,
      results: job.status === "done" ? job.results : job.results.slice(-10),
      error: job.error,
    });
  });

  app.post("/api/screen-cancel/:jobId", (req: any, res: any) => {
    cancelJob(req.params.jobId);
    res.json({ ok: true });
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // setup environment specific middleware
  if (process.env.NODE_ENV === "development" && server) {
    await setupVite(app, server);
  } else if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    serveStatic(app);
  }

  return app;
}

// Support direct execution for local dev/prod
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain || (process.env.NODE_ENV === "development" && !process.env.VERCEL)) {
  const preferredPort = parseInt(process.env.PORT || "3000");
  findAvailablePort(preferredPort).then(async (port) => {
    const app = express(); // Placeholder, createApp will handle it
    const dummyServer = createServer(app);
    const realApp = await createApp(dummyServer);
    
    // Replace listener with the one from createApp if needed, 
    // but better to just use the one we created.
    const finalServer = createServer(realApp);

    finalServer.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  }).catch(console.error);
}
