import type { Metadata } from "next";
import { AdminGate } from "@/components/auth/AdminGate";
import { ReviewCenter } from "@/components/practice/ReviewCenter";

export const metadata: Metadata = {
  title: "错题复盘 - Asteroid",
  description: "集中查看数学题目的答错、跳过和未掌握状态，按章节进行复盘。",
};

export default function ReviewPage() {
  return (
    <AdminGate>
      <ReviewCenter />
    </AdminGate>
  );
}

