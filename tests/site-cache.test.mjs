import assert from "node:assert/strict";
import test from "node:test";

import {
  SITE_CACHE_VERSION,
  getSiteCacheKey,
  readSiteCache,
  writeSiteCache,
} from "../lib/site-cache.ts";

class MemoryStorage {
  #values = new Map();

  get length() {
    return this.#values.size;
  }

  key(index) {
    return [...this.#values.keys()][index] ?? null;
  }

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

function withBrowserStorages(sessionStorage, localStorage, callback) {
  const previousWindow = globalThis.window;
  const previousBroadcastChannel = globalThis.BroadcastChannel;
  globalThis.window = { sessionStorage, localStorage };
  globalThis.BroadcastChannel = undefined;

  try {
    return callback();
  } finally {
    globalThis.window = previousWindow;
    globalThis.BroadcastChannel = previousBroadcastChannel;
  }
}

test("readSiteCache chooses the newest valid snapshot across storage layers", () => {
  const sessionStorage = new MemoryStorage();
  const localStorage = new MemoryStorage();
  const key = getSiteCacheKey("notes-list", "public");
  const now = Date.now();

  sessionStorage.setItem(key, JSON.stringify({
    version: SITE_CACHE_VERSION,
    value: { source: "session" },
    cachedAt: now - 2_000,
  }));
  localStorage.setItem(key, JSON.stringify({
    version: SITE_CACHE_VERSION,
    value: { source: "local" },
    cachedAt: now - 1_000,
  }));

  withBrowserStorages(sessionStorage, localStorage, () => {
    const cached = readSiteCache(key, (value) => value);
    assert.deepEqual(cached?.value, { source: "local" });
    assert.equal(cached?.cachedAt, now - 1_000);
  });
});

test("writeSiteCache mirrors a usable snapshot to both browser storage layers", () => {
  const sessionStorage = new MemoryStorage();
  const localStorage = new MemoryStorage();
  const key = getSiteCacheKey("note-reader", "public-note");

  withBrowserStorages(sessionStorage, localStorage, () => {
    writeSiteCache(key, { title: "缓存快照" });
    const sessionEnvelope = JSON.parse(sessionStorage.getItem(key));
    const localEnvelope = JSON.parse(localStorage.getItem(key));
    assert.deepEqual(sessionEnvelope.value, { title: "缓存快照" });
    assert.deepEqual(localEnvelope.value, { title: "缓存快照" });
    assert.equal(sessionEnvelope.version, SITE_CACHE_VERSION);
    assert.equal(localEnvelope.version, SITE_CACHE_VERSION);
  });
});
