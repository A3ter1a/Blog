import Link from "next/link";
import {
  Calculator,
  ChevronRight,
  GraduationCap,
  Search,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "工具",
  description: "进入 Asteroid 的学习工具台，按真题、数学训练和资料检索选择复习入口。",
  path: "/tools",
  keywords: ["学习工具", "真题中心", "数学训练", "资料检索"],
});

const toolHubs = [
  {
    id: "past-papers",
    title: "真题中心",
    description: "进入英语真题训练、数学真题训练和真题训练结果。",
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
    id: "resource-search",
    title: "资料检索",
    description: "在已发布笔记和题集中定位内容，查找材料来源。",
    href: "/tools/resource-search",
    icon: Search,
    tone: "border-sky-500/20 bg-sky-500/10 text-sky-700",
  },
];

export default function ToolsPage() {
  return (
    <>
      <PageHeader
        width="normal"
        title="工具"
        description="先选复习方向，再进入具体操作。"
      />

      <PageShell width="normal" topPadding="content">
        <section className="mx-auto grid max-w-4xl gap-3">
          {toolHubs.map((tool) => (
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
    icon: LucideIcon;
    tone: string;
  };
}) {
  const Icon = tool.icon;

  return (
    <Link
      href={tool.href}
      className="surface-card motion-card-lift group flex min-h-28 items-center gap-4 p-4 text-left sm:p-5"
    >
      <span className={`motion-ui flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border group-hover:scale-[1.03] ${tool.tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-headline text-lg font-bold text-on-surface group-hover:text-primary sm:text-xl">
          {tool.title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-on-surface-variant">
          {tool.description}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 text-sm font-medium text-primary">
        <span className="hidden sm:inline">进入</span>
        <ChevronRight className="motion-icon-shift h-4 w-4 group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
