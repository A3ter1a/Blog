"use client";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readJsonStorage<T>(
  key: string,
  fallback: T,
  normalize?: (value: unknown) => T
): T {
  if (!canUseStorage()) return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;

    const parsed: unknown = JSON.parse(raw);
    return normalize ? normalize(parsed) : parsed as T;
  } catch {
    return fallback;
  }
}

export function writeJsonStorage<T>(key: string, value: T): void {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore unavailable storage, quota errors, and private-mode restrictions.
  }
}

export function removeStorage(key: string): void {
  if (!canUseStorage()) return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage, quota errors, and private-mode restrictions.
  }
}
