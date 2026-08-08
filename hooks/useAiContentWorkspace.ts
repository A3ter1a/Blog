"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithAuth, getCachedAuthSession, refreshAuthSession } from "@/lib/fetch-with-auth";
import { getSupabase } from "@/lib/supabase";
import { doesAiProfileMatchSlot, getActiveAiAccountSlot } from "@/lib/auth-session-slot";
import type { AiContentProposalSummaryRow } from "@/lib/server-ai-content";
import {
  clearSiteCache,
  getSiteCacheKey,
  readSiteCache,
  siteCacheValuesEqual,
  writeSiteCache,
} from "@/lib/site-cache";

export type AiWorkspaceProfile = {
  id: string;
  account_key: string;
  subject: "math" | "english" | "politics" | "economics";
  display_name: string;
  avatar_url: string | null;
  bio: string;
  academic_affiliation: string;
  focus_tags: string[];
  is_active: boolean;
};

type WorkspaceState = {
  loading: boolean;
  profile: AiWorkspaceProfile | null;
  proposals: AiContentProposalSummaryRow[];
  error: string | null;
};

const SESSION_EXPIRED_MESSAGE = "AI 学科会话已失效。系统已尝试自动恢复；如果该学科会话已被浏览器清除，请从对应专属入口登录一次。";
const AI_WORKSPACE_CACHE_TTL_MS = 5 * 60 * 1000;
const AI_WORKSPACE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type AiWorkspaceCacheValue = {
  profile: AiWorkspaceProfile | null;
  proposals: AiContentProposalSummaryRow[];
};

function parseError(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  return typeof record.error === "string" ? record.error : fallback;
}

export function useAiContentWorkspace() {
  const reloadInFlightRef = useRef<Promise<void> | null>(null);
  const [state, setState] = useState<WorkspaceState>({
    loading: true,
    profile: null,
    proposals: [],
    error: null,
  });
  const [recovering, setRecovering] = useState(false);

  const reload = useCallback(() => {
    if (reloadInFlightRef.current) return reloadInFlightRef.current;

    const request = (async () => {
      try {
        const activeSlot = getActiveAiAccountSlot();
        if (!activeSlot) {
          throw new Error("请从对应学科的专属入口进入 AI 内容工作台");
        }

        const cacheKey = getSiteCacheKey("ai-content-workspace", activeSlot);
        const cached = readSiteCache<AiWorkspaceCacheValue>(cacheKey, (value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return null;
          const record = value as Record<string, unknown>;
          return {
            profile: record.profile && typeof record.profile === "object" ? record.profile as AiWorkspaceProfile : null,
            proposals: Array.isArray(record.proposals) ? record.proposals as AiContentProposalSummaryRow[] : [],
          };
        }, { ttlMs: AI_WORKSPACE_CACHE_TTL_MS, maxAgeMs: AI_WORKSPACE_CACHE_MAX_AGE_MS });
        if (cached) {
          setState((current) => ({
            ...current,
            loading: false,
            profile: siteCacheValuesEqual(current.profile, cached.value.profile) ? current.profile : cached.value.profile,
            proposals: siteCacheValuesEqual(current.proposals, cached.value.proposals) ? current.proposals : cached.value.proposals,
            error: null,
          }));
        } else {
          setState((current) => ({ ...current, loading: true, error: null }));
        }

        const response = await fetchWithAuth("/api/ai/content-proposals?limit=60", {
          cache: "no-store",
        });
        const payload: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(parseError(payload, response.status === 401 ? SESSION_EXPIRED_MESSAGE : "当前账号无权使用 AI 内容工作台"));
        }
        const record = payload && typeof payload === "object" && !Array.isArray(payload)
          ? payload as Record<string, unknown>
          : {};
        if (!doesAiProfileMatchSlot(activeSlot, record.profile)) {
          throw new Error("当前账号资料与学科会话槽不一致，请退出后检查账号配置");
        }
        const nextProfile = (record.profile ?? null) as AiWorkspaceProfile | null;
        const nextProposals = Array.isArray(record.proposals) ? record.proposals as AiContentProposalSummaryRow[] : [];
        writeSiteCache(cacheKey, { profile: nextProfile, proposals: nextProposals });
        setState((current) => ({
          loading: false,
          profile: siteCacheValuesEqual(current.profile, nextProfile) ? current.profile : nextProfile,
          proposals: siteCacheValuesEqual(current.proposals, nextProposals) ? current.proposals : nextProposals,
          error: null,
        }));
      } catch (error: unknown) {
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : "AI 内容工作台加载失败",
        }));
      }
    })();

    reloadInFlightRef.current = request;
    return request.finally(() => {
      if (reloadInFlightRef.current === request) reloadInFlightRef.current = null;
    });
  }, []);

  const recoverSession = useCallback(async () => {
    if (recovering) return false;
    setRecovering(true);
    try {
      const session = await refreshAuthSession();
      if (!session) {
        setState((current) => ({ ...current, loading: false, error: SESSION_EXPIRED_MESSAGE }));
        return false;
      }
      await reload();
      return true;
    } finally {
      setRecovering(false);
    }
  }, [recovering, reload]);

  useEffect(() => {
    const supabase = (() => {
      try {
        return getSupabase();
      } catch {
        return null;
      }
    })();
    let initialSessionPending = true;
    void reload();
    if (!supabase) return undefined;

    let disposed = false;
    const refreshIfExpiring = () => {
      if (document.visibilityState === "hidden") return;
      void (async () => {
        const session = await getCachedAuthSession();
        if (!session?.expires_at || session.expires_at * 1000 - Date.now() > 90_000) return;
        const refreshed = await refreshAuthSession();
        if (refreshed && !disposed) void reload();
      })();
    };

    window.addEventListener("focus", refreshIfExpiring);
    window.addEventListener("online", refreshIfExpiring);
    document.addEventListener("visibilitychange", refreshIfExpiring);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // Supabase emits INITIAL_SESSION during client hydration. The explicit
      // first load above already covers it, so do not fetch the same payload
      // twice on every workbench mount.
      if (event === "INITIAL_SESSION" && initialSessionPending) {
        initialSessionPending = false;
        return;
      }
      if (event === "SIGNED_OUT") {
        const slot = getActiveAiAccountSlot();
        if (slot) clearSiteCache(getSiteCacheKey("ai-content-workspace", slot));
      }
      void reload();
    });
    return () => {
      disposed = true;
      initialSessionPending = false;
      window.removeEventListener("focus", refreshIfExpiring);
      window.removeEventListener("online", refreshIfExpiring);
      document.removeEventListener("visibilitychange", refreshIfExpiring);
      data.subscription.unsubscribe();
    };
  }, [reload]);

  return { ...state, reload, recoverSession, recovering };
}
