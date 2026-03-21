/**
 * 台股技術指標計算引擎（TypeScript 版）
 * 使用 yahoo-finance2 取代 Python yfinance，完全在 Node.js 中執行
 * 取代原有的 Python Flask 服務（stock_service.py）
 */
import yahooFinance from "yahoo-finance2";
import pLimit from "p-limit";

// ─── 型別定義 ──────────────────────────────────────────────────────────────

export interface OhlcvBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ConditionResult {
  pass: boolean;
  reason?: string;
  [key: string]: unknown;
}

export interface ScreenResult {
  stockCode: string;
  stockName: string;
  currentPrice: number;
  priceChange: number;
  priceChangePct: number;
  volume: number;
  condMaAligned: boolean;
  condVolumeSpike: boolean;
  condObvRising: boolean;
  condVrAbove: boolean;
  condBullishBreakout: boolean;
  conditionsMetCount: number;
  maValues: Record<string, number>;
  volumeRatio: number | null;
  vrValue: number | null;
  obvValue: number | null;
  breakoutPrice: number | null;
  details: {
    ma: ConditionResult;
    volume: ConditionResult;
    obv: ConditionResult;
    vr: ConditionResult;
    breakout: ConditionResult;
  };
}

export interface ChartData {
  dates: string[];
  ohlcv: OhlcvBar[];
  ma5: (number | null)[];
  ma10: (number | null)[];
  ma20: (number | null)[];
  ma40: (number | null)[];
  obv: (number | null)[];
  vr26: (number | null)[];
}

export interface ScreenParams {
  maPeriods?: number[];
  volumeMultiplier?: number;
  vrThreshold?: number;
  vrPeriod?: number;
  bullishMinPct?: number;
  scanLimit?: number;
  minConditions?: number;
}

// ─── 股票清單快取 ──────────────────────────────────────────────────────────

let _stockCache: Array<[string, string]> = [];
let _stockCacheTime: number | null = null;
const STOCK_CACHE_TTL = 3600 * 1000; // 1 hour

async function fetchStockList(): Promise<Array<[string, string]>> {
  const stocks: Array<[string, string]> = [];
  const seen = new Set<string>();

  // 1. TWSE 上市股票
  try {
    const r = await fetch(
      "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
      { signal: AbortSignal.timeout(15000) }
    );
    if (r.ok) {
      const data = (await r.json()) as Array<{ Code?: string; Name?: string }>;
      for (const item of data) {
        const code = item.Code ?? "";
        const name = item.Name ?? "";
        if (code && name && /^\d{4}$/.test(code)) {
          stocks.push([code, name]);
          seen.add(code);
        }
      }
    }
  } catch (e) {
    console.warn("[StockList] TWSE fetch error:", e);
  }

  // 2. TPEX 上櫃股票
  try {
    const r2 = await fetch(
      "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis",
      {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      }
    );
    if (r2.ok) {
      const data2 = (await r2.json()) as Array<{
        SecuritiesCompanyCode?: string;
        CompanyName?: string;
      }>;
      for (const item of data2) {
        const code = item.SecuritiesCompanyCode ?? "";
        const name = item.CompanyName ?? "";
        if (code && name && /^\d{4}$/.test(code) && !seen.has(code)) {
          stocks.push([code, name]);
          seen.add(code);
        }
      }
    }
  } catch (e) {
    console.warn("[StockList] TPEX fetch error:", e);
  }

  return stocks;
}

export async function getTwStocks(): Promise<Array<[string, string]>> {
  const now = Date.now();
  if (_stockCache.length > 0 && _stockCacheTime && now - _stockCacheTime < STOCK_CACHE_TTL) {
    return _stockCache;
  }
  const list = await fetchStockList();
  if (list.length > 0) {
    _stockCache = list;
    _stockCacheTime = now;
  }
  return _stockCache.length > 0 ? _stockCache : list;
}

