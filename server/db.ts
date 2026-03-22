import * as schema from "../drizzle/schema.js";
import fs from "node:fs";
import path from "node:path";
import { users, screenerSettings, screenerResults, screenerRuns, notifications, watchlist } from "../drizzle/schema.js";
import { eq, desc, and, count, sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _db: any = null;
let LibSQL: any = null;
let DrizzleLib: any = null;

async function loadDbLibs() {
  if (!LibSQL || !DrizzleLib) {
    try {
      LibSQL = await import("@libsql/client");
      DrizzleLib = await import("drizzle-orm/libsql");
    } catch (e) {
      console.error("[Database] Failed to load DB libraries:", e);
      throw e;
    }
  }
}

export async function getDb() {
  if (_db === "FAILED") return null;
  if (!_db) {
    let dbUrl = process.env.DATABASE_URL || "file:sqlite.db";
    const isVercel = !!process.env.VERCEL;

    if (isVercel) {
      // Only use fallback if it's not a remote LibSQL URL
      const isRemote = dbUrl.startsWith("libsql://") || dbUrl.startsWith("https://") || dbUrl.startsWith("http://");
      
      if (!isRemote) {
        const tmpPath = path.join("/tmp", "sqlite.db");
        if (!fs.existsSync(tmpPath)) {
          try {
            // More robust path resolution using __dirname
            const srcPath = path.resolve(__dirname, "..", "data", "sqlite.db");
            if (fs.existsSync(srcPath)) {
              fs.copyFileSync(srcPath, tmpPath);
              fs.chmodSync(tmpPath, 0o666);
              console.log("[Database] Copied bundled DB to /tmp from", srcPath);
            } else {
              console.warn("[Database] Source DB NOT FOUND at", srcPath);
              // Try process.cwd fallback
              const fallbackPath = path.resolve(process.cwd(), "data/sqlite.db");
              if (fs.existsSync(fallbackPath)) {
                fs.copyFileSync(fallbackPath, tmpPath);
                fs.chmodSync(tmpPath, 0o666);
                console.log("[Database] Copied bundled DB to /tmp from fallback", fallbackPath);
              }
            }
          } catch (e) {
            console.error("[Database] Failed to setup /tmp DB:", e);
          }
        }
        dbUrl = `file:${tmpPath}`;
      }
    }


    try {
      await loadDbLibs();
      const client = LibSQL.createClient({ url: dbUrl });
      _db = DrizzleLib.drizzle(client, { schema });
      
      const isRemote = dbUrl.startsWith("libsql://") || dbUrl.startsWith("https://") || dbUrl.startsWith("http://");
      console.log(`[Database] Connected to ${isRemote ? "Remote" : "Local"} LibSQL (${dbUrl})`);
      
      if (isVercel && !isRemote) {
        console.warn("[Database] WARNING: Running on Vercel with a local SQLite database.");
      }

      // Always ensure basic entities exist (idempotent)
      // This also serves as a schema check
      await initDb(_db);
      console.log("[Database] Initialization & Schema check: OK");
    } catch (error) {
      console.error("[Database] CRITICAL: Failed to connect to LibSQL:", error);
      _db = "FAILED";
      return null;
    }
  }
  return _db;
}

async function initDb(db: any) {
  try {
    console.log("[Database] Running schema recovery...");
    
    // Core Schema Setup (Idempotent)
    await db.run(sql`CREATE TABLE IF NOT EXISTS "users" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "openId" text NOT NULL,
        "name" text,
        "email" text,
        "loginMethod" text,
        "role" text DEFAULT 'user' NOT NULL,
        "createdAt" integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
        "updatedAt" integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
        "lastSignedIn" integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
    )`);
    await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "users_openId_unique" ON "users" ("openId")`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS "screener_settings" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "name" text DEFAULT '預設設定' NOT NULL,
        "maPeriods" text,
        "volumeMultiplier" real DEFAULT 1.5 NOT NULL,
        "vrThreshold" integer DEFAULT 120 NOT NULL,
        "vrPeriod" integer DEFAULT 26 NOT NULL,
        "bullishCandleMinPct" real DEFAULT 2.0 NOT NULL,
        "scanLimit" integer DEFAULT 0 NOT NULL,
        "autoRunEnabled" integer DEFAULT false NOT NULL,
        "isDefault" integer DEFAULT false NOT NULL,
        "createdAt" integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
        "updatedAt" integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
    )`);
    await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "screener_settings_userId_unique" ON "screener_settings" ("userId")`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS "screener_runs" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "runDate" text NOT NULL,
        "totalToScan" integer DEFAULT 0 NOT NULL,
        "totalScanned" integer DEFAULT 0 NOT NULL,
        "totalMatched" integer DEFAULT 0 NOT NULL,
        "status" text DEFAULT 'running' NOT NULL,
        "errorMessage" text,
        "createdAt" integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
        "completedAt" integer
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS "screener_results" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "runId" integer NOT NULL,
        "stockCode" text NOT NULL,
        "stockName" text NOT NULL,
        "currentPrice" real,
        "priceChange" real,
        "priceChangePct" real,
        "volume" integer,
        "condMaAligned" integer DEFAULT false NOT NULL,
        "condVolumeSpike" integer DEFAULT false NOT NULL,
        "condObvRising" integer DEFAULT false NOT NULL,
        "condVrAbove" integer DEFAULT false NOT NULL,
        "condBullishBreakout" integer DEFAULT false NOT NULL,
        "ma5" real,
        "ma10" real,
        "ma20" real,
        "ma40" real,
        "volumeRatio" real,
        "vrValue" real,
        "obvValue" real,
        "breakoutPrice" real,
        "conditionsMetCount" integer DEFAULT 0 NOT NULL,
        "createdAt" integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS "watchlist" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "stockCode" text NOT NULL,
        "stockName" text NOT NULL,
        "addedPrice" real,
        "note" text,
        "createdAt" integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS "notifications" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "runId" integer,
        "title" text NOT NULL,
        "content" text NOT NULL,
        "isRead" integer DEFAULT false NOT NULL,
        "createdAt" integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
    )`);

    // Ensure guest user (id=1)
    await db.run(sql`
      INSERT OR IGNORE INTO "users" ("id", "name", "email", "openId", "role") 
      VALUES (1, '訪客使用者', 'guest@example.com', 'guest-user', 'admin')
    `);

    // Ensure default settings for guest (id=1)
    await db.run(sql`
      INSERT OR IGNORE INTO "screener_settings" ("userId", "name", "isDefault", "scanLimit", "maPeriods")
      VALUES (1, '預設設定', 1, 0, '[5, 10, 20, 40]')
    `);

    console.log("[Database] Schema recovery & Guest init: OK");
  } catch (error) {
    console.error("[Database] Schema recovery failed:", error);
  }
}

