"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Calculator,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";

type CenterModuleId = "english" | "math" | "results";
type ModuleIcon = LucideIcon;

const centerModules: Array<{
  id: CenterModuleId;
  title: string;
  subtitle: string;
  status: string;
  icon: ModuleIcon;
  href?: string;
}> = [
  {
    id: "english",
    title: "英语真题训练",
    subtitle: "英语一 2007-2026",
    status: "可用",
    icon: BookOpenCheck,
    href: "/tools/english-training",
  },
  {
    id: "math",
    title: "数学真题训练",
    subtitle: "数学三真题",
    status: "待接入",
    icon: Calculator,
  },
  {
    id: "results",
    title: "真题训练结果",
    subtitle: "正确率与得分",
    status: "待接入",
    icon: BarChart3,
  },
];

export function PastPaperCenter() {
  return (
    <>
      <PageHeader
        width="workspace"
        title="真题中心"
        description="集中管理英语、数学真题训练和训练结果。"
        actions={(
          <Link href="/tools" className="control-button h-10 px-3 text-sm">
            返回工具
          </Link>
        )}
      />

      <PageShell width="workspace" topPadding="content">
        <section className="mx-auto grid max-w-4xl gap-3">
          {centerModules.map((module) => (
            <CenterModuleCard key={module.id} module={module} />
          ))}
        </section>
      </PageShell>
    </>
  );
}

function CenterModuleCard({
  module,
}: {
  module: {
    title: string;
    subtitle: string;
    status: string;
    icon: ModuleIcon;
    href?: string;
  };
}) {
  const Icon = module.icon;
  const content = (
    <div className={`surface-card group flex min-h-28 items-center gap-4 p-4 text-left sm:p-5 ${
      module.href ? "group" : "opacity-70"
    }`}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-on-surface sm:text-xl">{module.title}</h2>
          <span className="rounded-lg bg-surface-container-low px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
            {module.status}
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 text-on-surface-variant">{module.subtitle}</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 text-sm font-semibold text-primary">
        <span className="hidden sm:inline">{module.href ? "进入" : "待接入"}</span>
        <ArrowRight className={`h-4 w-4 transition-transform ${module.href ? "group-hover:translate-x-1" : ""}`} />
      </div>
    </div>
  );

  if (!module.href) return content;

  return <Link href={module.href}>{content}</Link>;
}