// ─── 歷史數據獲取（使用 Yahoo Finance v8 API，繞過 v7 的 429 限制）──────────

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchV8Chart(ticker: string, range = "6mo"): Promise<OhlcvBar[] | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}`;
    const resp = await fetch(url, {
      headers: YF_HEADERS,
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as {
      chart: {
        result?: Array<{
          timestamp: number[];
          indicators: {
            quote: Array<{
              open: (number | null)[];
              high: (number | null)[];
              low: (number | null)[];
              close: (number | null)[];
              volume: (number | null)[];
            }>;
          };
        }>;
        error?: unknown;
      };
    };
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const { timestamp, indicators } = result;
    const q = indicators.quote[0];
    if (!timestamp || !q) return null;

    const bars: OhlcvBar[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      const close = q.close[i];
      if (close == null || close === 0) continue;
      bars.push({
        date: new Date(timestamp[i] * 1000).toISOString().slice(0, 10),
        open: q.open[i] ?? close,
        high: q.high[i] ?? close,
        low: q.low[i] ?? close,
        close,
        volume: q.volume[i] ?? 0,
      });
    }
    return bars.length >= 20 ? bars : null;
  } catch {
    return null;
  }
}

export async function getStockData(
  symbol: string,
  _periodDays = 60
): Promise<OhlcvBar[] | null> {
  // 使用 6mo range 確保有足夠的 K 棒（約 120 根）
  let bars = await fetchV8Chart(`${symbol}.TW`, "6mo");
  if (!bars || bars.length < 20) {
    bars = await fetchV8Chart(`${symbol}.TWO`, "6mo");
  }
  return bars && bars.length >= 20 ? bars : null;
}

// ─── 技術指標計算 ──────────────────────────────────────────────────────────

function calcMa(close: number[], period: number): (number | null)[] {
  return close.map((_, i) => {
    if (i < period - 1) return null;
    const slice = close.slice(i - period + 1, i + 1);
    return round2(slice.reduce((a, b) => a + b, 0) / period);
  });
}

function calcObv(close: number[], volume: number[]): number[] {
  const obv: number[] = [0];
  for (let i = 1; i < close.length; i++) {
    if (close[i] > close[i - 1]) obv.push(obv[i - 1] + volume[i]);
    else if (close[i] < close[i - 1]) obv.push(obv[i - 1] - volume[i]);
    else obv.push(obv[i - 1]);
  }
  return obv;
}

function calcVr(close: number[], volume: number[], period = 26): (number | null)[] {
  return close.map((_, i) => {
    if (i < period) return null;
    const wc = close.slice(i - period + 1, i + 1);
    const wv = volume.slice(i - period + 1, i + 1);
    let up = 0, down = 0, flat = 0;
    for (let j = 1; j < wc.length; j++) {
      const v = wv[j];
      if (wc[j] > wc[j - 1]) up += v;
      else if (wc[j] < wc[j - 1]) down += v;
      else flat += v;
    }
    const denom = down + 0.5 * flat;
    if (denom === 0) return null;
    return round2(((up + 0.5 * flat) / denom) * 100);
  });
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── 條件檢查 ──────────────────────────────────────────────────────────────

function checkMaAligned(bars: OhlcvBar[], maPeriods: number[]): ConditionResult {
  const close = bars.map((b) => b.close);
  const sorted = [...maPeriods].sort((a, b) => a - b);
  const maMap: Record<number, (number | null)[]> = {};
  for (const p of sorted) maMap[p] = calcMa(close, p);

  const latestMas: Record<number, number> = {};
  for (const p of sorted) {
    const v = maMap[p][close.length - 1];
    if (v === null) return { pass: false, reason: "MA 數據不足", values: {} };
    latestMas[p] = v;
  }

  const latestClose = close[close.length - 1];
  const priceAboveAllMa = Object.values(latestMas).every((v) => latestClose > v);
  const maAligned = sorted.every(
    (p, i) => i === 0 || latestMas[sorted[i - 1]] > latestMas[p]
  );
  const shortMa = maMap[sorted[0]].filter((v): v is number => v !== null);
  const maRising = shortMa.length >= 3 && shortMa[shortMa.length - 1] > shortMa[shortMa.length - 3];

  return {
    pass: priceAboveAllMa && maAligned && maRising,
    priceAboveAllMa,
    maAligned,
    maRising,
    values: Object.fromEntries(Object.entries(latestMas).map(([k, v]) => [k, round2(v)])),
  };
}

function checkVolumeSpike(bars: OhlcvBar[], multiplier = 1.5): ConditionResult {
  if (bars.length < 11) return { pass: false, reason: "成交量數據不足" };
  const volume = bars.map((b) => b.volume);
  const latest = volume[volume.length - 1];
  const avg10 = volume.slice(-11, -1).reduce((a, b) => a + b, 0) / 10;
  if (avg10 === 0) return { pass: false, reason: "均量為零" };
  const ratio = latest / avg10;
  return {
    pass: ratio >= multiplier,
    latestVolume: Math.round(latest),
    avgVolume10: Math.round(avg10),
    ratio: round2(ratio),
  };
}

function checkObvRising(bars: OhlcvBar[]): ConditionResult {
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume);
  const obv = calcObv(close, volume);
  if (obv.length < 20) return { pass: false, reason: "OBV 數據不足" };
  const latest = obv[obv.length - 1];
  const max20 = Math.max(...obv.slice(-21, -1));
  const obvNewHigh = latest > max20;
  const recent5 = obv.slice(-5);
  const slope = recent5.length >= 3
    ? (recent5[recent5.length - 1] - recent5[0]) / (recent5.length - 1)
    : 0;
  const obvRising = slope > 0;
  return {
    pass: obvNewHigh && obvRising,
    latestObv: round2(latest),
    obv20Max: round2(max20),
    obvNewHigh,
    obvRising,
  };
}

function checkVr(bars: OhlcvBar[], threshold = 120, period = 26): ConditionResult {
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume);
  const vr = calcVr(close, volume, period);
  const valid = vr.filter((v): v is number => v !== null);
  if (valid.length === 0) return { pass: false, reason: "VR 數據不足" };
  const latest = valid[valid.length - 1];
  return { pass: latest > threshold, vrValue: round2(latest), threshold };
}

function checkBullishBreakout(bars: OhlcvBar[], minPct = 2.0): ConditionResult {
  if (bars.length < 21) return { pass: false, reason: "數據不足" };
  const latest = bars[bars.length - 1];
  if (latest.open === 0) return { pass: false, reason: "開盤價為零" };
  const candlePct = ((latest.close - latest.open) / latest.open) * 100;
  const isBullish = candlePct >= minPct;
  const prevHigh = Math.max(...bars.slice(-21, -1).map((b) => b.high));
  const isBreakout = latest.close > prevHigh;
  return {
    pass: isBullish && isBreakout,
    closePct: round2(candlePct),
    isBullishCandle: isBullish,
    prevHigh: round2(prevHigh),
    isBreakout,
    currentClose: round2(latest.close),
  };
}

// ─── 單股篩選 ──────────────────────────────────────────────────────────────

export async function screenStock(
  symbol: string,
  name: string,
  params: ScreenParams = {}
): Promise<ScreenResult | null> {
  const maPeriods = params.maPeriods ?? [5, 10, 20, 40];
  const volumeMultiplier = params.volumeMultiplier ?? 1.5;
  const vrThreshold = params.vrThreshold ?? 120;
  const vrPeriod = params.vrPeriod ?? 26;
  const bullishMinPct = params.bullishMinPct ?? 2.0;

  const bars = await getStockData(symbol, 90);
  if (!bars || bars.length < 41) return null;

  const latest = bars[bars.length - 1];
  const prev = bars[bars.length - 2] ?? latest;
  const priceChange = latest.close - prev.close;
  const priceChangePct = prev.close !== 0 ? (priceChange / prev.close) * 100 : 0;

  const condMa = checkMaAligned(bars, maPeriods);
  const condVol = checkVolumeSpike(bars, volumeMultiplier);
  const condObv = checkObvRising(bars);
  const condVr = checkVr(bars, vrThreshold, vrPeriod);
  const condBreakout = checkBullishBreakout(bars, bullishMinPct);

  const conditionsMetCount = [
    condMa.pass, condVol.pass, condObv.pass, condVr.pass, condBreakout.pass,
  ].filter(Boolean).length;

  return {
    stockCode: symbol,
    stockName: name,
    currentPrice: round2(latest.close),
    priceChange: round2(priceChange),
    priceChangePct: round2(priceChangePct),
    volume: Math.round(latest.volume),
    condMaAligned: condMa.pass,
    condVolumeSpike: condVol.pass,
    condObvRising: condObv.pass,
    condVrAbove: condVr.pass,
    condBullishBreakout: condBreakout.pass,
    conditionsMetCount,
    maValues: (condMa.values as Record<string, number>) ?? {},
    volumeRatio: (condVol.ratio as number) ?? null,
    vrValue: (condVr.vrValue as number) ?? null,
    obvValue: (condObv.latestObv as number) ?? null,
    breakoutPrice: (condBreakout.prevHigh as number) ?? null,
    details: { ma: condMa, volume: condVol, obv: condObv, vr: condVr, breakout: condBreakout },
  };
}

// ─── 批次篩選（背景 Job） ──────────────────────────────────────────────────

export interface ScreenJob {
  status: "pending" | "running" | "done" | "error" | "cancelled";
  progress: number;
  total: number;
  scanned: number;
  results: ScreenResult[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const _jobs = new Map<string, ScreenJob>();

export function getJob(jobId: string): ScreenJob | undefined {
  return _jobs.get(jobId);
}

export function cancelJob(jobId: string): boolean {
  const job = _jobs.get(jobId);
  if (!job || job.status === "done" || job.status === "error") return false;
  job.status = "cancelled";
  return true;
}

export async function startScreenJob(
  jobId: string,
  params: ScreenParams
): Promise<void> {
  const job: ScreenJob = {
    status: "running",
    progress: 0,
    total: 0,
    scanned: 0,
    results: [],
    startedAt: Date.now(),
  };
  _jobs.set(jobId, job);

  try {
    const allStocks = await getTwStocks();
    const limit = params.scanLimit ?? 100;
    const minCond = params.minConditions ?? 5;
    const stocks = allStocks.slice(0, limit);
    job.total = stocks.length;

    const concurrency = pLimit(10);

    const tasks = stocks.map(([code, name]) =>
      concurrency(async () => {
        if (job.status === "cancelled") return;
        try {
          const result = await screenStock(code, name, params);
          if (result && result.conditionsMetCount >= minCond) {
            job.results.push(result);
          }
        } catch {
          // ignore individual stock errors
        } finally {
          job.scanned += 1;
          job.progress = Math.round((job.scanned / job.total) * 100);
        }
      })
    );

    await Promise.all(tasks);

    if (job.status !== "cancelled") {
      job.status = "done";
    }
  } catch (e) {
    job.status = "error";
    job.error = String(e);
  } finally {
    job.finishedAt = Date.now();
  }
}

// ─── 圖表數據 ──────────────────────────────────────────────────────────────

export async function getChartData(
  symbol: string,
  periodDays = 90
): Promise<ChartData | null> {
  const bars = await getStockData(symbol, periodDays);
  if (!bars || bars.length === 0) return null;

  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume);

  return {
    dates: bars.map((b) => b.date),
    ohlcv: bars,
    ma5: calcMa(close, 5),
    ma10: calcMa(close, 10),
    ma20: calcMa(close, 20),
    ma40: calcMa(close, 40),
    obv: calcObv(close, volume).map(round2),
    vr26: calcVr(close, volume, 26),
  };
}

// ─── 即時報價 ──────────────────────────────────────────────────────────────

export async function getQuote(symbol: string) {
  try {
    const result = await yahooFinance.quoteSummary(`${symbol}.TW`, {
      modules: ["price"],
    }, { validateResult: false });
    const price = result.price;
    return {
      symbol,
      price: price?.regularMarketPrice ?? null,
      previousClose: price?.regularMarketPreviousClose ?? null,
      volume: price?.regularMarketVolume ?? null,
      marketCap: price?.marketCap ?? null,
    };
  } catch {
    return null;
  }
}
