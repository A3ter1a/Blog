import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import { revalidatePublicContent } from "@/lib/server-public-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Invalidate public server caches after legacy client-side Supabase writes.
 * The endpoint carries no data and is restricted to the existing admin
 * authority source, so it cannot be used to read or mutate blog content.
 */
export async function POST(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;

  revalidatePublicContent();
  return NextResponse.json({ success: true });
}
