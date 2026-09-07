import Link from "next/link";
import { AdminGate } from "@/components/auth/AdminGate";
import { AssistantMemoryReview } from "@/components/ai-assistant/AssistantMemoryReview";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "助手记忆",
  description: "核对并确认笔记助手保存的学习记忆候选。",
  path: "/tools/assistant-memory",
});

export default function AssistantMemoryPage() {
  return <AdminGate>
    <PageHeader title="助手记忆" width="normal" description="先核对内容和来源，再确认是否供后续回答参考。候选不会自动生效。" actions={<Link href="/tools" className="control-button min-h-11 px-3 text-sm">返回工具</Link>} />
    <PageShell width="normal" topPadding="content"><AssistantMemoryReview /></PageShell>
  </AdminGate>;
}
