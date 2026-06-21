import type { ReactNode } from "react";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "调试面板",
  description: "Asteroid 的本地开发调试入口，生产环境不可访问。",
  path: "/debug",
});

export default function DebugLayout({ children }: { children: ReactNode }) {
  return children;
}
