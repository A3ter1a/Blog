import { AdminGate } from "@/components/auth/AdminGate";
import { ProblemBooklet } from "@/components/tools/ProblemBooklet";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "PDF 做题本",
  description: "从题集中批量选择题目，生成适合 iPad 横屏使用的一题一页 PDF 做题本。",
  path: "/tools/problem-booklet",
});

export default function ProblemBookletPage() {
  return (
    <AdminGate>
      <ProblemBooklet />
    </AdminGate>
  );
}
