import { cn } from "@/lib/utils";
import { Activity, CheckCircle2, Search, Calendar } from "lucide-react";

interface StatsBarProps {
  totalScanned: number;
  totalMatched: number;
  runDate: string;
  status: string;
}

export default function StatsBar({ totalScanned, totalMatched, runDate, status }: StatsBarProps) {
  const matchRate = totalScanned > 0 ? ((totalMatched / totalScanned) * 100).toFixed(1) : "0.0";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard
        icon={<Search className="w-4 h-4" />}
        label="掃描股票"
        value={totalScanned.toLocaleString()}
        unit="支"
      />
      <StatCard
        icon={<CheckCircle2 className="w-4 h-4" />}
        label="符合條件"
        value={totalMatched.toLocaleString()}
        unit="支"
        highlight={totalMatched > 0}
      />
      <StatCard
        icon={<Activity className="w-4 h-4" />}
        label="命中率"
        value={matchRate}
        unit="%"
        highlight={Number(matchRate) > 0}
      />
      <StatCard
        icon={<Calendar className="w-4 h-4" />}
        label="篩選日期"
        value={runDate}
        status={status}
      />
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
  status?: string;
}

function StatCard({ icon, label, value, unit, highlight, status }: StatCardProps) {
  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 transition-all",
      highlight ? "border-primary/30 bg-primary/5" : "border-border"
    )}>
      <div className={cn("flex items-center gap-2 mb-2 text-xs", highlight ? "text-primary" : "text-muted-foreground")}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-xl font-bold font-num", highlight ? "text-primary" : "text-foreground")}>
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        {status && (
          <span className={cn(
            "text-xs px-1.5 py-0.5 rounded-full ml-1",
            status === "completed" ? "bg-primary/15 text-primary" :
            status === "running" ? "bg-chart-3/15 text-chart-3" :
            "bg-destructive/15 text-destructive"
          )}>
            {status === "completed" ? "完成" : status === "running" ? "執行中" : "失敗"}
          </span>
        )}
      </div>
    </div>
  );
}
