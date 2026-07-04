import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  FileDown,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";

type MathTrainingModule = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tone: string;
};

const mathTrainingModules: MathTrainingModule[] = [
  {
    title: "数学三自测",
    description: "先做：生成计时训练卷，并保存作答与复盘记录。",
    href: "/tools/math3-self-test",
    icon: ClipboardCheck,
    tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
  },
  {
    title: "错题复盘",
    description: "做完后：集中处理答错、跳过和未掌握的题目。",
    href: "/tools/review",
    icon: RotateCcw,
    tone: "border-rose-500/20 bg-rose-500/10 text-rose-700",
  },
  {
    title: "数学三知识目录",
    description: "按章节：查看知识点，并从目录范围进入刷题。",
    href: "/tools/math3-catalog",
    icon: BookOpen,
    tone: "border-violet-500/20 bg-violet-500/10 text-violet-700",
  },
  {
    title: "PDF 做题本",
    description: "离线练习：从题集中导出横屏题目册和答案册。",
    href: "/tools/problem-booklet",
    icon: FileDown,
    tone: "border-amber-500/20 bg-amber-500/10 text-amber-700",
  },
];

export function MathTrainingCenter() {
  return (
    <>
      <PageHeader
        width="normal"
        title="数学训练"
        description="日常数学练习入口，按训练、复盘、章节和导出使用。"
        actions={(
          <Link href="/tools" className="control-button h-10 px-3 text-sm">
            返回工具
          </Link>
        )}
      />

      <PageShell width="normal" topPadding="content">
        <section className="mx-auto grid max-w-4xl gap-3">
          {mathTrainingModules.map((module) => (
            <MathTrainingCard key={module.href} module={module} />
          ))}
        </section>
      </PageShell>
    </>
  );
}

function MathTrainingCard({ module }: { module: MathTrainingModule }) {
  const Icon = module.icon;

  return (
    <Link
      href={module.href}
      className="surface-card motion-card-lift group flex min-h-28 items-center gap-4 p-4 text-left sm:p-5"
    >
      <span className={`motion-ui flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border group-hover:scale-[1.03] ${module.tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-headline text-lg font-bold text-on-surface group-hover:text-primary sm:text-xl">
          {module.title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-on-surface-variant">
          {module.description}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 text-sm font-medium text-primary">
        <span className="hidden sm:inline">进入</span>
        <ChevronRight className="motion-icon-shift h-4 w-4 group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
