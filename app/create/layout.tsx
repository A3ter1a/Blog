import type { ReactNode } from "react";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "创建与编辑",
  description: "Asteroid 的管理员内容编辑入口，用于维护公开笔记、题集、封面和章节数据。",
  path: "/create",
});

export default function CreateLayout({ children }: { children: ReactNode }) {
  return children;
}
