import {
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(strftime('%s', 'now') * 1000)`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(sql`(strftime('%s', 'now') * 1000)`).notNull(),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp_ms" }).default(sql`(strftime('%s', 'now') * 1000)`).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// 篩選條件設定
export const screenerSettings = sqliteTable("screener_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull().unique(), // Added unique for upsert
  name: text("name").notNull().default("預設設定"),
  // MA 天數 (Stored as JSON string in text column)
  maPeriods: text("maPeriods"), 
  // 成交量倍數閾值
  volumeMultiplier: real("volumeMultiplier").notNull().default(1.5),
  // VR 閾值
  vrThreshold: integer("vrThreshold").notNull().default(120),
  // VR 計算週期
  vrPeriod: integer("vrPeriod").notNull().default(26),
  // 長紅K 最小漲幅 %
  bullishCandleMinPct: real("bullishCandleMinPct").notNull().default(2.0),
  // 掃描股票數量限制（0 = 全部，預設 900）
  scanLimit: integer("scanLimit").notNull().default(900),
  // 每日自動篩選開關
  autoRunEnabled: integer("autoRunEnabled", { mode: "boolean" }).notNull().default(false),
  // 是否為預設設定
  isDefault: integer("isDefault", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(strftime('%s', 'now') * 1000)`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(sql`(strftime('%s', 'now') * 1000)`).notNull(),
});

export type ScreenerSettings = typeof screenerSettings.$inferSelect;
export type InsertScreenerSettings = typeof screenerSettings.$inferInsert;

// 篩選結果（每次執行的批次結果）
export const screenerRuns = sqliteTable("screener_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runDate: text("runDate").notNull(), // YYYY-MM-DD
  totalScanned: integer("totalScanned").notNull().default(0),
  totalMatched: integer("totalMatched").notNull().default(0),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
  errorMessage: text("errorMessage"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(strftime('%s', 'now') * 1000)`).notNull(),
  completedAt: integer("completedAt", { mode: "timestamp_ms" }),
});

export type ScreenerRun = typeof screenerRuns.$inferSelect;
export type InsertScreenerRun = typeof screenerRuns.$inferInsert;

// 個別股票篩選結果
export const screenerResults = sqliteTable("screener_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("runId").notNull(),
  stockCode: text("stockCode").notNull(),
  stockName: text("stockName").notNull(),
  currentPrice: real("currentPrice"),
  priceChange: real("priceChange"),
  priceChangePct: real("priceChangePct"),
  volume: integer("volume"),
  // 各條件是否符合
  condMaAligned: integer("condMaAligned", { mode: "boolean" }).notNull().default(false),
  condVolumeSpike: integer("condVolumeSpike", { mode: "boolean" }).notNull().default(false),
  condObvRising: integer("condObvRising", { mode: "boolean" }).notNull().default(false),
  condVrAbove: integer("condVrAbove", { mode: "boolean" }).notNull().default(false),
  condBullishBreakout: integer("condBullishBreakout", { mode: "boolean" }).notNull().default(false),
  // 指標數值
  ma5: real("ma5"),
  ma10: real("ma10"),
  ma20: real("ma20"),
  ma40: real("ma40"),
  volumeRatio: real("volumeRatio"),
  vrValue: real("vrValue"),
  obvValue: real("obvValue"),
  breakoutPrice: real("breakoutPrice"),
  // 符合條件數量
  conditionsMetCount: integer("conditionsMetCount").notNull().default(0),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(strftime('%s', 'now') * 1000)`).notNull(),
});

export type ScreenerResult = typeof screenerResults.$inferSelect;
export type InsertScreenerResult = typeof screenerResults.$inferInsert;

// 觀察清單
export const watchlist = sqliteTable("watchlist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  stockCode: text("stockCode").notNull(),
  stockName: text("stockName").notNull(),
  addedPrice: real("addedPrice"),
  note: text("note"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(strftime('%s', 'now') * 1000)`).notNull(),
});

export type Watchlist = typeof watchlist.$inferSelect;
export type InsertWatchlist = typeof watchlist.$inferInsert;

// 通知記錄
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  runId: integer("runId"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isRead: integer("isRead", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(strftime('%s', 'now') * 1000)`).notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
