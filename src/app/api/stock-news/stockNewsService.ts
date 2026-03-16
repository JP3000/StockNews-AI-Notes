export interface StockNewsItem {
  title: string;
  summary: string;
  publishedAt: string;
  url: string;
}

export interface StockNewsPayload {
  items: StockNewsItem[];
  total: number;
  source: string;
  fetchedAt: string;
}

type StockNewsApiResponse = {
  data: StockNewsPayload;
  error?: string;
  details?: string;
};

export async function fetchStockNews(limit = 20): Promise<StockNewsPayload> {
  const normalizedLimit = Math.min(Math.max(Math.floor(limit), 1), 200);

  const response = await fetch(`/api/stock-news?limit=${normalizedLimit}`, {
    cache: "no-store",
  });

  const payload = (await response.json()) as StockNewsApiResponse;

  if (!response.ok || !payload.data || !Array.isArray(payload.data.items)) {
    throw new Error(payload.error || payload.details || "Failed to fetch stock news");
  }

  return payload.data;
}
  