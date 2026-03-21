import "dotenv/config";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../drizzle/schema";
import { users, screenerSettings, screenerResults, screenerRuns, notifications, watchlist } from "../drizzle/schema";
import { eq, desc, and, count } from "drizzle-orm";

let _db: any = null;

export async function getDb() {
  if (!_db) {
    const dbPath = process.env.DATABASE_URL || "sqlite.db";
    try {
      const sqlite = new Database(dbPath);
      sqlite.pragma("journal_mode = WAL");
      _db = drizzle(sqlite);
      console.log(`[Database] Connected to local SQLite (${dbPath})`);
      await initDb(_db);
    } catch (error) {
      console.error("[Database] Failed to connect to SQLite:", error);
      throw error;
    }
  }
  return _db;
}

async function initDb(db: any) {
  try {
    await db.insert(users).values({
      id: 1,
      name: "訪客使用者",
      email: "guest@example.com",
      openId: "guest-user",
      role: "admin",
    }).onConflictDoNothing();

    await db.insert(screenerSettings).values({
      userId: 1,
      name: "預設設定",
      isDefault: true,
      scanLimit: 900,
      maPeriods: JSON.stringify([5, 10, 20, 40]),
    }).onConflictDoNothing();
    
    console.log("[Database] Initialization complete (Guest user & settings)");
  } catch (error) {
    console.error("[Database] Initialization failed:", error);
  }
}

export const GUEST_USER = {
  id: 1,
  openId: "guest-user",
  name: "訪客使用者",
  email: "guest@example.com",
  role: "admin",
} as const;

// --- User Operations ---
export async function upsertUser(data: any) {
  const db = await getDb();
  return db.insert(users).values(data).onConflictDoUpdate({
    target: users.openId,
    set: data,
  }).returning();
}

export async function getUserById(id: number) {
  const db = await getDb();
  const results = await db.select().from(users).where(eq(users.id, id));
  return results[0] || null;
}

export async function getUsersWithAutoRun() {
  const db = await getDb();
  return db.select().from(users);
}

// --- Screener Settings ---
export async function getScreenerSettings(userId: number) {
  const db = await getDb();
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
  const insertData = {
    ...data,
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
  return db.update(screenerSettings).set({ autoRunEnabled: enabled }).where(eq(screenerSettings.userId, userId));
}

// --- Screener Runs ---
export async function createScreenerRun(data: any) {
  const db = await getDb();
  const res = await db.insert(screenerRuns).values({
    ...data,
    createdAt: new Date(),
  }).returning();
  return res[0].id;
}

export async function updateScreenerRun(id: number, data: any) {
  const db = await getDb();
  return db.update(screenerRuns).set(data).where(eq(screenerRuns.id, id));
}

export async function getLatestScreenerRun() {
  const db = await getDb();
  const results = await db.select().from(screenerRuns).orderBy(desc(screenerRuns.createdAt)).limit(1);
  return results[0] || null;
}

export async function getScreenerRunById(id: number) {
  const db = await getDb();
  const results = await db.select().from(screenerRuns).where(eq(screenerRuns.id, id));
  return results[0] || null;
}

export async function getScreenerRunHistory(limit = 30) {
  const db = await getDb();
  return db.select().from(screenerRuns).orderBy(desc(screenerRuns.createdAt)).limit(limit);
}

// --- Screener Results ---
export async function insertScreenerResults(data: any[]) {
  const db = await getDb();
  const chunkSize = 50;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    // Ensure all objects in the chunk have the same keys for better-sqlite3 consistency
    await db.insert(screenerResults).values(chunk);
  }
}

export async function getLatestScreenerResults() {
  const db = await getDb();
  const latestRun = await getLatestScreenerRun();
  if (!latestRun) return [];
  return db.select().from(screenerResults).where(eq(screenerResults.runId, latestRun.id));
}

export async function getScreenerResultsByRunId(runId: number) {
  const db = await getDb();
  return db.select().from(screenerResults).where(eq(screenerResults.runId, runId));
}

// --- Notifications ---
export async function createNotification(data: any) {
  const db = await getDb();
  return db.insert(notifications).values({
    ...data,
    isRead: false,
    createdAt: new Date(),
  }).returning();
}

export async function getNotifications(userId: number, limit = 50) {
  const db = await getDb();
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  const res = await db.select({ count: count() }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return Number(res[0]?.count || 0);
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  return db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}

export async function updateNotificationRead(id: number, isRead: boolean) {
  const db = await getDb();
  return db.update(notifications).set({ isRead }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  return db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}

export async function deleteNotification(id: number, _userId?: number) {
  const db = await getDb();
  // We ignore userId for now as id is unique enough
  return db.delete(notifications).where(eq(notifications.id, id));
}

// --- Watchlist ---
export async function addToWatchlist(data: any) {
  const db = await getDb();
  const res = await db.insert(watchlist).values({
    ...data,
    createdAt: new Date(),
  }).onConflictDoNothing().returning();
  return res[0]?.id;
}

export async function removeFromWatchlist(userId: number, stockCode: string) {
  const db = await getDb();
  return db.delete(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.stockCode, stockCode)));
}

export async function getWatchlist(userId: number) {
  const db = await getDb();
  return db.select().from(watchlist).where(eq(watchlist.userId, userId));
}

export async function isInWatchlist(userId: number, stockCode: string) {
  const db = await getDb();
  const results = await db.select().from(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.stockCode, stockCode)));
  return results.length > 0;
}
