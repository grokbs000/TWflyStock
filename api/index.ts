let app: any;

export default async function handler(req: any, res: any) {
  // 1. 基線測試：已確認正常
  if (req.url?.includes("/api/debug-internal")) {
    return res.status(200).json({ status: "ok", source: "internal_debug_no_imports" });
  }

  // 2. 逐一排查測試：找出哪個模組崩潰
  if (req.url?.includes("/api/debug-imports")) {
    const results: any = {};
    try {
      results.step = "Checking DB...";
      await import("../server/db");
      results.db = "LOADED";
      
      results.step = "Checking Stock Engine...";
      await import("../server/stockEngine");
      results.stockEngine = "LOADED";

      results.step = "Checking OAuth...";
      await import("../server/_core/oauth");
      results.oauth = "LOADED";

      results.step = "Checking System Router...";
      await import("../server/_core/systemRouter");
      results.systemRouter = "LOADED";
      
      results.step = "Checking App Router...";
      await import("../server/routers");
      results.appRouter = "LOADED";

      return res.status(200).json({ status: "all_imports_passed", results });
    } catch (err: any) {
      return res.status(500).json({ 
        status: "import_failed", 
        step: results.step, 
        message: err.message, 
        stack: err.stack 
      });
    }
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




