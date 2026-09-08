"use client";

/**
 * Small site-wide stale-while-revalidate cache for read-only browser data.
 *
 * The cache deliberately stores only caller-provided data. Callers must put
 * an account/session scope in the key before caching private responses. The
 * helper mirrors sessionStorage to localStorage so a folded/recreated in-app
 * browser view can still paint the last usable snapshot.
 */

export const SITE_CACHE_VERSION = 2;
export const SITE_CACHE_TTL_MS = 5 * 60 * 1000;
export const SITE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SITE_CACHE_ENTRY_MAX_BYTES = 3_000_000;
const SITE_CACHE_STORAGE_LIMIT_BYTES = 12_000_000;
const SITE_CACHE_CHANNEL_NAME = "asteroid-site-cache";

export type SiteCacheEnvelope<T> = {
  version: number;
  value: T;
  cachedAt: number;
  lastAccessedAt?: number;
};

export type SiteCacheRead<T> = {
  value: T;
  cachedAt: number;
  stale: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "length" | "key">;

export type SiteCacheEvent = {
  type: "write" | "clear" | "namespace";
  key?: string;
  namespace?: string;
};

type SiteCacheListener = (event: SiteCacheEvent) => void;

let siteCacheChannel: BroadcastChannel | null | undefined;
const siteCacheListeners = new Set<SiteCacheListener>();

function namespaceFromKey(key: string | null): string | undefined {
  if (!key) return undefined;
  const prefix = `asteroid:site-cache:v${SITE_CACHE_VERSION}:`;
  if (!key.startsWith(prefix)) return undefined;
  const separatorIndex = key.indexOf(":", prefix.length);
  if (separatorIndex < 0) return undefined;
  try {
    return decodeURIComponent(key.slice(prefix.length, separatorIndex));
  } catch {
    return undefined;
  }
}

function notifySiteCacheListeners(event: SiteCacheEvent): void {
  siteCacheListeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // A cache observer must never break a storage operation.
    }
  });
}

function getSiteCacheChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (siteCacheChannel !== undefined) return siteCacheChannel;

  try {
    const channel = new BroadcastChannel(SITE_CACHE_CHANNEL_NAME);
    channel.onmessage = (message: MessageEvent<SiteCacheEvent>) => {
      if (!message.data || typeof message.data !== "object") return;
      notifySiteCacheListeners(message.data);
    };
    siteCacheChannel = channel;
  } catch {
    siteCacheChannel = null;
  }

  return siteCacheChannel;
}

function broadcastSiteCacheEvent(event: SiteCacheEvent): void {
  getSiteCacheChannel()?.postMessage(event);
}

function getStorageEntrySize(raw: string): number {
  return raw.length * 2;
}

function parseCacheEnvelope(raw: string): SiteCacheEnvelope<unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SITE_CACHE_VERSION || typeof parsed.cachedAt !== "number") return null;
    return parsed as SiteCacheEnvelope<unknown>;
  } catch {
    return null;
  }
}

function pruneStorage(storage: StorageLike, requiredBytes: number, protectedKey: string): void {
  const now = Date.now();
  const entries: Array<{ key: string; size: number; lastAccessedAt: number }> = [];
  let totalBytes = 0;

  let storageLength = 0;
  try {
    storageLength = storage.length;
  } catch {
    return;
  }

  // Removing an expired entry shifts subsequent indexes; walk backwards.
  for (let index = storageLength - 1; index >= 0; index -= 1) {
    let key: string | null = null;
    let raw: string | null = null;
    try {
      key = storage.key(index);
      // The incoming value replaces this entry; count only its new size.
      if (key === protectedKey) continue;
      raw = key ? storage.getItem(key) : null;
    } catch {
      continue;
    }
    if (!key?.startsWith(`asteroid:site-cache:v${SITE_CACHE_VERSION}:`)) continue;

    if (!raw) continue;
    const envelope = parseCacheEnvelope(raw);
    if (!envelope || now - envelope.cachedAt > SITE_CACHE_MAX_AGE_MS) {
      try {
        storage.removeItem(key);
      } catch {
        // Ignore restricted storage contexts.
      }
      continue;
    }

    const size = getStorageEntrySize(raw);
    totalBytes += size;
    entries.push({
      key,
      size,
      lastAccessedAt: typeof envelope.lastAccessedAt === "number" ? envelope.lastAccessedAt : envelope.cachedAt,
    });
  }

  if (totalBytes + requiredBytes <= SITE_CACHE_STORAGE_LIMIT_BYTES) return;

  entries
    .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt)
    .some((entry) => {
      try {
        storage.removeItem(entry.key);
      } catch {
        return false;
      }
      totalBytes -= entry.size;
      return totalBytes + requiredBytes <= SITE_CACHE_STORAGE_LIMIT_BYTES;
    });
}

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
  let newest: SiteCacheRead<T> | null = null;
  for (const storage of getStorages()) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = parseCacheEnvelope(raw);
      if (!parsed) {
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
      const candidate = {
        value,
        cachedAt: parsed.cachedAt,
        stale: age >= ttlMs,
      };
      if (!newest || candidate.cachedAt > newest.cachedAt) newest = candidate;
    } catch {
      // Ignore malformed entries and continue with the other storage.
    }
  }
  return newest;
}

