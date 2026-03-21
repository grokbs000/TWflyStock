import {
  boolean,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// 篩選條件設定
export const screenerSettings = mysqlTable("screener_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull().default("預設設定"),
  // MA 天數
  maPeriods: json("maPeriods").$type<number[]>(),
  // 成交量倍數閾值
  volumeMultiplier: decimal("volumeMultiplier", { precision: 5, scale: 2 }).notNull().default("1.5"),
  // VR 閾值
  vrThreshold: int("vrThreshold").notNull().default(120),
  // VR 計算週期
  vrPeriod: int("vrPeriod").notNull().default(26),
  // 長紅K 最小漲幅 %
  bullishCandleMinPct: decimal("bullishCandleMinPct", { precision: 5, scale: 2 }).notNull().default("2.0"),
  // 掃描股票數量限制（0 = 全部，預設 900）
  scanLimit: int("scanLimit").notNull().default(900),
  // 每日自動篩選開關
  autoRunEnabled: boolean("autoRunEnabled").notNull().default(false),
  // 是否為預設設定
  isDefault: boolean("isDefault").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScreenerSettings = typeof screenerSettings.$inferSelect;
export type InsertScreenerSettings = typeof screenerSettings.$inferInsert;

// 篩選結果（每次執行的批次結果）
export const screenerRuns = mysqlTable("screener_runs", {
  id: int("id").autoincrement().primaryKey(),
  runDate: varchar("runDate", { length: 10 }).notNull(), // YYYY-MM-DD
  totalScanned: int("totalScanned").notNull().default(0),
  totalMatched: int("totalMatched").notNull().default(0),
  status: mysqlEnum("status", ["running", "completed", "failed"]).notNull().default("running"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type ScreenerRun = typeof screenerRuns.$inferSelect;
export type InsertScreenerRun = typeof screenerRuns.$inferInsert;

// 個別股票篩選結果
export const screenerResults = mysqlTable("screener_results", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  stockCode: varchar("stockCode", { length: 10 }).notNull(),
  stockName: varchar("stockName", { length: 64 }).notNull(),
  currentPrice: decimal("currentPrice", { precision: 10, scale: 2 }),
  priceChange: decimal("priceChange", { precision: 10, scale: 2 }),
  priceChangePct: decimal("priceChangePct", { precision: 8, scale: 4 }),
  volume: int("volume"),
  // 各條件是否符合
  condMaAligned: boolean("condMaAligned").notNull().default(false),
  condVolumeSpike: boolean("condVolumeSpike").notNull().default(false),
  condObvRising: boolean("condObvRising").notNull().default(false),
  condVrAbove: boolean("condVrAbove").notNull().default(false),
  condBullishBreakout: boolean("condBullishBreakout").notNull().default(false),
  // 指標數值
  ma5: decimal("ma5", { precision: 10, scale: 2 }),
  ma10: decimal("ma10", { precision: 10, scale: 2 }),
  ma20: decimal("ma20", { precision: 10, scale: 2 }),
  ma40: decimal("ma40", { precision: 10, scale: 2 }),
  volumeRatio: decimal("volumeRatio", { precision: 8, scale: 4 }),
  vrValue: decimal("vrValue", { precision: 8, scale: 2 }),
  obvValue: decimal("obvValue", { precision: 20, scale: 2 }),
  breakoutPrice: decimal("breakoutPrice", { precision: 10, scale: 2 }),
  // 符合條件數量
  conditionsMetCount: int("conditionsMetCount").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScreenerResult = typeof screenerResults.$inferSelect;
export type InsertScreenerResult = typeof screenerResults.$inferInsert;

// 觀察清單
export const watchlist = mysqlTable("watchlist", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  stockCode: varchar("stockCode", { length: 10 }).notNull(),
  stockName: varchar("stockName", { length: 64 }).notNull(),
  addedPrice: decimal("addedPrice", { precision: 10, scale: 2 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Watchlist = typeof watchlist.$inferSelect;
export type InsertWatchlist = typeof watchlist.$inferInsert;

// 通知記錄
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  runId: int("runId"),
  title: varchar("title", { length: 256 }).notNull(),
  content: text("content").notNull(),
  isRead: boolean("isRead").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
