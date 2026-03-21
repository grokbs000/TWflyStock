#!/usr/bin/env python3
"""
台股技術指標計算服務
提供 Flask REST API 供 Node.js 後端呼叫
計算 MA、OBV、VR 等技術指標，並執行飆股篩選
支援 SSE 串流進度推送，解決大量股票掃描超時問題
"""
import json
import sys
import traceback
from datetime import datetime, timedelta
from typing import Any, Generator

import numpy as np
import pandas as pd
import yfinance as yf
from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# 自定義 JSON encoder，處理 numpy 類型
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

app.json_encoder = NumpyEncoder

def safe_bool(v) -> bool:
    return bool(v)

def safe_int(v) -> int:
    if v is None:
        return 0
    return int(v)

def safe_float_val(v, decimals=2):
    if v is None:
        return None
    try:
        f = float(v)
        if np.isnan(f) or np.isinf(f):
            return None
        return round(f, decimals)
    except (TypeError, ValueError):
        return None

# ─── 台股股票清單（動態載入全台股上市+上櫃） ──────────────────────────────────────
_STOCK_CACHE: list[tuple[str, str]] = []
_STOCK_CACHE_TIME: datetime | None = None
_STOCK_CACHE_TTL = 3600  # 1 小時更新一次

def _fetch_stock_list() -> list[tuple[str, str]]:
    """從 TWSE + TPEX API 動態獲取全台股清單"""
    stocks: list[tuple[str, str]] = []
    seen: set[str] = set()

    # 1. TWSE 上市股票
    try:
        import requests as req
        r = req.get(
            "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
            timeout=15
        )
        if r.status_code == 200:
            for item in r.json():
                code = item.get("Code", "")
                name = item.get("Name", "")
                if code and name and code.isdigit() and len(code) == 4:
                    stocks.append((code, name))
                    seen.add(code)
    except Exception as e:
        print(f"[StockList] TWSE fetch error: {e}", file=sys.stderr)

    # 2. TPEX 上櫃股票
    try:
        import requests as req
        r2 = req.get(
            "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis",
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
        )
        if r2.status_code == 200 and r2.text.strip():
            for item in r2.json():
                code = item.get("SecuritiesCompanyCode", "")
                name = item.get("CompanyName", "")
                if code and name and code.isdigit() and len(code) == 4 and code not in seen:
                    stocks.append((code, name))
                    seen.add(code)
    except Exception as e:
        print(f"[StockList] TPEX fetch error: {e}", file=sys.stderr)

    # 若 API 失敗，使用精選備用清單
    if len(stocks) < 50:
        stocks = [
            ("2330", "台積電"), ("2303", "聯電"), ("2317", "鴻海"), ("2454", "聯發科"),
            ("2881", "富邦金"), ("2882", "國泰金"), ("2891", "中信金"), ("2885", "元大金"),
            ("2886", "兆豐金"), ("2884", "玉山金"), ("2887", "台新金"), ("2892", "第一金"),
            ("1301", "台塑"), ("1303", "南亞"), ("1326", "台化"), ("2002", "中鋼"),
            ("2357", "華碩"), ("2382", "廣達"), ("2308", "台達電"), ("3008", "大立光"),
        ]
    print(f"[StockList] Loaded {len(stocks)} stocks", file=sys.stderr)
    return stocks

def get_tw_stocks() -> list[tuple[str, str]]:
    """取得台股清單（帶快取）"""
    global _STOCK_CACHE, _STOCK_CACHE_TIME
    now = datetime.now()
    if (
        not _STOCK_CACHE
        or _STOCK_CACHE_TIME is None
        or (now - _STOCK_CACHE_TIME).total_seconds() > _STOCK_CACHE_TTL
    ):
        _STOCK_CACHE = _fetch_stock_list()
        _STOCK_CACHE_TIME = now
    return _STOCK_CACHE

# 啟動時預載股票清單
try:
    _STOCK_CACHE = _fetch_stock_list()
    _STOCK_CACHE_TIME = datetime.now()
except Exception:
    pass

def TW_STOCKS():
    return get_tw_stocks()


