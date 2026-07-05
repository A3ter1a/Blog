import { EconomicsGlossary } from "@/components/tools/EconomicsGlossary";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "经济学术语",
  description: "按英文原词、国内译名和考研表达整理的微观经济学术语库。",
  path: "/tools/economics-glossary",
  keywords: ["微观经济学", "经济学术语", "平狄克", "考研经济学"],
});

export default function EconomicsGlossaryPage() {
  return <EconomicsGlossary />;
}
