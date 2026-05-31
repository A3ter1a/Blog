"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

type AdminAuthState = {
  loading: boolean;
  user: User | null;
  isAdmin: boolean;
  error: string | null;
};

export function useAdminAuth(): AdminAuthState {
  const [state, setState] = useState<AdminAuthState>({
    loading: true,
    user: null,
    isAdmin: false,
    error: null,
  });

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    let errorTimer: number | undefined;

    async function resolveAdminState(user: User | null, token: string | null, errorMessage?: string | null) {
      if (!user || !token) {
        if (!mounted) return;
        setState({
          loading: false,
          user,
          isAdmin: false,
          error: errorMessage ?? null,
        });
        return;
      }

      try {
        const res = await fetch("/api/auth/admin", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!mounted) return;
        setState({
          loading: false,
          user,
          isAdmin: res.ok,
          error: res.ok ? null : errorMessage ?? null,
        });
      } catch (error) {
        if (!mounted) return;
        setState({
          loading: false,
          user,
          isAdmin: false,
          error: error instanceof Error ? error.message : errorMessage ?? null,
        });
      }
    }

    try {
      const supabase = getSupabase();

      supabase.auth.getSession().then(({ data, error }) => {
        void resolveAdminState(
          data.session?.user ?? null,
          data.session?.access_token ?? null,
          error?.message ?? null
        );
      });

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        void resolveAdminState(session?.user ?? null, session?.access_token ?? null, null);
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
