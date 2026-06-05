import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  ListChecks,
  Target,
  Zap,
} from "lucide-react";

const primaryTools = [
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

const secondaryTools = [
  {
    id: "problem-bank",
    title: "题集与刷题",
    description: "从题集进入阅读、编辑和章节整理，再衔接到目录刷题。",
    href: "/notes",
    icon: ListChecks,
    tone: "border-blue-500/20 bg-blue-500/10 text-blue-700",
    metric: "题库入口",
  },
  {
    id: "flashcard",
    title: "抽卡复习",
    description: "复习到期闪卡，按掌握程度自动安排下一次回看。",
    href: "/flashcard",
    icon: Zap,
    tone: "border-amber-500/20 bg-amber-500/10 text-amber-700",
    metric: "间隔重复",
  },
];

export default function ToolsPage() {
  return (
    <main className="min-h-screen bg-surface pt-24">
      <section className="border-b border-outline-variant/20 bg-surface-container-low/70">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div>
            <div className="eyebrow-chip mb-3 px-3 py-1 text-xs">
              <Target className="h-4 w-4" />
              学习工具台
            </div>
            <h1 className="font-headline text-3xl font-bold text-on-surface md:text-4xl">
              工具
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-on-surface-variant md:text-base">
              只保留真正需要进入操作的入口。
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <section className="grid gap-3">
          {primaryTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
          {secondaryTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </section>
      </div>
    </main>
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
      className="surface-card group block p-4 hover:-translate-y-0.5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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

        <div className="flex shrink-0 items-center justify-end gap-2 text-sm font-medium text-primary">
          <span>进入</span>
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}
