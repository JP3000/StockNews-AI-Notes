export interface StockOverview {
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
}

type StockOverviewApiResponse = {
  data: StockOverview | null;
  error?: string;
  details?: string;
};

export async function fetchStockOverview(symbol: string): Promise<StockOverview> {
  const response = await fetch(`/api/stock-overview?symbol=${encodeURIComponent(symbol)}`, {
    cache: "no-store",
  });

  const payload = (await response.json()) as StockOverviewApiResponse;

  if (!response.ok || !payload.data) {
    throw new Error(payload.error || payload.details || "Failed to fetch stock overview");
  }

  return payload.data;
}
