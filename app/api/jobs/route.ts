import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import { cleanupExpiredUserJobs, listUserJobs } from "@/lib/server-job-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;

  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 40);
    // Terminal messages are retained for three days. Cleanup is deliberately
    // best-effort so an older database that has not received WP12 can still
    // return the local/remote ledger without turning the message center into
    // a 500 page.
    let cleanup: { availability: "synced" | "schema_pending"; deleted: number } = {
      availability: "synced",
      deleted: 0,
    };
    try {
      const result = await cleanupExpiredUserJobs(auth.context.supabase, auth.context.user.id);
      cleanup = { availability: result.availability, deleted: result.data };
    } catch {
      cleanup = { availability: "schema_pending", deleted: 0 };
    }
    const ledger = await listUserJobs(auth.context.supabase, auth.context.user.id, limit);
    return NextResponse.json({
      success: true,
      available: ledger.availability === "synced",
      availability: ledger.availability,
      cleanup,
      jobs: ledger.data,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "任务账本读取失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
