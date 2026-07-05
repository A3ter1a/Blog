import {
  BookOpenText,
  Calculator,
  GraduationCap,
  Search,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { ToolHubCard, ToolHubGrid, type ToolHubCardItem } from "@/components/tools/ToolHubCard";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "工具",
  description: "进入 Asteroid 的学习工具台，按真题、数学训练和资料检索选择复习入口。",
  path: "/tools",
  keywords: ["学习工具", "真题中心", "数学训练", "资料检索"],
});

const toolHubs: ToolHubCardItem[] = [
  {
    id: "past-papers",
    title: "真题中心",
    description: "进入真题训练、训练结果和词句整理。",
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
    id: "economics-glossary",
    title: "经济学术语",
    description: "按英文原词、中文译名和考研表达整理微观概念。",
    href: "/tools/economics-glossary",
    icon: BookOpenText,
    tone: "border-amber-500/20 bg-amber-500/10 text-amber-700",
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
        <ToolHubGrid>
          {toolHubs.map((tool) => (
            <ToolHubCard key={tool.href} item={tool} />
          ))}
        </ToolHubGrid>
      </PageShell>
    </>
  );
}
