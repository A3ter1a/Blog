import Link from "next/link";
import {
  BookOpen,
  ClipboardCheck,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { ToolHubCard, ToolHubGrid, type ToolHubCardItem } from "@/components/tools/ToolHubCard";
import { AdminMathOcrToolCard } from "@/components/tools/AdminMathOcrToolCard";
import { AdminToolHubCard } from "@/components/tools/AdminToolHubCard";

const mathTrainingModules: ToolHubCardItem[] = [
  {
    title: "数学三自测",
    description: "先做：生成计时训练卷，并保存作答与复盘记录。",
    href: "/tools/math3-self-test",
    icon: ClipboardCheck,
    tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
  },
  {
    title: "数学三知识目录",
    description: "按章节：查看知识点，并从目录范围进入刷题。",
    href: "/tools/math3-catalog",
    icon: BookOpen,
    tone: "border-violet-500/20 bg-violet-500/10 text-violet-700",
  },
];

export function MathTrainingCenter() {
  return (
    <>
      <PageHeader
        width="normal"
        template="training"
        title="数学训练"
        description="按章节查找知识点，进入数学三计时自测。"
        actions={(
          <Link href="/tools" className="control-button h-10 px-3 text-sm">
            返回工具
          </Link>
        )}
      />

      <PageShell width="normal" topPadding="content" template="training">
        <ToolHubGrid>
          {mathTrainingModules.map((module, index) => (
            <ToolHubCard key={module.href} item={module} index={index} />
          ))}
          <AdminToolHubCard
            icon="review"
            title="错题复盘"
            description="集中处理答错、跳过和未掌握的题目。"
            href="/tools/review"
            tone="border-rose-500/20 bg-rose-500/10 text-rose-700"
          />
          <AdminToolHubCard
            icon="file"
            title="PDF 做题本"
            description="从题集中导出横屏题目册和答案册，适合管理员整理后离线练习。"
            href="/tools/problem-booklet"
            actionLabel="导出题本"
            tone="border-amber-500/20 bg-amber-500/10 text-amber-700"
          />
          <AdminMathOcrToolCard />
        </ToolHubGrid>
      </PageShell>
    </>
  );
}
