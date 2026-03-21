import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, Zap, Square } from "lucide-react";
import { toast } from "sonner";
import { useState, useRef, useCallback, useEffect } from "react";

interface ScreenProgress {
  scanned: number;
  total: number;
  matched: number;
}

interface RunScreenerButtonProps {
  onComplete?: (results?: unknown[]) => void;
  onProgress?: (progress: ScreenProgress) => void;
  onMatch?: (stock: unknown) => void;
  selectedConditions: string[];
}

export default function RunScreenerButton({ onComplete, onProgress, onMatch, selectedConditions }: RunScreenerButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ScreenProgress | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevMatchedRef = useRef<number>(0);
  const prevMatchesRef = useRef<unknown[]>([]);

  const { data: userSettings } = trpc.screener.getSettings.useQuery(undefined, {
    retry: false,
  });

  const utils = trpc.useUtils();
  const saveResultMutation = trpc.screener.saveStreamResult.useMutation();

  // 清理輪詢
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // 取消 job
  const cancelJob = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (jobId) {
      try {
        await fetch(`/api/screen-cancel/${jobId}`, { method: "POST" });
      } catch { /* ignore */ }
    }
  }, []);

  const stopScreener = useCallback(async () => {
    stopPolling();
    await cancelJob();
    jobIdRef.current = null;
    setIsRunning(false);
    setProgress(null);
    prevMatchedRef.current = 0;
    prevMatchesRef.current = [];
    toast.info("篩選已停止", { id: "screener-run" });
  }, [stopPolling, cancelJob]);

  // 輪詢狀態
  const pollStatus = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/screen-status/${jobId}`);
      if (!res.ok) return;
      const job = await res.json() as {
        status: string;
        scanned?: number;
        total?: number;
        matched?: number;
        matches?: unknown[];
        results?: unknown[];
        totalScanned?: number;
        totalMatched?: number;
        timestamp?: string;
        error?: string;
      };

      if (job.status === "pending") {
        toast.loading("飆股篩選啟動中...", { id: "screener-run" });
        return;
      }

      if (job.status === "running") {
        const scanned = job.scanned ?? 0;
        const total = job.total ?? 0;
        const matched = job.matched ?? 0;
        const p = { scanned, total, matched };
        setProgress(p);
        onProgress?.(p);

        const pct = total > 0 ? Math.round((scanned / total) * 100) : 0;
        toast.loading(
          `掃描中 ${scanned}/${total}（${pct}%）· 發現 ${matched} 支飆股`,
          { id: "screener-run" }
        );

        // 即時推送新發現的飆股
        const currentMatches = job.matches ?? [];
        if (currentMatches.length > prevMatchedRef.current) {
          const newMatches = currentMatches.slice(prevMatchedRef.current);
          newMatches.forEach((stock) => onMatch?.(stock));
          prevMatchedRef.current = currentMatches.length;
          prevMatchesRef.current = currentMatches;
        }
        return;
      }

      if (job.status === "done") {
        stopPolling();
        jobIdRef.current = null;

        // 儲存結果到資料庫
        try {
          await saveResultMutation.mutateAsync({
            totalScanned: job.totalScanned ?? 0,
            totalMatched: job.totalMatched ?? 0,
            results: (job.results ?? []) as Record<string, unknown>[],
            timestamp: job.timestamp ?? new Date().toISOString(),
          });
        } catch { /* ignore DB save errors */ }

        toast.success(
          `篩選完成！掃描 ${job.totalScanned} 支，找到 ${job.totalMatched} 支飆股`,
          { id: "screener-run", duration: 5000 }
        );
        setProgress(null);
        setIsRunning(false);
        prevMatchedRef.current = 0;
        prevMatchesRef.current = [];
        utils.screener.getLatestResults.invalidate();
        utils.screener.getHistory.invalidate();
        utils.notifications.unreadCount.invalidate();
        onComplete?.(job.results);
        return;
      }

      if (job.status === "error" || job.status === "cancelled") {
        stopPolling();
        jobIdRef.current = null;
        setIsRunning(false);
        setProgress(null);
        prevMatchedRef.current = 0;
        prevMatchesRef.current = [];
        if (job.status === "error") {
          toast.error(`篩選失敗：${job.error ?? "未知錯誤"}`, { id: "screener-run" });
        }
      }
    } catch (err) {
      console.error("[Screener] Poll error:", err);
    }
  }, [onProgress, onMatch, onComplete, stopPolling, saveResultMutation, utils]);

  const runScreener = useCallback(async () => {
    if (isRunning) return;

    setIsRunning(true);
    setProgress(null);
    prevMatchedRef.current = 0;
    prevMatchesRef.current = [];

    const settings = {
      maPeriods: userSettings?.maPeriods ?? [5, 10, 20, 40],
      volumeMultiplier: Number(userSettings?.volumeMultiplier ?? 1.5),
      vrThreshold: Number(userSettings?.vrThreshold ?? 120),
      vrPeriod: Number(userSettings?.vrPeriod ?? 26),
      bullishCandleMinPct: Number(userSettings?.bullishCandleMinPct ?? 2.0),
      scanLimit: Number((userSettings as { scanLimit?: number })?.scanLimit ?? 900),
      minConditions: selectedConditions.length > 0 ? selectedConditions.length : 5,
    };

    toast.loading("飆股篩選啟動中...", { id: "screener-run" });

    try {
      // 啟動背景 job
      const startRes = await fetch("/api/screen-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!startRes.ok) {
        const errData = await startRes.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${startRes.status}`);
      }

      const { jobId } = await startRes.json() as { jobId: string };
      jobIdRef.current = jobId;

      // 立即查詢一次，然後每 1 秒輪詢
      await pollStatus(jobId);
      pollIntervalRef.current = setInterval(() => pollStatus(jobId), 1000);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "未知錯誤";
      toast.error(`篩選失敗：${msg}`, { id: "screener-run" });
      setIsRunning(false);
      setProgress(null);
    }
  }, [isRunning, userSettings, pollStatus]);

  // 元件卸載時清理
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const pct = progress && progress.total > 0 ? Math.round((progress.scanned / progress.total) * 100) : 0;

  if (isRunning && progress && progress.total > 0) {
    return (
      <div className="flex items-center gap-2">
        {/* Compact progress indicator */}
        <div className="flex flex-col gap-1 min-w-[140px] sm:min-w-[180px]">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground font-num shrink-0 w-8 text-right">{pct}%</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              {progress.scanned}/{progress.total}
            </span>
            {progress.matched > 0 && (
              <span className="text-primary font-medium">+{progress.matched} 飆股</span>
            )}
          </div>
        </div>
        {/* Stop button */}
        <Button
          size="sm"
          variant="outline"
          onClick={stopScreener}
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 h-8 w-8 p-0"
          title="停止篩選"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
        </Button>
      </div>
    );
  }

  // Initial running state (before first poll response)
  if (isRunning) {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" disabled className="bg-primary text-primary-foreground">
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          啟動中...
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={stopScreener}
          className="border-destructive/40 text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
          title="停止篩選"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      onClick={runScreener}
      disabled={isRunning}
      className="bg-primary text-primary-foreground hover:bg-primary/90 animate-pulse-glow"
    >
      <Zap className="w-3.5 h-3.5 mr-1.5" />
      執行篩選
    </Button>
  );
}
