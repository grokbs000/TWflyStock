import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock axios to avoid real HTTP calls in tests
vi.mock("axios", () => ({
  default: vi.fn().mockResolvedValue({
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
  }),
  isAxiosError: vi.fn().mockReturnValue(false),
}));

// Mock db functions
vi.mock("./db", () => ({
  getScreenerSettings: vi.fn().mockResolvedValue(null),
  createScreenerRun: vi.fn().mockResolvedValue(1),
  insertScreenerResults: vi.fn().mockResolvedValue(undefined),
  updateScreenerRun: vi.fn().mockResolvedValue(undefined),
  createNotification: vi.fn().mockResolvedValue(undefined),
  getLatestScreenerRun: vi.fn().mockResolvedValue(null),
  getLatestScreenerResults: vi.fn().mockResolvedValue([]),
  getScreenerRunById: vi.fn().mockResolvedValue(null),
  getScreenerResultsByRunId: vi.fn().mockResolvedValue([]),
  getScreenerRunHistory: vi.fn().mockResolvedValue([]),
  getWatchlist: vi.fn().mockResolvedValue([]),
  addToWatchlist: vi.fn().mockResolvedValue(1),
  removeFromWatchlist: vi.fn().mockResolvedValue(undefined),
  isInWatchlist: vi.fn().mockResolvedValue(false),
  upsertScreenerSettings: vi.fn().mockResolvedValue(undefined),
  getNotifications: vi.fn().mockResolvedValue([]),
  getUnreadNotificationCount: vi.fn().mockResolvedValue(0),
  markNotificationRead: vi.fn().mockResolvedValue(undefined),
  markAllNotificationsRead: vi.fn().mockResolvedValue(undefined),
  deleteNotification: vi.fn().mockResolvedValue(undefined),
  toggleAutoRun: vi.fn().mockResolvedValue(undefined),
  getAllUsersWithAutoRun: vi.fn().mockResolvedValue([]),
}));

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("screener.getServiceStatus", () => {
  it("returns online status from Python service", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.screener.getServiceStatus();
    expect(result).toHaveProperty("online");
  });
});

describe("screener.getLatestResults", () => {
  it("returns empty results when no runs exist", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.screener.getLatestResults();
    expect(result).toEqual({ run: null, results: [] });
  });
});

describe("screener.getHistory", () => {
  it("returns history list with default limit", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.screener.getHistory({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("screener.getSettings", () => {
  it("returns default settings when user has no saved settings", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.screener.getSettings();
    expect(result).toMatchObject({
      maPeriods: [5, 10, 20, 40],
      vrThreshold: 120,
      vrPeriod: 26,
      isDefault: true,
    });
  });
});

describe("watchlist", () => {
  it("returns empty watchlist for new user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.watchlist.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("adds a stock to watchlist", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.watchlist.add({
      stockCode: "2330",
      stockName: "台積電",
      addedPrice: 1000,
    });
    expect(result).toEqual({ success: true, id: 1 });
  });

  it("throws CONFLICT when adding duplicate stock", async () => {
    const { isInWatchlist } = await import("./db");
    vi.mocked(isInWatchlist).mockResolvedValueOnce(true);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.watchlist.add({ stockCode: "2330", stockName: "台積電" })
    ).rejects.toThrow("股票已在觀察清單中");
  });

  it("removes a stock from watchlist", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.watchlist.remove({ stockCode: "2330" });
    expect(result).toEqual({ success: true });
  });

  it("checks if stock is in watchlist", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.watchlist.isWatching({ stockCode: "2330" });
    expect(typeof result).toBe("boolean");
  });
});

describe("notifications", () => {
  it("returns empty notifications for new user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.notifications.list({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns unread count", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.notifications.unreadCount();
    expect(typeof result).toBe("number");
  });
});

describe("notifications.markAllRead", () => {
  it("marks all notifications as read for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.notifications.markAllRead();
    expect(result).toEqual({ success: true });
  });
});

describe("notifications.delete", () => {
  it("deletes a notification by id", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.notifications.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("screener.getSettings with scanLimit", () => {
  it("returns default scanLimit of 900", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.screener.getSettings();
    expect(result).toHaveProperty("scanLimit");
    expect(result.scanLimit).toBe(900);
  });

  it("returns default autoRunEnabled as false", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.screener.getSettings();
    expect(result).toHaveProperty("autoRunEnabled");
    expect(result.autoRunEnabled).toBe(false);
  });
});

describe("auth", () => {
  it("returns null for unauthenticated user", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toMatchObject({ id: 1, name: "Test User" });
  });
});
