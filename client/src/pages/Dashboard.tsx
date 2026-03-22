import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useState, useCallback, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import StockCard from "@/components/StockCard";
import StatsBar from "@/components/StatsBar";
import RunScreenerButton from "@/components/RunScreenerButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, RefreshCw, LogIn, Download, ScanSearch, Sparkles, Zap, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ScreenerResult } from "../../../api/shared/types";
import { Link } from "wouter";

function exportToCsv(results: unknown[], filename = "飆股篩選結果.csv") {
  if (!results || results.length === 0) {
    toast.error("沒有可匯出的資料");
    return;
  }

  const headers = [
    "股票代碼", "股票名稱", "現價", "漲跌", "漲跌幅(%)",
    "成交量", "量比", "VR(26)", "OBV值", "突破價",
    "MA多頭排列", "成交量放大", "OBV創新高", "VR>120", "長紅突破",
    "符合條件數",
  ];

  const rows = (results as Record<string, unknown>[]).map((r) => [
    r.stockCode ?? "",
    r.stockName ?? "",
    r.currentPrice ?? "",
    r.priceChange ?? "",
    r.priceChangePct !== null && r.priceChangePct !== undefined
      ? Number(r.priceChangePct).toFixed(2)
      : "",
    r.volume ?? "",
    r.volumeRatio ? Number(r.volumeRatio).toFixed(2) : "",
    r.vrValue ? Number(r.vrValue).toFixed(1) : "",
    r.obvValue ? Number(r.obvValue).toFixed(0) : "",
    r.breakoutPrice ?? "",
    r.condMaAligned ? "✓" : "✗",
    r.condVolumeSpike ? "✓" : "✗",
    r.condObvRising ? "✓" : "✗",
    r.condVrAbove ? "✓" : "✗",
    r.condBullishBreakout ? "✓" : "✗",
    r.conditionsMetCount ?? "",
  ]);

  const csvContent = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const bom = "\uFEFF"; // UTF-8 BOM for Excel
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`已匯出 ${results.length} 支股票資料`);
}

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const [liveProgress, setLiveProgress] = useState<{ scanned: number; total: number; matched: number } | null>(null);
  const [liveMatches, setLiveMatches] = useState<unknown[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([
    "condMaAligned",
    "condVolumeSpike",
    "condObvRising",
    "condVrAbove",
    "condBullishBreakout",
  ]);
  const [minConditions, setMinConditions] = useState(5);

  // Sync minConditions when selectedConditions changes
  useEffect(() => {
    const maxSelected = selectedConditions.length;
    if (minConditions > maxSelected) {
      setMinConditions(maxSelected > 0 ? maxSelected : 1);
    } else if (maxSelected > 0 && minConditions === 0) {
      setMinConditions(1);
    }
  }, [selectedConditions, minConditions]);

  const { data: latestData, isLoading, refetch } = trpc.screener.getLatestResults.useQuery(undefined, {
    refetchInterval: false,
  });

  const { data: serviceStatus, refetch: refetchStatus, isFetching: isStatusFetching } = trpc.screener.getServiceStatus.useQuery(undefined, {
    refetchInterval: (query) => (query.state.data?.online ? 30000 : 5000),
    retry: 5,
    retryDelay: 2000,
    staleTime: 0,
  });

  const results = latestData?.results ?? [];
  const run = latestData?.run;

  const filteredResults = (results as ScreenerResult[]).filter((r) => {
    // Calculate how many of the SELECTED conditions are met
    const localMetCount = selectedConditions.length > 0 
      ? selectedConditions.filter(cond => !!(r as any)[cond]).length
      : r.conditionsMetCount; // fall back to global count if none selected

    return localMetCount >= minConditions;
  });

  const handleComplete = useCallback(() => {
    setLiveProgress(null);
    setLiveMatches([]);
    refetch();
  }, [refetch]);

  const handleProgress = useCallback((p: { scanned: number; total: number; matched: number }) => {
    setLiveProgress(p);
  }, []);

  const handleMatch = useCallback((stock: unknown) => {
    setLiveMatches((prev) => [stock, ...prev].slice(0, 3));
  }, []);

  const maxSelected = selectedConditions.length;
  const minConditionOptions = Array.from({ length: maxSelected }, (_, i) => maxSelected - i);

  return (
    <AppLayout>
      <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 min-h-screen">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">飆股雷達</h1>
              {serviceStatus?.online ? (
                <Badge className="bg-primary/15 text-primary border-primary/30 text-xs">● 服務在線</Badge>
              ) : serviceStatus === undefined ? (
                <Badge variant="outline" className="text-xs text-muted-foreground">● 連線中...</Badge>
              ) : (
                <button onClick={() => refetchStatus()} title="點擊重新連線">
                  <Badge variant="destructive" className="text-xs cursor-pointer hover:opacity-80">
                    {isStatusFetching ? "● 連線中..." : "● 服務離線（點擊重試）"}
                  </Badge>
                </button>
              )}
            </div>
            <p className="text-muted-foreground text-xs sm:text-sm ml-9 sm:ml-11 line-clamp-2">
              {run
                ? `最後更新：${new Date(run.createdAt).toLocaleString("zh-TW")} · 掃描 ${run.totalScanned} 支，找到 ${run.totalMatched} 支`
                : "尚未執行篩選，點擊「執行篩選」開始分析"}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            {filteredResults.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToCsv(filteredResults)}
                className="border-border text-muted-foreground hover:text-foreground hidden sm:flex"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                匯出 CSV
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="border-border text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">重新整理</span>
            </Button>
            <RunScreenerButton
              onComplete={handleComplete}
              onProgress={handleProgress}
              onMatch={handleMatch}
              selectedConditions={selectedConditions}
            />
          </div>
        </div>

        {/* Filter Selection - Always Visible */}
        <div className="flex flex-col gap-4 p-4 rounded-xl border border-border bg-card/50">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground text-xs sm:text-sm">篩選條件勾選 (必須符合)：</span>
              {selectedConditions.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedConditions([])}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
                >
                  清除重置
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "condMaAligned", label: "MA 多頭排列" },
                { id: "condVolumeSpike", label: "成交量放大" },
                { id: "condObvRising", label: "OBV 創新高" },
                { id: "condVrAbove", label: "VR > 120" },
                { id: "condBullishBreakout", label: "長紅突破" },
              ].map((cond) => {
                const isActive = selectedConditions.includes(cond.id);
                return (
                  <button
                    key={cond.id}
                    onClick={() =>
                      setSelectedConditions((prev) =>
                        isActive ? prev.filter((id) => id !== cond.id) : [...prev, cond.id]
                      )
                    }
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                      isActive
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    <div className={cn(
                      "w-2.5 h-2.5 rounded-full border flex items-center justify-center transition-all",
                      isActive ? "bg-primary border-primary" : "border-muted-foreground"
                    )}>
                      {isActive && <div className="w-1 h-1 bg-primary-foreground rounded-full" />}
                    </div>
                    {cond.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="h-px bg-border/50" />
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground mr-1 text-xs sm:text-sm">至少符合條件數：</span>
            {minConditionOptions.length > 0 ? (
              minConditionOptions.map((n) => {
                const count = (results as ScreenerResult[]).filter((r) => r.conditionsMetCount >= n).length;
                return (
                  <button
                    key={n}
                    onClick={() => setMinConditions(n)}
                    className={cn(
                      "px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium transition-all",
                      minConditions === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    ≥{n}
                    {results.length > 0 && <span className="ml-1 opacity-70">({count})</span>}
                  </button>
                );
              })
            ) : (
              <span className="text-xs text-muted-foreground italic">請先選擇上方篩選條件</span>
            )}
          </div>
        </div>

        {/* Live Progress Counter — shown while screening is running */}
        {liveProgress && (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 animate-slide-up">
            <div className="flex items-stretch gap-3">
              {/* Scanned */}
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <ScanSearch className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground leading-none mb-1">已讀取股票</p>
                  <p className="text-lg font-bold font-num text-foreground leading-none">
                    <span className="text-primary">{liveProgress.scanned.toLocaleString()}</span>
                    <span className="text-muted-foreground text-sm font-normal"> / {liveProgress.total.toLocaleString()}</span>
                  </p>
                </div>
              </div>

              {/* Divider */}
              <div className="w-px bg-border/60 self-stretch" />

              {/* Matched */}
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-chart-1/15 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-chart-1" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground leading-none mb-1">已發現飆股</p>
                  <p className="text-lg font-bold font-num text-foreground leading-none">
                    <span className={liveProgress.matched > 0 ? "text-chart-1" : "text-muted-foreground"}>
                      {liveProgress.matched.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground text-sm font-normal"> 支</span>
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="flex flex-col justify-center gap-1 w-20 sm:w-28 shrink-0">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{Math.round((liveProgress.scanned / liveProgress.total) * 100)}%</span>
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    掃描中
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((liveProgress.scanned / liveProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Live match preview */}
            {liveMatches.length > 0 && (
              <div className="border-t border-primary/15 pt-3">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-primary" />
                  最新發現的飆股
                </p>
                <div className="flex flex-wrap gap-2">
                  {(liveMatches as ScreenerResult[]).map((s, i) => {
                    const price = Number(s.currentPrice ?? 0);
                    const changePct = Number(s.priceChangePct ?? 0);
                    const isUp = changePct > 0;
                    const isDown = changePct < 0;
                    const count = Number(s.conditionsMetCount ?? 0);
                    return (
                      <div
                        key={`${s.stockCode}-${i}`}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border px-3 py-2 bg-card/80 transition-all",
                          count === 5 ? "border-primary/40" : "border-border"
                        )}
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground font-num">{String(s.stockCode)}</span>
                            <span className="text-sm font-semibold text-foreground">{String(s.stockName)}</span>
                            {count === 5 && (
                              <span className="text-xs bg-primary/15 text-primary border border-primary/30 px-1.5 py-0 rounded-full leading-5">全條件</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={cn("text-base font-bold font-num", isUp ? "text-stock-up" : isDown ? "text-stock-down" : "text-foreground")}>
                              {price.toFixed(2)}
                            </span>
                            <span className={cn("text-xs font-num", isUp ? "text-stock-up" : isDown ? "text-stock-down" : "text-muted-foreground")}>
                              {changePct > 0 ? "+" : ""}{changePct.toFixed(2)}%
                            </span>
                            <span className="text-xs text-muted-foreground">{count}/5 條件</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats Bar */}
        {run && (
          <StatsBar
            totalScanned={run.totalScanned}
            totalMatched={run.totalMatched}
            runDate={run.runDate}
            status={run.status}
          />
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 gap-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-muted-foreground text-sm">載入中...</p>
          </div>
        ) : filteredResults.length === 0 ? (
          <EmptyState isAuthenticated={isAuthenticated} hasRun={!!run} />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 animate-slide-up">
              {filteredResults.map((stock) => (
                <StockCard key={stock.stockCode} stock={stock as any} />
              ))}
            </div>
            
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                size="lg"
                onClick={() => exportToCsv(filteredResults)}
                className="bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 w-full sm:w-auto"
              >
                <FileDown className="w-5 h-5 mr-2" />
                下載本次篩選結果 (CSV)
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function EmptyState({ isAuthenticated, hasRun }: { isAuthenticated: boolean; hasRun: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24 gap-5 sm:gap-6">
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
        <TrendingUp className="w-8 h-8 sm:w-10 sm:h-10 text-primary/60" />
      </div>
      <div className="text-center px-4">
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">
          {hasRun ? "目前沒有符合條件的飆股" : "尚未執行篩選"}
        </h3>
        <p className="text-muted-foreground text-sm max-w-sm">
          {hasRun
            ? "目前市場中沒有同時滿足所有技術指標條件的股票，可嘗試降低篩選條件數量"
            : "點擊右上角「執行篩選」按鈕，開始掃描台股飆股"}
        </p>
      </div>
    </div>
  );
}
