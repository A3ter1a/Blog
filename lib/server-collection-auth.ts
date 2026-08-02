import "server-only";

import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { Tables } from "./database.types";
import { createAuthenticatedServerClient, getBearerToken } from "./server-admin-auth";
import type { CollectionActor } from "./server-note-collections";

export type CollectionRequestContext = {
  supabase: ReturnType<typeof createAuthenticatedServerClient>;
  user: User;
  actor: CollectionActor;
  profile: Tables<"ai_profiles"> | null;
};

export type CollectionRequestContextResult =
  | { ok: true; context: CollectionRequestContext }
  | { ok: false; response: NextResponse };

export async function getCollectionRequestContext(req: NextRequest): Promise<CollectionRequestContextResult> {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "登录后才能管理合集", success: false }, { status: 401 }) };
  }

  let supabase: ReturnType<typeof createAuthenticatedServerClient>;
  try {
    supabase = createAuthenticatedServerClient(req);
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Supabase server config is missing", success: false }, { status: 500 }) };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false, response: NextResponse.json({ error: "登录会话无效", success: false }, { status: 401 }) };
  }

  const user = userData.user;
  const email = user.email?.trim();
  if (email) {
    const { data: adminRow, error: adminError } = await supabase
      .from("admin_users")
      .select("email")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (!adminError && adminRow?.email?.trim().toLowerCase() === email.toLowerCase()) {
      return {
        ok: true,
        context: {
          supabase,
          user,
          actor: { userId: user.id, role: "admin" },
          profile: null,
        },
      };
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("ai_profiles")
    .select("id, account_key, subject, display_name, avatar_url, bio, academic_affiliation, focus_tags, is_active, created_at, updated_at")
    .eq("id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (profileError) {
    return { ok: false, response: NextResponse.json({ error: "账号资料暂时不可用", success: false }, { status: 503 }) };
  }
  if (!profile) {
    return { ok: false, response: NextResponse.json({ error: "当前账号不是管理员或已启用的 AI 学科账号", success: false }, { status: 403 }) };
  }

  return {
    ok: true,
    context: {
      supabase,
      user,
      actor: { userId: user.id, role: "ai", aiProfileId: profile.id, subject: profile.subject },
      profile: profile as Tables<"ai_profiles">,
    },
  };
}
