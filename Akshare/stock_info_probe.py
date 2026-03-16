#!/usr/bin/env python3
"""Probe selected AkShare stock info APIs without touching production code.

Usage:
  python3 Akshare/stock_info_probe.py
  python3 Akshare/stock_info_probe.py --limit 5
    python3 Akshare/stock_info_probe.py --functions stock_info_global_em
"""

from __future__ import annotations

import argparse
import datetime as dt
import inspect
import json
import time
from typing import Any

import akshare as ak
import pandas as pd

DEFAULT_FUNCTIONS = [
    "stock_info_global_em",
]

TEST_ARG_VALUES: dict[str, Any] = {
    "symbol": "全部",
    "stock": "600030",
    "date": dt.date.today().strftime("%Y%m%d"),
    "start_date": (dt.date.today() - dt.timedelta(days=7)).strftime("%Y%m%d"),
    "end_date": dt.date.today().strftime("%Y%m%d"),
    "page": 1,
    "limit": 20,
    "indicator": "全部",
    "market": "全部",
}


def _json_safe(value: Any) -> Any:
    if isinstance(value, (dt.datetime, dt.date)):
        return value.isoformat()

    if isinstance(value, pd.Timestamp):
        return value.isoformat()

    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}

    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]

    if isinstance(value, (str, int, float, bool)) or value is None:
        return value

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    return str(value)


def _preview_dataframe(df: pd.DataFrame, limit: int) -> dict[str, Any]:
    rows = len(df)
    cols = len(df.columns)
    return {
        "shape": [rows, cols],
        "columns": [str(c) for c in df.columns],
        "head": _json_safe(df.head(limit).to_dict(orient="records")),
        "tail": _json_safe(df.tail(min(limit, rows)).to_dict(orient="records")),
    }


def _required_params(func: Any) -> list[str]:
    signature = inspect.signature(func)
    required: list[str] = []
    for parameter in signature.parameters.values():
        if parameter.kind in (
            inspect.Parameter.POSITIONAL_ONLY,
            inspect.Parameter.POSITIONAL_OR_KEYWORD,
            inspect.Parameter.KEYWORD_ONLY,
        ) and parameter.default is inspect._empty:
            required.append(parameter.name)
    return required


def _call_with_optional_fallback(func: Any) -> tuple[Any, dict[str, Any]]:
    call_meta: dict[str, Any] = {"attempt": "no-args", "kwargs": {}}
    try:
        return func(), call_meta
    except TypeError as err:
        missing = _required_params(func)
        kwargs = {k: TEST_ARG_VALUES[k] for k in missing if k in TEST_ARG_VALUES}
        if missing and len(kwargs) == len(missing):
            call_meta = {"attempt": "fallback-kwargs", "kwargs": kwargs}
            return func(**kwargs), call_meta
        raise TypeError(f"{err}; required_params={missing}; tested_kwargs={kwargs}") from err


def probe_function(function_name: str, limit: int) -> dict[str, Any]:
    started_at = time.time()

    report: dict[str, Any] = {
        "function": function_name,
        "ok": False,
        "elapsedMs": None,
        "meta": {},
    }

    try:
        if not hasattr(ak, function_name):
            raise AttributeError(f"AkShare has no function named '{function_name}'")

        func = getattr(ak, function_name)
        if not callable(func):
            raise TypeError(f"'{function_name}' exists but is not callable")

        data, call_meta = _call_with_optional_fallback(func)
        elapsed_ms = round((time.time() - started_at) * 1000, 2)

        report["ok"] = True
        report["elapsedMs"] = elapsed_ms
        report["meta"] = call_meta

        if isinstance(data, pd.DataFrame):
            report["resultType"] = "DataFrame"
            report["result"] = _preview_dataframe(data, limit)
        elif isinstance(data, dict):
            report["resultType"] = "dict"
            keys = list(data.keys())
            report["result"] = {
                "keys": [str(k) for k in keys],
                "sample": _json_safe(dict(list(data.items())[:limit])),
            }
        elif isinstance(data, (list, tuple)):
            report["resultType"] = type(data).__name__
            report["result"] = {
                "size": len(data),
                "sample": _json_safe(list(data[:limit])),
            }
        else:
            report["resultType"] = type(data).__name__
            report["result"] = _json_safe(data)

    except Exception as exc:  # noqa: BLE001
        elapsed_ms = round((time.time() - started_at) * 1000, 2)
        report["ok"] = False
        report["elapsedMs"] = elapsed_ms
        report["errorType"] = type(exc).__name__
        report["error"] = str(exc)

    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Probe selected AkShare info endpoints")
    parser.add_argument(
        "--functions",
        nargs="*",
        default=DEFAULT_FUNCTIONS,
        help="Function names to probe. Default: the six requested stock_info_* endpoints.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=3,
        help="Preview row/item count for each successful response.",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Optional path to save full JSON report.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    limit = max(1, min(args.limit, 20))

    reports = [probe_function(name, limit) for name in args.functions]

    summary = {
        "total": len(reports),
        "ok": sum(1 for item in reports if item.get("ok")),
        "failed": sum(1 for item in reports if not item.get("ok")),
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "reports": reports,
    }

    output = json.dumps(summary, ensure_ascii=False, indent=2)
    print(output)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
