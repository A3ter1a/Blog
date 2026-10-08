"use client";

import { AdminToolHubCard } from "@/components/tools/AdminToolHubCard";

export function AdminMathOcrToolCard() {
  return (
    <AdminToolHubCard
      icon="scan"
      title="数学真题 OCR 核对"
      description="整套结束后统一识别答题纸，逐页确认无误再进入评分。"
      href="/tools/math-paper-ocr"
      tone="border-sky-500/20 bg-sky-500/10 text-sky-700"
    />
  );
}
