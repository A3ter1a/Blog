"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin-auth";
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

    try {
      const supabase = getSupabase();

      supabase.auth.getSession().then(({ data, error }) => {
        if (!mounted) return;
        const user = data.session?.user ?? null;
        setState({
          loading: false,
          user,
          isAdmin: isAdminEmail(user?.email),
          error: error?.message ?? null,
        });
      });

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        const user = session?.user ?? null;
        setState({
          loading: false,
          user,
          isAdmin: isAdminEmail(user?.email),
          error: null,
        });
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
