import { AdminGate } from "@/components/auth/AdminGate";
import { EnglishTraining } from "@/components/tools/EnglishTraining";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "英语真题训练",
  description: "英语一 2007-2026 真题训练。",
  path: "/tools/english-training",
});

export default function EnglishTrainingPage() {
  return (
    <AdminGate>
      <EnglishTraining />
    </AdminGate>
  );
}
