import { NextRequest, NextResponse } from "next/server";
import { runAkshareCommand } from "@/lib/akshareRunner";

export const runtime = "nodejs";

type StockGlobalNewsItem = {
  title: string;
  summary: string;
  publishedAt: string;
  url: string;
};

type StockGlobalNewsPayload = {
  items: StockGlobalNewsItem[];
  total: number;
  source: string;
  fetchedAt: string;
};

function emptyPayload(): StockGlobalNewsPayload {
  return {
    items: [],
    total: 0,
    source: "stock_info_global_em",
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") || "20");

  const normalizedLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.floor(limit), 1), 200)
    : 20;

  try {
    const result = await runAkshareCommand<StockGlobalNewsPayload>(
      "stock_info_global_em",
      { limit: normalizedLimit },
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          details: result.details,
          data: emptyPayload(),
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to fetch stock news from AkShare",
        details: message,
        data: emptyPayload(),
      },
      { status: 500 },
    );
  }
}
