import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  Brush,
  ReferenceLine,
} from "recharts";
import {
  fetchStockData,
  StockDataPoint,
} from "../app/api/stock-price/stockPriceService";

interface StockChartProps {
  symbol: string;
  interval?:
    | "1min"
    | "5min"
    | "15min"
    | "30min"
    | "60min"
    | "daily"
    | "weekly"
    | "monthly";
  timePeriod?: number;
  chartType?: "line" | "area";
  showGrid?: boolean;
  showLegend?: boolean;
  showBrush?: boolean;
  showReferenceLine?: boolean;
}

const StockChart: React.FC<StockChartProps> = ({
  symbol,
  interval = "daily",
  timePeriod = 30,
  chartType = "line",
  showGrid = true,
  showLegend = true,
  showBrush = true,
  showReferenceLine = false,
}) => {
  const [stockData, setStockData] = useState<StockDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const data = await fetchStockData(symbol, interval, timePeriod);
        setStockData(data);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch stock data",
        );
        console.error("Error fetching stock data:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [symbol, interval, timePeriod]);

  if (loading) return <div className="py-4 text-center">Loading chart...</div>;
  if (error)
    return <div className="py-4 text-center text-red-500">Error: {error}</div>;
  if (!stockData.length)
    return <div className="py-4 text-center">No data available</div>;

  // Format date for better display based on interval
  const formatXAxis = (date: string) => {
    const dateObj = new Date(date);
    if (interval.includes("min")) {
      return dateObj.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return dateObj.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const formatTooltipDate = (date: string) => {
    const dateObj = new Date(date);
    if (interval.includes("min")) {
      return dateObj.toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return dateObj.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const ChartComponent = chartType === "area" ? AreaChart : LineChart;

  // Calculate average closing price for reference line
  const averageClose =
    stockData.reduce((sum, point) => sum + point.close, 0) / stockData.length;

  return (
    <div className="h-[500px] w-full rounded-lg bg-white p-4 shadow">
      <h3 className="mb-2 text-center text-lg font-semibold">
        {symbol} {interval} Price Chart
      </h3>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {new Date(stockData[0].date).toLocaleDateString()} -{" "}
          {new Date(stockData[stockData.length - 1].date).toLocaleDateString()}
        </div>
        <div className="text-sm font-medium">
          Current: ${stockData[stockData.length - 1].close.toFixed(2)}
        </div>
      </div>
      <ResponsiveContainer width="100%" height="80%">
        <ChartComponent
          data={stockData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#eee" />}
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            tick={{ fontSize: 12 }}
            minTickGap={30}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(value) => `$${value.toFixed(2)}`}
            tick={{ fontSize: 12 }}
            width={80}
          />
          <Tooltip
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]}
            labelFormatter={formatTooltipDate}
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #eee",
              borderRadius: "4px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          />
          {showLegend && (
            <Legend
              verticalAlign="top"
              height={36}
              formatter={(value) => (
                <span className="text-sm text-gray-600">{value}</span>
              )}
            />
          )}
          {chartType === "area" ? (
            <Area
              type="monotone"
              dataKey="close"
              name="Closing Price"
              stroke="#8884d8"
              fill="#8884d8"
              fillOpacity={0.2}
              activeDot={{ r: 6 }}
            />
          ) : (
            <Line
              type="monotone"
              dataKey="close"
              name="Closing Price"
              stroke="#8884d8"
              strokeWidth={2}
              activeDot={{ r: 6 }}
              dot={false}
            />
          )}
          {showReferenceLine && (
            <ReferenceLine
              y={averageClose}
              stroke="#ff7300"
              strokeDasharray="3 3"
              label={{
                position: "right",
                value: `Avg $${averageClose.toFixed(2)}`,
                fill: "#ff7300",
                fontSize: 12,
              }}
            />
          )}
          {showBrush && (
            <Brush
              dataKey="date"
              height={20}
              stroke="#8884d8"
              travellerWidth={10}
              startIndex={Math.max(0, stockData.length - 20)}
              tickFormatter={formatXAxis}
            />
          )}
        </ChartComponent>
      </ResponsiveContainer>
      <div className="mt-2 text-center text-xs text-gray-500">
        Data provided by AkShare
      </div>
    </div>
  );
};

export default StockChart;
