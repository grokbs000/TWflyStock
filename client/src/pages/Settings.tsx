import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Loader2, Settings as SettingsIcon, Save, RotateCcw, LogIn, Info, Bell, Database } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";

const DEFAULTS = {
  maPeriods: [5, 10, 20, 40],
  volumeMultiplier: 1.5,
  vrThreshold: 120,
  vrPeriod: 26,
  bullishCandleMinPct: 2.0,
  scanLimit: 900,
  autoRunEnabled: false,
};

export default function Settings() {
  const { isAuthenticated } = useAuth();

  const { data: settings, isLoading } = trpc.screener.getSettings.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: stockTotal } = trpc.screener.getStockTotal.useQuery();

  const [maPeriods, setMaPeriods] = useState<number[]>(DEFAULTS.maPeriods);
  const [volumeMultiplier, setVolumeMultiplier] = useState(DEFAULTS.volumeMultiplier);
  const [vrThreshold, setVrThreshold] = useState(DEFAULTS.vrThreshold);
  const [vrPeriod, setVrPeriod] = useState(DEFAULTS.vrPeriod);
  const [bullishMinPct, setBullishMinPct] = useState(DEFAULTS.bullishCandleMinPct);
  const [scanLimit, setScanLimit] = useState(DEFAULTS.scanLimit);
  const [autoRunEnabled, setAutoRunEnabled] = useState(DEFAULTS.autoRunEnabled);

  const totalStocks = (stockTotal as { total?: number })?.total ?? 1958;

  useEffect(() => {
    if (settings) {
      setMaPeriods(settings.maPeriods ?? DEFAULTS.maPeriods);
      setVolumeMultiplier(Number(settings.volumeMultiplier ?? DEFAULTS.volumeMultiplier));
      setVrThreshold(Number(settings.vrThreshold ?? DEFAULTS.vrThreshold));
      setVrPeriod(Number(settings.vrPeriod ?? DEFAULTS.vrPeriod));
      setBullishMinPct(Number(settings.bullishCandleMinPct ?? DEFAULTS.bullishCandleMinPct));
      setScanLimit(Number((settings as { scanLimit?: number }).scanLimit ?? DEFAULTS.scanLimit));
      setAutoRunEnabled(Boolean((settings as { autoRunEnabled?: boolean }).autoRunEnabled ?? DEFAULTS.autoRunEnabled));
    }
  }, [settings]);

  const utils = trpc.useUtils();

  const updateMutation = trpc.screener.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("設定已儲存");
      utils.screener.getSettings.invalidate();
    },
    onError: (e) => toast.error(`儲存失敗：${e.message}`),
  });

  const toggleAutoRun = trpc.notifications.toggleAutoRun.useMutation({
    onSuccess: (data) => {
      setAutoRunEnabled(data.enabled);
      toast.success(data.enabled ? "已開啟每日自動篩選通知" : "已關閉每日自動篩選通知");
      utils.screener.getSettings.invalidate();
    },
    onError: (e) => toast.error(`操作失敗：${e.message}`),
  });

  const handleSave = () => {
    updateMutation.mutate({
      maPeriods,
      volumeMultiplier,
      vrThreshold,
      vrPeriod,
      bullishCandleMinPct: bullishMinPct,
      scanLimit,
      autoRunEnabled,
    });
  };

  const handleReset = () => {
    setMaPeriods(DEFAULTS.maPeriods);
    setVolumeMultiplier(DEFAULTS.volumeMultiplier);
    setVrThreshold(DEFAULTS.vrThreshold);
    setVrPeriod(DEFAULTS.vrPeriod);
    setBullishMinPct(DEFAULTS.bullishCandleMinPct);
    setScanLimit(DEFAULTS.scanLimit);
    setAutoRunEnabled(DEFAULTS.autoRunEnabled);
    toast.info("已重置為預設值（尚未儲存）");
  };

  if (!isAuthenticated) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-screen gap-6">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <SettingsIcon className="w-10 h-10 text-primary/60" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">請先登入</h2>
            <p className="text-muted-foreground text-sm">登入後即可自訂篩選條件參數</p>
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
      <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 min-h-screen max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <SettingsIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">篩選設定</h1>
              <p className="text-muted-foreground text-xs sm:text-sm hidden sm:block">自訂技術指標篩選條件與通知設定</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleReset} className="border-border text-muted-foreground h-8 px-2 sm:px-3">
              <RotateCcw className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">重置</span>
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} className="h-8">
              {updateMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 sm:mr-1.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 sm:mr-1.5" />
              )}
              <span className="hidden sm:inline">儲存設定</span>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : (
          <div className="space-y-6 animate-slide-up">

            {/* ── 通知設定 ── */}
            <SettingSection
              title="每日自動篩選通知"
              description="開啟後，每天台股收盤後（14:35）將自動執行飆股篩選，並以站內通知告知結果"
              icon={<Bell className="w-4 h-4 text-amber-400" />}
              accent
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">自動篩選通知</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {autoRunEnabled ? "已開啟 — 每日收盤後自動篩選並通知" : "已關閉 — 需手動執行篩選"}
                  </p>
                </div>
                <Switch
                  checked={autoRunEnabled}
                  onCheckedChange={(checked) => {
                    setAutoRunEnabled(checked);
                    toggleAutoRun.mutate({ enabled: checked });
                  }}
                  disabled={toggleAutoRun.isPending}
                  className="data-[state=checked]:bg-amber-500"
                />
              </div>
              <div className="mt-3 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                <p className="text-xs text-amber-400/80">
                  💡 開啟後，系統將在每個交易日下午 2:35 自動執行篩選，找到飆股後立即推送通知到「通知中心」。
                </p>
              </div>
            </SettingSection>

            {/* ── 掃描範圍設定 ── */}
            <SettingSection
              title="掃描股票數量"
              description="設定每次篩選要掃描的股票數量。掃描越多股票越全面，但耗時也越長"
              icon={<Database className="w-4 h-4 text-blue-400" />}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-foreground">掃描數量</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold font-num text-primary">
                      {scanLimit === 0 ? "全部" : scanLimit}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      / {totalStocks} 支
                    </span>
                  </div>
                </div>
                <Slider
                  value={[scanLimit === 0 ? totalStocks : scanLimit]}
                  onValueChange={([v]) => {
                    setScanLimit(v >= totalStocks ? 0 : v);
                  }}
                  min={100}
                  max={totalStocks}
                  step={50}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>100 支（快速）</span>
                  <span>全部 {totalStocks} 支（完整）</span>
                </div>
                {/* 快速選擇按鈕 */}
                <div className="flex flex-wrap gap-2">
                  {[100, 300, 500, 900, 0].map((val) => (
                    <button
                      key={val}
                      onClick={() => setScanLimit(val)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                        scanLimit === val
                          ? "bg-primary/20 border-primary text-primary"
                          : "bg-transparent border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {val === 0 ? `全部 (${totalStocks})` : val}
                    </button>
                  ))}
                </div>
                <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
                  <p className="text-xs text-blue-400/80">
                    ⏱ 預估掃描時間：{scanLimit === 0 || scanLimit >= totalStocks
                      ? `約 ${Math.ceil(totalStocks / 67 * 2.4 / 60)} 分鐘`
                      : scanLimit <= 100
                      ? "約 10 秒"
                      : `約 ${Math.ceil(scanLimit / 67 * 2.4)} 秒`}
                    （10 執行緒並行下載）
                  </p>
                </div>
              </div>
            </SettingSection>

            {/* ── MA Settings ── */}
            <SettingSection
              title="移動平均線（MA）"
              description="設定用於判斷多頭排列的均線天數，股價需高於所有均線且均線呈多頭排列"
            >
              <div className="space-y-3">
                <Label className="text-sm text-foreground">均線天數（以逗號分隔）</Label>
                <Input
                  value={maPeriods.join(", ")}
                  onChange={(e) => {
                    const vals = e.target.value
                      .split(",")
                      .map((v) => parseInt(v.trim()))
                      .filter((v) => !isNaN(v) && v > 0 && v <= 200);
                    if (vals.length >= 2) setMaPeriods(vals);
                  }}
                  className="bg-input border-border text-foreground font-num"
                  placeholder="5, 10, 20, 40"
                />
                <div className="flex flex-wrap gap-1.5">
                  {maPeriods.map((p) => (
                    <span key={p} className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-num border border-primary/30">
                      MA{p}
                    </span>
                  ))}
                </div>
              </div>
            </SettingSection>

            {/* ── Volume Settings ── */}
            <SettingSection
              title="成交量放大倍數"
              description="近期成交量需超過過去10日均量的指定倍數"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-foreground">倍數閾值</Label>
                  <span className="text-lg font-bold font-num text-primary">{volumeMultiplier.toFixed(1)}x</span>
                </div>
                <Slider
                  value={[volumeMultiplier]}
                  onValueChange={([v]) => setVolumeMultiplier(v)}
                  min={1.0}
                  max={5.0}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1.0x（寬鬆）</span>
                  <span>5.0x（嚴格）</span>
                </div>
              </div>
            </SettingSection>

            {/* ── VR Settings ── */}
            <SettingSection
              title="VR 成交量比率"
              description="VR（Volume Ratio）指標衡量市場買賣力道，數值越高代表買氣越旺"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm text-foreground">VR 閾值</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={vrThreshold}
                      onChange={(e) => setVrThreshold(Number(e.target.value))}
                      min={50}
                      max={500}
                      className="bg-input border-border text-foreground font-num"
                    />
                    <span className="text-muted-foreground text-sm shrink-0">（建議 120）</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-foreground">VR 計算週期（天）</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={vrPeriod}
                      onChange={(e) => setVrPeriod(Number(e.target.value))}
                      min={5}
                      max={60}
                      className="bg-input border-border text-foreground font-num"
                    />
                    <span className="text-muted-foreground text-sm shrink-0">（建議 26）</span>
                  </div>
                </div>
              </div>
            </SettingSection>

            {/* ── Bullish Candle Settings ── */}
            <SettingSection
              title="長紅K線最小漲幅"
              description="當日收盤相對開盤的最小漲幅百分比，用於判斷是否為長紅K線"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-foreground">最小漲幅</Label>
                  <span className="text-lg font-bold font-num text-primary">{bullishMinPct.toFixed(1)}%</span>
                </div>
                <Slider
                  value={[bullishMinPct]}
                  onValueChange={([v]) => setBullishMinPct(v)}
                  min={0.5}
                  max={10.0}
                  step={0.5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0.5%（寬鬆）</span>
                  <span>10.0%（嚴格）</span>
                </div>
              </div>
            </SettingSection>

            {/* Info */}
            <div className="rounded-xl border border-border bg-secondary/50 p-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>設定變更後，下次執行篩選時將自動套用新的參數。</p>
                  <p>建議使用預設值以獲得最佳篩選效果，過於寬鬆的條件可能導致大量結果。</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function SettingSection({
  title,
  description,
  children,
  icon,
  accent,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? "border-amber-500/20 bg-amber-500/5" : "border-border bg-card"}`}>
      <div className="mb-4 flex items-start gap-2">
        {icon && <div className="mt-0.5">{icon}</div>}
        <div>
          <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
