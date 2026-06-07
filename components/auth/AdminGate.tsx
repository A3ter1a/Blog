"use client";

import Link from "next/link";
import { Loader2, LockKeyhole } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type AdminGateProps = {
  children: React.ReactNode;
};

export function AdminGate({ children }: AdminGateProps) {
  const { loading, user, isAdmin } = useAdminAuth();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4 pb-20 pt-24 sm:px-6">
        <div className="flex items-center gap-3 text-on-surface-variant">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span>正在确认管理员身份...</span>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4 pb-20 pt-24 sm:px-6">
        <div className="surface-panel max-w-sm space-y-4 p-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-surface-container-high flex items-center justify-center text-primary">
            <LockKeyhole className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-on-surface font-headline">需要管理员登录</h1>
          <p className="text-sm text-on-surface-variant">
            这个页面会修改公开网站数据，必须登录后才能继续。
          </p>
          <Link
            href="/login"
            className="control-button control-button-primary px-5 py-2.5 text-sm"
          >
            前往登录
          </Link>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4 pb-20 pt-24 sm:px-6">
        <div className="surface-panel max-w-sm space-y-4 p-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-50 flex items-center justify-center text-red-600">
            <LockKeyhole className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-on-surface font-headline">没有管理员权限</h1>
          <p className="text-sm text-on-surface-variant">
            当前账号不能创建、编辑或删除博客数据。
          </p>
          <Link
            href="/"
            className="control-button px-5 py-2.5 text-sm"
          >
            返回首页
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
