import { AdminGate } from "@/components/auth/AdminGate";
import { AiContentReviewWorkspace } from "@/components/ai-content/AiContentReviewWorkspace";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { createNoIndexMetadata } from "@/lib/site-metadata";
import { ShieldCheck } from "lucide-react";

export const metadata = createNoIndexMetadata({
  title: "AI 内容审核",
  description: "管理员审核 AI 学科账号提交的 Markdown，支持版本锚定批注、退回、批准与发布。",
  path: "/tools/ai-review",
});

export default function AiReviewPage() {
  return (
    <AdminGate>
      <PageHeader
        width="wide"
        template="training"
        eyebrow="AI REVIEW"
        title="AI 内容审核"
        description="检查 AI 整理的知识点、推导和例题，确认无误后发布；需要修改时可批注并退回。"
        icon={<ShieldCheck className="h-5 w-5" />}
      />
      <PageShell width="wide" topPadding="content" template="training">
        <AiContentReviewWorkspace />
      </PageShell>
    </AdminGate>
  );
}
