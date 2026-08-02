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
        description="审核与发布独立于 AI 工作台；正文只在批准并发布后进入现有 notes 数据结构。"
        icon={<ShieldCheck className="h-5 w-5" />}
      />
      <PageShell width="wide" topPadding="content" template="training">
        <AiContentReviewWorkspace />
      </PageShell>
    </AdminGate>
  );
}
