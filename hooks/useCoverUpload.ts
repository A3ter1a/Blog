"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { generateFileName, uploadImage } from "@/lib/supabase-storage";

type CoverUploadState = {
  coverImage: string;
  coverPreviewSrc: string;
  coverUploadError: string | null;
  isUploadingCover: boolean;
  setCoverImageUrl: (url: string) => void;
  clearCoverImage: () => void;
  handleCoverImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
};

export function useCoverUpload(initialCoverImage = ""): CoverUploadState {
  const toast = useToast();
  const [coverImage, setCoverImage] = useState(initialCoverImage);
  const [coverPreviewSrc, setCoverPreviewSrc] = useState(initialCoverImage);
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const coverObjectUrlRef = useRef<string | null>(null);

  const revokeCoverObjectUrl = useCallback(() => {
    if (!coverObjectUrlRef.current) return;
    URL.revokeObjectURL(coverObjectUrlRef.current);
    coverObjectUrlRef.current = null;
  }, []);

  const setCoverImageUrl = useCallback((url: string) => {
    revokeCoverObjectUrl();
    setCoverImage(url);
    setCoverPreviewSrc(url);
    setCoverUploadError(null);
  }, [revokeCoverObjectUrl]);

  const clearCoverImage = useCallback(() => {
    revokeCoverObjectUrl();
    setCoverImage("");
    setCoverPreviewSrc("");
    setCoverUploadError(null);
  }, [revokeCoverObjectUrl]);

  const handleCoverImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setCoverUploadError("请选择图片文件");
      toast.error("请选择图片文件");
      event.target.value = "";
      return;
    }

    revokeCoverObjectUrl();
    const previousCoverImage = coverImage;
    const previewUrl = URL.createObjectURL(file);
    coverObjectUrlRef.current = previewUrl;
    setCoverPreviewSrc(previewUrl);
    setCoverUploadError(null);
    setIsUploadingCover(true);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const url = await uploadImage(file, generateFileName("cover", ext));
      setCoverImageUrl(url);
      toast.success("封面图片已上传");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      revokeCoverObjectUrl();
      setCoverPreviewSrc(previousCoverImage);
      setCoverUploadError(`上传失败：${message}`);
      toast.error(`封面上传失败：${message}`);
    } finally {
      setIsUploadingCover(false);
      event.target.value = "";
    }
  }, [coverImage, revokeCoverObjectUrl, setCoverImageUrl, toast]);

  useEffect(() => {
    return () => {
      revokeCoverObjectUrl();
    };
  }, [revokeCoverObjectUrl]);

  return {
    coverImage,
    coverPreviewSrc,
    coverUploadError,
    isUploadingCover,
    setCoverImageUrl,
    clearCoverImage,
    handleCoverImageUpload,
  };
}