def get_stock_data(symbol: str, period_days: int = 60) -> pd.DataFrame | None:
    """從 yfinance 獲取台股數據"""
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=period_days)
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
        
        ticker_obj = yf.Ticker(f"{symbol}.TW")
        df = ticker_obj.history(start=start_str, end=end_str, auto_adjust=True)
        
        if df.empty or len(df) < 20:
            ticker_obj = yf.Ticker(f"{symbol}.TWO")
            df = ticker_obj.history(start=start_str, end=end_str, auto_adjust=True)
        
        if df.empty or len(df) < 20:
            return None
        
        df = df.rename(columns={
            "Open": "open", "High": "high", "Low": "low",
            "Close": "close", "Volume": "volume"
        })
        required_cols = ["open", "high", "low", "close", "volume"]
        if not all(c in df.columns for c in required_cols):
            return None
        df = df[required_cols].dropna()
        return df
    except Exception as e:
        print(f"Error fetching {symbol}: {e}", file=sys.stderr)
        return None


def calc_ma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period).mean()


def calc_obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    obv = [0]
    for i in range(1, len(close)):
        if close.iloc[i] > close.iloc[i - 1]:
            obv.append(obv[-1] + volume.iloc[i])
        elif close.iloc[i] < close.iloc[i - 1]:
            obv.append(obv[-1] - volume.iloc[i])
        else:
            obv.append(obv[-1])
    return pd.Series(obv, index=close.index)


def calc_vr(close: pd.Series, volume: pd.Series, period: int = 26) -> pd.Series:
    vr_values = []
    for i in range(len(close)):
        if i < period:
            vr_values.append(np.nan)
            continue
        
        window_close = close.iloc[i - period + 1: i + 1]
        window_volume = volume.iloc[i - period + 1: i + 1]
        
        up_vol = 0.0
        down_vol = 0.0
        flat_vol = 0.0
        
        for j in range(1, len(window_close)):
            v = float(window_volume.iloc[j])
            if window_close.iloc[j] > window_close.iloc[j - 1]:
                up_vol += v
            elif window_close.iloc[j] < window_close.iloc[j - 1]:
                down_vol += v
            else:
                flat_vol += v
        
        denominator = down_vol + 0.5 * flat_vol
        if denominator == 0:
            vr_values.append(np.nan)
        else:
            vr = (up_vol + 0.5 * flat_vol) / denominator * 100
            vr_values.append(vr)
    
    return pd.Series(vr_values, index=close.index)


def check_ma_aligned(df: pd.DataFrame, ma_periods: list[int]) -> dict:
    close = df["close"]
    ma_values = {}
    
    for period in sorted(ma_periods):
        ma_values[period] = calc_ma(close, period)
    
    latest_close = float(close.iloc[-1])
    latest_mas = {p: float(ma_values[p].iloc[-1]) for p in ma_periods if not np.isnan(ma_values[p].iloc[-1])}
    
    if len(latest_mas) < len(ma_periods):
        return {"pass": False, "reason": "MA 數據不足", "values": latest_mas}
    
    price_above_all_ma = all(latest_close > v for v in latest_mas.values())
    sorted_periods = sorted(ma_periods)
    ma_aligned = all(
        latest_mas[sorted_periods[i]] > latest_mas[sorted_periods[i + 1]]
        for i in range(len(sorted_periods) - 1)
    )
    shortest_ma = ma_values[sorted_periods[0]]
    ma_rising = (
        len(shortest_ma.dropna()) >= 3 and
        float(shortest_ma.iloc[-1]) > float(shortest_ma.iloc[-3])
    )
    
    passed = bool(price_above_all_ma and ma_aligned and ma_rising)
    return {
        "pass": passed,
        "priceAboveAllMa": bool(price_above_all_ma),
        "maAligned": bool(ma_aligned),
        "maRising": bool(ma_rising),
        "values": {str(p): round(float(v), 2) for p, v in latest_mas.items()},
    }


def check_volume_spike(df: pd.DataFrame, multiplier: float = 1.5) -> dict:
    volume = df["volume"]
    
    if len(volume) < 11:
        return {"pass": False, "reason": "成交量數據不足"}
    
    latest_volume = float(volume.iloc[-1])
    avg_volume_10 = float(volume.iloc[-11:-1].mean())
    
    if avg_volume_10 == 0:
        return {"pass": False, "reason": "均量為零"}
    
    ratio = latest_volume / avg_volume_10
    passed = bool(ratio >= multiplier)
    
    return {
        "pass": passed,
        "latestVolume": int(latest_volume),
        "avgVolume10": int(avg_volume_10),
        "ratio": round(float(ratio), 4),
    }


