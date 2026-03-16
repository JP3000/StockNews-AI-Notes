"use client";

import { useEffect, useState } from "react";
import { fetchStockNews, StockNewsItem } from "@/app/api/stock-news/stockNewsService";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { ScrollArea } from "./ui/scroll-area";

interface StockNewsProps {
  limit?: number;
  className?: string;
}

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}...`;
}

export function StockNews({ limit = 20, className }: StockNewsProps) {
  const [news, setNews] = useState<StockNewsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState("stock_info_global_em");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const handleRefresh = () => {
    setRefreshVersion((prev) => prev + 1);
  };

  useEffect(() => {
    let active = true;

    const loadNews = async () => {
      try {
        setLoading(true);
        setError(null);

        const newsData = await fetchStockNews(limit);
        if (!active) return;

        setNews(newsData.items);
        setTotal(newsData.total);
        setSource(newsData.source);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load news");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadNews();

    return () => {
      active = false;
    };
  }, [limit, refreshVersion]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>东方财富资讯</CardTitle>
          <CardDescription>加载中...</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" disabled>
              刷新中...
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(5)].map((_, index) => (
            <div key={index} className="space-y-2 rounded-md border p-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>东方财富资讯</CardTitle>
          <CardDescription className="text-red-500">{error}</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              刷新最新消息
            </Button>
          </CardAction>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>东方财富资讯</CardTitle>
        <CardDescription>
          最新 {news.length} 条 / 总计 {total} 条 ({source})
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            {loading ? "刷新中..." : "刷新最新消息"}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {news.length === 0 ? (
          <p className="text-muted-foreground text-sm">暂无资讯数据</p>
        ) : (
          <ScrollArea className="h-[620px] pr-3" type="always">
            <div className="space-y-3">
              {news.map((item, index) => (
                <article key={`${item.url}-${index}`} className="space-y-2 rounded-md border p-3">
                  <h4 className="text-sm font-semibold leading-5">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {item.title || "（无标题）"}
                    </a>
                  </h4>
                  <p className="text-muted-foreground text-sm leading-5">
                    {truncate(item.summary || "（无摘要）", 170)}
                  </p>
                  <p className="text-muted-foreground text-xs">{item.publishedAt}</p>
                </article>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
