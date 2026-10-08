import { MathTrainingCenter } from "@/components/tools/MathTrainingCenter";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "数学训练",
  description: "按章节查找知识点，进入数学三计时自测；管理员还可复盘、导出做题本和核对 OCR。",
  path: "/tools/math-training",
});

export default function MathTrainingPage() {
  return <MathTrainingCenter />;
}
