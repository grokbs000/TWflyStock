// Consolidated Vercel entry point

let app: any;

export default async function handler(req: any, res: any) {
  // Baseline test path
  if (req.url?.includes("/api/debug-internal")) {
    return res.status(200).json({ 
      status: "ok", 
      source: "internal_debug_static_imports_fixed",
      time: new Date().toISOString()
    });
  }

  try {
    if (!app) {
      console.log("[Vercel] Initializing app via dynamic import...");
      const { createApp } = await import("../server/_core/index.js");
      app = await createApp();
      console.log("[Vercel] App initialized successfully.");
    }
    return app(req, res);
  } catch (err: any) {
    console.error("[Vercel] CRITICAL: Static initialization failed", err);
    res.status(500).json({
      error: "Initialization Failure",
      message: err.message,
      code: err.code || 'UNKNOWN',
      stack: err.stack,
    });
  }
}



