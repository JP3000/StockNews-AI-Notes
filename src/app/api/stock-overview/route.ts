import { NextRequest, NextResponse } from "next/server";
import { runAkshareCommand } from "@/lib/akshareRunner";

export const runtime = "nodejs";

type StockOverview = {
  symbol: string;
  name: string | null;
  industry: string | null;
  listingDate: string | null;
  totalMarketCap: number | null;
  circulatingMarketCap: number | null;
  peTtm: number | null;
  pb: number | null;
  latestClose: number | null;
  changePercent: number | null;
  source: string;
  fetchedAt: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "600519").trim();

  if (!/^\d{6}$/.test(symbol)) {
    return NextResponse.json(
      { error: "symbol must be a 6-digit A-share code, e.g. 600519" },
      { status: 400 },
    );
  }

  try {
    const result = await runAkshareCommand<StockOverview>("overview", { symbol });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          details: result.details,
          data: null,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to fetch stock overview from AkShare",
        details: message,
        data: null,
      },
      { status: 500 },
    );
  }
}
