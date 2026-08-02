"use client";

import { useCallback, useEffect, useState } from "react";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import { getSupabase } from "@/lib/supabase";
import type { CollectionAvailableNote, CollectionDetail, CollectionSummary } from "@/lib/collections-contract";

type WorkspaceState = {
  loading: boolean;
  collections: CollectionSummary[];
  availableNotes: CollectionAvailableNote[];
  role: "admin" | "ai" | null;
  error: string | null;
};

const COLLECTION_REQUEST_TIMEOUT_MS = 12_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function responseError(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), COLLECTION_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      headers: await buildAuthHeaders(init?.headers),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok || !isRecord(payload)) throw new Error(responseError(payload, "合集操作失败"));
    return payload;
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      throw new Error("合集工作台请求超时，请检查登录状态或稍后重试");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function useCollectionWorkspace() {
  const [state, setState] = useState<WorkspaceState>({ loading: true, collections: [], availableNotes: [], role: null, error: null });

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [collectionPayload, notePayload] = await Promise.all([
        requestJson("/api/collections?scope=manage&limit=100"),
        requestJson("/api/collections/notes?limit=200"),
      ]);
      setState({
        loading: false,
        collections: Array.isArray(collectionPayload.collections) ? collectionPayload.collections as CollectionSummary[] : [],
        availableNotes: Array.isArray(notePayload.notes) ? notePayload.notes as CollectionAvailableNote[] : [],
        role: collectionPayload.role === "admin" || collectionPayload.role === "ai" ? collectionPayload.role : null,
        error: null,
      });
    } catch (error: unknown) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "合集工作台加载失败" }));
    }
  }, []);

  useEffect(() => {
    void reload();
    let unsubscribe: (() => void) | undefined;
    try {
      const { data } = getSupabase().auth.onAuthStateChange(() => void reload());
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Missing local Supabase config is rendered as the normal workspace error state.
    }
    return () => unsubscribe?.();
  }, [reload]);

  const getDetail = useCallback(async (id: string): Promise<CollectionDetail> => {
    const payload = await requestJson(`/api/collections/${encodeURIComponent(id)}`);
    if (!isRecord(payload.collection)) throw new Error("合集详情不可用");
    return payload.collection as unknown as CollectionDetail;
  }, []);

  const mutate = useCallback(async (url: string, method: string, body?: Record<string, unknown>) => {
    const payload = await requestJson(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    await reload();
    return payload;
  }, [reload]);

  return {
    ...state,
    reload,
    getDetail,
    create: (body: Record<string, unknown>) => mutate("/api/collections", "POST", body),
    update: (id: string, body: Record<string, unknown>) => mutate(`/api/collections/${encodeURIComponent(id)}`, "PATCH", body),
    remove: (id: string) => mutate(`/api/collections/${encodeURIComponent(id)}`, "DELETE"),
    addNote: (id: string, noteId: string) => mutate(`/api/collections/${encodeURIComponent(id)}/items`, "POST", { noteId }),
    reorder: (id: string, itemId: string, sortOrder: number) => mutate(`/api/collections/${encodeURIComponent(id)}/items`, "PATCH", { itemId, sortOrder }),
    removeNote: (id: string, itemId: string) => mutate(`/api/collections/${encodeURIComponent(id)}/items`, "DELETE", { itemId }),
  };
}
