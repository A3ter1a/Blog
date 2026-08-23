export const AI_CONTENT_IMAGE_BUCKET = "note-images";
export const AI_CONTENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const AI_CONTENT_IMAGE_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

const EXTENSION_BY_MIME: Record<(typeof AI_CONTENT_IMAGE_ALLOWED_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function getAiContentImageError(file: Pick<File, "size" | "type">): string | null {
  if (!AI_CONTENT_IMAGE_ALLOWED_TYPES.includes(file.type as (typeof AI_CONTENT_IMAGE_ALLOWED_TYPES)[number])) {
    return "仅支持 PNG、JPEG、WebP 或 GIF 图片。";
  }
  if (file.size <= 0) return "图片文件为空。";
  if (file.size > AI_CONTENT_IMAGE_MAX_BYTES) return "图片不能超过 10 MB。";
  return null;
}

export function getAiContentImageExtension(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType as (typeof AI_CONTENT_IMAGE_ALLOWED_TYPES)[number]] ?? null;
}

export function normalizeAiImageAlt(value: unknown, fallback = "文章插图"): string {
  if (typeof value !== "string") return fallback;
  return value.trim().replace(/\s+/g, " ").slice(0, 180) || fallback;
}

export function normalizeExternalImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
