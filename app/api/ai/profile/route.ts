import { NextRequest, NextResponse } from "next/server";
import { parseAiProfileUpdate } from "@/lib/ai-profile";
import { getAiRequestContext } from "@/lib/server-ai-auth";
import { revalidatePublicContent } from "@/lib/server-public-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_SELECT = "id, account_key, subject, display_name, avatar_url, bio, academic_affiliation, focus_tags, is_active, created_at, updated_at";

/** Return the currently authenticated AI account's editable profile. */
export async function GET(req: NextRequest) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    { success: true, profile: auth.context.profile },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Update only role-facing profile fields for the current AI account. */
export async function PATCH(req: NextRequest) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;

  const body: unknown = await req.json().catch(() => null);
  const parsed = parseAiProfileUpdate(body);
  if (!parsed.ok) {
    return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  }

  const { data, error } = await auth.context.supabase
    .from("ai_profiles")
    .update(parsed.value)
    .eq("id", auth.context.profile.id)
    .select(PROFILE_SELECT)
    .maybeSingle();

  if (error) {
    const status = error.code === "42501" ? 403 : 503;
    return NextResponse.json(
      { success: false, error: status === 403 ? "当前账号没有修改角色资料的权限" : "角色资料保存失败，请稍后重试" },
      { status },
    );
  }

  if (!data) {
    return NextResponse.json({ success: false, error: "当前 AI 账号资料不存在或已停用" }, { status: 404 });
  }

  revalidatePublicContent();

  return NextResponse.json(
    { success: true, profile: data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
