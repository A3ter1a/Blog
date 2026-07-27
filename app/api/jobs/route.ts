import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import { listUserJobs } from "@/lib/server-job-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;

  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 40);
    const ledger = await listUserJobs(auth.context.supabase, auth.context.user.id, limit);
    return NextResponse.json({
      success: true,
      available: ledger.availability === "synced",
      availability: ledger.availability,
      jobs: ledger.data,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "任务账本读取失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
