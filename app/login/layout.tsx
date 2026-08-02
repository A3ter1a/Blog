import type { ReactNode } from "react";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "账号登录",
  description: "Asteroid 的管理员与 AI 学科账号登录入口。",
  path: "/login",
});

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
