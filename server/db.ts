import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertNotification,
  InsertScreenerResult,
  InsertScreenerRun,
  InsertScreenerSettings,
  InsertUser,
  InsertWatchlist,
  notifications,
  screenerResults,
  screenerRuns,
  screenerSettings,
  users,
  watchlist,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Screener Runs ───────────────────────────────────────────────────────────

export async function createScreenerRun(data: InsertScreenerRun) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(screenerRuns).values(data);
  return result[0].insertId;
}

export async function updateScreenerRun(
  id: number,
  data: Partial<{ totalScanned: number; totalMatched: number; status: "running" | "completed" | "failed"; errorMessage: string; completedAt: Date }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(screenerRuns).set(data).where(eq(screenerRuns.id, id));
}

export async function getLatestScreenerRun() {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(screenerRuns).orderBy(desc(screenerRuns.createdAt)).limit(1);
  return result[0] ?? null;
}

export async function getScreenerRunHistory(limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(screenerRuns).orderBy(desc(screenerRuns.createdAt)).limit(limit);
}

export async function getScreenerRunById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(screenerRuns).where(eq(screenerRuns.id, id)).limit(1);
  return result[0] ?? null;
}

// ─── Screener Results ─────────────────────────────────────────────────────────

export async function insertScreenerResults(results: InsertScreenerResult[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (results.length === 0) return;
  await db.insert(screenerResults).values(results);
}

export async function getScreenerResultsByRunId(runId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(screenerResults)
    .where(eq(screenerResults.runId, runId))
    .orderBy(desc(screenerResults.conditionsMetCount));
}

export async function getLatestScreenerResults() {
  const db = await getDb();
  if (!db) return [];
  const latestRun = await getLatestScreenerRun();
  if (!latestRun || latestRun.status !== "completed") return [];
  return getScreenerResultsByRunId(latestRun.id);
}

// ─── Screener Settings ────────────────────────────────────────────────────────

export async function getScreenerSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(screenerSettings)
    .where(and(eq(screenerSettings.userId, userId), eq(screenerSettings.isDefault, true)))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertScreenerSettings(userId: number, data: Partial<InsertScreenerSettings>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await getScreenerSettings(userId);
  if (existing) {
    await db.update(screenerSettings).set(data).where(eq(screenerSettings.id, existing.id));
    return existing.id;
  } else {
    const result = await db.insert(screenerSettings).values({
      userId,
      isDefault: true,
      ...data,
    });
    return result[0].insertId;
  }
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

export async function getWatchlist(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(watchlist)
    .where(eq(watchlist.userId, userId))
    .orderBy(desc(watchlist.createdAt));
}

export async function addToWatchlist(data: InsertWatchlist) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(watchlist).values(data);
  return result[0].insertId;
}

export async function removeFromWatchlist(userId: number, stockCode: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(watchlist)
    .where(and(eq(watchlist.userId, userId), eq(watchlist.stockCode, stockCode)));
}

export async function isInWatchlist(userId: number, stockCode: string) {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select()
    .from(watchlist)
    .where(and(eq(watchlist.userId, userId), eq(watchlist.stockCode, stockCode)))
    .limit(1);
  return result.length > 0;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(data);
}

export async function getNotifications(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return Number(result[0]?.count ?? 0);
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
}

export async function deleteNotification(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

// 取得所有開啟自動篩選的用戶
export async function getUsersWithAutoRun() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ userId: screenerSettings.userId })
    .from(screenerSettings)
    .where(and(eq(screenerSettings.isDefault, true), eq(screenerSettings.autoRunEnabled, true)));
}

export async function toggleAutoRun(userId: number, enabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await getScreenerSettings(userId);
  if (existing) {
    await db.update(screenerSettings).set({ autoRunEnabled: enabled }).where(eq(screenerSettings.id, existing.id));
  } else {
    await db.insert(screenerSettings).values({ userId, isDefault: true, autoRunEnabled: enabled });
  }
}
