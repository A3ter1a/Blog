import { AdminGate } from "@/components/auth/AdminGate";
import { EnglishVocabularyLibrary } from "@/components/tools/EnglishVocabularyLibrary";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "词汇汇总",
  description: "英语真题生词、固定搭配和熟词生义汇总。",
  path: "/tools/english-vocabulary",
});

export default function EnglishVocabularyPage() {
  return (
    <AdminGate>
      <EnglishVocabularyLibrary />
    </AdminGate>
  );
}
