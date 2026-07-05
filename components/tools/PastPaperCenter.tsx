import Link from "next/link";
import {
  BarChart3,
  BookOpenCheck,
  Calculator,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { ToolHubCard, ToolHubGrid, type ToolHubCardItem } from "@/components/tools/ToolHubCard";

type CenterModuleId = "english" | "math" | "results";

const centerModules: Array<{
  id: CenterModuleId;
} & ToolHubCardItem> = [
  {
    id: "english",
    title: "英语真题训练",
    description: "英语一 2007-2026",
    icon: BookOpenCheck,
    href: "/tools/english-training",
    tone: "border-teal-500/20 bg-teal-500/10 text-teal-700",
  },
  {
    id: "math",
    title: "数学真题训练",
    description: "数学三真题",
    icon: Calculator,
    tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
  },
  {
    id: "results",
    title: "真题训练结果",
    description: "正确率与得分",
    icon: BarChart3,
    href: "/tools/past-paper-results",
    tone: "border-sky-500/20 bg-sky-500/10 text-sky-700",
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
        <ToolHubGrid>
          {centerModules.map((module) => (
            <ToolHubCard key={module.id} item={module} />
          ))}
        </ToolHubGrid>
      </PageShell>
    </>
  );
}
