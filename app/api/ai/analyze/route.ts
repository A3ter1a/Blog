import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import { analyzeProblemOcrText, ProblemOcrServiceError } from "@/lib/problem-ocr-service";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";

// DeepSeek analysis endpoint — classifies OCR text into structured Problem arrays.
export async function POST(req: NextRequest) {
  const adminError = await requireAdminRequest(req);
  if (adminError) return adminError;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const apiKey = resolveAIKey("deepseek", typeof body.apiKey === "string" ? body.apiKey : undefined);
    const chapterContext = Array.isArray(body.chapterContext)
      ? body.chapterContext.filter((item): item is string => typeof item === "string")
      : [];
    const result = await analyzeProblemOcrText({
      apiKey: apiKey ?? "",
      model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_DEEPSEEK_MODEL,
      ocrText: typeof body.ocrText === "string" ? body.ocrText : "",
      chapterContext,
    });
    return NextResponse.json({ ...result, success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "题目分析失败";
    console.error("[Analyze] Error:", message);
    return NextResponse.json({ error: message, success: false }, {
      status: error instanceof ProblemOcrServiceError ? error.status : 500,
    });
  }
}
