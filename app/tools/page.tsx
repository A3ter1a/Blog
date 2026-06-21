import Link from "next/link";
import {
  BookOpen,
  Bot,
  ChevronRight,
  ClipboardCheck,
  FileDown,
  RotateCcw,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "工具",
  description: "进入 Asteroid 的学习工具台，管理笔记问答、错题复盘、数学三自测、PDF 做题本和知识目录。",
  path: "/tools",
  keywords: ["学习工具", "错题复盘", "数学三自测", "PDF 做题本"],
});

const primaryTools = [
  {
    id: "note-qa",
    title: "笔记问答",
    description: "在已发布笔记和题集中查答案、找位置、整理提纲。",
    href: "/tools/note-qa",
    icon: Bot,
    tone: "border-sky-500/20 bg-sky-500/10 text-sky-700",
    metric: "检索",
  },
  {
    id: "review-center",
    title: "错题复盘",
    description: "集中处理答错、跳过和未掌握的数学题，按章节查看薄弱点。",
    href: "/tools/review",
    icon: RotateCcw,
    tone: "border-rose-500/20 bg-rose-500/10 text-rose-700",
    metric: "待回看",
  },
  {
    id: "math3-self-test",
    title: "数学三自测",
    description: "生成安心卷、模拟卷或拔高卷，进入计时考试并保存复盘记录。",
    href: "/tools/math3-self-test",
    icon: ClipboardCheck,
    tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
    metric: "AI 组卷",
  },
  {
    id: "problem-booklet",
    title: "PDF 做题本",
    description: "从题集中批量选择题目，导出横屏一题一页的题目册和答案册。",
    href: "/tools/problem-booklet",
    icon: FileDown,
    tone: "border-amber-500/20 bg-amber-500/10 text-amber-700",
    metric: "PDF",
  },
  {
    id: "math3-catalog",
    title: "数学三知识目录",
    description: "按考纲章节管理知识点，并从目录范围进入刷题队列。",
    href: "/tools/math3-catalog",
    icon: BookOpen,
    tone: "border-violet-500/20 bg-violet-500/10 text-violet-700",
    metric: "目录刷题",
  },
];

export default function ToolsPage() {
  return (
    <>
      <PageHeader
        width="normal"
        title="工具"
        description="保留真正需要进入操作的学习入口。"
      />

      <PageShell width="normal" topPadding="content">
        <section className="grid gap-4 md:grid-cols-2 lg:gap-6">
          {primaryTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </section>
      </PageShell>
    </>
  );
}

function ToolCard({
  tool,
}: {
  tool: {
    title: string;
    description: string;
    href: string;
    icon: typeof ClipboardCheck;
    tone: string;
    metric: string;
  };
}) {
  const Icon = tool.icon;

  return (
    <Link
      href={tool.href}
      className="surface-card group flex min-h-40 flex-col p-5 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-float"
    >
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border transition-all duration-300 ease-out group-hover:scale-[1.03] ${tool.tone}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-headline text-lg font-bold text-on-surface transition-colors duration-300 ease-out group-hover:text-primary">
                {tool.title}
              </h3>
              <span className="tag-chip px-2 py-0.5 text-xs font-medium">
                {tool.metric}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">
              {tool.description}
            </p>
          </div>
        </div>

        <div className="mt-auto flex shrink-0 items-center justify-end gap-2 text-sm font-medium text-primary">
          <span>进入</span>
          <ChevronRight className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  );
}
