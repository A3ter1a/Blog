import { PageLoadingSkeleton } from "@/components/ui/PageLoadingSkeleton";

export default function NoteReaderLoading() {
  return <PageLoadingSkeleton title="正在加载笔记正文" variant="reader" />;
}
