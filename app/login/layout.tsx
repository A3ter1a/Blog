import type { ReactNode } from "react";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "管理员登录",
  description: "Asteroid 的管理员登录入口，用于创建、编辑、删除内容和使用服务端 AI 能力。",
  path: "/login",
});

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
