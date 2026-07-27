import { AdminGate } from "@/components/auth/AdminGate";
import { MathPaperOcrReview } from "@/components/tools/MathPaperOcrReview";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "数学真题 OCR 核对",
  description: "统一识别数学答题纸，逐页人工确认后再进入评分。",
  path: "/tools/math-paper-ocr",
});

export default function MathPaperOcrPage() {
  return (
    <AdminGate>
      <MathPaperOcrReview />
    </AdminGate>
  );
}
