"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

const SESSION_CACHE_TTL_MS = 2_000;

type SessionClient = SupabaseClient;

let sessionClient: SessionClient | null = null;
let sessionPromise: Promise<Session | null> | null = null;
let refreshPromise: Promise<Session | null> | null = null;
let cachedSession: { session: Session | null; expiresAt: number } | null = null;
let removeAuthListener: (() => void) | null = null;

function resetSessionCache(): void {
  sessionPromise = null;
  cachedSession = null;
}

export function invalidateCachedAuthSession(): void {
  resetSessionCache();
}

/**
 * Refresh the current Supabase session using the refresh token already kept
 * in the active account slot. Concurrent callers share one request so focus,
 * online and 401 recovery events cannot rotate the token repeatedly.
 *
 * A null result is deliberately non-magical: if the browser storage has been
 * cleared or the refresh token has expired, the user must sign in once again.
 */
export function refreshAuthSession(): Promise<Session | null> {
  const supabase = ensureSessionClient();
  if (refreshPromise) return refreshPromise;

  const request = supabase.auth.refreshSession()
    .then(({ data, error }) => {
      resetSessionCache();
      if (error || !data.session) return null;
      cachedSession = {
        session: data.session,
        expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
      };
      return data.session;
    })
    .catch(() => {
      resetSessionCache();
      return null;
    })
    .finally(() => {
      if (refreshPromise === request) refreshPromise = null;
    });

  refreshPromise = request;
  return request;
}

function ensureSessionClient(): SessionClient {
  const supabase = getSupabase();
  if (sessionClient === supabase) return supabase;

  removeAuthListener?.();
  sessionClient = supabase;
  refreshPromise = null;
  resetSessionCache();
  const { data } = supabase.auth.onAuthStateChange(() => {
    resetSessionCache();
  });
  removeAuthListener = () => data.subscription.unsubscribe();
  return supabase;
}

/**
 * Share the browser session lookup across AI pages and auth-aware requests.
 * The short TTL avoids a waterfall of identical local-storage reads while
 * auth events immediately invalidate the cache when a user signs in/out or
 * Supabase refreshes the token.
 */
export function getCachedAuthSession(): Promise<Session | null> {
  const supabase = ensureSessionClient();
  if (cachedSession && cachedSession.expiresAt > Date.now()) {
    return Promise.resolve(cachedSession.session);
  }
  if (sessionPromise) return sessionPromise;

  sessionPromise = supabase.auth.getSession()
    .then(({ data }) => {
      cachedSession = {
        session: data.session,
        expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
      };
      return data.session;
    })
    .finally(() => {
      sessionPromise = null;
    });

  return sessionPromise;
}

export async function buildAuthHeaders(headers?: HeadersInit): Promise<Headers> {
  const nextHeaders = new Headers(headers);
  const session = await getCachedAuthSession();
  const token = session?.access_token;

  if (token) {
    nextHeaders.set("Authorization", `Bearer ${token}`);
  }

  return nextHeaders;
}

/**
 * Auth-aware fetch for browser API calls. It retries exactly once after a
 * 401, using the active slot's refresh token. The original response is kept
 * when recovery is impossible so callers can display the server's error.
 */
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const firstResponse = await fetch(input, {
    ...init,
    headers: await buildAuthHeaders(init.headers),
  });
  if (firstResponse.status !== 401) return firstResponse;

  const session = await refreshAuthSession();
  if (!session?.access_token) return firstResponse;

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(input, {
    ...init,
    headers: retryHeaders,
  });
}
