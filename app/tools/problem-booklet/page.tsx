import type { Metadata } from "next";
import { AdminGate } from "@/components/auth/AdminGate";
import { ProblemBooklet } from "@/components/tools/ProblemBooklet";

export const metadata: Metadata = {
  title: "做题本 - Asteroid",
  description: "从题集中批量选择题目，生成适合 iPad 横屏使用的一题一页 PDF 做题本。",
};

export default function ProblemBookletPage() {
  return (
    <AdminGate>
      <ProblemBooklet />
    </AdminGate>
  );
}
