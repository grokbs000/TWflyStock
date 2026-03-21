import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, History as HistoryIcon, CheckCircle2, XCircle, Clock, Download, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import StockCard from "@/components/StockCard";
import { toast } from "sonner";

function exportToCsv(results: unknown[], runDate: string) {
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

  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `飆股篩選_${runDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`已匯出 ${results.length} 支股票資料`);
}

export default function History() {
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false); // mobile: toggle list/detail

  const { data: history, isLoading: historyLoading } = trpc.screener.getHistory.useQuery({ limit: 30 });

  const { data: runDetail, isLoading: detailLoading } = trpc.screener.getResultsByRunId.useQuery(
    { runId: selectedRunId! },
    { enabled: selectedRunId !== null }
  );

  const handleSelectRun = (id: number) => {
    setSelectedRunId(id);
    setShowDetail(true); // on mobile, switch to detail view
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 min-h-screen">
        {/* Header */}
        <div className="flex items-center gap-3">
          {/* Mobile back button when viewing detail */}
          {showDetail && selectedRunId && (
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-secondary transition-colors"
              onClick={() => setShowDetail(false)}
            >
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <HistoryIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">篩選歷史</h1>
            <p className="text-muted-foreground text-xs sm:text-sm hidden sm:block">查看過去的篩選記錄與結果</p>
          </div>
          {/* CSV export button in header when detail is shown */}
          {showDetail && runDetail && runDetail.results.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCsv(runDetail.results, runDetail.run.runDate)}
              className="border-border text-muted-foreground hover:text-foreground h-8"
            >
              <Download className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">匯出 CSV</span>
            </Button>
          )}
        </div>

        {/* Desktop: side-by-side layout | Mobile: toggle list/detail */}
        <div className="flex gap-5">
          {/* History List */}
          <div className={cn(
            "shrink-0",
            // Desktop: always show
            "md:block md:w-72",
            // Mobile: show list OR detail
            showDetail ? "hidden" : "block w-full"
          )}>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">篩選記錄</h2>
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              </div>
            ) : !history || history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">尚無篩選記錄</div>
            ) : (
              <div className="space-y-2">
                {history.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => handleSelectRun(run.id)}
                    className={cn(
                      "w-full text-left rounded-lg border p-3 transition-all",
                      selectedRunId === run.id
                        ? "border-primary/40 bg-primary/8"
                        : "border-border bg-card hover:border-primary/20"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{run.runDate}</span>
                      <StatusBadge status={run.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>掃描 {run.totalScanned} 支</span>
                      <span className={cn("font-medium", run.totalMatched > 0 ? "text-primary" : "")}>
                        找到 {run.totalMatched} 支
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(run.createdAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Run Detail */}
          <div className={cn(
            "flex-1 min-w-0",
            // Desktop: always show
            "md:block",
            // Mobile: show only when detail is active
            showDetail ? "block" : "hidden"
          )}>
            {!selectedRunId ? (
              <div className="hidden md:flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
                <HistoryIcon className="w-10 h-10 opacity-30" />
                <p className="text-sm">選擇左側記錄查看詳情</p>
              </div>
            ) : detailLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : runDetail ? (
              <div className="animate-slide-up">
                <div className="flex items-center justify-between mb-4 gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">
                      {runDetail.run.runDate} 篩選結果
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      掃描 {runDetail.run.totalScanned} 支 · 找到 {runDetail.run.totalMatched} 支飆股
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={runDetail.run.status} />
                    {runDetail.results.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportToCsv(runDetail.results, runDetail.run.runDate)}
                        className="border-border text-muted-foreground hover:text-foreground hidden md:flex"
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        匯出 CSV
                      </Button>
                    )}
                  </div>
                </div>

                {runDetail.results.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    此次篩選未找到符合條件的股票
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                    {runDetail.results.map((stock) => (
                      <StockCard key={stock.id} stock={stock} />
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 shrink-0">
        <CheckCircle2 className="w-3 h-3" />
        完成
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30 shrink-0">
        <XCircle className="w-3 h-3" />
        失敗
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-chart-3/15 text-chart-3 border border-chart-3/30 shrink-0">
      <Loader2 className="w-3 h-3 animate-spin" />
      執行中
    </span>
  );
}
