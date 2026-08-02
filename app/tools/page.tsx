import {
  Bot,
  BookOpenText,
  Calculator,
  GraduationCap,
  Layers3,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { ToolHubCard, ToolHubGrid, type ToolHubCardItem } from "@/components/tools/ToolHubCard";
import { AdminReviewToolCard } from "@/components/tools/AdminReviewToolCard";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "工具",
  description: "进入 Asteroid 的学习工具台，按真题、数学训练和经济学术语选择复习入口。",
  path: "/tools",
  keywords: ["学习工具", "真题中心", "数学训练", "经济学术语"],
});

const toolHubs: ToolHubCardItem[] = [
  {
    id: "ai-content",
    title: "AI 内容工作台",
    description: "AI 学科账号提交 Markdown，自动自检后进入人工审核。",
    href: "/tools/ai-content",
    icon: Bot,
    tone: "border-primary/20 bg-primary/10 text-primary",
  },
  {
    id: "collections",
    title: "合集工作台",
    description: "按章节或主题逐篇追加内容，随时调整顺序、移除或发布。",
    href: "/tools/collections",
    icon: Layers3,
    tone: "border-violet-500/20 bg-violet-500/10 text-violet-700",
  },
  {
    id: "past-papers",
    title: "真题中心",
    description: "进入真题训练、训练结果和词句整理。",
    href: "/tools/past-papers",
    icon: GraduationCap,
    tone: "border-teal-500/20 bg-teal-500/10 text-teal-700",
  },
  {
    id: "math-training",
    title: "数学训练",
    description: "集中管理数学三自测、错题复盘、知识目录和做题本。",
    href: "/tools/math-training",
    icon: Calculator,
    tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
  },
  {
    id: "economics-glossary",
    title: "经济学术语",
    description: "按英文原词、中文译名和考研表达整理微观概念。",
    href: "/tools/economics-glossary",
    icon: BookOpenText,
    tone: "border-amber-500/20 bg-amber-500/10 text-amber-700",
  },
];

export default function ToolsPage() {
  return (
    <>
      <PageHeader
        width="normal"
        template="training"
        title="工具"
        description="先选复习方向，再进入具体操作。"
      />

      <PageShell width="normal" topPadding="content" template="training">
        <ToolHubGrid>
          <AdminReviewToolCard />
          {toolHubs.map((tool) => (
            <ToolHubCard key={tool.href} item={tool} />
          ))}
        </ToolHubGrid>
      </PageShell>
    </>
  );
}