def check_obv_rising(df: pd.DataFrame) -> dict:
    obv = calc_obv(df["close"], df["volume"])
    
    if len(obv) < 20:
        return {"pass": False, "reason": "OBV 數據不足"}
    
    latest_obv = float(obv.iloc[-1])
    obv_20_max = float(obv.iloc[-21:-1].max())
    obv_new_high = latest_obv > obv_20_max
    
    recent_obv = obv.iloc[-5:].values
    x = np.arange(len(recent_obv))
    if len(recent_obv) >= 3:
        slope = np.polyfit(x, recent_obv, 1)[0]
        obv_rising = slope > 0
    else:
        obv_rising = False
    
    passed = bool(obv_new_high and obv_rising)
    return {
        "pass": passed,
        "latestObv": round(float(latest_obv), 2),
        "obv20Max": round(float(obv_20_max), 2),
        "obvNewHigh": bool(obv_new_high),
        "obvRising": bool(obv_rising),
    }


def check_vr(df: pd.DataFrame, threshold: float = 120, period: int = 26) -> dict:
    vr = calc_vr(df["close"], df["volume"], period)
    
    valid_vr = vr.dropna()
    if len(valid_vr) == 0:
        return {"pass": False, "reason": "VR 數據不足"}
    
    latest_vr = float(valid_vr.iloc[-1])
    passed = bool(latest_vr > threshold)
    
    return {
        "pass": passed,
        "vrValue": round(float(latest_vr), 2),
        "threshold": float(threshold),
    }


def check_bullish_breakout(df: pd.DataFrame, min_pct: float = 2.0) -> dict:
    if len(df) < 21:
        return {"pass": False, "reason": "數據不足"}
    
    latest = df.iloc[-1]
    open_price = float(latest["open"])
    close_price = float(latest["close"])
    
    if open_price == 0:
        return {"pass": False, "reason": "開盤價為零"}
    
    candle_pct = (close_price - open_price) / open_price * 100
    is_bullish = bool(candle_pct >= min_pct)
    
    prev_high = float(df["high"].iloc[-21:-1].max())
    is_breakout = bool(close_price > prev_high)
    
    passed = bool(is_bullish and is_breakout)
    return {
        "pass": passed,
        "closePct": round(float(candle_pct), 2),
        "isBullishCandle": is_bullish,
        "prevHigh": round(float(prev_high), 2),
        "isBreakout": is_breakout,
        "currentClose": round(float(close_price), 2),
    }


def screen_stock(
    symbol: str,
    name: str,
    ma_periods: list[int] = None,
    volume_multiplier: float = 1.5,
    vr_threshold: float = 120,
    vr_period: int = 26,
    bullish_min_pct: float = 2.0,
) -> dict | None:
    """對單一股票執行全部篩選條件"""
    if ma_periods is None:
        ma_periods = [5, 10, 20, 40]
    
    df = get_stock_data(symbol, period_days=90)
    if df is None or len(df) < 41:
        return None
    
    latest = df.iloc[-1]
    prev = df.iloc[-2] if len(df) >= 2 else latest
    
    current_price = float(latest["close"])
    price_change = float(latest["close"]) - float(prev["close"])
    price_change_pct = price_change / float(prev["close"]) * 100 if float(prev["close"]) != 0 else 0
    
    cond_ma = check_ma_aligned(df, ma_periods)
    cond_vol = check_volume_spike(df, volume_multiplier)
    cond_obv = check_obv_rising(df)
    cond_vr = check_vr(df, vr_threshold, vr_period)
    cond_breakout = check_bullish_breakout(df, bullish_min_pct)
    
    conditions_met = sum([
        cond_ma["pass"],
        cond_vol["pass"],
        cond_obv["pass"],
        cond_vr["pass"],
        cond_breakout["pass"],
    ])
    
    return {
        "stockCode": symbol,
        "stockName": name,
        "currentPrice": round(float(current_price), 2),
        "priceChange": round(float(price_change), 2),
        "priceChangePct": round(float(price_change_pct), 4),
        "volume": int(latest["volume"]),
        "condMaAligned": bool(cond_ma["pass"]),
        "condVolumeSpike": bool(cond_vol["pass"]),
        "condObvRising": bool(cond_obv["pass"]),
        "condVrAbove": bool(cond_vr["pass"]),
        "condBullishBreakout": bool(cond_breakout["pass"]),
        "conditionsMetCount": int(conditions_met),
        "maValues": cond_ma.get("values", {}),
        "volumeRatio": cond_vol.get("ratio"),
        "vrValue": cond_vr.get("vrValue"),
        "obvValue": cond_obv.get("latestObv"),
        "breakoutPrice": cond_breakout.get("prevHigh"),
        "details": {
            "ma": cond_ma,
            "volume": cond_vol,
            "obv": cond_obv,
            "vr": cond_vr,
            "breakout": cond_breakout,
        },
    }


