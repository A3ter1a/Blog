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
      description="页面暂时无法打开。请先重试；如果仍未恢复，可以返回笔记列表继续学习，稍后再打开这一页。"
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
