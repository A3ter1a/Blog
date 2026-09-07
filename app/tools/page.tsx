import {
  BookOpenText,
  Bot,
  Brain,
  Calculator,
  GraduationCap,
  Layers3,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { ToolHubCard, ToolHubGrid, type ToolHubCardItem } from "@/components/tools/ToolHubCard";
import { createPageMetadata } from "@/lib/site-metadata";
import { AdminReviewToolCard } from "@/components/tools/AdminReviewToolCard";

export const metadata = createPageMetadata({
  title: "工具",
  description: "按阅读理解、刷题复盘和 AI 资料整理选择学习任务。",
  path: "/tools",
  keywords: ["学习工具", "真题中心", "数学训练", "经济学术语"],
});

const toolHubs: ToolHubCardItem[] = [
  {
    id: "math-training",
    title: "数学训练",
    description: "集中管理数学三自测、错题复盘、知识目录和做题本。",
    href: "/tools/math-training",
    icon: Calculator,
    tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
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
        description="读懂知识点 → 独立练习 → 核对与复盘。AI 的解释、识别和评分建议都可回到原文或答案核对。"
      />

      <PageShell width="normal" topPadding="content" template="training">
        <div className="mx-auto mb-5 max-w-4xl"><h2 className="font-headline text-lg font-semibold text-on-surface">阅读与理解</h2></div>
        <ToolHubGrid>
          <ToolHubCard item={{ title: "读笔记 · 问 AI · 做快测", description: "打开一篇笔记，在阅读页使用「问助手」解释难点；有已发布快测的笔记可在助手中自测。助手与快测需登录。", href: "/notes", icon: Bot, actionLabel: "选一篇笔记" }} />
        </ToolHubGrid>
        <div className="mx-auto mb-5 mt-8 max-w-4xl"><h2 className="font-headline text-lg font-semibold text-on-surface">练习与复盘</h2><p className="mt-1 text-sm text-on-surface-variant">先作答，再查看解析或 AI 建议；个人训练记录需登录后保存。</p></div>
        <ToolHubGrid>
          {toolHubs.map((tool) => (
            <ToolHubCard key={tool.href} item={tool} />
          ))}
        </ToolHubGrid>
        <div className="mx-auto mb-5 mt-8 max-w-4xl"><h2 className="font-headline text-lg font-semibold text-on-surface">资料整理与 AI 协作</h2></div>
        <ToolHubGrid>
          <ToolHubCard item={{ title: "合集工作台", description: "把笔记整理成章节或专题，按自己的复习顺序阅读。", href: "/tools/collections", icon: Layers3 }} />
          <ToolHubCard item={{ title: "助手记忆", description: "核对从问答中保存的候选内容，确认后才用于后续回答。需登录你的博客账号。", href: "/tools/assistant-memory", icon: Brain, actionLabel: "查看候选" }} />
          <AdminReviewToolCard />
        </ToolHubGrid>
      </PageShell>
    </>
  );
}
