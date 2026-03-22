export const ENV = {
  appId: process.env.VITE_APP_ID ?? process.env.APP_ID ?? "tw_stock_screener",
  cookieSecret: process.env.JWT_SECRET ?? process.env.COOKIE_SECRET ?? "default_secret_change_me",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL || "https://manus.computer",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
