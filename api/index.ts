import { createApp } from "../server/_core/index";

let app: any;

export default async function handler(req: any, res: any) {
  // 基線測試路徑
  if (req.url?.includes("/api/debug-internal")) {
    return res.status(200).json({ status: "ok", source: "internal_debug_static_imports" });
  }

  try {
    if (!app) {
      console.log("[Vercel] Initializing app statically...");
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





