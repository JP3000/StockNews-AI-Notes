"use client";
import React, { useState, useEffect } from "react";
import { Input } from "./ui/input";
import StockChart from "./stockChart";
import StockOverviewCard from "./stockOverview";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

type StockInfoProps = {
  className?: string;
};

export default function StockInfo({ className }: StockInfoProps) {
  const [searchText, setSearchText] = useState("");
  const [symbol, setSymbol] = useState("600519");
  const debouncedSearchText = useDebounce(searchText, 500);

  useEffect(() => {
    const normalized = debouncedSearchText.trim();
    if (/^\d{6}$/.test(normalized)) {
      setSymbol(normalized);
    }
  }, [debouncedSearchText]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-4", className)}>
      <div className="relative w-full">
        <Input
          className="bg-muted pl-8"
          placeholder="输入A股代码，例如 600519"
          value={searchText}
          onChange={(e) =>
            setSearchText(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
        />
        <p className="text-muted-foreground mt-2 text-xs">
          当前代码：{symbol}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <StockChart
          symbol={symbol}
          interval="daily"
          timePeriod={90}
          chartType="area"
          showBrush={true}
          showReferenceLine={true}
          key={symbol}
        />

        <StockOverviewCard symbol={symbol} compact className="h-[260px]" />
      </div>
    </div>
  );
}
