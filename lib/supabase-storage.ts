import { getSupabase } from "./supabase";

const BUCKET_NAME = "note-images";

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
  const supabase = getSupabase();
  
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, file, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from(BUCKET_NAME)
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
 * 删除图片
 * @param url 图片的 public URL
 */
export async function deleteImage(url: string): Promise<void> {
  // 从 URL 中提取文件路径
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/");
  // 路径格式: /storage/v1/object/public/note-images/xxx/xxx.png
  const bucketIndex = pathParts.indexOf(BUCKET_NAME);
  if (bucketIndex === -1) return;
  
  const filePath = pathParts.slice(bucketIndex + 1).join("/");
  const supabase = getSupabase();
  
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([filePath]);

  if (error) throw error;
}
