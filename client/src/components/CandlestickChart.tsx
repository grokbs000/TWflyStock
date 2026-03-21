import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import { cn } from "@/lib/utils";

interface OHLCVData {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number;
}

interface ChartData {
  dates: string[];
  ohlcv: OHLCVData[];
  ma5: (number | null)[];
  ma10: (number | null)[];
  ma20: (number | null)[];
  ma40: (number | null)[];
  obv: (number | null)[];
  vr26: (number | null)[];
}

interface CandlestickChartProps {
  data: ChartData;
  symbol: string;
}

type ActiveIndicator = "obv" | "vr";

const COLORS = {
  up: "#22c55e",
  down: "#ef4444",
  ma5: "#f59e0b",
  ma10: "#3b82f6",
  ma20: "#8b5cf6",
  ma40: "#ec4899",
  obv: "#06b6d4",
  vr: "#f97316",
  vrRef: "#6b7280",
  grid: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  text: "rgba(255,255,255,0.50)",
};

const CHART_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid, color: "transparent" },
    textColor: COLORS.text,
    fontFamily: "Inter, Noto Sans TC, sans-serif",
    fontSize: 11,
  },
  grid: {
    vertLines: { color: COLORS.grid },
    horzLines: { color: COLORS.grid },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: {
    borderColor: COLORS.border,
    scaleMargins: { top: 0.08, bottom: 0.08 },
  },
  timeScale: {
    borderColor: COLORS.border,
    timeVisible: true,
    secondsVisible: false,
  },
};

