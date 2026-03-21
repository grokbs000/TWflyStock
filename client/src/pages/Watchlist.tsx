import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookMarked, Trash2, TrendingUp, LogIn, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export default function Watchlist() {
  const { isAuthenticated } = useAuth();

  const { data: watchlist, isLoading, refetch } = trpc.watchlist.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const utils = trpc.useUtils();

  const removeMutation = trpc.watchlist.remove.useMutation({
    onSuccess: (_, vars) => {
      toast.success("已從觀察清單移除");
      utils.watchlist.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!isAuthenticated) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-screen gap-6">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <BookMarked className="w-10 h-10 text-primary/60" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">請先登入</h2>
            <p className="text-muted-foreground text-sm">登入後即可使用觀察清單功能</p>
          </div>
          <Button onClick={() => (window.location.href = getLoginUrl())}>
            <LogIn className="w-4 h-4 mr-2" />
            立即登入
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <BookMarked className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">觀察清單</h1>
              <p className="text-muted-foreground text-xs sm:text-sm hidden sm:block">追蹤你關注的股票</p>
            </div>
          </div>
          {watchlist && (
            <Badge className="bg-secondary text-muted-foreground border-border shrink-0">
              {watchlist.length} 支股票
            </Badge>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : !watchlist || watchlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
              <BookMarked className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-semibold text-foreground mb-1">觀察清單為空</h3>
              <p className="text-muted-foreground text-sm">在飆股雷達頁面點擊書籤圖示，即可將股票加入觀察清單</p>
            </div>
            <Link href="/">
              <Button variant="outline" size="sm">
                <TrendingUp className="w-4 h-4 mr-2" />
                前往飆股雷達
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 animate-slide-up">
            {watchlist.map((item) => (
              <WatchlistCard
                key={item.id}
                item={item}
                onRemove={() => removeMutation.mutate({ stockCode: item.stockCode })}
                isRemoving={removeMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

interface WatchlistItem {
  id: number;
  stockCode: string;
  stockName: string;
  addedPrice: string | null;
  note: string | null;
  createdAt: Date;
}

function WatchlistCard({
  item,
  onRemove,
  isRemoving,
}: {
  item: WatchlistItem;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const addedPrice = item.addedPrice ? Number(item.addedPrice) : null;

  return (
    <div className="group rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs text-muted-foreground font-num">{item.stockCode}</span>
          </div>
          <h3 className="text-base font-semibold text-foreground">{item.stockName}</h3>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link href={`/chart/${item.stockCode}`}>
            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            disabled={isRemoving}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {addedPrice && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">加入時股價</span>
            <span className="font-medium font-num text-foreground">{addedPrice.toFixed(2)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">加入時間</span>
          <span className="text-muted-foreground">{new Date(item.createdAt).toLocaleDateString("zh-TW")}</span>
        </div>
        {item.note && (
          <div className="mt-2 p-2 rounded-lg bg-secondary text-xs text-muted-foreground">
            {item.note}
          </div>
        )}
      </div>
    </div>
  );
}
