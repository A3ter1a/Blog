"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { RouteFallback } from "@/components/ui/RouteFallback";
import "./globals.css";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-surface text-on-surface">
        <title>站点错误 - Asteroid</title>
        <RouteFallback
          eyebrow="站点错误"
          title="站点外壳暂时没有加载成功"
          description="这是更底层的兜底页面，通常说明根布局或全局资源加载时出现异常。可以先重试；如果仍然失败，再检查最近一次部署日志。"
          icon={AlertTriangle}
          retryLabel="重新加载"
          onRetry={unstable_retry}
          primaryHref="/"
          primaryLabel="回到首页"
        />
      </body>
    </html>
  );
}