export const GUEST_USER = {
  id: 1,
  openId: "guest-user",
  name: "訪客使用者",
  email: "guest@example.com",
  role: "admin" as const,
  loginMethod: "guest",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
} as const;

// --- User Operations ---
export async function upsertUser(data: any) {
  const db = await getDb();
  if (!db) return [];
  const { id: _, ...insertData } = data;
  return db.insert(users).values(insertData).onConflictDoUpdate({
    target: users.openId,
    set: insertData,
  }).returning();
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return id === 1 ? GUEST_USER : null;
  const results = await db.select().from(users).where(eq(users.id, id));
  return results[0] || null;
}

export async function getUsersWithAutoRun() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users);
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return openId === "guest-user" ? GUEST_USER : null;
  const results = await db.select().from(users).where(eq(users.openId, openId));
  return results[0] || null;
}

// --- Screener Settings ---
export async function getScreenerSettings(userId: number) {
  const db = await getDb();
  if (!db) return { userId, name: "預設設定", isDefault: true, scanLimit: 0, maPeriods: [5, 10, 20, 40] };
  const results = await db.select().from(screenerSettings).where(eq(screenerSettings.userId, userId));
  const settings = results[0];
  if (settings && typeof settings.maPeriods === "string") {
    try {
      settings.maPeriods = JSON.parse(settings.maPeriods);
    } catch (e) {
      settings.maPeriods = [5, 10, 20, 40];
    }
  }
  return settings || null;
}

export async function upsertScreenerSettings(userId: number, data: any) {
  const db = await getDb();
  if (!db) return [];
  const { id: _, ...rest } = data;
  const insertData = {
    ...rest,
    userId,
    maPeriods: Array.isArray(data.maPeriods) ? JSON.stringify(data.maPeriods) : JSON.stringify(data.maPeriods || [5, 10, 20, 40]),
  };
  
  return db.insert(screenerSettings).values(insertData).onConflictDoUpdate({
    target: screenerSettings.userId,
    set: insertData,
  }).returning();
}

