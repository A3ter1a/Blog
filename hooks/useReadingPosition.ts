"use client";

import { useEffect, useRef } from "react";

type ReadingPosition = {
  version: 1;
  contentVersion: string;
  scrollY: number;
  progress: number;
  headingId: string | null;
  headingOffset: number;
  savedAt: number;
};

type UseReadingPositionOptions = {
  noteId: string;
  contentVersion: string;
  enabled?: boolean;
  contentSelector?: string;
};

const STORAGE_PREFIX = "asteroid:reading-position:v1:";

function getStorageKey(noteId: string): string {
  return `${STORAGE_PREFIX}${noteId}`;
}

function readPosition(noteId: string): ReadingPosition | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(getStorageKey(noteId)) ?? "null") as Partial<ReadingPosition> | null;
    if (!value || value.version !== 1 || typeof value.scrollY !== "number" || typeof value.contentVersion !== "string") return null;
    return {
      version: 1,
      contentVersion: value.contentVersion,
      scrollY: Math.max(0, value.scrollY),
      progress: typeof value.progress === "number" ? value.progress : 0,
      headingId: typeof value.headingId === "string" ? value.headingId : null,
      headingOffset: typeof value.headingOffset === "number" ? value.headingOffset : 0,
      savedAt: typeof value.savedAt === "number" ? value.savedAt : 0,
    };
  } catch {
    return null;
  }
}

function findReadingAnchor(contentSelector: string): { headingId: string | null; headingOffset: number } {
  const root = document.querySelector(contentSelector);
  if (!root) return { headingId: null, headingOffset: 0 };

  const headings = Array.from(root.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id]"));
  let active: HTMLElement | null = null;
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top <= 112) active = heading;
    else break;
  }

  return active
    ? { headingId: active.id, headingOffset: active.getBoundingClientRect().top }
    : { headingId: null, headingOffset: 0 };
}

export function useReadingPosition({
  noteId,
  contentVersion,
  enabled = true,
  contentSelector = "[data-reader-article-content]",
}: UseReadingPositionOptions): void {
  const restoredKeyRef = useRef("");

  useEffect(() => {
    if (!enabled || window.location.hash) return;
    const restoreKey = `${noteId}:${contentVersion}`;
    if (restoredKeyRef.current === restoreKey) return;
    restoredKeyRef.current = restoreKey;

    const saved = readPosition(noteId);
    if (!saved || saved.scrollY < 120) return;

    const restore = () => {
      if (saved.contentVersion === contentVersion) {
        window.scrollTo({ top: saved.scrollY, behavior: "auto" });
        return;
      }

      const heading = saved.headingId ? document.getElementById(saved.headingId) : null;
      if (heading) {
        const top = window.scrollY + heading.getBoundingClientRect().top - saved.headingOffset;
        window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
        return;
      }

      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: maxScroll * Math.min(1, Math.max(0, saved.progress)), behavior: "auto" });
    };

    const frame = window.requestAnimationFrame(restore);
    const timer = window.setTimeout(restore, 240);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [contentSelector, contentVersion, enabled, noteId]);

  useEffect(() => {
    if (!enabled) return;
    let frame: number | null = null;
    let timer: number | null = null;
    let lastSavedAt = 0;

    const save = () => {
      frame = null;
      lastSavedAt = Date.now();
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const anchor = findReadingAnchor(contentSelector);
      const value: ReadingPosition = {
        version: 1,
        contentVersion,
        scrollY: Math.max(0, window.scrollY),
        progress: Math.min(1, Math.max(0, window.scrollY / maxScroll)),
        headingId: anchor.headingId,
        headingOffset: anchor.headingOffset,
        savedAt: Date.now(),
      };
      try {
        window.localStorage.setItem(getStorageKey(noteId), JSON.stringify(value));
      } catch {
        // Reading continuity is an enhancement; blocked storage must not break reading.
      }
    };

    const scheduleSave = () => {
      if (frame !== null || timer !== null) return;
      const delay = Math.max(0, 200 - (Date.now() - lastSavedAt));
      timer = window.setTimeout(() => {
        timer = null;
        frame = window.requestAnimationFrame(save);
      }, delay);
    };

    window.addEventListener("scroll", scheduleSave, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("scroll", scheduleSave);
      window.removeEventListener("pagehide", save);
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (timer !== null) window.clearTimeout(timer);
      save();
    };
  }, [contentSelector, contentVersion, enabled, noteId]);
}
