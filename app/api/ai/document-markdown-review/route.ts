import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import {
  DocumentMarkdownReviewError,
  prepareDocumentMarkdownReviewSource,
  reviewDocumentMarkdown,
} from "@/lib/document-markdown-review-service";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return undefined;
  return value;
}

export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const markdown = typeof body.markdown === "string" ? body.markdown : "";
    const clientApiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
    const model = typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : DEFAULT_DEEPSEEK_MODEL;
    const chunkIndex = getPositiveInteger(body.chunkIndex);
    const chunkCount = getPositiveInteger(body.chunkCount);
    const sourceMarkdown = prepareDocumentMarkdownReviewSource(markdown);

    const apiKey = resolveAIKey("deepseek", clientApiKey);
    if (!apiKey) {
      return NextResponse.json({ error: "缺少 DeepSeek API Key，请先在 AI 设置里配置并测试。", success: false }, { status: 400 });
    }

    const result = await reviewDocumentMarkdown({
      apiKey,
      model,
      markdown: sourceMarkdown,
      chunkIndex,
      chunkCount,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = getErrorMessage(error, "Markdown 审查失败");
    console.error("[Document Markdown Review] Error:", message);
    const status = error instanceof DocumentMarkdownReviewError ? error.status : 500;
    return NextResponse.json({ error: message, success: false }, { status });
  }
}
