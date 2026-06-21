"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { RouteFallback } from "@/components/ui/RouteFallback";

export default function Error({
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
    <RouteFallback
      eyebrow="页面错误"
      title="这一页暂时没有加载成功"
      description="这通常是临时网络、数据读取或页面渲染异常导致的。可以先重试一次；如果反复出现，再根据控制台日志定位具体模块。"
      icon={AlertTriangle}
      retryLabel="重新加载"
      onRetry={unstable_retry}
      primaryHref="/"
      primaryLabel="回到首页"
      secondaryHref="/notes"
      secondaryLabel="查看文章列表"
    />
  );
}
