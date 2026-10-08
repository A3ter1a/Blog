"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { getCachedAuthSession, getFreshAuthSession } from "@/lib/fetch-with-auth";
import { readJsonStorage, removeStorage, writeJsonStorage } from "@/lib/browser-storage";
import { getActiveAiAccountSlot, getAuthCacheKey } from "@/lib/auth-session-slot";
import { resolveAdminAuthCheck, type AdminAuthCheckResult } from "@/lib/auth-error";

type AdminAuthState = {
  loading: boolean;
  user: User | null;
  isAdmin: boolean;
  error: string | null;
  retryable: boolean;
};

type CachedAdminAuth = {
  userId: string;
  email: string | null;
  isAdmin: boolean;
  checkedAt: number;
  expiresAt: number;
};

const ADMIN_AUTH_CACHE_KEY_BASE = "asteroid-admin-auth";
const ADMIN_AUTH_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_AUTH_REVALIDATE_INTERVAL_MS = 60 * 1000;
const ADMIN_AUTH_RECHECK_EVENT = "asteroid:admin-auth-recheck";

/**
 * Local-only review switch. It requires an explicit env flag and a localhost
 * origin, so it cannot replace authorization in a deployed environment.
 * Server APIs keep their normal admin checks.
 */
function isLocalReviewMode(): boolean {
  if (process.env.NEXT_PUBLIC_ASTEROID_REVIEW_MODE !== "1") return false;
  if (typeof window === "undefined") return false;

  return window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1";
}

const REVIEW_MODE_EVENT = "asteroid:review-mode-change";

export function useLocalReviewMode(): boolean {
  // Keep the server render and the first client render identical. The
  // localhost-only review flag is intentionally enabled after hydration so it
  // cannot make protected pages produce different HTML on the two sides.
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const refresh = () => setEnabled(isLocalReviewMode());
    refresh();
    window.addEventListener(REVIEW_MODE_EVENT, refresh);
    return () => window.removeEventListener(REVIEW_MODE_EVENT, refresh);
  }, []);

  return enabled;
}

export function recheckAdminAuth(): void {
  window.dispatchEvent(new Event(ADMIN_AUTH_RECHECK_EVENT));
}

let pendingAdminCheck: {
  userId: string;
  token: string;
  promise: Promise<AdminAuthCheckResult>;
} | null = null;

async function checkAdminOnServer(user: User, token: string): Promise<AdminAuthCheckResult> {
  if (
    pendingAdminCheck
    && pendingAdminCheck.userId === user.id
    && pendingAdminCheck.token === token
  ) {
    return pendingAdminCheck.promise;
  }

  const promise = fetch("/api/auth/admin", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  }).then(async (res) => ({
    ok: res.ok,
    status: res.status,
    payload: await res.json().catch(() => null),
  }));

  pendingAdminCheck = { userId: user.id, token, promise };

  try {
    return await promise;
  } finally {
    if (pendingAdminCheck?.promise === promise) {
      pendingAdminCheck = null;
    }
  }
}

function normalizeCachedAdminAuth(value: unknown): CachedAdminAuth | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Partial<CachedAdminAuth>;
  if (typeof record.userId !== "string") return null;
  if (typeof record.isAdmin !== "boolean") return null;
  if (typeof record.checkedAt !== "number") return null;
  if (typeof record.expiresAt !== "number") return null;

  return {
    userId: record.userId,
    email: typeof record.email === "string" ? record.email : null,
    isAdmin: record.isAdmin,
    checkedAt: record.checkedAt,
    expiresAt: record.expiresAt,
  };
}

function readCachedAdminAuth(): CachedAdminAuth | null {
  const cacheKey = getAuthCacheKey(ADMIN_AUTH_CACHE_KEY_BASE);
  const cached = readJsonStorage<CachedAdminAuth | null>(
    cacheKey,
    null,
    normalizeCachedAdminAuth,
  );

  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    removeStorage(cacheKey);
    return null;
  }
  // A previous 403 must not survive a deployment or an administrator-list
  // repair. Only positive authorization is reusable across sessions.
  if (!cached.isAdmin) {
    removeStorage(cacheKey);
    return null;
  }

  return cached;
}

function readCachedAdminAuthForUser(user: User): CachedAdminAuth | null {
  const cached = readCachedAdminAuth();
  return cached?.userId === user.id ? cached : null;
}

function writeCachedAdminAuth(user: User, isAdmin: boolean): void {
  const cacheKey = getAuthCacheKey(ADMIN_AUTH_CACHE_KEY_BASE);
  if (!isAdmin) {
    removeStorage(cacheKey);
    return;
  }

  const checkedAt = Date.now();
  writeJsonStorage<CachedAdminAuth>(cacheKey, {
    userId: user.id,
    email: user.email ?? null,
    isAdmin,
    checkedAt,
    expiresAt: checkedAt + ADMIN_AUTH_CACHE_TTL_MS,
  });
}