export default function CandlestickChart({ data, symbol }: CandlestickChartProps) {
  const priceRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [activeIndicator, setActiveIndicator] = useState<ActiveIndicator>("vr");

  useEffect(() => {
    if (!priceRef.current || !volumeRef.current || !indicatorRef.current) return;

    const validOHLCV = data.ohlcv.filter(
      (d) => d.open !== null && d.high !== null && d.low !== null && d.close !== null
    );

    // ── Price Chart ──────────────────────────────────────────────────────────
    const priceChart = createChart(priceRef.current, { ...CHART_OPTIONS, height: 300 });

    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    });
    // Defensive: deduplicate by time (lightweight-charts crashes on duplicates)
    const ohlcvData = validOHLCV.map((d) => ({
      time: d.date as Time,
      open: d.open!,
      high: d.high!,
      low: d.low!,
      close: d.close!,
    }));

    const uniqueOhlcv = ohlcvData.filter((val, index, self) => 
      index === self.findIndex((t) => t.time === val.time)
    );

    try {
      candleSeries.setData(uniqueOhlcv);
    } catch (e) {
      console.error("CandleSeries setData error:", e);
    }

    // MA Lines
    [
      { maData: data.ma5, color: COLORS.ma5, period: 5 },
      { maData: data.ma10, color: COLORS.ma10, period: 10 },
      { maData: data.ma20, color: COLORS.ma20, period: 20 },
      { maData: data.ma40, color: COLORS.ma40, period: 40 },
    ].forEach(({ maData, color, period }) => {
      const s = priceChart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      const maPoints = data.dates
        .map((date, i) => ({ time: date as Time, value: maData[i] }))
        .filter((d): d is { time: Time; value: number } => d.value !== null);

      const uniqueMa = maPoints.filter((val, index, self) => 
        index === self.findIndex((t) => t.time === val.time)
      );

      try {
        s.setData(uniqueMa);
      } catch (e) {
        console.error(`MA${period} setData error:`, e);
      }
    });

    // ── Volume Chart ─────────────────────────────────────────────────────────
    const volumeChart = createChart(volumeRef.current, {
      ...CHART_OPTIONS,
      height: 90,
      rightPriceScale: {
        ...CHART_OPTIONS.rightPriceScale,
        scaleMargins: { top: 0.1, bottom: 0.0 },
      },
    });

    const volumeSeries = volumeChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "right",
    });
    const volumeData = validOHLCV.map((d, i) => ({
      time: d.date as Time,
      value: d.volume,
      color:
        i > 0 && d.close! >= validOHLCV[i - 1].close!
          ? COLORS.up + "88"
          : COLORS.down + "88",
    }));

    const uniqueVolume = volumeData.filter((val, index, self) => 
      index === self.findIndex((t) => t.time === val.time)
    );

    try {
      volumeSeries.setData(uniqueVolume);
    } catch (e) {
      console.error("VolumeSeries setData error:", e);
    }

    // ── Indicator Chart ───────────────────────────────────────────────────────
    const indicatorChart = createChart(indicatorRef.current, {
      ...CHART_OPTIONS,
      height: 110,
    });

    if (activeIndicator === "obv") {
      const obvSeries = indicatorChart.addSeries(LineSeries, {
        color: COLORS.obv,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      const obvData = data.dates
        .map((date, i) => ({ time: date as Time, value: data.obv[i] }))
        .filter((d): d is { time: Time; value: number } => d.value !== null);

      const uniqueObv = obvData.filter((val, index, self) => 
        index === self.findIndex((t) => t.time === val.time)
      );

      try {
        obvSeries.setData(uniqueObv);
      } catch (e) {
        console.error("OBV setData error:", e);
      }
    } else {
      const vrSeries = indicatorChart.addSeries(LineSeries, {
        color: COLORS.vr,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      const vrData = data.dates
        .map((date, i) => ({ time: date as Time, value: data.vr26[i] }))
        .filter((d): d is { time: Time; value: number } => d.value !== null);

      const uniqueVr = vrData.filter((val, index, self) => 
        index === self.findIndex((t) => t.time === val.time)
      );

      try {
        vrSeries.setData(uniqueVr);
      } catch (e) {
        console.error("VR setData error:", e);
      }

      // Reference line at 120
      const refSeries = indicatorChart.addSeries(LineSeries, {
        color: COLORS.vrRef,
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const validVrDates = data.dates.filter((_, i) => data.vr26[i] !== null);
      if (validVrDates.length > 0) {
        refSeries.setData(
          validVrDates.map((date) => ({ time: date as Time, value: 120 }))
        );
      }
    }

    // Sync time scales
    const charts: IChartApi[] = [priceChart, volumeChart, indicatorChart].filter(Boolean);
    charts.forEach((chart, idx) => {
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!range) return;
        charts.forEach((other, j) => {
          if (j !== idx && other && other.timeScale) {
            try {
              other.timeScale().setVisibleLogicalRange(range);
            } catch (e) {
              // Ignore sync errors to prevent crash
            }
          }
        });
      });
    });

    priceChart.timeScale().fitContent();
    volumeChart.timeScale().fitContent();
    indicatorChart.timeScale().fitContent();

    const handleResize = () => {
      if (priceRef.current) priceChart.applyOptions({ width: priceRef.current.clientWidth });
      if (volumeRef.current) volumeChart.applyOptions({ width: volumeRef.current.clientWidth });
      if (indicatorRef.current) indicatorChart.applyOptions({ width: indicatorRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      priceChart.remove();
      volumeChart.remove();
      indicatorChart.remove();
    };
  }, [data, activeIndicator]);

  return (
    <div className="p-4 space-y-1">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
        <span className="text-xs font-semibold text-muted-foreground">{symbol} K線圖</span>
        {[
          { color: COLORS.ma5, label: "MA5" },
          { color: COLORS.ma10, label: "MA10" },
          { color: COLORS.ma20, label: "MA20" },
          { color: COLORS.ma40, label: "MA40" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded" style={{ backgroundColor: color }} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Price Chart */}
      <div ref={priceRef} className="w-full" />

      {/* Volume Chart */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-xs text-muted-foreground">成交量</span>
      </div>
      <div ref={volumeRef} className="w-full" />

      {/* Indicator Tabs */}
      <div className="flex items-center gap-1 pt-2">
        {(["obv", "vr"] as ActiveIndicator[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveIndicator(tab)}
            className={cn(
              "px-3 py-1 rounded text-xs font-medium transition-all",
              activeIndicator === tab
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "obv" ? "OBV" : "VR(26)"}
          </button>
        ))}
      </div>

      {/* Indicator Chart */}
      <div ref={indicatorRef} className="w-full" />
    </div>
  );
}
