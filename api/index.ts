let app: any;

export default async function handler(req: any, res: any) {
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


