"use client";

/**
 * Small site-wide stale-while-revalidate cache for read-only browser data.
 *
 * The cache deliberately stores only caller-provided data. Callers must put
 * an account/session scope in the key before caching private responses. The
 * helper mirrors sessionStorage to localStorage so a folded/recreated in-app
 * browser view can still paint the last usable snapshot.
 */

export const SITE_CACHE_VERSION = 1;
export const SITE_CACHE_TTL_MS = 5 * 60 * 1000;
export const SITE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type SiteCacheEnvelope<T> = {
  version: number;
  value: T;
  cachedAt: number;
};

export type SiteCacheRead<T> = {
  value: T;
  cachedAt: number;
  stale: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "length" | "key">;

function getStorages(): StorageLike[] {
  if (typeof window === "undefined") return [];

  const storages: StorageLike[] = [];
  for (const name of ["sessionStorage", "localStorage"] as const) {
    try {
      const storage = window[name];
      if (storage && !storages.includes(storage)) storages.push(storage);
    } catch {
      // Restricted webviews and private mode can deny either storage.
    }
  }
  return storages;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getSiteCacheKey(namespace: string, scope = "public"): string {
  const encodePart = (value: string, fallback: string) => {
    const encoded = encodeURIComponent(value.trim() || fallback);
    if (encoded.length <= 220) return encoded;
    let hash = 2166136261;
    for (let index = 0; index < encoded.length; index += 1) {
      hash ^= encoded.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${encoded.slice(0, 160)}-${(hash >>> 0).toString(16)}`;
  };
  const safeNamespace = encodePart(namespace, "site");
  const safeScope = encodePart(scope, "public");
  return `asteroid:site-cache:v${SITE_CACHE_VERSION}:${safeNamespace}:${safeScope}`;
}

export function readSiteCache<T>(
  key: string,
  normalize?: (value: unknown) => T | null,
  options: { ttlMs?: number; maxAgeMs?: number } = {},
): SiteCacheRead<T> | null {
  const ttlMs = options.ttlMs ?? SITE_CACHE_TTL_MS;
  const maxAgeMs = options.maxAgeMs ?? SITE_CACHE_MAX_AGE_MS;
  for (const storage of getStorages()) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || parsed.version !== SITE_CACHE_VERSION || typeof parsed.cachedAt !== "number") {
        storage.removeItem(key);
        continue;
      }
      const age = Date.now() - parsed.cachedAt;
      if (age < 0 || age > maxAgeMs) {
        storage.removeItem(key);
        continue;
      }
      const value = normalize ? normalize(parsed.value) : parsed.value as T;
      if (value === null || value === undefined) {
        storage.removeItem(key);
        continue;
      }
      return {
        value,
        cachedAt: parsed.cachedAt,
        stale: age >= ttlMs,
      };
    } catch {
      // Ignore malformed entries and continue with the other storage.
    }
  }
  return null;
}

export function writeSiteCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  let serialized: string;
  try {
    serialized = JSON.stringify({ version: SITE_CACHE_VERSION, value, cachedAt: Date.now() });
  } catch {
    return;
  }

  // A single unusually large article should not evict the entire site cache.
  if (serialized.length > 3_000_000) return;
  for (const storage of getStorages()) {
    try {
      storage.setItem(key, serialized);
    } catch {
      // Ignore quota and restricted-storage failures.
    }
  }
}

export function clearSiteCache(key: string): void {
  for (const storage of getStorages()) {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore restricted browser contexts.
    }
  }
}

export function clearSiteCacheNamespace(namespace: string): void {
  if (typeof window === "undefined") return;
  const prefix = `asteroid:site-cache:v${SITE_CACHE_VERSION}:${encodeURIComponent(namespace.trim() || "site")}:`;
  for (const storage of getStorages()) {
    try {
      const keys: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    } catch {
      // Ignore restricted browser contexts.
    }
  }
}

/** Stable enough for normalized API snapshots; ignores object key ordering. */
export function siteCacheValuesEqual(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return value;
  };

  try {
    return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
  } catch {
    return Object.is(left, right);
  }
}
