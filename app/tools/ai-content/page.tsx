import { Bot } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { AiContentWorkspace } from "@/components/ai-content/AiContentWorkspace";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "AI 内容工作台",
  description: "AI 学科账号提交 Markdown、执行静默自检并送人工审核。",
  path: "/tools/ai-content",
});

export default function AiContentPage() {
  return (
    <>
      <PageHeader
        width="wide"
        template="training"
        eyebrow="AI WORKSPACE"
        title="AI 内容工作台"
        description="每个学科账号只处理自己的 Markdown 草稿；审核和发布仍由你决定。"
        icon={<Bot className="h-5 w-5" />}
      />
      <PageShell width="wide" topPadding="content" template="training">
        <AiContentWorkspace />
      </PageShell>
    </>
  );
}
