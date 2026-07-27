import { assertAdminWrite, getSupabase } from "./supabase";

const IMAGE_BUCKET_NAME = "note-images";
const OCR_DOCUMENT_BUCKET_NAME = "ocr-documents";
const OCR_DOCUMENT_SIGNED_URL_TTL_SECONDS = 2 * 60 * 60;

export type UploadedOcrDocument = {
  path: string;
  url: string;
  expiresInSeconds: number;
};

export type ProblemOcrUploadInput = {
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  name: string;
};

export type UploadedProblemOcrAsset = {
  path: string;
  mimeType: ProblemOcrUploadInput["mimeType"];
  name: string;
};

// 检查 Supabase 是否已配置
function checkSupabaseConfig() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Supabase URL 未配置。请在 .env.local 中设置 NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase Key 未配置。请在 .env.local 中设置 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
}

/**
 * 上传图片到 Supabase Storage
 * @param file 图片文件
 * @param path 存储路径（如 'formula/xxx.png'）
 * @returns 图片的 public URL
 */
export async function uploadImage(file: File, path: string): Promise<string> {
  checkSupabaseConfig();
  await assertAdminWrite();
  const supabase = getSupabase();
  
  const { error: uploadError } = await supabase.storage
    .from(IMAGE_BUCKET_NAME)
    .upload(path, file, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from(IMAGE_BUCKET_NAME)
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * 生成唯一文件名
 * @param prefix 文件名前缀
 * @param ext 文件扩展名
 */
export function generateFileName(prefix: string, ext: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}/${timestamp}-${random}.${ext}`;
}

/**
 * 上传 OCR PDF 到私有临时桶，并返回给百度可读取的限时链接。
 */
export async function uploadOcrDocument(file: File, path: string): Promise<UploadedOcrDocument> {
  checkSupabaseConfig();
  await assertAdminWrite();

  const supabase = getSupabase();
  const { error: uploadError } = await supabase.storage
    .from(OCR_DOCUMENT_BUCKET_NAME)
    .upload(path, file, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`OCR 临时文件上传失败：${uploadError.message}。请确认 Supabase 已执行 0007_document_ocr_storage.sql`);
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from(OCR_DOCUMENT_BUCKET_NAME)
    .createSignedUrl(path, OCR_DOCUMENT_SIGNED_URL_TTL_SECONDS);

  if (signedUrlError) {
    throw new Error(`OCR 临时文件链接创建失败：${signedUrlError.message}。请确认 ocr-documents 桶允许管理员读取对象`);
  }

  if (!data?.signedUrl) {
    throw new Error("OCR 临时文件链接创建失败：Supabase 没有返回 signedUrl");
  }

  return {
    path,
    url: data.signedUrl,
    expiresInSeconds: OCR_DOCUMENT_SIGNED_URL_TTL_SECONDS,
  };
}

/**
 * 清理 OCR 私有临时桶中的 PDF。
 */
export async function deleteOcrDocument(path: string): Promise<void> {
  if (!path) return;
  await assertAdminWrite();

  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from(OCR_DOCUMENT_BUCKET_NAME)
    .remove([path]);

  if (error) throw error;
}

function decodeBase64Image(value: string): Uint8Array {
  const normalized = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function getProblemOcrExtension(mimeType: ProblemOcrUploadInput["mimeType"]): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

/**
 * Upload compressed problem images to the private OCR bucket before a durable
 * internal job is created. Every path is scoped to the authenticated user.
 */
export async function uploadProblemOcrAssets(inputs: ProblemOcrUploadInput[]): Promise<UploadedProblemOcrAsset[]> {
  if (inputs.length === 0 || inputs.length > 10) throw new Error("题库 OCR 每次必须上传 1–10 张图片");
  checkSupabaseConfig();
  await assertAdminWrite();
  const supabase = getSupabase();
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("登录状态已失效，无法上传题库 OCR 图片");

  const batchId = crypto.randomUUID();
  const uploaded: UploadedProblemOcrAsset[] = [];
  try {
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      const path = `problem-ocr/${userResult.data.user.id}/${batchId}/${String(index + 1).padStart(2, "0")}.${getProblemOcrExtension(input.mimeType)}`;
      const { error } = await supabase.storage.from(OCR_DOCUMENT_BUCKET_NAME).upload(
        path,
        decodeBase64Image(input.base64),
        { contentType: input.mimeType, upsert: false },
      );
      if (error) throw new Error(`题库 OCR 图片上传失败：${error.message}。请确认已执行 WP3 图片临时源迁移`);
      uploaded.push({ path, mimeType: input.mimeType, name: input.name });
    }
    return uploaded;
  } catch (error: unknown) {
    if (uploaded.length > 0) {
      await supabase.storage.from(OCR_DOCUMENT_BUCKET_NAME).remove(uploaded.map((asset) => asset.path));
    }
    throw error;
  }
}

export async function deleteProblemOcrAssets(paths: string[]): Promise<void> {
  const normalized = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));
  if (normalized.length === 0) return;
  await assertAdminWrite();
  const supabase = getSupabase();
  const { error } = await supabase.storage.from(OCR_DOCUMENT_BUCKET_NAME).remove(normalized);
  if (error) throw error;
}

/**
 * 删除图片
 * @param url 图片的 public URL
 */
export async function deleteImage(url: string): Promise<void> {
  await assertAdminWrite();

  // 从 URL 中提取文件路径
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/");
  // 路径格式: /storage/v1/object/public/note-images/xxx/xxx.png
  const bucketIndex = pathParts.indexOf(IMAGE_BUCKET_NAME);
  if (bucketIndex === -1) return;
  
  const filePath = pathParts.slice(bucketIndex + 1).join("/");
  const supabase = getSupabase();
  
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET_NAME)
    .remove([filePath]);

  if (error) throw error;
}
