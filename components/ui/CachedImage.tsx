"use client";

import type { ImgHTMLAttributes } from "react";

type CachedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src: string;
  alt: string;
};

/**
 * Let the browser own image requests and honor the origin's Cache-Control/ETag.
 * A parallel fetch bypasses native lazy loading and can download the same cover
 * twice. Native images also support external hosts without requiring CORS.
 */
export function CachedImage({ src, alt, decoding = "async", ...props }: CachedImageProps) {
  // Remote cover URLs are user supplied and may not support next/image's proxy.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} src={src} alt={alt} decoding={decoding} />;
}
