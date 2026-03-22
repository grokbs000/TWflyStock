let app: any;

export default async function handler(req: any, res: any) {
  // 1. 最小化測試：如果不依賴 server/ 代碼就能運作，說明問題在 import
  if (req.url?.includes("/api/debug-internal")) {
    return res.status(200).json({
      status: "ok",
      source: "internal_debug_no_imports",
      time: new Date().toISOString(),
      env_vercel: !!process.env.VERCEL
    });
  }

  try {
    if (!app) {
      console.log("[Vercel] Initializing app dynamically...");
      const { createApp } = await import("../server/_core/index");
      app = await createApp();
    }
    return app(req, res);
  } catch (err: any) {
    console.error("[Vercel] CRITICAL: App initialization failed", err);
    res.status(500).json({
      error: "Internal Server Error during initialization",
      message: err.message,
      stack: err.stack,
    });
  }
}



