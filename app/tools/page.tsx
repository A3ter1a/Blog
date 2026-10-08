import {
  BarChart3,
  BookOpenCheck,
  BookOpenText,
  Calculator,
  Layers3,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { ToolHubCard, ToolHubGrid, type ToolHubCardItem } from "@/components/tools/ToolHubCard";
import { createPageMetadata } from "@/lib/site-metadata";
import { AdminReviewToolCard } from "@/components/tools/AdminReviewToolCard";
import { AdminToolHubCard } from "@/components/tools/AdminToolHubCard";

export const metadata = createPageMetadata({
  title: "工具",
  description: "按刷题复盘和资料整理选择学习任务。",
  path: "/tools",
  keywords: ["学习工具", "英语真题", "英语复盘", "数学训练", "经济学术语"],
});

const toolHubs: ToolHubCardItem[] = [
  {
    id: "math-training",
    title: "数学训练",
    description: "按章节查找知识点，进入数学三计时自测。",
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
  {
    id: "english-training",
    title: "英语真题",
    description: "按 2021-2026 年份和题型训练英语一真题，支持草稿、提交与复盘。",
    href: "/tools/english-training",
    actionLabel: "开始训练",
    icon: BookOpenCheck,
    tone: "border-teal-500/20 bg-teal-500/10 text-teal-700",
  },
  {
    id: "past-paper-results",
    title: "英语复盘",
    description: "按年份查看得分、正确率和错题分布，继续上一轮训练。",
    href: "/tools/past-paper-results",
    actionLabel: "查看复盘",
    icon: BarChart3,
    tone: "border-sky-500/20 bg-sky-500/10 text-sky-700",
  },
];

export default function ToolsPage() {
  return (
    <>
      <PageHeader
        width="wide"
        template="training"
        title="工具"
        description="按学习任务进入练习、复盘和资料整理。"
      />

      <PageShell width="wide" topPadding="content" template="training">
        <div className="mb-5">
          <h2 className="font-headline text-lg font-semibold text-on-surface">练习与复盘</h2>
          <p className="mt-1 text-sm text-on-surface-variant">先作答，再查看解析；个人训练记录需登录后保存。</p>
        </div>
        <ToolHubGrid width="wide">
          {toolHubs.map((tool, index) => (
            <ToolHubCard key={tool.href} item={tool} index={index} />
          ))}
        </ToolHubGrid>
        <div className="mb-5 mt-8">
          <h2 className="font-headline text-lg font-semibold text-on-surface">资料与工作台</h2>
        </div>
        <ToolHubGrid width="wide">
          <ToolHubCard item={{
            title: "合集工作台",
            description: "把笔记整理成章节或专题，按自己的复习顺序阅读。",
            href: "/tools/collections",
            icon: Layers3,
          }} />
          <AdminToolHubCard
            icon="brain"
            title="助手记忆"
            description="核对从问答中保存的候选内容，确认后才用于后续回答。"
            href="/tools/assistant-memory"
            actionLabel="查看候选"
          />
          <AdminReviewToolCard />
        </ToolHubGrid>
      </PageShell>
    </>
  );
}