def get_chart_data(symbol: str, period_days: int = 90) -> dict | None:
    """獲取個股完整圖表數據"""
    df = get_stock_data(symbol, period_days)
    if df is None or df.empty:
        return None
    
    close = df["close"]
    volume = df["volume"]
    
    ma5 = calc_ma(close, 5)
    ma10 = calc_ma(close, 10)
    ma20 = calc_ma(close, 20)
    ma40 = calc_ma(close, 40)
    obv = calc_obv(close, volume)
    vr26 = calc_vr(close, volume, 26)
    
    def safe_float(v):
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return None
        return round(float(v), 2)
    
    dates = [d.strftime("%Y-%m-%d") for d in df.index]
    
    return {
        "dates": dates,
        "ohlcv": [
            {
                "date": dates[i],
                "open": safe_float(df["open"].iloc[i]),
                "high": safe_float(df["high"].iloc[i]),
                "low": safe_float(df["low"].iloc[i]),
                "close": safe_float(df["close"].iloc[i]),
                "volume": int(df["volume"].iloc[i]),
            }
            for i in range(len(df))
        ],
        "ma5": [safe_float(v) for v in ma5],
        "ma10": [safe_float(v) for v in ma10],
        "ma20": [safe_float(v) for v in ma20],
        "ma40": [safe_float(v) for v in ma40],
        "obv": [safe_float(v) for v in obv],
        "vr26": [safe_float(v) for v in vr26],
    }


# ─── Flask API 端點 ──────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


@app.route("/stocks/list", methods=["GET"])
def stock_list():
    stocks = get_tw_stocks()
    return jsonify([{"code": c, "name": n} for c, n in stocks])


@app.route("/stocks/total", methods=["GET"])
def stock_total():
    stocks = get_tw_stocks()
    return jsonify({
        "total": len(stocks),
        "twse": len([s for s in stocks if s[0].isdigit()]),
        "description": f"共 {len(stocks)} 支台股（上市+上櫃）"
    })


@app.route("/screen", methods=["POST"])
def screen():
    """執行飆股篩選（使用 ThreadPoolExecutor 並行加速）"""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    data = request.get_json() or {}
    ma_periods = data.get("maPeriods", [5, 10, 20, 40])
    volume_multiplier = float(data.get("volumeMultiplier", 1.5))
    vr_threshold = float(data.get("vrThreshold", 120))
    vr_period = int(data.get("vrPeriod", 26))
    bullish_min_pct = float(data.get("bullishCandleMinPct", 2.0))
    min_conditions = int(data.get("minConditions", 5))
    scan_limit = int(data.get("scanLimit", 900))
    
    all_stocks = get_tw_stocks()
    if scan_limit > 0 and scan_limit < len(all_stocks):
        stocks_to_scan = all_stocks[:scan_limit]
    else:
        stocks_to_scan = all_stocks
    
    results = []
    errors = []
    
    def process_stock(args):
        symbol, name = args
        try:
            result = screen_stock(
                symbol, name,
                ma_periods=ma_periods,
                volume_multiplier=volume_multiplier,
                vr_threshold=vr_threshold,
                vr_period=vr_period,
                bullish_min_pct=bullish_min_pct,
            )
            return ("ok", result)
        except Exception as e:
            return ("err", {"symbol": symbol, "error": str(e)})
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(process_stock, (sym, name)): sym for sym, name in stocks_to_scan}
        for future in as_completed(futures):
            status, data_result = future.result()
            if status == "ok":
                if data_result and data_result["conditionsMetCount"] >= min_conditions:
                    results.append(data_result)
            else:
                errors.append(data_result)
    
    results.sort(key=lambda x: (-x["conditionsMetCount"], -x["priceChangePct"]))
    
    return jsonify({
        "results": results,
        "totalScanned": len(stocks_to_scan),
        "totalStocks": len(all_stocks),
        "totalMatched": len(results),
        "errors": errors[:10],
        "timestamp": datetime.now().isoformat(),
    })