export async function toggleAutoRun(userId: number, enabled: boolean) {
  const db = await getDb();
  if (!db) return;
  return db.update(screenerSettings).set({ autoRunEnabled: enabled }).where(eq(screenerSettings.userId, userId));
}

// --- Screener Runs ---
export async function createScreenerRun(data: any) {
  const db = await getDb();
  if (!db) return Date.now(); // jobId fallback
  
  console.log("[Database] Creating screener run (Raw SQL)...", { runDate: data.runDate, status: data.status });
  
  const now = new Date().getTime();
  const status = data.status || "running";
  
  // Use raw SQL to completely bypass Drizzle's column-filling logic
  await db.run(sql`
    INSERT INTO "screener_runs" ("runDate", "totalToScan", "totalScanned", "totalMatched", "status", "createdAt")
    VALUES (${data.runDate}, ${data.totalToScan || 0}, 0, 0, ${status}, ${now})
  `);
  
  // Get the last inserted ID
  const lastIdRes = await db.run(sql`SELECT last_insert_rowid() as id`);
  const runId = Number(lastIdRes.rows[0].id);
  
  console.log("[Database] Screener run created, ID:", runId);
  return runId;
}

export async function updateScreenerRun(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  return db.update(screenerRuns).set(data).where(eq(screenerRuns.id, id));
}

export async function getLatestScreenerRun() {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(screenerRuns).orderBy(desc(screenerRuns.createdAt)).limit(1);
  return results[0] || null;
}

export async function getScreenerRunById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(screenerRuns).where(eq(screenerRuns.id, id));
  return results[0] || null;
}

export async function getScreenerRunHistory(limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(screenerRuns).orderBy(desc(screenerRuns.createdAt)).limit(limit);
}

// --- Screener Results ---
export async function insertScreenerResults(data: any[]) {
  const db = await getDb();
  if (!db) return;
  const chunkSize = 50;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize).map(item => {
      const { id: _, ...rest } = item;
      return rest;
    });
    // Ensure all objects in the chunk have the same keys for better-sqlite3 consistency
    await db.insert(screenerResults).values(chunk);
  }
}

export async function getLatestScreenerResults() {
  const db = await getDb();
  if (!db) return [];
  const latestRun = await getLatestScreenerRun();
  if (!latestRun) return [];
  return db.select().from(screenerResults).where(eq(screenerResults.runId, latestRun.id));
}

export async function getScreenerResultsByRunId(runId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(screenerResults).where(eq(screenerResults.runId, runId));
}

// --- Notifications ---
export async function createNotification(data: any) {
  const db = await getDb();
  if (!db) return [];
  const { id: _, ...insertData } = data;
  return db.insert(notifications).values({
    ...insertData,
    isRead: false,
    createdAt: new Date(),
  }).returning();
}

export async function getNotifications(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const res = await db.select({ count: count() }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return Number(res[0]?.count || 0);
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) return;
  return db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}

export async function updateNotificationRead(id: number, isRead: boolean) {
  const db = await getDb();
  if (!db) return;
  return db.update(notifications).set({ isRead }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  return db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}

export async function deleteNotification(id: number, _userId?: number) {
  const db = await getDb();
  if (!db) return;
  // We ignore userId for now as id is unique enough
  return db.delete(notifications).where(eq(notifications.id, id));
}

// --- Watchlist ---
export async function addToWatchlist(data: any) {
  const db = await getDb();
  if (!db) return null;
  const { id: _, ...rest } = data;
  const res = await db.insert(watchlist).values({
    ...rest,
    createdAt: new Date(),
  }).onConflictDoNothing().returning();
  return res[0]?.id;
}

export async function removeFromWatchlist(userId: number, stockCode: string) {
  const db = await getDb();
  if (!db) return;
  return db.delete(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.stockCode, stockCode)));
}

export async function getWatchlist(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(watchlist).where(eq(watchlist.userId, userId));
}

export async function isInWatchlist(userId: number, stockCode: string) {
  const db = await getDb();
  if (!db) return false;
  const results = await db.select().from(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.stockCode, stockCode)));
  return results.length > 0;
}
