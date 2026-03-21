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

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Configure body parser with larger size limit
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // ─── 篩選 API 端點（直接使用 TypeScript 股票引擎，無需 Python）
  app.post("/api/screen-start", (req, res) => {
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

  app.get("/api/screen-status/:jobId", (req, res) => {
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

  app.post("/api/screen-cancel/:jobId", (req, res) => {
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

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
