console.log("[server/_core/index.ts] Module loading started...");
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
  const isVercel = !!process.env.VERCEL;
  console.log("[createApp] Starting initialization...", { isVercel });
  
  const app = express();

  // Configure body parser
  console.log("[createApp] Configuring body parser...");
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // OAuth routes
  console.log("[createApp] Registering OAuth routes...");
  registerOAuthRoutes(app);

  // Health check
  console.log("[createApp] Registering health check...");
  app.get("/api/health", async (req: any, res: any) => {
    try {
      const db = await getDb();
      res.json({ status: "ok", db: "connected", env: process.env.NODE_ENV, vercel: isVercel });
    } catch (e: any) {
      console.error("[Health] DB error:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // Screening endpoints
  console.log("[createApp] Registering screening endpoints...");
  app.post("/api/screen-start", (req: any, res: any) => {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const body = req.body || {};
    // Ensure error handling for the floating promise
    startScreenJob(jobId, {
      maPeriods: body.maPeriods ?? [5, 10, 20, 40, 60],
      volumeMultiplier: body.volumeMultiplier ?? 1.5,
      vrThreshold: body.vrThreshold ?? 80,
      vrPeriod: body.vrPeriod ?? 26,
      bullishMinPct: body.bullishCandleMinPct ?? 2.0,
      scanLimit: body.scanLimit ?? 900,
      minConditions: body.minConditions ?? 5,
    }).catch(err => console.error(`[Job ${jobId}] Failed:`, err));
    
    res.json({ jobId });
  });

  app.get("/api/screen-status/:jobId", (req: any, res: any) => {
    const job = getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({
      status: job.status,
      scanned: job.scanned,
      total: job.total,
      matched: job.results.length,
      error: job.error,
    });
  });

  app.post("/api/screen-cancel/:jobId", (req: any, res: any) => {
    cancelJob(req.params.jobId);
    res.json({ ok: true });
  });

  // tRPC
  console.log("[createApp] Registering tRPC...");
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // environment specific
  if (process.env.NODE_ENV === "development" && server) {
    console.log("[createApp] Setting up Vite (Dev Mode)...");
    await setupVite(app, server);
  } else if (!isVercel) {
    // Only serve static if NOT on Vercel (Vercel handles this itself)
    console.log("[createApp] Setting up serveStatic (Production Mode)...");
    serveStatic(app);
  } else {
    console.log("[createApp] Skipping serveStatic (Vercel Mode)...");
  }

  console.log("[createApp] Initialization complete.");
  return app;
}


// Support direct execution for local dev/prod
// Support direct execution for local dev/prod
const isVercel = !!process.env.VERCEL;
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (!isVercel && (isMain || process.env.NODE_ENV === "development")) {
  const preferredPort = parseInt(process.env.PORT || "3000");
  findAvailablePort(preferredPort).then(async (port) => {
    const app = express();
    const dummyServer = createServer(app);
    const realApp = await createApp(dummyServer);
    const finalServer = createServer(realApp);

    finalServer.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  }).catch(console.error);
}

