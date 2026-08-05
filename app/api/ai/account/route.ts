import { NextRequest, NextResponse } from "next/server";
import { getAiRequestContext } from "@/lib/server-ai-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight AI account handshake used by the subject login flow. Keep this
 * separate from the proposal list so login never downloads Markdown or other
 * proposal payloads just to verify the account slot.
 */
export async function GET(req: NextRequest) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    { success: true, profile: auth.context.profile },
    { headers: { "Cache-Control": "no-store" } },
  );
}
