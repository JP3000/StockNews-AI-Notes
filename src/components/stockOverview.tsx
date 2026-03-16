"use client";

import { useEffect, useState } from "react";
import {
  fetchStockOverview,
  StockOverview,
} from "@/app/api/stock-overview/stockOverviewService";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  symbol: string;
  className?: string;
  compact?: boolean;
};

function formatMoney(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  if (Math.abs(value) >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)} 亿`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${(value / 10_000).toFixed(2)} 万`;
  }
  return value.toFixed(2);
}

function formatNumber(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

export default function StockOverviewCard({
  symbol,
  className,
  compact = false,
}: Props) {
  const [overview, setOverview] = useState<StockOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadOverview = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchStockOverview(symbol);
        if (!active) return;
        setOverview(data);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load stock overview");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadOverview();

    return () => {
      active = false;
    };
  }, [symbol]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>股票基本信息</CardTitle>
        </CardHeader>
        <CardContent className={cn("space-y-3", compact && "space-y-2") }>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          {!compact && <Skeleton className="h-5 w-3/4" />}
        </CardContent>
      </Card>
    );
  }

  if (error || !overview) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>股票基本信息</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500">{error || "No stock overview available"}</p>
        </CardContent>
      </Card>
    );
  }

  const change = overview.changePercent;
  const changeClass =
    change === null ? "text-muted-foreground" : change >= 0 ? "text-red-500" : "text-green-600";

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          {overview.name || symbol} ({symbol})
        </CardTitle>
      </CardHeader>
      <CardContent className={cn("space-y-4", compact && "space-y-3") }>
        <div className={cn("grid grid-cols-2 gap-3 text-sm", compact && "gap-2 text-xs")}>
          <div>
            <p className="text-muted-foreground">最新收盘</p>
            <p className="font-medium">{formatNumber(overview.latestClose)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">涨跌幅</p>
            <p className={`font-medium ${changeClass}`}>
              {change === null ? "-" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">市盈率(TTM)</p>
            <p className="font-medium">{formatNumber(overview.peTtm)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">总市值</p>
            <p className="font-medium">{formatMoney(overview.totalMarketCap)}</p>
          </div>
          {!compact && (
            <>
              <div>
                <p className="text-muted-foreground">市净率(PB)</p>
                <p className="font-medium">{formatNumber(overview.pb)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">流通市值</p>
                <p className="font-medium">{formatMoney(overview.circulatingMarketCap)}</p>
              </div>
            </>
          )}
        </div>

        <div className={cn("space-y-2 text-sm", compact && "space-y-1 text-xs")}>
          <p>
            <span className="text-muted-foreground">行业：</span>
            <span>{overview.industry || "-"}</span>
          </p>
          <p>
            <span className="text-muted-foreground">上市日期：</span>
            <span>{overview.listingDate || "-"}</span>
          </p>
          {!compact && (
            <p>
              <span className="text-muted-foreground">数据源：</span>
              <span>{overview.source}</span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
