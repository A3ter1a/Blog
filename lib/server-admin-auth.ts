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

export async function getAdminRequestContext(req: NextRequest): Promise<AdminRequestContextResult> {
  const token = getBearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin login required", success: false }, { status: 401 }),
    };
  }

  let supabase;
  try {
    supabase = createAuthenticatedServerClient(req);
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Supabase server config is missing", success: false }, { status: 500 }),
    };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid login session", success: false }, { status: 401 }),
    };
  }

  const email = data.user.email?.trim();
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin permission required", success: false }, { status: 403 }),
    };
  }

  const { data: adminRow, error: adminError } = await supabase
    .from("admin_users")
    .select("email")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (adminError) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin authority source is unavailable", success: false }, { status: 503 }),
    };
  }

  if (!adminRow?.email || adminRow.email.trim().toLowerCase() !== email.toLowerCase()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin permission required", success: false }, { status: 403 }),
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
