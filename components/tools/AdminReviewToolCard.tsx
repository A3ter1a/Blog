"use client";

import { ShieldCheck } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { ToolHubCard } from "@/components/tools/ToolHubCard";

export function AdminReviewToolCard() {
  const { loading, isAdmin } = useAdminAuth();
  if (loading || !isAdmin) return null;

  return (
    <ToolHubCard item={{
      id: "ai-review",
      title: "AI 内容审核",
      description: "查看学科账号提交的文章，批注、退回、批准或发布。",
      href: "/tools/ai-review",
      actionLabel: "开始审核",
      icon: ShieldCheck,
      tone: "border-primary/20 bg-primary/10 text-primary",
    }} />
  );
}
