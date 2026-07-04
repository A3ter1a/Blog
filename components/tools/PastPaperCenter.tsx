"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Calculator,
  ClipboardCheck,
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
        eyebrow="训练"
        icon={<ClipboardCheck className="h-4 w-4" />}
        title="真题中心"
        description="集中管理英语、数学真题训练和训练结果。"
      />

      <PageShell width="workspace" topPadding="content">
        <section className="grid gap-4 md:grid-cols-3">
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
    <div className={`surface-card flex min-h-56 flex-col justify-between p-5 text-left ${
      module.href ? "group" : "opacity-70"
    }`}>
      <div>
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </span>
          <span className="rounded-lg bg-surface-container-low px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
            {module.status}
          </span>
        </div>
        <h2 className="mt-5 text-xl font-bold text-on-surface">{module.title}</h2>
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">{module.subtitle}</p>
      </div>
      <div className="mt-6 flex items-center justify-between text-sm font-semibold text-primary">
        <span>{module.href ? "进入" : "待接入"}</span>
        <ArrowRight className={`h-4 w-4 transition-transform ${module.href ? "group-hover:translate-x-1" : ""}`} />
      </div>
    </div>
  );

  if (!module.href) return content;

  return <Link href={module.href}>{content}</Link>;
}
