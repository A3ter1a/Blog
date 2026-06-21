import { AdminGate } from "@/components/auth/AdminGate";
import { ReviewCenter } from "@/components/practice/ReviewCenter";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "错题复盘",
  description: "集中查看数学题目的答错、跳过和未掌握状态，按章节进行复盘。",
  path: "/tools/review",
});

export default function ReviewPage() {
  return (
    <AdminGate>
      <ReviewCenter />
    </AdminGate>
  );
}
