import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  cancelJob,
  getChartData,
  getJob,
  getQuote,
  getTwStocks,
  screenStock,
  startScreenJob,
  type ScreenParams,
} from "./stockEngine";
import {
  addToWatchlist,
  createNotification,
  createScreenerRun,
  deleteNotification,
  getLatestScreenerResults,
  getLatestScreenerRun,
  getNotifications,
  getScreenerResultsByRunId,
  getScreenerRunById,
  getScreenerRunHistory,
  getScreenerSettings,
  getUnreadNotificationCount,
  getUsersWithAutoRun,
  getWatchlist, GUEST_USER,
  insertScreenerResults,
  isInWatchlist,
  markAllNotificationsRead,
  markNotificationRead,
  removeFromWatchlist,
  toggleAutoRun,
  updateScreenerRun,
  upsertScreenerSettings,
} from "./db";
import { z } from "zod";

// ─── TypeScript 股票引擎（取代 Python Flask 服務） ──────────────────────────────
// 所有股票分析邏輯已移至 server/stockEngine.ts，使用 yahoo-finance2 套件
// 不再依賴 Python 進程，可在生產環境正常運行

const screenerSettingsSchema = z.object({
  maPeriods: z.array(z.number().int().min(1).max(200)).min(2).max(6).optional(),
  volumeMultiplier: z.number().min(1).max(10).optional(),
  vrThreshold: z.number().min(50).max(500).optional(),
  vrPeriod: z.number().int().min(5).max(60).optional(),
  bullishCandleMinPct: z.number().min(0.5).max(20).optional(),
  // scanLimit: 0 = 全部，100~9999 = 指定數量，預設 900
  scanLimit: z.number().int().min(0).max(9999).optional(),
  autoRunEnabled: z.boolean().optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      (ctx.res as any).clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Screener ──────────────────────────────────────────────────────────────
  screener: router({
    // 執行完整篩選
    run: protectedProcedure
      .input(
        z.object({
          minConditions: z.number().int().min(1).max(5).default(5),
          settings: screenerSettingsSchema.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 獲取用戶設定
        const userSettings = await getScreenerSettings(ctx.user.id);
        const settings = {
          maPeriods: input.settings?.maPeriods ?? userSettings?.maPeriods ?? [5, 10, 20, 40],
          volumeMultiplier: Number(input.settings?.volumeMultiplier ?? userSettings?.volumeMultiplier ?? 1.5),
          vrThreshold: Number(input.settings?.vrThreshold ?? userSettings?.vrThreshold ?? 120),
          vrPeriod: Number(input.settings?.vrPeriod ?? userSettings?.vrPeriod ?? 26),
          bullishCandleMinPct: Number(input.settings?.bullishCandleMinPct ?? userSettings?.bullishCandleMinPct ?? 2.0),
          scanLimit: Number(input.settings?.scanLimit ?? userSettings?.scanLimit ?? 900),
          minConditions: input.minConditions,
        };

        // 建立篩選執行記錄
        const today = new Date().toISOString().split("T")[0];
        const runId = await createScreenerRun({
          runDate: today,
          status: "running",
        });

         try {
          // 使用 TypeScript 股票引擎（取代 Python Flask 服務）
          const jobId = `run-${runId}-${Date.now()}`;
          // 啟動背景篩選 job
          void startScreenJob(jobId, {
            maPeriods: settings.maPeriods,
            volumeMultiplier: settings.volumeMultiplier,
            vrThreshold: settings.vrThreshold,
            vrPeriod: settings.vrPeriod,
            bullishMinPct: settings.bullishCandleMinPct,
            scanLimit: settings.scanLimit,
            minConditions: settings.minConditions,
          });
          // 輪詢直到完成（最多等 15 分鐘）
          const maxWait = 15 * 60 * 1000;
          const pollInterval = 2000;
          const startTime = Date.now();
          let screenResult: { results: import("./stockEngine").ScreenResult[]; totalScanned: number; totalMatched: number } | null = null;
          while (Date.now() - startTime < maxWait) {
            await new Promise(r => setTimeout(r, pollInterval));
            const job = getJob(jobId);
            if (!job) break;
            if (job.status === "done") {
              screenResult = {
                results: job.results,
                totalScanned: job.scanned,
                totalMatched: job.results.length,
              };
              break;
            }
            if (job.status === "error") {
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `篩選失敗：${job.error ?? "未知錯誤"}` });
            }
            if (job.status === "cancelled") {
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "篩選已取消" });
            }
          }
          if (!screenResult) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "篩選超時，請縮小掃描範圍後再試" });
          }

          // 儲存結果到資料庫
          if (screenResult.results && screenResult.results.length > 0) {
            await insertScreenerResults(
              screenResult.results.map((r) => ({
                runId,
                stockCode: r.stockCode,
                stockName: r.stockName,
                currentPrice: r.currentPrice != null ? String(r.currentPrice) : null,
                priceChange: r.priceChange != null ? String(r.priceChange) : null,
                priceChangePct: r.priceChangePct != null ? String(r.priceChangePct) : null,
                volume: r.volume ?? null,
                condMaAligned: r.condMaAligned,
                condVolumeSpike: r.condVolumeSpike,
                condObvRising: r.condObvRising,
                condVrAbove: r.condVrAbove,
                condBullishBreakout: r.condBullishBreakout,
                conditionsMetCount: r.conditionsMetCount,
                ma5: r.maValues?.[5] != null ? String(r.maValues[5]) : null,
                ma10: r.maValues?.[10] != null ? String(r.maValues[10]) : null,
                ma20: r.maValues?.[20] != null ? String(r.maValues[20]) : null,
                ma40: r.maValues?.[40] != null ? String(r.maValues[40]) : null,
                volumeRatio: r.volumeRatio != null ? String(r.volumeRatio) : null,
                vrValue: r.vrValue != null ? String(r.vrValue) : null,
                obvValue: r.obvValue != null ? String(r.obvValue) : null,
                breakoutPrice: r.breakoutPrice != null ? String(r.breakoutPrice) : null,
              }))
            );
          }

          await updateScreenerRun(runId, {
            totalScanned: screenResult.totalScanned,
            totalMatched: screenResult.totalMatched,
            status: "completed",
            completedAt: new Date(),
          });

          // 發送通知
          if (screenResult.totalMatched > 0) {
            await createNotification({
              userId: ctx.user.id,
              runId,
              title: `發現 ${screenResult.totalMatched} 支飆股！`,
              content: `今日篩選完成，共掃描 ${screenResult.totalScanned} 支股票，找到 ${screenResult.totalMatched} 支符合所有條件的飆股。`,
            });
          }

          return {
            runId,
            totalScanned: screenResult.totalScanned,
            totalMatched: screenResult.totalMatched,
            results: screenResult.results,
          };
        } catch (error) {
          await updateScreenerRun(runId, {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Unknown error",
            completedAt: new Date(),
          });
          throw error;
        }
      }),

    // 儲存 SSE 串流篩選結果到資料庫
    saveStreamResult: protectedProcedure
      .input(
        z.object({
          totalScanned: z.number().int(),
          totalMatched: z.number().int(),
          results: z.array(z.record(z.string(), z.unknown())),
          timestamp: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const today = new Date().toISOString().split("T")[0];
        const runId = await createScreenerRun({
          runDate: today,
          status: "running",
        });

        try {
          if (input.results.length > 0) {
            await insertScreenerResults(
              input.results.map((r) => ({
                runId: runId as number,
                stockCode: String(r.stockCode || ""),
                stockName: String(r.stockName || ""),
                currentPrice: r.currentPrice != null ? Number(r.currentPrice) : null,
                priceChange: r.priceChange != null ? Number(r.priceChange) : null,
                priceChangePct: r.priceChangePct != null ? Number(r.priceChangePct) : null,
                volume: r.volume != null ? Number(r.volume) : null,
                condMaAligned: Boolean(r.condMaAligned),
                condVolumeSpike: Boolean(r.condVolumeSpike),
                condObvRising: Boolean(r.condObvRising),
                condVrAbove: Boolean(r.condVrAbove),
                condBullishBreakout: Boolean(r.condBullishBreakout),
                conditionsMetCount: Number(r.conditionsMetCount || 0),
                ma5: (r.maValues as any)?.["5"] != null ? Number((r.maValues as any)["5"]) : null,
                ma10: (r.maValues as any)?.["10"] != null ? Number((r.maValues as any)["10"]) : null,
                ma20: (r.maValues as any)?.["20"] != null ? Number((r.maValues as any)["20"]) : null,
                ma40: (r.maValues as any)?.["40"] != null ? Number((r.maValues as any)["40"]) : null,
                volumeRatio: r.volumeRatio != null ? Number(r.volumeRatio) : null,
                vrValue: r.vrValue != null ? Number(r.vrValue) : null,
                obvValue: r.obvValue != null ? Number(r.obvValue) : null,
                breakoutPrice: r.breakoutPrice != null ? Number(r.breakoutPrice) : null,
              }))
            );
          }

          await updateScreenerRun(runId, {
            totalScanned: input.totalScanned,
            totalMatched: input.totalMatched,
            status: "completed",
            completedAt: new Date(),
          });

          if (input.totalMatched > 0) {
            await createNotification({
              userId: ctx.user.id,
              runId,
              title: `發現 ${input.totalMatched} 支飆股！`,
              content: `今日篩選完成，共掃描 ${input.totalScanned} 支股票，找到 ${input.totalMatched} 支符合所有條件的飆股。`,
            });
          }

          return { success: true, runId, totalScanned: input.totalScanned, totalMatched: input.totalMatched };
        } catch (error) {
          await updateScreenerRun(runId, {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Unknown error",
            completedAt: new Date(),
          });
          throw error;
        }
      }),

    // 獲取最新篩選結果
    getLatestResults: publicProcedure.query(async () => {
      const latestRun = await getLatestScreenerRun();
      if (!latestRun) return { run: null, results: [] };
      const results = await getLatestScreenerResults();
      return { run: latestRun, results };
    }),

    // 獲取特定執行的結果
    getResultsByRunId: publicProcedure
      .input(z.object({ runId: z.number().int() }))
      .query(async ({ input }) => {
        const run = await getScreenerRunById(input.runId);
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
        const results = await getScreenerResultsByRunId(input.runId);
        return { run, results };
      }),

    // 獲取篩選歷史
    getHistory: publicProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }))
      .query(async ({ input }) => {
        return getScreenerRunHistory(input.limit);
      }),

    // 獲取個股圖表數據
    getStockChart: publicProcedure
      .input(
        z.object({
          symbol: z.string().min(1).max(10),
          days: z.number().int().min(20).max(365).default(90),
        })
      )
      .query(async ({ input }) => {
        const data = await getChartData(input.symbol, input.days);
        if (!data) throw new TRPCError({ code: "NOT_FOUND", message: `無法獲取 ${input.symbol} 的圖表數據` });
        return data;
      }),
    // 對單一股票執行分析
    analyzeStock: publicProcedure
      .input(
        z.object({
          symbol: z.string().min(1).max(10),
          name: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        const result = await screenStock(input.symbol, input.name ?? input.symbol);
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: `無法分析 ${input.symbol}` });
        return result;
      }),

    // 獲獲用戶篩選設定
    getSettings: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id || GUEST_USER.id;
      const settings = await getScreenerSettings(userId);
      if (!settings) {
        return {
          maPeriods: [5, 10, 20, 40],
          volumeMultiplier: "1.5",
          vrThreshold: 120,
          vrPeriod: 26,
          bullishCandleMinPct: "2.0",
          scanLimit: 900,
          autoRunEnabled: false,
          isDefault: true,
        };
      }
      return settings;
    }),

    // 更新篩選設定
    updateSettings: publicProcedure
      .input(screenerSettingsSchema)
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || GUEST_USER.id;
        const data: Record<string, unknown> = {};
        if (input.maPeriods !== undefined) data.maPeriods = input.maPeriods;
        if (input.volumeMultiplier !== undefined) data.volumeMultiplier = String(input.volumeMultiplier);
        if (input.vrThreshold !== undefined) data.vrThreshold = input.vrThreshold;
        if (input.vrPeriod !== undefined) data.vrPeriod = input.vrPeriod;
        if (input.bullishCandleMinPct !== undefined) data.bullishCandleMinPct = String(input.bullishCandleMinPct);
        if (input.scanLimit !== undefined) data.scanLimit = input.scanLimit;
        if (input.autoRunEnabled !== undefined) data.autoRunEnabled = input.autoRunEnabled;
        await upsertScreenerSettings(userId, data);
        return { success: true };
      }),

      // 獲取股票池總數
    getStockTotal: publicProcedure.query(async () => {
      try {
        const stocks = await getTwStocks();
        return { total: stocks.length, description: `共 ${stocks.length} 支上市+上櫃股票` };
      } catch {
        return { total: 0, description: "無法取得股票池資訊" };
      }
    }),
    // 獲取股票清單
    getStockList: publicProcedure.query(async () => {
      const stocks = await getTwStocks();
      return stocks.map(([code, name]) => ({ code, name }));
    }),
    // 獲取服務狀態（TypeScript 引擎不需要外部服務）
    getServiceStatus: publicProcedure.query(async () => {
      return { online: true, status: "ok", engine: "typescript" };
    }),
  }),

  // ─── Watchlist ─────────────────────────────────────────────────────────────
  watchlist: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getWatchlist(ctx.user.id);
    }),

    add: protectedProcedure
      .input(
        z.object({
          stockCode: z.string().min(1).max(10),
          stockName: z.string().min(1).max(64),
          addedPrice: z.number().optional(),
          note: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const exists = await isInWatchlist(ctx.user.id, input.stockCode);
        if (exists) {
          throw new TRPCError({ code: "CONFLICT", message: "股票已在觀察清單中" });
        }
        const id = await addToWatchlist({
          userId: ctx.user.id,
          stockCode: input.stockCode,
          stockName: input.stockName,
          addedPrice: input.addedPrice ? String(input.addedPrice) : null,
          note: input.note ?? null,
        });
        return { success: true, id };
      }),

    remove: protectedProcedure
      .input(z.object({ stockCode: z.string().min(1).max(10) }))
      .mutation(async ({ ctx, input }) => {
        await removeFromWatchlist(ctx.user.id, input.stockCode);
        return { success: true };
      }),

    isWatching: protectedProcedure
      .input(z.object({ stockCode: z.string().min(1).max(10) }))
      .query(async ({ ctx, input }) => {
        return isInWatchlist(ctx.user.id, input.stockCode);
      }),
  }),

  // ─  // ─── Notifications ───────────────────────────────────────────────
  notifications: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
      .query(async ({ ctx, input }) => {
        return getNotifications(ctx.user.id, input.limit);
      }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return getUnreadNotificationCount(ctx.user.id);
    }),

    markRead: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await markNotificationRead(input.id);
        return { success: true };
      }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await markAllNotificationsRead(ctx.user.id);
      return { success: true };
    }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await deleteNotification(input.id, ctx.user.id);
        return { success: true };
      }),

    // 切換自動篩選開關
    toggleAutoRun: protectedProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await toggleAutoRun(ctx.user.id, input.enabled);
        return { success: true, enabled: input.enabled };
      }),

    // 手動觸發自動篩選（供排程或测試用）
    triggerAutoRun: protectedProcedure.mutation(async ({ ctx }) => {
      const userSettings = await getScreenerSettings(ctx.user.id);
      const settings = {
        maPeriods: userSettings?.maPeriods ?? [5, 10, 20, 40],
        volumeMultiplier: Number(userSettings?.volumeMultiplier ?? 1.5),
        vrThreshold: Number(userSettings?.vrThreshold ?? 120),
        vrPeriod: Number(userSettings?.vrPeriod ?? 26),
        bullishCandleMinPct: Number(userSettings?.bullishCandleMinPct ?? 2.0),
        scanLimit: Number(userSettings?.scanLimit ?? 900),
        minConditions: 5,
      };

      const today = new Date().toISOString().split("T")[0];
      const runId = await createScreenerRun({ runDate: today, status: "running" });

      try {
        // 使用 TypeScript 股票引擎執行自動篩選
        const autoJobId = `auto-${runId}-${Date.now()}`;
        void startScreenJob(autoJobId, {
          maPeriods: settings.maPeriods,
          volumeMultiplier: settings.volumeMultiplier,
          vrThreshold: settings.vrThreshold,
          vrPeriod: settings.vrPeriod,
          bullishMinPct: settings.bullishCandleMinPct,
          scanLimit: settings.scanLimit,
          minConditions: settings.minConditions,
        });
        const maxWaitAuto = 15 * 60 * 1000;
        const startTimeAuto = Date.now();
        let autoResult: { results: import("./stockEngine").ScreenResult[]; totalScanned: number } | null = null;
        while (Date.now() - startTimeAuto < maxWaitAuto) {
          await new Promise(r => setTimeout(r, 2000));
          const job = getJob(autoJobId);
          if (!job) break;
          if (job.status === "done") { autoResult = { results: job.results, totalScanned: job.scanned }; break; }
          if (job.status === "error") throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `自動篩選失敗：${job.error}` });
        }
        if (!autoResult) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "自動篩選超時" });
        const result = autoResult;
        if (result.results.length > 0) {
          await insertScreenerResults(
            result.results.map((r) => ({
              runId,
              stockCode: r.stockCode,
              stockName: r.stockName,
              currentPrice: r.currentPrice != null ? String(r.currentPrice) : null,
              priceChange: r.priceChange != null ? String(r.priceChange) : null,
              priceChangePct: r.priceChangePct != null ? String(r.priceChangePct) : null,
              volume: r.volume ?? null,
              condMaAligned: r.condMaAligned,
              condVolumeSpike: r.condVolumeSpike,
              condObvRising: r.condObvRising,
              condVrAbove: r.condVrAbove,
              condBullishBreakout: r.condBullishBreakout,
              conditionsMetCount: r.conditionsMetCount,
              ma5: r.maValues?.[5] != null ? String(r.maValues[5]) : null,
              ma10: r.maValues?.[10] != null ? String(r.maValues[10]) : null,
              ma20: r.maValues?.[20] != null ? String(r.maValues[20]) : null,
              ma40: r.maValues?.[40] != null ? String(r.maValues[40]) : null,
              volumeRatio: r.volumeRatio != null ? String(r.volumeRatio) : null,
              vrValue: r.vrValue != null ? String(r.vrValue) : null,
              obvValue: r.obvValue != null ? String(r.obvValue) : null,
              breakoutPrice: r.breakoutPrice != null ? String(r.breakoutPrice) : null,
            }))
          );
        }
        await updateScreenerRun(runId, {
          totalScanned: result.totalScanned,
          totalMatched: result.results.length,
          status: "completed",
          completedAt: new Date(),
        });
        const notifTitle = result.results.length > 0
          ? `📈 發現 ${result.results.length} 支飆股！`
          : `今日篩選完成，未發現符合全條件的股票`;
        const notifContent = result.results.length > 0
          ? `自動篩選完成，共掃描 ${result.totalScanned} 支股票，找到 ${result.results.length} 支飆股。`
          : `自動篩選完成，共掃描 ${result.totalScanned} 支股票，目前市場尚未出現符合所有技術條件的飆股。`;
        await createNotification({ userId: ctx.user.id, runId, title: notifTitle, content: notifContent });
        return { success: true, runId, totalMatched: result.results.length };
      } catch (error) {
        await updateScreenerRun(runId, {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          completedAt: new Date(),
        });
        throw error;
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
