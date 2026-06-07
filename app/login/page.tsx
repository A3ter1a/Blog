"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, LogOut } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { PageShell } from "@/components/ui/PageScaffold";

export default function LoginPage() {
  const router = useRouter();
  const { loading, user, isAdmin } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const { error } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    router.push("/create");
  };

  const handleLogout = async () => {
    setSubmitting(true);
    await getSupabase().auth.signOut();
    setSubmitting(false);
    setMessage("已退出登录");
  };

  return (
    <PageShell width="compact">
      <div className="surface-panel mx-auto max-w-sm p-6">
        <h1 className="mb-2 font-headline text-2xl font-bold text-on-surface">管理员登录</h1>
        <p className="text-sm text-on-surface-variant mb-6">
          登录后才能创建、编辑、删除内容和使用服务端 AI 能力。
        </p>

        {loading ? (
          <div className="flex items-center gap-3 text-on-surface-variant">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span>正在检查登录状态...</span>
          </div>
        ) : user ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-container-high p-4 text-sm text-on-surface-variant">
              <div>当前账号：{user.email}</div>
              <div className={isAdmin ? "text-green-700 mt-1" : "text-red-600 mt-1"}>
                {isAdmin ? "管理员权限已生效" : "当前账号不在管理员名单中"}
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={submitting}
              className="control-button h-11 w-full px-4 text-sm"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              退出登录
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-2">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field-control h-11 w-full px-4 text-sm"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-2">密码</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field-control h-11 w-full px-4 text-sm"
                autoComplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="control-button control-button-primary h-11 w-full px-4 text-sm"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              登录
            </button>
          </form>
        )}

        {message && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {message}
          </div>
        )}
      </div>
    </PageShell>
  );
}
