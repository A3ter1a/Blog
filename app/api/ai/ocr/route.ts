import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_QWEN_MODEL,
  isOfficialQwenEndpoint,
} from "@/lib/ai-config";
import { ProblemOcrServiceError, recognizeProblemImage } from "@/lib/problem-ocr-service";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";

// Qwen Vision OCR endpoint — extracts text from problem images.
export async function POST(req: NextRequest) {
  const adminError = await requireAdminRequest(req);
  if (adminError) return adminError;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (!isOfficialQwenEndpoint(body.endpoint)) {
      return NextResponse.json({ error: "Qwen 仅支持官方 DashScope HTTPS 地址，不能使用自定义端点。" }, { status: 400 });
    }
    const apiKey = resolveAIKey("qwen", typeof body.apiKey === "string" ? body.apiKey : undefined);
    const result = await recognizeProblemImage({
      apiKey: apiKey ?? "",
      model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_QWEN_MODEL,
      imageBase64: typeof body.imageBase64 === "string" ? body.imageBase64 : "",
      mimeType: typeof body.mimeType === "string" ? body.mimeType : "image/jpeg",
    });
    return NextResponse.json({ text: result.text, success: true, model: result.model });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "OCR 识别失败";
    console.error("[OCR] Error:", message);
    return NextResponse.json({ error: message, success: false }, {
      status: error instanceof ProblemOcrServiceError ? error.status : 500,
    });
  }
}
