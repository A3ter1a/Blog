import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    error: "同步 Markdown 审阅入口已停用，请通过任务中心创建可恢复任务。",
    success: false,
    replacement: "/api/jobs/markdown-review",
  }, { status: 410 });
}
