"use client";

import { useCallback, useEffect, useState } from "react";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import { getSupabase } from "@/lib/supabase";
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