export function writeSiteCache<T>(key: string, value: T, options: { cachedAt?: number } = {}): void {
  if (typeof window === "undefined") return;
  let serialized: string;
  try {
    serialized = JSON.stringify({
      version: SITE_CACHE_VERSION,
      value,
      cachedAt: options.cachedAt ?? Date.now(),
      lastAccessedAt: Date.now(),
    });
  } catch {
    return;
  }

  // A single unusually large article should not evict the entire site cache.
  if (getStorageEntrySize(serialized) > SITE_CACHE_ENTRY_MAX_BYTES) return;
  const previous = readSiteCache<T>(key);
  const valueChanged = !previous || !siteCacheValuesEqual(previous.value, value);
  let wrote = false;
  for (const storage of getStorages()) {
    try {
      pruneStorage(storage, getStorageEntrySize(serialized), key);
    } catch {
      // A restricted storage implementation can fail while enumerating keys.
    }
    try {
      storage.setItem(key, serialized);
      wrote = true;
    } catch {
      // Retry once after removing the oldest entries. Some webviews report
      // quota errors before their internal accounting catches up.
      try {
        pruneStorage(storage, getStorageEntrySize(serialized), key);
      } catch {
        // Ignore restricted storage enumeration failures.
      }
      try {
        storage.setItem(key, serialized);
        wrote = true;
      } catch {
        // Ignore quota and restricted-storage failures.
      }
    }
  }
  // Refresh TTLs without making other tabs fetch and write the same data back.
  if (wrote && valueChanged) broadcastSiteCacheEvent({ type: "write", key, namespace: namespaceFromKey(key) });
}

export function clearSiteCache(key: string): void {
  for (const storage of getStorages()) {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore restricted browser contexts.
    }
  }
  broadcastSiteCacheEvent({ type: "clear", key, namespace: namespaceFromKey(key) });
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
  broadcastSiteCacheEvent({ type: "namespace", namespace: namespace.trim() || "site" });
}

/** Subscribe to cache changes made by another tab or in-app browser context. */
export function subscribeSiteCache(
  listener: SiteCacheListener,
  options: { namespace?: string; key?: string } = {},
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const filteredListener: SiteCacheListener = (event) => {
    if (options.namespace && event.namespace !== options.namespace) return;
    if (options.key && event.type !== "namespace" && event.key !== options.key) return;
    listener(event);
  };
  siteCacheListeners.add(filteredListener);
  getSiteCacheChannel();

  const handleStorage = (event: StorageEvent) => {
    const namespace = namespaceFromKey(event.key);
    if (!event.key || !namespace) return;
    if (event.oldValue && event.newValue) {
      const previous = parseCacheEnvelope(event.oldValue);
      const next = parseCacheEnvelope(event.newValue);
      if (previous && next && siteCacheValuesEqual(previous.value, next.value)) return;
    }
    const cacheEvent: SiteCacheEvent = {
      type: event.newValue === null ? "clear" : "write",
      key: event.key,
      namespace,
    };
    filteredListener(cacheEvent);
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    siteCacheListeners.delete(filteredListener);
    window.removeEventListener("storage", handleStorage);
  };
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
