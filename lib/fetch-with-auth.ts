"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

const SESSION_CACHE_TTL_MS = 2_000;

type SessionClient = SupabaseClient;

let sessionClient: SessionClient | null = null;
let sessionPromise: Promise<Session | null> | null = null;
let cachedSession: { session: Session | null; expiresAt: number } | null = null;
let removeAuthListener: (() => void) | null = null;

function resetSessionCache(): void {
  sessionPromise = null;
  cachedSession = null;
}

export function invalidateCachedAuthSession(): void {
  resetSessionCache();
}

function ensureSessionClient(): SessionClient {
  const supabase = getSupabase();
  if (sessionClient === supabase) return supabase;

  removeAuthListener?.();
  sessionClient = supabase;
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
