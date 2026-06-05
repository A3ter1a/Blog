import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Layers,
  ListChecks,
  Target,
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

const supportTools = [
  {
    id: "reading-time",
    title: "阅读时间",
    description: "笔记阅读页自动显示预计阅读时间，帮助安排复习节奏。",
    href: "/notes",
    icon: Clock,
    tone: "border-blue-500/20 bg-blue-500/10 text-blue-700",
    metric: "笔记内置",
  },
];

const workflowSteps = [
  { title: "整理", description: "在笔记和题集中沉淀材料", icon: Layers },
  { title: "定位", description: "用数学三目录锁定章节范围", icon: Target },
  { title: "检验", description: "用刷题和自测暴露薄弱点", icon: ListChecks },
];

export default function ToolsPage() {
  return (
    <main className="min-h-screen bg-surface pt-24">
      <section className="border-b border-outline-variant/20 bg-surface-container-low/70">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div>
              <div className="eyebrow-chip mb-3 px-3 py-1 text-xs">
                <Target className="h-4 w-4" />
                学习工具台
              </div>
              <h1 className="font-headline text-3xl font-bold text-on-surface md:text-4xl">
                工具
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-on-surface-variant md:text-base">
                把笔记、题集、数学三目录和模拟自测串成一条复习工作流。
              </p>
            </div>

            <div className="surface-panel grid grid-cols-3 gap-2 p-3">
              {workflowSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="surface-muted px-3 py-3">
                    <Icon className="mb-2 h-4 w-4 text-primary" />
                    <div className="text-sm font-semibold text-on-surface">{step.title}</div>
                    <div className="mt-1 text-xs leading-5 text-on-surface-variant">{step.description}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <section className="grid gap-4 lg:grid-cols-2">
          {primaryTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} priority />
          ))}
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-on-surface">辅助能力</h2>
            <Link
              href="/notes"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-container"
            >
              查看笔记
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {supportTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function ToolCard({
  tool,
  priority = false,
}: {
  tool: {
    title: string;
    description: string;
    href: string;
    icon: typeof ClipboardCheck;
    tone: string;
    metric: string;
  };
  priority?: boolean;
}) {
  const Icon = tool.icon;

  return (
    <Link
      href={tool.href}
      className={`surface-card group block p-5 hover:-translate-y-0.5 ${
        priority ? "min-h-52" : ""
      }`}
    >
      <div className="flex h-full flex-col justify-between gap-5">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className={`flex h-11 w-11 items-center justify-center rounded-lg border ${tool.tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <span className="tag-chip px-2.5 py-1 text-xs font-medium">
              {tool.metric}
            </span>
          </div>

          <h3 className="mt-5 font-headline text-xl font-bold text-on-surface group-hover:text-primary">
            {tool.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">
            {tool.description}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-outline-variant/15 pt-4 text-sm font-medium text-primary">
          <span>进入</span>
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}
