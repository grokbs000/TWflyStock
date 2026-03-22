import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth.js";
import { appRouter } from "../routers.js";
import { createContext } from "./context.js";
import { serveStatic, setupVite } from "./vite.js";
import { startScreenJob, getJob, cancelJob } from "../stockEngine.js";
import { getDb, createScreenerRun, getScreenerRunById, getScreenerResultsByRunId, GUEST_USER } from "../db.js";
import { sdk } from "./sdk.js";

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
  
  const app = express();

  // Configure body parser
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // OAuth routes
  registerOAuthRoutes(app);

  // Health check
  app.get("/api/health", async (req: any, res: any) => {
    try {
      await getDb();
      res.json({ status: "ok", db: "connected", env: process.env.NODE_ENV, vercel: isVercel });
    } catch (e: any) {
      console.error("[Health] DB error:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // Screening endpoints
  app.post("/api/screen-start", async (req: any, res: any) => {
    const body = req.body || {};
    const today = new Date().toISOString().split("T")[0];
    
    // Authenticate user for notifications
    let userId: number = GUEST_USER.id;
    try {
      const user = await sdk.authenticateRequest(req);
      if (user) userId = user.id;
    } catch { /* fallback to guest */ }

    // Create a run in the database
    const runId = await createScreenerRun({
      runDate: today,
      status: "running",
    });

    const jobId = `run-${runId}-${Date.now()}`;
    
    const jobPromise = startScreenJob(runId, {
      maPeriods: body.maPeriods ?? [5, 10, 20, 40, 60],
      volumeMultiplier: body.volumeMultiplier ?? 1.5,
      vrThreshold: body.vrThreshold ?? 80,
      vrPeriod: body.vrPeriod ?? 26,
      bullishMinPct: body.bullishCandleMinPct ?? 2.0,
      scanLimit: body.scanLimit ?? 900,
      minConditions: body.minConditions ?? 5,
    }, userId).catch(err => {
      console.error(`[Job ${jobId}] Failed:`, err);
    });

    // Use Vercel's waitUntil to keep the function alive if supported
    if ((req as any).waitUntil) {
      console.log(`[Vercel] Using waitUntil for Job ${jobId}`);
      (req as any).waitUntil(jobPromise);
    } else {
      console.log(`[Local] Running Job ${jobId} in background`);
      // In local dev, we just let it run
    }
    
    res.json({ jobId, runId });
  });

  app.get("/api/screen-status/:jobId", async (req: any, res: any) => {
    const jobId = req.params.jobId;
    // Extract runId from jobId (format: run-ID-timestamp or job-ID-...)
    const runIdMatch = jobId.match(/run-(\d+)-/);
    const runId = runIdMatch ? parseInt(runIdMatch[1]) : null;

    if (!runId) {
      return res.status(404).json({ error: "Invalid Job ID format" });
    }

    const run = await getScreenerRunById(runId);
    if (!run) return res.status(404).json({ error: "Job not found in database" });

    // Map DB status to what frontend expects
    const statusMap: Record<string, string> = {
      "running": "running",
      "completed": "done",
      "failed": "error"
    };

    const results = run.status === "completed" ? await getScreenerResultsByRunId(runId) : [];
    // For live matches, we'd need to query the latest ones if still running
    const matches = run.status === "running" ? await getScreenerResultsByRunId(runId) : results;

    res.json({
      status: statusMap[run.status] || "error",
      scanned: run.totalScanned,
      total: (run as any).totalToScan || 900, // Use the new totalToScan field
      matched: run.totalMatched,
      matches: matches.slice(-3),
      results: run.status === "completed" ? results : undefined,
      totalScanned: run.totalScanned,
      totalMatched: run.totalMatched,
      timestamp: new Date().toISOString(),
      error: run.errorMessage,
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

