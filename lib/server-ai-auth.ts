import "server-only";

import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Tables } from "@/lib/database.types";
import { createAuthenticatedServerClient, getBearerToken } from "@/lib/server-admin-auth";

export type AiRequestContext = {
  supabase: ReturnType<typeof createAuthenticatedServerClient>;
  user: User;
  profile: Tables<"ai_profiles">;
};

export type AiRequestContextResult =
  | { ok: true; context: AiRequestContext }
  | { ok: false; response: NextResponse };

export async function getAiRequestContext(req: NextRequest): Promise<AiRequestContextResult> {
  const token = getBearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "AI 账号登录后才能提交内容", success: false }, { status: 401 }),
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

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "登录会话无效", success: false }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("ai_profiles")
    .select("id, account_key, subject, display_name, avatar_url, bio, academic_affiliation, focus_tags, is_active, created_at, updated_at")
    .eq("id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      response: NextResponse.json({ error: "AI 账号资料暂时不可用", success: false }, { status: 503 }),
    };
  }

  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json({ error: "当前账号不是已启用的 AI 学科账号", success: false }, { status: 403 }),
    };
  }

  return {
    ok: true,
    context: {
      supabase,
      user: userData.user,
      profile: profile as Tables<"ai_profiles">,
    },
  };
}
