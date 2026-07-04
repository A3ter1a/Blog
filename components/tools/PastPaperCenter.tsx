"use client";

import { useState } from "react";
import {
  BarChart3,
  BookOpenCheck,
  Calculator,
  ClipboardCheck,
  Clock3,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { EnglishTraining } from "@/components/tools/EnglishTraining";

type CenterModuleId = "english" | "math" | "results";
type ModuleIcon = LucideIcon;

const centerModules: Array<{
  id: CenterModuleId;
  title: string;
  subtitle: string;
  status: string;
  icon: ModuleIcon;
}> = [
  {
    id: "english",
    title: "英语真题训练",
    subtitle: "英语一 2007-2026",
    status: "可用",
    icon: BookOpenCheck,
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
  const [activeModule, setActiveModule] = useState<CenterModuleId>("english");

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
        <section className="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="surface-panel p-3 xl:sticky xl:top-24 xl:self-start">
            <div className="mb-3 flex items-center gap-2 px-2 text-sm font-semibold text-on-surface">
              <Clock3 className="h-4 w-4 text-primary" />
              真题中心
            </div>
            <div className="grid gap-2">
              {centerModules.map((module) => {
                const Icon = module.icon;
                const active = module.id === activeModule;
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => setActiveModule(module.id)}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                      active
                        ? "border-primary/35 bg-primary/[0.08] text-primary"
                        : "border-outline-variant/20 bg-surface-container-low/70 text-on-surface hover:border-primary/25 hover:bg-surface-container-lowest"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        active ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-primary"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{module.title}</span>
                        <span className="mt-1 block text-xs text-on-surface-variant">{module.subtitle}</span>
                        <span className="mt-2 inline-flex rounded-md bg-surface-container-lowest px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">
                          {module.status}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0">
            {activeModule === "english" ? (
              <EnglishTraining embedded />
            ) : (
              <PendingModule module={centerModules.find((module) => module.id === activeModule)!} />
            )}
          </section>
        </section>
      </PageShell>
    </>
  );
}

function PendingModule({
  module,
}: {
  module: {
    title: string;
    subtitle: string;
    icon: ModuleIcon;
  };
}) {
  const Icon = module.icon;

  return (
    <section className="surface-panel flex min-h-[32rem] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h2 className="font-headline text-2xl font-bold text-on-surface">{module.title}</h2>
        <p className="mt-2 text-sm text-on-surface-variant">{module.subtitle} · 待接入</p>
      </div>
    </section>
  );
}
