import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import CandlestickChart from "@/components/CandlestickChart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, TrendingUp, TrendingDown, BookmarkPlus, BookmarkCheck, AlertCircle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc as trpcClient } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useState } from "react";

const CONDITIONS = [
  { key: "condMaAligned", label: "MA多頭排列", desc: "股價高於所有均線，且均線呈多頭排列" },
  { key: "condVolumeSpike", label: "成交量放大", desc: "成交量超過10日均量1.5倍" },
  { key: "condObvRising", label: "OBV創新高", desc: "OBV上升趨勢且突破20日新高" },
  { key: "condVrAbove", label: "VR(26)>120", desc: "成交量比率指標超過120" },
  { key: "condBullishBreakout", label: "長紅突破", desc: "出現長紅K線且突破前波高點" },
] as const;

export default function StockChart() {
  const { symbol } = useParams<{ symbol: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [chartDays, setChartDays] = useState(90);

  const { data: chartData, isLoading: chartLoading } = trpc.screener.getStockChart.useQuery(
    { symbol: symbol ?? "", days: chartDays },
    { enabled: !!symbol }
  );

  const { data: analysis, isLoading: analysisLoading } = trpc.screener.analyzeStock.useQuery(
    { symbol: symbol ?? "" },
    { enabled: !!symbol }
  );

  const { data: isWatching } = trpcClient.watchlist.isWatching.useQuery(
    { stockCode: symbol ?? "" },
    { enabled: isAuthenticated && !!symbol }
  );

  const utils = trpcClient.useUtils();

  const addMutation = trpcClient.watchlist.add.useMutation({
    onSuccess: () => {
      toast.success("已加入觀察清單");
      utils.watchlist.isWatching.invalidate({ stockCode: symbol ?? "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMutation = trpcClient.watchlist.remove.useMutation({
    onSuccess: () => {
      toast.success("已從觀察清單移除");
      utils.watchlist.isWatching.invalidate({ stockCode: symbol ?? "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleWatchlist = () => {
    if (!isAuthenticated) { toast.error("請先登入"); return; }
    if (isWatching) {
      removeMutation.mutate({ stockCode: symbol ?? "" });
    } else {
      addMutation.mutate({
        stockCode: symbol ?? "",
        stockName: analysis?.stockName ?? symbol ?? "",
        addedPrice: analysis?.currentPrice,
      });
    }
  };

  const price = Number(analysis?.currentPrice ?? 0);
  const change = Number(analysis?.priceChange ?? 0);
  const changePct = Number(analysis?.priceChangePct ?? 0);
  const isUp = change > 0;
  const isDown = change < 0;

  return (
    <AppLayout>
      <div className="flex flex-col gap-4 sm:gap-5 p-4 sm:p-6 min-h-screen">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="self-start text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          返回
        </Button>

        {/* Stock Header */}
        {analysisLoading ? (
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="text-muted-foreground">載入分析中...</span>
          </div>
        ) : analysis ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                <span className="text-muted-foreground font-num text-xs sm:text-sm shrink-0">{symbol}</span>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{analysis.stockName}</h1>
                {analysis.conditionsMetCount === 5 && (
                  <Badge className="bg-primary/15 text-primary border-primary/30 shrink-0">全條件</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <span className={cn("text-2xl sm:text-3xl font-bold font-num", isUp ? "text-stock-up" : isDown ? "text-stock-down" : "text-foreground")}>
                  {price.toFixed(2)}
                </span>
                <div className={cn("flex items-center gap-1 text-xs sm:text-sm font-medium font-num", isUp ? "text-stock-up" : isDown ? "text-stock-down" : "text-muted-foreground")}>
                  {isUp ? <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : isDown ? <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : null}
                  <span>{change > 0 ? "+" : ""}{change.toFixed(2)} ({changePct > 0 ? "+" : ""}{changePct.toFixed(2)}%)</span>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleWatchlist}
              className={cn("border-border shrink-0", isWatching && "border-primary/40 text-primary bg-primary/10")}
            >
              {isWatching ? <BookmarkCheck className="w-4 h-4 sm:mr-1.5" /> : <BookmarkPlus className="w-4 h-4 sm:mr-1.5" />}
              <span className="hidden sm:inline">{isWatching ? "已加入觀察" : "加入觀察"}</span>
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="w-4 h-4" />
            <span>無法載入股票資料</span>
          </div>
        )}

        {/* Conditions */}
        {analysis && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {CONDITIONS.map(({ key, label, desc }) => {
              const passed = analysis[key as keyof typeof analysis] as boolean;
              return (
                <div
                  key={key}
                  className={cn(
                    "rounded-lg border p-3 text-center transition-all",
                    passed ? "border-primary/30 bg-primary/8" : "border-border bg-card"
                  )}
                >
                  <div className={cn("text-xs font-medium mb-1", passed ? "text-primary" : "text-muted-foreground")}>
                    {label}
                  </div>
                  <div className={cn("text-lg font-bold", passed ? "text-primary" : "text-muted-foreground/40")}>
                    {passed ? "✓" : "✗"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 leading-tight hidden sm:block">{desc}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Metrics Row */}
        {analysis && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="量比" value={analysis.volumeRatio ? `${Number(analysis.volumeRatio).toFixed(2)}x` : "N/A"} highlight={Number(analysis.volumeRatio ?? 0) >= 1.5} />
            <MetricCard label="VR(26)" value={analysis.vrValue ? Number(analysis.vrValue).toFixed(1) : "N/A"} highlight={Number(analysis.vrValue ?? 0) >= 120} />
            <MetricCard label="突破價位" value={analysis.breakoutPrice ? Number(analysis.breakoutPrice).toFixed(2) : "N/A"} />
            <MetricCard label="成交量" value={analysis.volume ? formatVolume(analysis.volume) : "N/A"} />
          </div>
        )}

        {/* Chart Period Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">圖表期間：</span>
          {[30, 60, 90, 180].map((d) => (
            <button
              key={d}
              onClick={() => setChartDays(d)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-all",
                chartDays === d ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {d}日
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {chartLoading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : chartData ? (
            <CandlestickChart data={chartData} symbol={symbol ?? ""} />
          ) : (
            <div className="flex items-center justify-center h-96 text-muted-foreground">
              <AlertCircle className="w-5 h-5 mr-2" />
              無法載入圖表數據
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function MetricCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3 bg-card", highlight ? "border-primary/30 bg-primary/5" : "border-border")}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-lg font-bold font-num", highlight ? "text-primary" : "text-foreground")}>{value}</div>
    </div>
  );
}

function formatVolume(v: number): string {
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}億`;
  if (v >= 10000) return `${(v / 10000).toFixed(1)}萬`;
  return v.toLocaleString();
}
