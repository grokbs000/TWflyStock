let app: any;

export default async function handler(req: any, res: any) {
  // Baseline test path - bypasses all imports
  if (req.url?.includes("/api/debug-internal")) {
    return res.status(200).json({ 
      status: "ok", 
      source: "internal_debug_no_static_imports",
      time: new Date().toISOString()
    });
  }

  try {
    if (!app) {
      console.log("[Vercel] Dynamically importing createApp...");
      // Using an absolute-style relative path to ensure the bundler picks it up
      const { createApp } = await import("../server/_core/index.js");
      console.log("[Vercel] Calling createApp...");
      app = await createApp();
      console.log("[Vercel] App initialized successfully.");
    }
    return app(req, res);
  } catch (err: any) {
    console.error("[Vercel] CRITICAL: Dynamic initialization failed", err);
    res.status(500).json({
      error: "Initialization Failure",
      message: err.message,
      code: err.code || 'UNKNOWN',
      stack: err.stack,
    });
  }
}






