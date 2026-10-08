"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getLoginReturnPath } from "@/lib/login-return";
import { resolveAdminAuthCheck } from "@/lib/auth-error";
import { Loader2, LogIn, LogOut } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { getFreshAuthSession, invalidateCachedAuthSession } from "@/lib/fetch-with-auth";
import { recheckAdminAuth, useAdminAuth, useLocalReviewMode } from "@/hooks/useAdminAuth";
import { PageShell } from "@/components/ui/PageScaffold";
import { useAiAccountSlot } from "@/hooks/useAiAccountSlot";
import {
  AI_ACCOUNT_SLOT_CONFIG,
  clearActiveAiAccountSlot,
  doesAiProfileMatchSlot,
  getAiAccountSlotForEmail,
  getAiAccountSlotPath,
  isExpectedAiAccountEmail,
} from "@/lib/auth-session-slot";

function getApiError(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as Record<string, unknown>).error;
  return typeof error === "string" && error ? error : fallback;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnPath = getLoginReturnPath(searchParams.get("next"));
  const { loading, user, isAdmin, error: authError, retryable: authRetryable } = useAdminAuth();
  const isReviewMode = useLocalReviewMode();
  const accountSlot = useAiAccountSlot();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [adminRetrying, setAdminRetrying] = useState(false);
  const [adminRetryAvailable, setAdminRetryAvailable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const slotConfig = accountSlot ? AI_ACCOUNT_SLOT_CONFIG[accountSlot] : null;
  const currentEmailMatchesSlot = accountSlot
    ? isExpectedAiAccountEmail(accountSlot, user?.email)
    : false;

  const navigateAfterAdmin = () => {
    router.replace(returnPath);
    // Keep a hard-navigation fallback for a router transition interrupted by
    // an auth-state update. It only runs while the browser is still on login.
    window.setTimeout(() => {
      if (window.location.pathname === "/login") {
        window.location.assign(returnPath);
      }
    }, 500);
  };

  const checkAdminAccess = async (token: string) => {
    let result: { response: Response; payload: unknown } | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch("/api/auth/admin", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const payload: unknown = await response.json().catch(() => null);
      result = { response, payload };
      if (response.status < 500 || attempt === 1) break;
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
    return result!;
  };

  const handleRetryAdminAccess = async () => {
    if (accountSlot || adminRetrying || submitting) return;

    setAdminRetrying(true);
    setMessage(null);
    try {
      // A retry must bypass the short render cache. Immediately after a
      // sign-in the auth storage event can still be settling, so the cached
      // value may be null even though Supabase already has a valid session.
      const session = await getFreshAuthSession();
      const token = session?.access_token;
      if (!token) {
        setAdminRetryAvailable(false);
        setMessage("登录会话已失效，请重新登录后重试。");
        return;
      }

      const { response, payload } = await checkAdminAccess(token);
      if (!response.ok) {
        const resolution = resolveAdminAuthCheck({ ok: response.ok, status: response.status, payload });
        if (!resolution.retryable) {
          await getSupabase().auth.signOut({ scope: "local" });
          invalidateCachedAuthSession();
          setAdminRetryAvailable(false);
        } else {
          setAdminRetryAvailable(true);
        }
        setMessage(resolution.error);
        return;
      }

      setAdminRetryAvailable(false);
      recheckAdminAuth();
      navigateAfterAdmin();
    } catch (error: unknown) {
      setAdminRetryAvailable(true);
      setMessage(error instanceof Error ? error.message : "管理员权限检查失败，请稍后重试。");
    } finally {
      setAdminRetrying(false);
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setAdminRetryAvailable(false);
    setMessage(null);

    try {
      if (isReviewMode) {
        navigateAfterAdmin();
        return;
      }

      const normalizedEmail = (slotConfig?.email ?? email).trim().toLowerCase();
      if (accountSlot && !isExpectedAiAccountEmail(accountSlot, normalizedEmail)) {
        setMessage(`当前窗口固定为${AI_ACCOUNT_SLOT_CONFIG[accountSlot].label}账号，请使用预设邮箱登录。`);
        return;
      }

      const aiEmailSlot = getAiAccountSlotForEmail(normalizedEmail);
      if (!accountSlot && aiEmailSlot) {
        setMessage(`该邮箱必须从${AI_ACCOUNT_SLOT_CONFIG[aiEmailSlot].label}专属入口登录，避免覆盖管理员会话。`);
        return;
      }

      const supabase = getSupabase();
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        setMessage(error.message);
        return;
      }

      invalidateCachedAuthSession();
      const session = signInData.session ?? await getFreshAuthSession();
      const token = session?.access_token;
      if (!token) {
        setMessage("登录成功，但没有取得有效会话，请重新登录。");
        return;
      }

      if (accountSlot) {
        if (!isExpectedAiAccountEmail(accountSlot, session.user.email)) {
          await supabase.auth.signOut({ scope: "local" });
          setMessage("登录账号与当前学科槽不一致，已安全退出该槽位。");
          return;
        }

        const aiResponse = await fetch("/api/ai/account", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const aiPayload: unknown = await aiResponse.json().catch(() => null);
        const profile = aiPayload && typeof aiPayload === "object" && !Array.isArray(aiPayload)
          ? (aiPayload as Record<string, unknown>).profile
          : null;

        if (!aiResponse.ok || !doesAiProfileMatchSlot(accountSlot, profile)) {
          await supabase.auth.signOut({ scope: "local" });
          setMessage(aiResponse.ok
            ? "账号资料与当前学科槽不一致，已安全退出；请先检查 AI 账号配置。"
            : getApiError(aiPayload, "当前账号无法进入 AI 内容工作台。"));
          return;
        }

        router.push(getAiAccountSlotPath("/tools/ai-content", accountSlot));
        return;
      }

      setAdminRetryAvailable(true);
      const { response: adminResponse, payload: adminPayload } = await checkAdminAccess(token);
      if (!adminResponse.ok) {
        const resolution = resolveAdminAuthCheck({ ok: false, status: adminResponse.status, payload: adminPayload });
        if (!resolution.retryable) {
          await supabase.auth.signOut({ scope: "local" });
          invalidateCachedAuthSession();
          setAdminRetryAvailable(false);
        } else {
          setAdminRetryAvailable(true);
        }
        setMessage(resolution.error);
        return;
      }

      setAdminRetryAvailable(false);
      recheckAdminAuth();
      navigateAfterAdmin();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "登录失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setSubmitting(true);
    const { error } = await getSupabase().auth.signOut({ scope: "local" });
    invalidateCachedAuthSession();
    setAdminRetryAvailable(false);
    setSubmitting(false);
    if (error) {
      setMessage(`退出登录失败：${error.message}`);
      return;
    }
    clearActiveAiAccountSlot();
    window.location.href = "/";
  };

  return (
    <PageShell width="compact">
      <div className="surface-panel mx-auto max-w-sm p-6">
        <h1 className="mb-2 font-headline text-2xl font-bold text-on-surface">账号登录</h1>
        <p className="text-sm text-on-surface-variant mb-6">
          {slotConfig
            ? `${slotConfig.label}专属会话只保存该学科账号，不会覆盖管理员或其他学科的登录状态。`
            : "管理员账号可以维护博客；AI 学科账号请使用各自的专属登录入口。"}
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
              <div className={(isAdmin || currentEmailMatchesSlot) ? "text-green-700 mt-1" : "text-red-600 mt-1"}>
                {accountSlot
                  ? (currentEmailMatchesSlot
                    ? `${slotConfig?.label ?? "学科"}账号会话已恢复`
                    : "当前登录账号与该学科槽不一致，请先退出")
                  : (isAdmin ? "管理员权限已生效" : authRetryable || adminRetryAvailable || adminRetrying
                    ? "已登录，管理员权限暂时无法确认"
                    : "当前账号没有管理员权限，可退出后切换账号")}
              </div>
            </div>
            {accountSlot && currentEmailMatchesSlot && (
              <Link href={getAiAccountSlotPath("/tools/ai-content", accountSlot)} className="control-button control-button-primary inline-flex h-11 w-full items-center justify-center px-4 text-sm">
                打开 AI 内容工作台
              </Link>
            )}
            {!accountSlot && isAdmin && (
              <Link href={returnPath} className="control-button control-button-primary min-h-11 w-full px-4 text-sm">
                继续学习
              </Link>
            )}
            <button
              onClick={handleLogout}
              disabled={submitting || adminRetrying}
              className="control-button h-11 w-full px-4 text-sm"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              退出登录
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-on-surface-variant mb-2">邮箱</label>
              <input
                id="login-email"
                type="email"
                value={slotConfig?.email ?? email}
                onChange={(event) => setEmail(event.target.value)}
                className="field-control h-11 w-full px-4 text-sm"
                autoComplete="email"
                readOnly={Boolean(accountSlot)}
                aria-readonly={Boolean(accountSlot)}
                required={!isReviewMode}
              />
              {slotConfig && (
                <p className="mt-2 text-xs text-on-surface-variant/75">
                  已锁定为{slotConfig.label}账号邮箱；会话将保存在独立槽位中。
                </p>
              )}
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-on-surface-variant mb-2">密码</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field-control h-11 w-full px-4 text-sm"
                autoComplete="current-password"
                required={!isReviewMode}
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="control-button control-button-primary h-11 w-full px-4 text-sm"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {isReviewMode ? "进入审查页面" : "登录"}
            </button>
          </form>
        )}

        {(message || (!accountSlot && authRetryable && authError)) && !adminRetrying && (
          <div className="mt-4 space-y-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
            {message ?? authError}
          </div>
        )}
        {!accountSlot && (adminRetryAvailable || adminRetrying || authRetryable) && (
              <button
                type="button"
                onClick={() => void handleRetryAdminAccess()}
                disabled={adminRetrying || submitting || loading}
                className="control-button mt-4 min-h-11 w-full px-3 text-sm"
              >
                {adminRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {adminRetrying ? "正在重新检查…" : "重新检查管理员权限"}
              </button>
        )}
      </div>
    </PageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<PageShell width="compact"><p role="status" className="text-on-surface-variant">正在准备登录…</p></PageShell>}>
      <LoginContent />
    </Suspense>
  );
}
