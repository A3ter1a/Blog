"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { getActiveAiAccountSlot } from "@/lib/auth-session-slot";
import { getSupabase } from "@/lib/supabase";
import type { CollectionAvailableNote, CollectionDetail, CollectionSummary } from "@/lib/collections-contract";
import {
  COLLECTION_WORKSPACE_CACHE_TTL_MS,
  clearCollectionWorkspaceCache,
  getCollectionWorkspaceCacheKey,
  readCollectionWorkspaceCache,
  type CollectionWorkspaceSnapshot,
  writeCollectionWorkspaceCache,
} from "@/lib/collection-workspace-cache";
import {
  clearCollectionDetailCache,
  readCollectionDetailCache,
  writeCollectionDetailCache,
} from "@/lib/collection-detail-cache";
import { clearCollectionListCache } from "@/lib/collection-list-cache";

type WorkspaceState = {
  loading: boolean;
  collections: CollectionSummary[];
  availableNotes: CollectionAvailableNote[];
  role: "admin" | "ai" | null;
  error: string | null;
};

const COLLECTION_REQUEST_TIMEOUT_MS = 30_000;

let workspaceRequest: { key: string; promise: Promise<CollectionWorkspaceSnapshot> } | null = null;

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
    const response = await fetchWithAuth(url, {
      ...init,
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

function snapshotFromPayload(payload: Record<string, unknown>): CollectionWorkspaceSnapshot {
  if (!Array.isArray(payload.collections) || !Array.isArray(payload.notes)) {
    throw new Error("合集工作台响应格式不完整");
  }
  return {
    collections: payload.collections as CollectionSummary[],
    availableNotes: payload.notes as CollectionAvailableNote[],
    role: payload.role === "admin" || payload.role === "ai" ? payload.role : null,
    cachedAt: Date.now(),
  };
}

function loadWorkspaceSnapshot(): Promise<CollectionWorkspaceSnapshot> {
  const key = getCollectionWorkspaceCacheKey();
  if (workspaceRequest?.key === key) return workspaceRequest.promise;

  const promise = requestJson("/api/collections/workspace")
    .then((payload) => {
      const snapshot = snapshotFromPayload(payload);
      writeCollectionWorkspaceCache(snapshot);
      return snapshot;
    })
    .finally(() => {
      if (workspaceRequest?.promise === promise) workspaceRequest = null;
    });

  workspaceRequest = { key, promise };
  return promise;
}

function stateFromSnapshot(snapshot: CollectionWorkspaceSnapshot): WorkspaceState {
  return {
    loading: false,
    collections: snapshot.collections,
    availableNotes: snapshot.availableNotes,
    role: snapshot.role,
    error: null,
  };
}

export function useCollectionWorkspace() {
  const [state, setState] = useState<WorkspaceState>({ loading: true, collections: [], availableNotes: [], role: null, error: null });

  const reload = useCallback(async (options: { background?: boolean } = {}) => {
    const cached = readCollectionWorkspaceCache();
    if (!options.background) {
      if (cached) setState(stateFromSnapshot(cached));
      else setState((current) => ({ ...current, loading: true, error: null }));
    }

    try {
      const snapshot = await loadWorkspaceSnapshot();
      setState(stateFromSnapshot(snapshot));
    } catch (error: unknown) {
      if (options.background) {
        // A current in-memory workspace is still more useful than replacing
        // it with an error screen while an inactive browser tab is throttled
        // or a post-mutation refresh is temporarily slow.
        setState((current) => {
          const keptUsableState = Boolean(cached || current.role || current.collections.length > 0);
          return keptUsableState
            ? { ...current, loading: false, error: null }
            : { ...current, loading: false, error: error instanceof Error ? error.message : "合集工作台加载失败" };
        });
        return;
      }
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "合集工作台加载失败" }));
    }
  }, []);

  useEffect(() => {
    const cached = readCollectionWorkspaceCache();
    if (cached) setState(stateFromSnapshot(cached));
    void reload({ background: true });

    let unsubscribe: (() => void) | undefined;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "hidden") return;
      const latest = readCollectionWorkspaceCache();
      if (!latest || Date.now() - latest.cachedAt > COLLECTION_WORKSPACE_CACHE_TTL_MS) {
        void reload({ background: true });
      }
    };

    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    try {
      const { data } = getSupabase().auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          clearCollectionWorkspaceCache();
          setState({ loading: false, collections: [], availableNotes: [], role: null, error: "登录状态已退出" });
          return;
        }
        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
        void reload();
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Missing local Supabase config is rendered as the normal workspace error state.
    }
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      unsubscribe?.();
    };
  }, [reload]);

  const getDetail = useCallback(async (id: string): Promise<CollectionDetail> => {
    // The workspace can contain private admin collections. Only AI slots have
    // a synchronous, stable browser scope here; admin details stay network-
    // backed so they can never be mistaken for public collection data.
    const cacheEnabled = Boolean(getActiveAiAccountSlot());
    const cached = cacheEnabled ? readCollectionDetailCache(id) : null;
    if (cached) {
      // Paint the cached detail immediately, then quietly replace it with the
      // authenticated snapshot. The workspace caller can keep its current
      // editor stable if the response is unchanged.
      void requestJson(`/api/collections/${encodeURIComponent(id)}`)
        .then((payload) => {
          if (!isRecord(payload.collection)) return;
          if (cacheEnabled) writeCollectionDetailCache(payload.collection as unknown as CollectionDetail);
        })
        .catch(() => undefined);
      return cached.value;
    }

    const payload = await requestJson(`/api/collections/${encodeURIComponent(id)}`);
    if (!isRecord(payload.collection)) throw new Error("合集详情不可用");
    const detail = payload.collection as unknown as CollectionDetail;
    if (cacheEnabled) writeCollectionDetailCache(detail);
    return detail;
  }, []);

  const mutate = useCallback(async (url: string, method: string, body?: Record<string, unknown>) => {
    const collectionMatch = url.match(/^\/api\/collections\/([^/]+)/);
    if (collectionMatch?.[1] && collectionMatch[1] !== "workspace") {
      clearCollectionDetailCache(decodeURIComponent(collectionMatch[1]));
    }
    clearCollectionListCache();
    const payload = await requestJson(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    // Mutations must not be reported as failed just because the optional
    // aggregate snapshot is slow. Callers refresh the selected detail; the
    // list snapshot is refreshed opportunistically in the background.
    void reload({ background: true });
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
    reorder: (
      id: string,
      itemId: string,
      sortOrder: number,
      swap?: { itemId: string; sortOrder: number },
    ) => mutate(`/api/collections/${encodeURIComponent(id)}/items`, "PATCH", {
      itemId,
      sortOrder,
      ...(swap ? { swapItemId: swap.itemId, swapSortOrder: swap.sortOrder } : {}),
    }),
    removeNote: (id: string, itemId: string) => mutate(`/api/collections/${encodeURIComponent(id)}/items`, "DELETE", { itemId }),
  };
}
