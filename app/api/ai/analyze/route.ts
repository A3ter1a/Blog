import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    error: "页面内题目分析入口已停用，请通过任务中心创建完整的题库 OCR 任务。",
    success: false,
    replacement: "/api/jobs/problem-ocr",
  }, { status: 410 });
}
