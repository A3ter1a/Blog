import Link from "next/link";
import {
  BookOpen,
  Bot,
  ChevronRight,
  ClipboardCheck,
  RotateCcw,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";

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
        <section className="grid gap-3 md:grid-cols-2">
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
      className="surface-card group flex min-h-36 flex-col p-4 hover:-translate-y-0.5"
    >
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className={`flex h-11 w-11 items-center justify-center rounded-lg border ${tool.tone}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-headline text-lg font-bold text-on-surface group-hover:text-primary">
                {tool.title}
              </h3>
              <span className="tag-chip px-2 py-0.5 text-xs font-medium">
                {tool.metric}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-on-surface-variant">
              {tool.description}
            </p>
          </div>
        </div>

        <div className="mt-auto flex shrink-0 items-center justify-end gap-2 text-sm font-medium text-primary">
          <span>进入</span>
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}
