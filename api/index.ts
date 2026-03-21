import { createApp } from "../server/_core/index";

let app: any;

export default async function handler(req: any, res: any) {
  try {
    if (!app) {
      console.log("[Vercel] Initializing app...");
      app = await createApp();
    }
    return app(req, res);
  } catch (err: any) {
    console.error("[Vercel] CRITICAL: App initialization failed", err);
    res.status(500).json({
      error: "Internal Server Error during initialization",
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
}

