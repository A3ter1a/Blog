import { MathTrainingCenter } from "@/components/tools/MathTrainingCenter";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "数学训练",
  description: "集中进入数学三自测、错题复盘、知识目录和 PDF 做题本。",
  path: "/tools/math-training",
});

export default function MathTrainingPage() {
  return <MathTrainingCenter />;
}
