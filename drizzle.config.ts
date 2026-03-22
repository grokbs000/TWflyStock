import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./api/drizzle/schema.ts",
  out: "./api/drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "sqlite.db",
  },
});
