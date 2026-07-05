import { AdminGate } from "@/components/auth/AdminGate";
import { PastPaperResults } from "@/components/tools/PastPaperResults";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "真题训练结果",
  description: "英语、数学真题训练正确率、得分和丢分分布。",
  path: "/tools/past-paper-results",
});

export default function PastPaperResultsPage() {
  return (
    <AdminGate>
      <PastPaperResults />
    </AdminGate>
  );
}
