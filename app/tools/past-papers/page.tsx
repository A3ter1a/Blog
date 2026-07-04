import { AdminGate } from "@/components/auth/AdminGate";
import { PastPaperCenter } from "@/components/tools/PastPaperCenter";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "真题中心",
  description: "英语、数学真题训练和训练结果中心。",
  path: "/tools/past-papers",
});

export default function PastPaperCenterPage() {
  return (
    <AdminGate>
      <PastPaperCenter />
    </AdminGate>
  );
}
