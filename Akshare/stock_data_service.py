#!/usr/bin/env python3
"""AkShare data gateway for the Next.js app.

Commands:
- history: fetch OHLCV history for A-share symbol
- overview: fetch basic stock metrics (PE/PB/market cap/industry)
- stock_info_global_em: fetch global financial news stream from Eastmoney
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import time
from typing import Any

import akshare as ak
import pandas as pd


TRANSIENT_ERROR_PATTERNS = (
    "connection aborted",
    "remote end closed connection",
    "timed out",
    "timeout",
    "connection reset",
    "max retries exceeded",
    "failed to establish a new connection",
    "temporarily unavailable",
    "proxyerror",
    "ssl",
)


def _is_transient_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(pattern in message for pattern in TRANSIENT_ERROR_PATTERNS)


def _call_with_retry(func: Any, /, *args: Any, retries: int = 3, **kwargs: Any) -> Any:
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            return func(*args, **kwargs)
        except Exception as exc:
            last_error = exc
            if attempt >= retries or not _is_transient_error(exc):
                raise
            time.sleep(0.35 * attempt)

    if last_error is not None:
        raise last_error

    raise RuntimeError("AkShare call failed without exception")


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = _safe_str(value).replace(",", "")
    if not text or text == "--":
        return None

    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None

    try:
        return float(match.group())
    except ValueError:
        return None


def _parse_market_value(value: Any) -> float | None:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        return float(value)

    text = _safe_str(value).replace(",", "")
    if not text or text == "--":
        return None

    number = _safe_float(text)
    if number is None:
        return None

    if "万亿" in text:
        return number * 1_0000_0000_0000
    if "亿" in text:
        return number * 1_0000_0000
    if "万" in text:
        return number * 1_0000

    return number


def _format_listing_date(value: Any) -> str | None:
    raw = re.sub(r"\D", "", _safe_str(value))
    if len(raw) == 8:
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
    return _safe_str(value) or None


def _history_period(interval: str) -> str:
    if interval in {"weekly", "monthly"}:
        return interval
    return "daily"


def _symbol_with_exchange(symbol: str) -> str:
    code = _safe_str(symbol)
    if len(code) != 6 or not code.isdigit():
        return code

    if code.startswith(("6", "9")):
        return f"sh{code}"
    if code.startswith(("0", "2", "3")):
        return f"sz{code}"
    if code.startswith(("4", "8")):
        return f"bj{code}"
    return f"sh{code}"


def _pick_column(columns: list[str], candidates: list[str]) -> str | None:
    for name in candidates:
        if name in columns:
            return name
    return None


def _normalize_history_df(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume"])

    columns = [str(col) for col in df.columns]
    date_col = _pick_column(columns, ["date", "日期", "时间", "datetime"])
    open_col = _pick_column(columns, ["open", "开盘"])
    high_col = _pick_column(columns, ["high", "最高"])
    low_col = _pick_column(columns, ["low", "最低"])
    close_col = _pick_column(columns, ["close", "收盘", "最新价"])
    volume_col = _pick_column(columns, ["volume", "成交量"])

    required_map = {
        "date": date_col,
        "open": open_col,
        "high": high_col,
        "low": low_col,
        "close": close_col,
        "volume": volume_col,
    }
    missing = [key for key, value in required_map.items() if value is None]
    if missing:
        raise RuntimeError(
            f"Missing columns in AkShare history response: {missing}; columns={columns}"
        )

    normalized = (
        df[
            [
                required_map["date"],
                required_map["open"],
                required_map["high"],
                required_map["low"],
                required_map["close"],
                required_map["volume"],
            ]
        ]
        .rename(
            columns={
                required_map["date"]: "date",
                required_map["open"]: "open",
                required_map["high"]: "high",
                required_map["low"]: "low",
                required_map["close"]: "close",
                required_map["volume"]: "volume",
            }
        )
        .copy()
    )

    normalized["date"] = pd.to_datetime(normalized["date"], errors="coerce")
    for col in ["open", "high", "low", "close", "volume"]:
        normalized[col] = pd.to_numeric(normalized[col], errors="coerce")

    normalized = normalized.dropna(subset=["date", "open", "high", "low", "close"])
    normalized = normalized.sort_values("date")
    normalized["date"] = normalized["date"].dt.strftime("%Y-%m-%d")
    return normalized


def _aggregate_history_interval(df: pd.DataFrame, interval: str) -> pd.DataFrame:
    if df.empty or interval == "daily":
        return df

    freq = "W-FRI" if interval == "weekly" else "ME"

    source = df.copy()
    source["date"] = pd.to_datetime(source["date"], errors="coerce")
    source = source.dropna(subset=["date"]).sort_values("date")
    if source.empty:
        return df

    grouped = source.set_index("date").resample(freq)

    aggregated = pd.DataFrame(
        {
            "open": grouped["open"].first(),
            "high": grouped["high"].max(),
            "low": grouped["low"].min(),
            "close": grouped["close"].last(),
            "volume": grouped["volume"].sum(min_count=1),
        }
    ).dropna(subset=["open", "high", "low", "close"])

    if aggregated.empty:
        return df

    aggregated = aggregated.reset_index()
    aggregated["date"] = aggregated["date"].dt.strftime("%Y-%m-%d")
    return aggregated


def _fetch_spot_row(symbol: str) -> dict[str, Any] | None:
    try:
        spot_df = _call_with_retry(ak.stock_zh_a_spot)
    except Exception:
        return None

    if spot_df is None or spot_df.empty or "代码" not in spot_df.columns:
        return None

    row_df = spot_df[spot_df["代码"].astype(str) == symbol]
    if row_df.empty:
        row_df = spot_df[spot_df["代码"].astype(str).str.zfill(6) == symbol]

    if row_df.empty:
        return None

    return row_df.iloc[0].to_dict()


def _fetch_name_from_code_table(symbol: str) -> str | None:
    try:
        code_name_df = _call_with_retry(ak.stock_info_a_code_name)
    except Exception:
        return None

    if code_name_df is None or code_name_df.empty:
        return None

    if "code" not in code_name_df.columns or "name" not in code_name_df.columns:
        return None

    matched = code_name_df[code_name_df["code"].astype(str).str.zfill(6) == symbol]
    if matched.empty:
        return None

    return _safe_str(matched.iloc[0].get("name")) or None


def _fetch_daily_snapshot(symbol: str) -> dict[str, Any] | None:
    try:
        daily_symbol = _symbol_with_exchange(symbol)
        daily_df = _call_with_retry(ak.stock_zh_a_daily, symbol=daily_symbol, adjust="")
    except Exception:
        return None

    if daily_df is None or daily_df.empty:
        return None

    latest = daily_df.iloc[-1].to_dict()
    return {str(key): value for key, value in latest.items()}


def _fetch_profile_cninfo(symbol: str) -> dict[str, Any] | None:
    try:
        profile_df = _call_with_retry(ak.stock_profile_cninfo, symbol=symbol)
    except Exception:
        return None

    if profile_df is None or profile_df.empty:
        return None

    return profile_df.iloc[0].to_dict()


def _fetch_valuation_latest(symbol: str, indicator: str) -> float | None:
    try:
        valuation_df = _call_with_retry(
            ak.stock_zh_valuation_baidu,
            symbol=symbol,
            indicator=indicator,
            period="近一年",
        )
    except Exception:
        return None

    if valuation_df is None or valuation_df.empty or "value" not in valuation_df.columns:
        return None

    latest_value = valuation_df["value"].dropna()
    if latest_value.empty:
        return None

    return _safe_float(latest_value.iloc[-1])


def fetch_history(symbol: str, interval: str, limit: int) -> list[dict[str, Any]]:
    period = _history_period(interval)
    limit = max(10, min(limit, 500))

    end_date = dt.date.today()
    if period == "daily":
        days_back = max(limit * 3, 240)
    elif period == "weekly":
        days_back = max(limit * 14, 700)
    else:
        days_back = max(limit * 45, 1800)

    start_date = end_date - dt.timedelta(days=days_back)

    normalized = pd.DataFrame()
    primary_error: str | None = None

    try:
        hist_df = _call_with_retry(
            ak.stock_zh_a_hist,
            symbol=symbol,
            period=period,
            start_date=start_date.strftime("%Y%m%d"),
            end_date=end_date.strftime("%Y%m%d"),
            adjust="",
        )
        normalized = _normalize_history_df(hist_df)
    except Exception as exc:
        primary_error = str(exc)

    if normalized.empty:
        try:
            daily_symbol = _symbol_with_exchange(symbol)
            daily_df = _call_with_retry(
                ak.stock_zh_a_daily,
                symbol=daily_symbol,
                adjust="",
            )
            normalized = _normalize_history_df(daily_df)
        except Exception as fallback_exc:
            detail = f"primary={primary_error}; fallback={fallback_exc}"
            raise RuntimeError(f"Failed to fetch history for {symbol}: {detail}") from fallback_exc

    normalized = _aggregate_history_interval(normalized, period)
    normalized = normalized.tail(limit)

    return normalized.to_dict(orient="records")


def _indicator_latest(symbol: str) -> dict[str, Any]:
    if not hasattr(ak, "stock_a_indicator_lg"):
        return {}

    try:
        indicator_df = _call_with_retry(ak.stock_a_indicator_lg, symbol=symbol)
    except Exception:
        return {}

    if indicator_df is None or indicator_df.empty:
        return {}

    return indicator_df.iloc[-1].to_dict()


def fetch_overview(symbol: str) -> dict[str, Any]:
    info_map: dict[str, Any] = {}
    info_error: str | None = None

    try:
        info_df = _call_with_retry(ak.stock_individual_info_em, symbol=symbol)
        if info_df is not None and not info_df.empty:
            for _, row in info_df.iterrows():
                item = _safe_str(row.get("item"))
                if item:
                    info_map[item] = row.get("value")
    except Exception as exc:
        info_error = str(exc)

    latest_indicator = _indicator_latest(symbol)
    pe_ttm = _safe_float(
        latest_indicator.get("pe_ttm")
        or latest_indicator.get("pe")
        or latest_indicator.get("市盈率")
    )
    pb = _safe_float(latest_indicator.get("pb") or latest_indicator.get("市净率"))

    if pe_ttm is None:
        pe_ttm = _fetch_valuation_latest(symbol=symbol, indicator="市盈率(TTM)")

    if pb is None:
        pb = _fetch_valuation_latest(symbol=symbol, indicator="市净率")

    latest_points: list[dict[str, Any]] = []
    history_error: str | None = None

    try:
        latest_points = fetch_history(symbol=symbol, interval="daily", limit=2)
    except Exception as exc:
        history_error = str(exc)

    latest_close = _safe_float(latest_points[-1].get("close")) if latest_points else None
    previous_close = _safe_float(latest_points[-2].get("close")) if len(latest_points) > 1 else None

    change_percent = None
    if latest_close is not None and previous_close not in (None, 0):
        change_percent = ((latest_close - previous_close) / previous_close) * 100

    daily_snapshot = _fetch_daily_snapshot(symbol)
    if daily_snapshot:
        if latest_close is None:
            latest_close = _safe_float(daily_snapshot.get("close"))

        if previous_close is None:
            previous_close = _safe_float(daily_snapshot.get("close"))

        if change_percent is None and latest_close is not None and previous_close not in (None, 0):
            change_percent = ((latest_close - previous_close) / previous_close) * 100

    spot_row = None
    if (
        not info_map
        or latest_close is None
        or change_percent is None
        or _safe_str(info_map.get("股票简称")) == ""
    ):
        spot_row = _fetch_spot_row(symbol)

    if spot_row:
        if latest_close is None:
            latest_close = _safe_float(spot_row.get("最新价") or spot_row.get("close"))

        if previous_close is None:
            previous_close = _safe_float(spot_row.get("昨收"))

        if change_percent is None:
            change_percent = _safe_float(spot_row.get("涨跌幅"))

        if _safe_str(info_map.get("股票简称")) == "" and spot_row.get("名称") is not None:
            info_map["股票简称"] = spot_row.get("名称")

    if _safe_str(info_map.get("股票简称")) == "":
        code_table_name = _fetch_name_from_code_table(symbol)
        if code_table_name:
            info_map["股票简称"] = code_table_name

    profile_row = None
    if (
        _safe_str(info_map.get("股票简称")) == ""
        or _safe_str(info_map.get("行业")) == ""
        or _safe_str(info_map.get("上市时间")) == ""
    ):
        profile_row = _fetch_profile_cninfo(symbol)

    if profile_row:
        if _safe_str(info_map.get("股票简称")) == "":
            profile_name = _safe_str(profile_row.get("A股简称") or profile_row.get("公司名称"))
            if profile_name:
                info_map["股票简称"] = profile_name

        if _safe_str(info_map.get("行业")) == "":
            profile_industry = _safe_str(profile_row.get("所属行业"))
            if profile_industry:
                info_map["行业"] = profile_industry

        if _safe_str(info_map.get("上市时间")) == "":
            profile_listing_date = _safe_str(profile_row.get("上市日期"))
            if profile_listing_date:
                info_map["上市时间"] = profile_listing_date

    total_market_cap = _parse_market_value(info_map.get("总市值"))
    circulating_market_cap = _parse_market_value(info_map.get("流通市值"))

    if daily_snapshot and latest_close is not None:
        outstanding_share = _safe_float(daily_snapshot.get("outstanding_share"))
        if outstanding_share is not None and outstanding_share > 0:
            estimated_circulating_market_cap = latest_close * outstanding_share
            if circulating_market_cap is None:
                circulating_market_cap = estimated_circulating_market_cap
            if total_market_cap is None:
                total_market_cap = estimated_circulating_market_cap

    if not (info_map or latest_indicator or latest_points or spot_row or daily_snapshot or profile_row):
        error_parts = []
        if info_error:
            error_parts.append(f"info={info_error}")
        if history_error:
            error_parts.append(f"history={history_error}")
        detail = "; ".join(error_parts)
        if detail:
            raise RuntimeError(f"No stock overview data returned by AkShare: {detail}")
        raise RuntimeError("No stock overview data returned by AkShare")

    return {
        "symbol": symbol,
        "name": _safe_str(info_map.get("股票简称")) or None,
        "industry": _safe_str(info_map.get("行业")) or None,
        "listingDate": _format_listing_date(info_map.get("上市时间")),
        "totalMarketCap": total_market_cap,
        "circulatingMarketCap": circulating_market_cap,
        "peTtm": pe_ttm,
        "pb": pb,
        "latestClose": latest_close,
        "changePercent": change_percent,
        "source": "akshare",
        "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def fetch_stock_info_global_em(limit: int) -> dict[str, Any]:
    limit = max(1, min(limit, 200))

    df = _call_with_retry(ak.stock_info_global_em)
    if df is None or df.empty:
        return {
            "items": [],
            "total": 0,
            "source": "stock_info_global_em",
            "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        }

    required_columns = ["标题", "摘要", "发布时间", "链接"]
    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        raise RuntimeError(f"Missing columns from stock_info_global_em response: {missing}")

    normalized = df[required_columns].copy().head(limit)
    normalized = normalized.rename(
        columns={
            "标题": "title",
            "摘要": "summary",
            "发布时间": "publishedAt",
            "链接": "url",
        }
    )

    for col in ["title", "summary", "publishedAt", "url"]:
        normalized[col] = normalized[col].apply(_safe_str)

    items = normalized.to_dict(orient="records")
    return {
        "items": items,
        "total": int(len(df)),
        "source": "stock_info_global_em",
        "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AkShare stock data service")
    subparsers = parser.add_subparsers(dest="command", required=True)

    history_parser = subparsers.add_parser("history")
    history_parser.add_argument("--symbol", required=True)
    history_parser.add_argument("--interval", default="daily")
    history_parser.add_argument("--limit", type=int, default=90)

    overview_parser = subparsers.add_parser("overview")
    overview_parser.add_argument("--symbol", required=True)

    global_info_em_parser = subparsers.add_parser("stock_info_global_em")
    global_info_em_parser.add_argument("--limit", type=int, default=20)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        if args.command == "history":
            payload = {
                "points": fetch_history(
                    symbol=args.symbol,
                    interval=args.interval,
                    limit=args.limit,
                )
            }
        elif args.command == "overview":
            payload = fetch_overview(symbol=args.symbol)
        else:
            payload = fetch_stock_info_global_em(limit=args.limit)

        print(json.dumps({"ok": True, "data": payload}, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "akshare request failed",
                    "details": str(exc),
                },
                ensure_ascii=False,
            )
        )
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
