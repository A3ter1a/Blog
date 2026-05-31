"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { readJsonStorage, removeStorage, writeJsonStorage } from "@/lib/browser-storage";

type AdminAuthState = {
  loading: boolean;
  user: User | null;
  isAdmin: boolean;
  error: string | null;
};

type CachedAdminAuth = {
  userId: string;
  email: string | null;
  isAdmin: boolean;
  checkedAt: number;
  expiresAt: number;
};

const ADMIN_AUTH_CACHE_KEY = "asteroid-admin-auth";
const ADMIN_AUTH_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_AUTH_REVALIDATE_INTERVAL_MS = 60 * 1000;

let pendingAdminCheck: {
  userId: string;
  token: string;
  promise: Promise<boolean>;
} | null = null;

async function checkAdminOnServer(user: User, token: string): Promise<boolean> {
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
  }).then((res) => res.ok);

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
  const cached = readJsonStorage<CachedAdminAuth | null>(
    ADMIN_AUTH_CACHE_KEY,
    null,
    normalizeCachedAdminAuth,
  );

  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    removeStorage(ADMIN_AUTH_CACHE_KEY);
    return null;
  }

  return cached;
}

function readCachedAdminAuthForUser(user: User): CachedAdminAuth | null {
  const cached = readCachedAdminAuth();
  return cached?.userId === user.id ? cached : null;
}

function writeCachedAdminAuth(user: User, isAdmin: boolean): void {
  const checkedAt = Date.now();
  writeJsonStorage<CachedAdminAuth>(ADMIN_AUTH_CACHE_KEY, {
    userId: user.id,
    email: user.email ?? null,
    isAdmin,
    checkedAt,
    expiresAt: checkedAt + ADMIN_AUTH_CACHE_TTL_MS,
  });
}

export function useAdminAuth(): AdminAuthState {
  const [state, setState] = useState<AdminAuthState>(() => {
    const cachedAdminAuth = readCachedAdminAuth();
    return {
      loading: true,
      user: null,
      isAdmin: cachedAdminAuth?.isAdmin ?? false,
      error: null,
    };
  });

  useEffect(() => {
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
        const isAdmin = await checkAdminOnServer(user, token);

        if (!mounted || latestCheckId !== checkId) return;

        writeCachedAdminAuth(user, isAdmin);
        setState({
          loading: false,
          user,
          isAdmin,
          error: isAdmin ? null : errorMessage,
        });
      } catch (error) {
        if (!mounted || latestCheckId !== checkId) return;

        setState({
          loading: false,
          user,
          isAdmin: fallbackIsAdmin ?? false,
          error: error instanceof Error ? error.message : errorMessage,
        });
      }
    }

    function resolveAdminState(user: User | null, token: string | null, errorMessage?: string | null) {
      latestCheckId += 1;
      const checkId = latestCheckId;

      if (!user || !token) {
        removeStorage(ADMIN_AUTH_CACHE_KEY);
        if (!mounted) return;
        setState({
          loading: false,
          user,
          isAdmin: false,
          error: errorMessage ?? null,
        });
        return;
      }

      if (!mounted) return;

      const cached = readCachedAdminAuthForUser(user);
      if (cached) {
        setState({
          loading: false,
          user,
          isAdmin: cached.isAdmin,
          error: errorMessage ?? null,
        });

        if (Date.now() - cached.checkedAt >= ADMIN_AUTH_REVALIDATE_INTERVAL_MS) {
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
        });
      }

      void verifyAdminState(user, token, errorMessage ?? null, checkId);
    }

    try {
      const supabase = getSupabase();

      supabase.auth.getSession().then(({ data, error }) => {
        resolveAdminState(
          data.session?.user ?? null,
          data.session?.access_token ?? null,
          error?.message ?? null
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
        });
      }, 0);
    }

    return () => {
      mounted = false;
      if (errorTimer !== undefined) window.clearTimeout(errorTimer);
      unsubscribe?.();
    };
  }, []);

  return state;
}
