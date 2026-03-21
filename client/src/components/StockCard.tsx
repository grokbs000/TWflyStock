import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { BookmarkPlus, BookmarkCheck, TrendingUp, TrendingDown, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface StockResult {
  id: number;
  stockCode: string;
  stockName: string;
  currentPrice: string | null;
  priceChange: string | null;
  priceChangePct: string | null;
  volume: number | null;
  condMaAligned: boolean;
  condVolumeSpike: boolean;
  condObvRising: boolean;
  condVrAbove: boolean;
  condBullishBreakout: boolean;
  conditionsMetCount: number;
  ma5: string | null;
  ma10: string | null;
  ma20: string | null;
  ma40: string | null;
  volumeRatio: string | null;
  vrValue: string | null;
  obvValue: string | null;
  breakoutPrice: string | null;
}

const CONDITIONS = [
  { key: "condMaAligned", label: "MA多頭排列", short: "MA" },
  { key: "condVolumeSpike", label: "成交量放大", short: "量" },
  { key: "condObvRising", label: "OBV創新高", short: "OBV" },
  { key: "condVrAbove", label: "VR>120", short: "VR" },
  { key: "condBullishBreakout", label: "長紅突破", short: "突破" },
] as const;

interface StockCardProps {
  stock: StockResult;
}

export default function StockCard({ stock }: StockCardProps) {
  const { isAuthenticated } = useAuth();
  const price = Number(stock.currentPrice ?? 0);
  const change = Number(stock.priceChange ?? 0);
  const changePct = Number(stock.priceChangePct ?? 0);
  const isUp = change > 0;
  const isDown = change < 0;

  const utils = trpc.useUtils();

  const { data: isWatching } = trpc.watchlist.isWatching.useQuery(
    { stockCode: stock.stockCode },
    { enabled: isAuthenticated }
  );

  const addMutation = trpc.watchlist.add.useMutation({
    onSuccess: () => {
      toast.success(`已將 ${stock.stockName} 加入觀察清單`);
      utils.watchlist.isWatching.invalidate({ stockCode: stock.stockCode });
      utils.watchlist.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMutation = trpc.watchlist.remove.useMutation({
    onSuccess: () => {
      toast.success(`已從觀察清單移除 ${stock.stockName}`);
      utils.watchlist.isWatching.invalidate({ stockCode: stock.stockCode });
      utils.watchlist.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleWatchlist = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      toast.error("請先登入才能使用觀察清單");
      return;
    }
    if (isWatching) {
      removeMutation.mutate({ stockCode: stock.stockCode });
    } else {
      addMutation.mutate({
        stockCode: stock.stockCode,
        stockName: stock.stockName,
        addedPrice: price,
      });
    }
  };

  const allConditionsMet = stock.conditionsMetCount === 5;

  return (
    <Link href={`/chart/${stock.stockCode}`}>
      <div
        className={cn(
          "group relative rounded-xl border bg-card p-4 cursor-pointer transition-all duration-200",
          "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5",
          allConditionsMet ? "border-primary/30 glow-primary" : "border-border"
        )}
      >
        {/* All conditions badge */}
        {allConditionsMet && (
          <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full animate-pulse-glow">
            全條件
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-muted-foreground font-num">{stock.stockCode}</span>
              <span className="text-base font-semibold text-foreground">{stock.stockName}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("text-2xl font-bold font-num", isUp ? "text-stock-up" : isDown ? "text-stock-down" : "text-foreground")}>
                {price.toFixed(2)}
              </span>
              <div className={cn("flex items-center gap-0.5 text-sm font-medium font-num", isUp ? "text-stock-up" : isDown ? "text-stock-down" : "text-muted-foreground")}>
                {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : isDown ? <TrendingDown className="w-3.5 h-3.5" /> : null}
                <span>{change > 0 ? "+" : ""}{change.toFixed(2)}</span>
                <span>({changePct > 0 ? "+" : ""}{changePct.toFixed(2)}%)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-muted-foreground hover:text-primary"
                  onClick={toggleWatchlist}
                >
                  {isWatching ? (
                    <BookmarkCheck className="w-4 h-4 text-primary" />
                  ) : (
                    <BookmarkPlus className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isWatching ? "從觀察清單移除" : "加入觀察清單"}</TooltipContent>
            </Tooltip>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
          </div>
        </div>

        {/* Conditions */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {CONDITIONS.map(({ key, label, short }) => {
            const passed = stock[key];
            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <span className={passed ? "badge-pass" : "badge-fail"}>
                    {passed ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                    {short}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {stock.volumeRatio && (
            <MetricRow label="量比" value={`${Number(stock.volumeRatio).toFixed(2)}x`} highlight={Number(stock.volumeRatio) >= 1.5} />
          )}
          {stock.vrValue && (
            <MetricRow label="VR(26)" value={Number(stock.vrValue).toFixed(1)} highlight={Number(stock.vrValue) >= 120} />
          )}
          {stock.breakoutPrice && (
            <MetricRow label="突破價" value={Number(stock.breakoutPrice).toFixed(2)} />
          )}
          {stock.volume && (
            <MetricRow label="成交量" value={formatVolume(stock.volume)} />
          )}
        </div>

        {/* Condition count bar */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                stock.conditionsMetCount === 5 ? "bg-primary" :
                stock.conditionsMetCount >= 3 ? "bg-chart-3" : "bg-muted-foreground/40"
              )}
              style={{ width: `${(stock.conditionsMetCount / 5) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground font-num shrink-0">
            {stock.conditionsMetCount}/5
          </span>
        </div>
      </div>
    </Link>
  );
}

function MetricRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium font-num", highlight ? "text-primary" : "text-foreground")}>{value}</span>
    </div>
  );
}

function formatVolume(v: number): string {
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}億`;
  if (v >= 10000) return `${(v / 10000).toFixed(1)}萬`;
  return v.toLocaleString();
}