export function useAdminAuth(): AdminAuthState {
  const pathname = usePathname();
  const isUiLabPath = pathname.startsWith("/ui-lab/");
  const isReviewMode = useLocalReviewMode();
  const [state, setState] = useState<AdminAuthState>({
    loading: true,
    user: null,
    isAdmin: false,
    error: null,
    retryable: false,
  });

  useEffect(() => {
    if (!isReviewMode) return;

    // Review mode is a local UI-only session. Keep protected server routes
    // unchanged, but let client gates render the page without a remote login.
    const timer = window.setTimeout(() => {
      setState({
        loading: false,
        user: null,
        isAdmin: true,
        error: null,
        retryable: false,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isReviewMode]);

  useEffect(() => {
    if (isReviewMode) return;
    if (isUiLabPath) return;

    const aiAccountSlot = getActiveAiAccountSlot();
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    let errorTimer: number | undefined;
    let latestCheckId = 0;

    async function verifyAdminState(
      user: User,
      token: string,
      errorMessage: string | null,
      checkId: number,
      fallbackIsAdmin?: boolean,
    ) {
      try {
        const result = await checkAdminOnServer(user, token);

        if (!mounted || latestCheckId !== checkId) return;

        const resolution = resolveAdminAuthCheck(result, fallbackIsAdmin);
        if (resolution.cache === "positive") {
          writeCachedAdminAuth(user, true);
        } else if (resolution.cache === "clear") {
          writeCachedAdminAuth(user, false);
        }

        // A transient server/network failure must not turn a previously valid
        // administrator into a permanent 403. Keep a positive cached state
        // while exposing a retryable error to the caller.
        setState({
          loading: false,
          user,
          isAdmin: resolution.isAdmin,
          error: resolution.error,
          retryable: resolution.retryable,
        });
      } catch (error) {
        if (!mounted || latestCheckId !== checkId) return;

        setState({
          loading: false,
          user,
          isAdmin: fallbackIsAdmin ?? false,
          error: error instanceof Error ? error.message : errorMessage,
          retryable: true,
        });
      }
    }

    function resolveAdminState(user: User | null, token: string | null, errorMessage?: string | null, forceCheck = false) {
      latestCheckId += 1;
      const checkId = latestCheckId;

      if (!user || !token) {
        removeStorage(getAuthCacheKey(ADMIN_AUTH_CACHE_KEY_BASE));
        if (!mounted) return;
        setState({
          loading: false,
          user,
          isAdmin: false,
          error: errorMessage ?? null,
          retryable: false,
        });
        return;
      }

      if (!mounted) return;

      // A dedicated AI account slot can never be an administrator session.
      // Skipping the admin endpoint avoids a pointless 403 on each page mount.
      if (aiAccountSlot) {
        removeStorage(getAuthCacheKey(ADMIN_AUTH_CACHE_KEY_BASE));
        setState({
          loading: false,
          user,
          isAdmin: false,
          error: errorMessage ?? null,
          retryable: false,
        });
        return;
      }

      const cached = readCachedAdminAuthForUser(user);
      if (cached) {
        setState({
          loading: false,
          user,
          isAdmin: cached.isAdmin,
          error: errorMessage ?? null,
          retryable: false,
        });

        if (forceCheck || Date.now() - cached.checkedAt >= ADMIN_AUTH_REVALIDATE_INTERVAL_MS) {
          void verifyAdminState(user, token, errorMessage ?? null, checkId, cached.isAdmin);
        }
        return;
      }

      if (mounted) {
        setState({
          loading: true,
          user,
          isAdmin: false,
          error: errorMessage ?? null,
          retryable: false,
        });
      }

      void verifyAdminState(user, token, errorMessage ?? null, checkId);
    }

    const handleRecheck = () => {
      void getFreshAuthSession().then((session) => {
        resolveAdminState(session?.user ?? null, session?.access_token ?? null, null, true);
      }).catch(() => {
        if (!mounted) return;
        setState((current) => ({ ...current, loading: false, error: "暂时无法读取登录会话，请稍后重试。", retryable: true }));
      });
    };
    window.addEventListener(ADMIN_AUTH_RECHECK_EVENT, handleRecheck);

    try {
      const supabase = getSupabase();

      getCachedAuthSession()
        .then((session) => {
          resolveAdminState(
            session?.user ?? null,
            session?.access_token ?? null,
            null,
          );
        })
        .catch((error: unknown) => {
          resolveAdminState(
            null,
            null,
            error instanceof Error ? error.message : "Auth unavailable",
          );
        });

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        resolveAdminState(session?.user ?? null, session?.access_token ?? null, null);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Auth unavailable";
      errorTimer = window.setTimeout(() => {
        if (!mounted) return;
        setState({
          loading: false,
          user: null,
          isAdmin: false,
          error: message,
          retryable: false,
        });
      }, 0);
    }

    return () => {
      mounted = false;
      window.removeEventListener(ADMIN_AUTH_RECHECK_EVENT, handleRecheck);
      if (errorTimer !== undefined) window.clearTimeout(errorTimer);
      unsubscribe?.();
    };
  }, [isReviewMode, isUiLabPath]);

  if (isReviewMode) {
    return {
      loading: false,
      user: null,
      isAdmin: true,
      error: null,
      retryable: false,
    };
  }

  return isUiLabPath ? { ...state, loading: false } : state;
}
