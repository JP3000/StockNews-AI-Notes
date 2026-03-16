import { NextRequest, NextResponse } from "next/server";
import { runAkshareCommand } from "@/lib/akshareRunner";

export const runtime = "nodejs";

type StockDataPoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type StockHistoryPayload = {
  points: StockDataPoint[];
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const symbol = (searchParams.get("symbol") || "600519").trim();
  const interval = (searchParams.get("interval") || "daily").trim();
  const timePeriod = Number(searchParams.get("timePeriod") || "90");

  if (!/^\d{6}$/.test(symbol)) {
    return NextResponse.json(
      { error: "symbol must be a 6-digit A-share code, e.g. 600519" },
      { status: 400 },
    );
  }

  const normalizedInterval = ["daily", "weekly", "monthly"].includes(interval)
    ? interval
    : "daily";

  const normalizedPeriod = Number.isFinite(timePeriod)
    ? Math.min(Math.max(Math.floor(timePeriod), 10), 500)
    : 90;

  try {
    const result = await runAkshareCommand<StockHistoryPayload>("history", {
      symbol,
      interval: normalizedInterval,
      limit: normalizedPeriod,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          details: result.details,
          data: [],
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ data: result.data.points || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to fetch stock price from AkShare",
        details: message,
        data: [],
      },
      { status: 500 },
    );
  }
}
