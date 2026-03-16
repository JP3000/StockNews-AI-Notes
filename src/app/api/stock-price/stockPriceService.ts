export interface StockDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type StockPriceApiResponse = {
  data: StockDataPoint[];
  error?: string;
  details?: string;
};

export const fetchStockData = async (
  symbol: string,
  interval: string = 'daily',
  timePeriod: number = 30,
): Promise<StockDataPoint[]> => {
  try {
    const params = new URLSearchParams({
      symbol,
      interval,
      timePeriod: String(timePeriod),
    });

    const response = await fetch(`/api/stock-price?${params.toString()}`, {
      cache: 'no-store',
    });

    const payload = (await response.json()) as StockPriceApiResponse;

    if (!response.ok) {
      throw new Error(
        payload.error || payload.details || `API request failed with status ${response.status}`,
      );
    }

    if (!Array.isArray(payload.data)) {
      throw new Error('Invalid stock price response');
    }

    return payload.data;
  } catch (error) {
    console.error('Error in fetchStockData:', error);
    throw error instanceof Error ? error : new Error('Failed to fetch stock data');
  }
};