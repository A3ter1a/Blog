"use client";

import { useCallback, useEffect, useState } from "react";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import { getSupabase } from "@/lib/supabase";
import { doesAiProfileMatchSlot, getActiveAiAccountSlot } from "@/lib/auth-session-slot";
import type { AiContentProposalRow } from "@/lib/server-ai-content";

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
  proposals: AiContentProposalRow[];
  error: string | null;
};

function parseError(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  return typeof record.error === "string" ? record.error : fallback;
}

export function useAiContentWorkspace() {
  const [state, setState] = useState<WorkspaceState>({
    loading: true,
    profile: null,
    proposals: [],
    error: null,
  });

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const activeSlot = getActiveAiAccountSlot();
      if (!activeSlot) {
        throw new Error("请从对应学科的专属入口进入 AI 内容工作台");
      }

      const response = await fetch("/api/ai/content-proposals?limit=60", {
        headers: await buildAuthHeaders(),
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(parseError(payload, response.status === 401 ? "请先登录 AI 学科账号" : "当前账号无权使用 AI 内容工作台"));
      }
      const record = payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
      if (!doesAiProfileMatchSlot(activeSlot, record.profile)) {
        throw new Error("当前账号资料与学科会话槽不一致，请退出后检查账号配置");
      }
      setState({
        loading: false,
        profile: (record.profile ?? null) as AiWorkspaceProfile | null,
        proposals: Array.isArray(record.proposals) ? record.proposals as AiContentProposalRow[] : [],
        error: null,
      });
    } catch (error: unknown) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "AI 内容工作台加载失败",
      }));
    }
  }, []);

  useEffect(() => {
    void reload();
    const supabase = (() => {
      try {
        return getSupabase();
      } catch {
        return null;
      }
    })();
    if (!supabase) return undefined;
    const { data } = supabase.auth.onAuthStateChange(() => {
      void reload();
    });
    return () => data.subscription.unsubscribe();
  }, [reload]);

  return { ...state, reload };
}
