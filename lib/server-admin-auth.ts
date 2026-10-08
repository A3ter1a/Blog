import "server-only";

import { createClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "./supabase-schema";

export function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function createAuthenticatedServerClient(req: NextRequest) {
  const token = getBearerToken(req);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !supabaseAnonKey) {
    throw new Error("Authenticated Supabase server config is missing");
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type AdminRequestContext = {
  supabase: ReturnType<typeof createAuthenticatedServerClient>;
  user: User;
};

export type AdminRequestContextResult =
  | { ok: true; context: AdminRequestContext }
  | { ok: false; response: NextResponse };

function adminErrorResponse(
  error: string,
  status: number,
  code: string,
): NextResponse {
  const headers = status === 503 ? { "Retry-After": "2" } : undefined;
  return NextResponse.json({ error, code, success: false }, { status, headers });
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function isRetryableSupabaseError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 401 || status === 403) return false;
  if (status !== null) return status >= 500;
  return true;
}

function isInvalidSupabaseSession(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 401) return true;
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "invalid_jwt" || code === "bad_jwt";
}

async function getUserWithTransientRetry(
  supabase: ReturnType<typeof createAuthenticatedServerClient>,
  token: string,
): Promise<{ data: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]; error: unknown }> {
  let result: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    result = await supabase.auth.getUser(token);
  } catch (error) {
    if (!isRetryableSupabaseError(error)) return { data: { user: null }, error };
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      result = await supabase.auth.getUser(token);
    } catch (retryError) {
      return { data: { user: null }, error: retryError };
    }
  }

  if (result.error && isRetryableSupabaseError(result.error)) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      result = await supabase.auth.getUser(token);
    } catch (retryError) {
      return { data: { user: null }, error: retryError };
    }
  }

  return result;
}

export async function getAdminRequestContext(req: NextRequest): Promise<AdminRequestContextResult> {
  const token = getBearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: adminErrorResponse("Admin login required", 401, "auth_required"),
    };
  }

  let supabase;
  try {
    supabase = createAuthenticatedServerClient(req);
  } catch {
    return {
      ok: false,
      response: adminErrorResponse("Supabase server config is missing", 500, "server_config_missing"),
    };
  }

  const { data, error } = await getUserWithTransientRetry(supabase, token);
  if (error) {
    return {
      ok: false,
      response: adminErrorResponse(
        isInvalidSupabaseSession(error)
          ? "Invalid login session"
          : "Supabase auth service is temporarily unavailable",
        isInvalidSupabaseSession(error) ? 401 : 503,
        isInvalidSupabaseSession(error) ? "invalid_session" : "auth_unavailable",
      ),
    };
  }

  if (!data.user) {
    return {
      ok: false,
      response: adminErrorResponse("Invalid login session", 401, "invalid_session"),
    };
  }

  const email = data.user.email?.trim();
  if (!email) {
    return {
      ok: false,
      response: adminErrorResponse("Admin permission required", 403, "admin_required"),
    };
  }

  let adminRow: { email: string } | null = null;
  let adminError: unknown = null;
  try {
    const result = await supabase
      .from("admin_users")
      .select("email")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    adminRow = result.data as { email: string } | null;
    adminError = result.error;
  } catch (error) {
    adminError = error;
  }

  if (adminError) {
    return {
      ok: false,
      response: adminErrorResponse("Admin authority source is unavailable", 503, "admin_source_unavailable"),
    };
  }

  if (!adminRow?.email || adminRow.email.trim().toLowerCase() !== email.toLowerCase()) {
    return {
      ok: false,
      response: adminErrorResponse("Admin permission required", 403, "admin_required"),
    };
  }

  return { ok: true, context: { supabase, user: data.user } };
}

export async function requireAdminRequest(req: NextRequest): Promise<NextResponse | null> {
  const result = await getAdminRequestContext(req);
  if (!result.ok) return result.response;
  return null;
}

export function resolveAIKey(provider: "deepseek" | "qwen", clientApiKey?: unknown): string {
  const envKey = provider === "deepseek" ? process.env.DEEPSEEK_API_KEY : process.env.QWEN_API_KEY;
  if (envKey) return envKey;

  if (process.env.NODE_ENV !== "production" && typeof clientApiKey === "string") {
    return clientApiKey.trim();
  }

  return "";
}
