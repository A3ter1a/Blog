import { NextRequest, NextResponse } from "next/server";
import { getJobRequestContext } from "@/lib/server-job-auth";
import { cleanupExpiredUserJobs, cleanupOrphanedUserOcrAssets, listUserJobs } from "@/lib/server-job-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await getJobRequestContext(req);
  if (!auth.ok) return auth.response;

  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 40);
    // Completed-but-unclaimed results are retained. Old failed/claimed/cancelled
    // messages and unregistered OCR uploads are cleaned best-effort without
    // making the task center unavailable when storage is temporarily down.
    let cleanup: { availability: "synced" | "schema_pending"; deleted: number } = {
      availability: "synced",
      deleted: 0,
    };
    try {
      const result = await cleanupExpiredUserJobs(auth.context.supabase, auth.context.user.id);
      cleanup = { availability: result.availability, deleted: result.data };
      await cleanupOrphanedUserOcrAssets(auth.context.supabase, auth.context.user.id);
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
