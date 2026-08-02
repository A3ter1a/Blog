import { CollectionWorkspace } from "@/components/collections/CollectionWorkspace";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "合集工作台",
  description: "逐篇管理文章合集，支持追加、排序、移除和发布。",
  path: "/tools/collections",
});

export default function CollectionWorkspacePage() {
  return (
    <>
      <PageHeader width="wide" template="workspace" title="合集工作台" description="创建或编辑通用合集；每篇文章仍独立存储和阅读。" />
      <PageShell width="wide" topPadding="content" template="workspace">
        <CollectionWorkspace />
      </PageShell>
    </>
  );
}
