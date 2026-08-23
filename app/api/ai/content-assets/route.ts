import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAiRequestContext } from "@/lib/server-ai-auth";
import {
  AI_CONTENT_IMAGE_BUCKET,
  AI_CONTENT_IMAGE_MAX_BYTES,
  getAiContentImageError,
  getAiContentImageExtension,
  normalizeAiImageAlt,
} from "@/lib/ai-content-image";
import { buildMarkdownImage } from "@/lib/markdown-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > AI_CONTENT_IMAGE_MAX_BYTES + 256 * 1024) {
    return NextResponse.json({ success: false, error: "图片不能超过 10 MB。" }, { status: 413 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "请选择要上传的图片。" }, { status: 400 });
    }

    const validationError = getAiContentImageError(file);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: file.size > AI_CONTENT_IMAGE_MAX_BYTES ? 413 : 400 });
    }

    const extension = getAiContentImageExtension(file.type);
    if (!extension) {
      return NextResponse.json({ success: false, error: "无法识别图片格式。" }, { status: 400 });
    }

    const month = new Date().toISOString().slice(0, 7);
    const path = `ai-content/${auth.context.user.id}/${month}/${randomUUID()}.${extension}`;
    const { error } = await auth.context.supabase.storage
      .from(AI_CONTENT_IMAGE_BUCKET)
      .upload(path, file, {
        cacheControl: "31536000",
        contentType: file.type,
        upsert: false,
      });
    if (error) throw error;

    const { data } = auth.context.supabase.storage.from(AI_CONTENT_IMAGE_BUCKET).getPublicUrl(path);
    const alt = normalizeAiImageAlt(formData.get("alt"), file.name.replace(/\.[^.]+$/, "") || "文章插图");
    return NextResponse.json({
      success: true,
      url: data.publicUrl,
      path,
      markdown: buildMarkdownImage(alt, data.publicUrl),
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("AI content image upload failed:", error);
    return NextResponse.json(
      { success: false, error: "图片上传失败，请确认账号权限和图片格式后重试。" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
