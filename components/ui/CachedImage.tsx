"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

const COVER_CACHE_NAME = "asteroid-cover-images-v1";
const COVER_CACHE_MAX_BYTES = 10 * 1024 * 1024;
const COVER_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const coverRefreshTimes = new Map<string, number>();

function getCacheableUrl(source: string): string | null {
  if (!source || source.startsWith("data:") || source.startsWith("blob:")) return null;

  try {
    const url = new URL(source, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

async function readCachedBlob(source: string): Promise<Blob | null> {
  if (!("caches" in window)) return null;

  try {
    const cache = await window.caches.open(COVER_CACHE_NAME);
    const response = await cache.match(source);
    if (!response) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

async function fetchAndCacheBlob(source: string): Promise<Blob | null> {
  try {
    const response = await fetch(source, {
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) return null;

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    const cacheableResponse = response.clone();
    const blob = await response.blob();
    if (blob.size > COVER_CACHE_MAX_BYTES || contentLength > COVER_CACHE_MAX_BYTES) return blob;

    if ("caches" in window) {
      try {
        const cache = await window.caches.open(COVER_CACHE_NAME);
        await cache.put(source, cacheableResponse);
      } catch {
        // A failed Cache Storage write must not prevent the image from showing.
      }
    }
    return blob;
  } catch {
    return null;
  }
}

type CachedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
};

/**
 * Cache-first image for persisted note and collection covers. The original
 * URL remains the immediate fallback, so a restricted webview or a CDN
 * without CORS still renders normally.
 */
export function CachedImage({ src, ...props }: CachedImageProps) {
  const [resolvedImage, setResolvedImage] = useState({ source: src, value: src });
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cacheableUrl = getCacheableUrl(src);

    if (!cacheableUrl) {
      return () => {
        cancelled = true;
      };
    }

    const applyBlob = (blob: Blob | null) => {
      if (!blob || cancelled) return;
      const objectUrl = URL.createObjectURL(blob);
      const previousObjectUrl = objectUrlRef.current;
      objectUrlRef.current = objectUrl;
      setResolvedImage({ source: src, value: objectUrl });
      if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
    };

    void (async () => {
      const cachedBlob = await readCachedBlob(cacheableUrl);
      if (cachedBlob) {
        applyBlob(cachedBlob);
        const lastRefreshAt = coverRefreshTimes.get(cacheableUrl) ?? 0;
        if (Date.now() - lastRefreshAt < COVER_REFRESH_INTERVAL_MS) return;
      }

      // Covers change infrequently, so refresh in the background while the
      // cached blob keeps the layout immediately usable.
      const freshBlob = await fetchAndCacheBlob(cacheableUrl);
      if (freshBlob) {
        coverRefreshTimes.set(cacheableUrl, Date.now());
        applyBlob(freshBlob);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [src]);

  return <img {...props} src={resolvedImage.source === src ? resolvedImage.value : src} />;
}
