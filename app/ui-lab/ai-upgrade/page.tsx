import { notFound } from "next/navigation";
import { createNoIndexMetadata } from "@/lib/site-metadata";
import AiUpgradeLab from "@/components/ui-lab/AiUpgradeLab";

export const dynamic = "force-dynamic";

export const metadata = createNoIndexMetadata({
  title: "AI 升级工作台（本地 Demo）",
  description: "Asteroid AI 内容审核、笔记助手与知识图像的本地交互演示。",
  path: "/ui-lab/ai-upgrade",
});

export default function AiUpgradeLabPage() {
  const enabled = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_UI_LAB === "true";

  if (!enabled) {
    notFound();
  }

  return <AiUpgradeLab />;
}
