"use client";

import { useSyncExternalStore } from "react";
import { readJsonStorage } from "@/lib/browser-storage";
import type { MotionPreference } from "@/lib/useReadingPreferences";

const QUERY = "(prefers-reduced-motion: reduce)";
const STORAGE_KEY = "reading-preferences";
const CHANGE_EVENT = "asteroid-reading-preferences-change";

function getMotionPreference(): MotionPreference {
  const stored = readJsonStorage<unknown>(STORAGE_KEY, null);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return "system";
  const value = (stored as { motionPreference?: unknown }).motionPreference;
  return value === "reduced" || value === "full" || value === "system" ? value : "system";
}

function getSnapshot(): boolean {
  const preference = getMotionPreference();
  if (preference === "reduced") return true;
  if (preference === "full") return false;
  return window.matchMedia(QUERY).matches;
}

function subscribe(notify: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", notify);
  window.addEventListener(CHANGE_EVENT, notify);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) notify();
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    media.removeEventListener("change", notify);
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener("storage", handleStorage);
  };
}

// Respond to preference changes without hiding the server-rendered content.
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