@app.route("/screen-stream", methods=["POST"])
def screen_stream():
    """
    SSE 串流版篩選端點，每掃描一批股票就推送進度事件
    解決大量股票掃描時的 HTTP 超時問題
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    data = request.get_json() or {}
    ma_periods = data.get("maPeriods", [5, 10, 20, 40])
    volume_multiplier = float(data.get("volumeMultiplier", 1.5))
    vr_threshold = float(data.get("vrThreshold", 120))
    vr_period = int(data.get("vrPeriod", 26))
    bullish_min_pct = float(data.get("bullishCandleMinPct", 2.0))
    min_conditions = int(data.get("minConditions", 5))
    scan_limit = int(data.get("scanLimit", 900))

    all_stocks = get_tw_stocks()
    if scan_limit > 0 and scan_limit < len(all_stocks):
        stocks_to_scan = all_stocks[:scan_limit]
    else:
        stocks_to_scan = all_stocks

    total = len(stocks_to_scan)

    def generate() -> Generator[str, None, None]:
        results = []
        errors = []
        scanned = 0
        ping_counter = [0]  # mutable counter for closure

        def process_stock(args):
            symbol, name = args
            try:
                result = screen_stock(
                    symbol, name,
                    ma_periods=ma_periods,
                    volume_multiplier=volume_multiplier,
                    vr_threshold=vr_threshold,
                    vr_period=vr_period,
                    bullish_min_pct=bullish_min_pct,
                )
                return ("ok", result)
            except Exception as e:
                return ("err", {"symbol": symbol, "error": str(e)})

        # 送出連線確認 ping（讓前端知道連線已建立）
        yield f": ping\n\n"
        # 送出初始事件
        yield f"data: {json.dumps({'type': 'start', 'total': total}, ensure_ascii=False)}\n\n"

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {
                executor.submit(process_stock, (sym, name)): (sym, name)
                for sym, name in stocks_to_scan
            }

            for future in as_completed(futures):
                status, data_result = future.result()
                scanned += 1
                ping_counter[0] += 1

                if status == "ok":
                    if data_result and data_result["conditionsMetCount"] >= min_conditions:
                        results.append(data_result)
                        # 每找到符合條件的股票立即推送
                        yield f"data: {json.dumps({'type': 'match', 'stock': data_result, 'scanned': scanned, 'total': total, 'matched': len(results)}, ensure_ascii=False, cls=NumpyEncoder)}\n\n"
                else:
                    errors.append(data_result)

                # 每 10 支推送一次進度（原來 20）
                if scanned % 10 == 0 or scanned == total:
                    yield f"data: {json.dumps({'type': 'progress', 'scanned': scanned, 'total': total, 'matched': len(results)}, ensure_ascii=False)}\n\n"
                # 每 5 支送出一次 SSE comment ping，防止代理超時
                elif ping_counter[0] % 5 == 0:
                    yield f": ping\n\n"

        # 排序結果
        results.sort(key=lambda x: (-x["conditionsMetCount"], -x["priceChangePct"]))

        # 送出最終完成事件
        final = {
            "type": "done",
            "results": results,
            "totalScanned": total,
            "totalStocks": len(all_stocks),
            "totalMatched": len(results),
            "errors": errors[:10],
            "timestamp": datetime.now().isoformat(),
        }
        yield f"data: {json.dumps(final, ensure_ascii=False, cls=NumpyEncoder)}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.route("/screen/single", methods=["POST"])
def screen_single():
    data = request.get_json() or {}
    symbol = data.get("symbol", "")
    name = data.get("name", symbol)
    
    if not symbol:
        return jsonify({"error": "symbol is required"}), 400
    
    ma_periods = data.get("maPeriods", [5, 10, 20, 40])
    volume_multiplier = float(data.get("volumeMultiplier", 1.5))
    vr_threshold = float(data.get("vrThreshold", 120))
    vr_period = int(data.get("vrPeriod", 26))
    bullish_min_pct = float(data.get("bullishCandleMinPct", 2.0))
    
    result = screen_stock(
        symbol, name,
        ma_periods=ma_periods,
        volume_multiplier=volume_multiplier,
        vr_threshold=vr_threshold,
        vr_period=vr_period,
        bullish_min_pct=bullish_min_pct,
    )
    
    if result is None:
        return jsonify({"error": f"無法獲取 {symbol} 的數據"}), 404
    
    return jsonify(result)


@app.route("/chart/<symbol>", methods=["GET"])
def chart(symbol: str):
    period_days = int(request.args.get("days", 90))
    data = get_chart_data(symbol, period_days)
    
    if data is None:
        return jsonify({"error": f"無法獲取 {symbol} 的圖表數據"}), 404
    
    return jsonify(data)


@app.route("/quote/<symbol>", methods=["GET"])
def quote(symbol: str):
    try:
        ticker = yf.Ticker(f"{symbol}.TW")
        info = ticker.fast_info
        
        return jsonify({
            "symbol": symbol,
            "price": getattr(info, "last_price", None),
            "previousClose": getattr(info, "previous_close", None),
            "volume": getattr(info, "last_volume", None),
            "marketCap": getattr(info, "market_cap", None),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── 背景 Job 系統（輪詢方式，解決 SSE 相容性問題） ─────────────────────────────
import threading
import uuid

_JOBS: dict[str, dict] = {}  # job_id -> {status, progress, results, ...}
_JOBS_LOCK = threading.Lock()


def _run_screen_job(job_id: str, params: dict):
    """在背景執行緒中執行篩選，並即時更新 _JOBS[job_id]"""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    ma_periods = params.get("maPeriods", [5, 10, 20, 40])
    volume_multiplier = float(params.get("volumeMultiplier", 1.5))
    vr_threshold = float(params.get("vrThreshold", 120))
    vr_period = int(params.get("vrPeriod", 26))
    bullish_min_pct = float(params.get("bullishCandleMinPct", 2.0))
    min_conditions = int(params.get("minConditions", 5))
    scan_limit = int(params.get("scanLimit", 900))

    try:
        all_stocks = get_tw_stocks()
        stocks_to_scan = all_stocks[:scan_limit] if 0 < scan_limit < len(all_stocks) else all_stocks
        total = len(stocks_to_scan)

        with _JOBS_LOCK:
            _JOBS[job_id].update({"status": "running", "total": total, "scanned": 0, "matched": 0, "matches": []})

        results = []
        errors = []
        scanned = 0

        def process_stock(args):
            symbol, name = args
            try:
                result = screen_stock(
                    symbol, name,
                    ma_periods=ma_periods,
                    volume_multiplier=volume_multiplier,
                    vr_threshold=vr_threshold,
                    vr_period=vr_period,
                    bullish_min_pct=bullish_min_pct,
                )
                return ("ok", result)
            except Exception as e:
                return ("err", {"symbol": symbol, "error": str(e)})

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {
                executor.submit(process_stock, (sym, name)): (sym, name)
                for sym, name in stocks_to_scan
            }
            for future in as_completed(futures):
                # 檢查是否被取消
                with _JOBS_LOCK:
                    if _JOBS[job_id].get("status") == "cancelled":
                        return

                status, data_result = future.result()
                scanned += 1

                if status == "ok":
                    if data_result and data_result["conditionsMetCount"] >= min_conditions:
                        results.append(data_result)
                        with _JOBS_LOCK:
                            _JOBS[job_id]["matches"].append(data_result)
                            _JOBS[job_id]["matched"] = len(results)
                else:
                    errors.append(data_result)

                with _JOBS_LOCK:
                    _JOBS[job_id]["scanned"] = scanned

        results.sort(key=lambda x: (-x["conditionsMetCount"], -x["priceChangePct"]))

        with _JOBS_LOCK:
            _JOBS[job_id].update({
                "status": "done",
                "results": results,
                "totalScanned": total,
                "totalStocks": len(all_stocks),
                "totalMatched": len(results),
                "errors": errors[:10],
                "timestamp": datetime.now().isoformat(),
            })
    except Exception as e:
        with _JOBS_LOCK:
            _JOBS[job_id].update({"status": "error", "error": str(e)})


@app.route("/screen-start", methods=["POST"])
def screen_start():
    """啟動背景篩選 job，立即回傳 job_id"""
    params = request.get_json() or {}
    job_id = str(uuid.uuid4())
    with _JOBS_LOCK:
        _JOBS[job_id] = {"status": "pending", "scanned": 0, "total": 0, "matched": 0, "matches": []}
    t = threading.Thread(target=_run_screen_job, args=(job_id, params), daemon=True)
    t.start()
    return jsonify({"jobId": job_id, "status": "pending"})


@app.route("/screen-status/<job_id>", methods=["GET"])
def screen_status(job_id: str):
    """查詢篩選 job 的進度"""
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    # 回傳安全的 JSON（處理 numpy 類型）
    return app.response_class(
        response=json.dumps(job, cls=NumpyEncoder, ensure_ascii=False),
        mimetype="application/json"
    )


@app.route("/screen-cancel/<job_id>", methods=["POST"])
def screen_cancel(job_id: str):
    """取消篩選 job"""
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id]["status"] = "cancelled"
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    print(f"Starting stock service on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
