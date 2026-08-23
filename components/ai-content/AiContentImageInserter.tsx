"use client";

import { useRef, useState } from "react";
import { FileImage, Link2, Loader2, Upload } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { getAiContentImageError, normalizeAiImageAlt, normalizeExternalImageUrl } from "@/lib/ai-content-image";
import { buildMarkdownImage } from "@/lib/markdown-format";

type AiContentImageInserterProps = {
  disabled?: boolean;
  onInsert: (markdown: string) => void;
};

type UploadPayload = {
  success?: boolean;
  markdown?: string;
  error?: string;
};

export function AiContentImageInserter({ disabled = false, onInsert }: AiContentImageInserterProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const insertUrl = () => {
    const normalizedUrl = normalizeExternalImageUrl(url);
    if (!normalizedUrl) {
      toast.error("请输入有效的 http 或 https 图片地址");
      return;
    }
    onInsert(buildMarkdownImage(normalizeAiImageAlt(alt), normalizedUrl));
    setUrl("");
    toast.success("图片 Markdown 已插入光标位置");
  };

  const uploadFile = async (file: File) => {
    const validationError = getAiContentImageError(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("alt", normalizeAiImageAlt(alt, file.name.replace(/\.[^.]+$/, "") || "文章插图"));
      const response = await fetchWithAuth("/api/ai/content-assets", { method: "POST", body: formData });
      const payload = await response.json().catch(() => ({})) as UploadPayload;
      if (!response.ok || !payload.markdown) throw new Error(payload.error || "图片上传失败");
      onInsert(payload.markdown);
      toast.success("图片已上传并插入正文");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="mt-4 rounded-xl border border-outline-variant/20 bg-surface-container-low p-3" aria-label="插入文章图片">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileImage className="h-4 w-4 text-primary" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-on-surface">插入图片</h3>
            <p className="text-xs text-on-surface-variant">上传或填入 URL，统一生成标准 Markdown。</p>
          </div>
        </div>
        <label
          aria-disabled={disabled || uploading}
          className={`control-button inline-flex min-h-11 items-center gap-2 px-3 py-2 text-sm ${disabled || uploading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "上传中…" : "上传图片"}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            disabled={disabled || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadFile(file);
            }}
          />
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(8rem,0.65fr)_minmax(12rem,1.35fr)_auto]">
        <label className="block">
          <span className="field-label">图片说明</span>
          <input value={alt} onChange={(event) => setAlt(event.target.value)} disabled={disabled || uploading} className="field-control h-11 w-full px-3 text-sm" placeholder="图片说明（alt）" />
        </label>
        <label className="block">
          <span className="field-label">图片 URL</span>
          <input value={url} onChange={(event) => setUrl(event.target.value)} disabled={disabled || uploading} className="field-control h-11 w-full px-3 text-sm" placeholder="https://…" inputMode="url" />
        </label>
        <button type="button" className="control-button inline-flex min-h-11 items-center justify-center gap-2 self-end px-3 py-2 text-sm" disabled={disabled || uploading || !url.trim()} onClick={insertUrl}>
          <Link2 className="h-4 w-4" />插入 URL
        </button>
      </div>
    </section>
  );
}
