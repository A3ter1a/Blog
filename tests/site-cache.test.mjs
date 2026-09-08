import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

import {
  SITE_CACHE_VERSION,
  getSiteCacheKey,
  readSiteCache,
  subscribeSiteCache,
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

test("refreshing a cache entry does not evict other entries by counting its old size twice", () => {
  const storage = new MemoryStorage();
  withBrowserStorages(storage, storage, () => {
    const value = "x".repeat(1_300_000);
    const keys = Array.from({ length: 4 }, (_, index) => getSiteCacheKey("reader", String(index)));
    keys.forEach((key) => writeSiteCache(key, value));
    writeSiteCache(keys[3], value);
    assert.equal(storage.length, 4);
    keys.forEach((key) => assert.ok(storage.getItem(key)));
  });
});

test("pruning removes adjacent expired entries without skipping shifted storage keys", () => {
  const storage = new MemoryStorage();
  const expiredKeys = ["one", "two"].map((scope) => getSiteCacheKey("reader", scope));
  expiredKeys.forEach((key) => storage.setItem(key, JSON.stringify({
    version: SITE_CACHE_VERSION, value: "expired", cachedAt: 0,
  })));
  withBrowserStorages(storage, storage, () => {
    writeSiteCache(getSiteCacheKey("reader", "new"), "fresh");
    expiredKeys.forEach((key) => assert.equal(storage.getItem(key), null));
  });
});

test("storage synchronization ignores timestamp-only refreshes but delivers edits and removals", () => {
  const storage = new MemoryStorage();
  withBrowserStorages(storage, storage, () => {
    let onStorage;
    window.addEventListener = (_, listener) => { onStorage = listener; };
    window.removeEventListener = () => {};
    const events = [];
    const unsubscribe = subscribeSiteCache((event) => events.push(event));
    const key = getSiteCacheKey("note-reader", "public-one");
    const envelope = (value, cachedAt) => JSON.stringify({ version: SITE_CACHE_VERSION, value, cachedAt });
    onStorage({ key, oldValue: envelope({ title: "same" }, 1), newValue: envelope({ title: "same" }, 2) });
    assert.equal(events.length, 0);
    onStorage({ key, oldValue: envelope({ title: "same" }, 2), newValue: envelope({ title: "edited" }, 3) });
    onStorage({ key, oldValue: envelope({ title: "edited" }, 3), newValue: null });
    assert.deepEqual(events.map((event) => event.type), ["write", "clear"]);
    unsubscribe();
  });
});

test("key-scoped subscriptions ignore other notes but deliver current-note writes and removals", () => {
  const storage = new MemoryStorage();
  withBrowserStorages(storage, storage, () => {
    let onStorage;
    window.addEventListener = (_, listener) => { onStorage = listener; };
    window.removeEventListener = () => {};
    const events = [];
    const key = getSiteCacheKey("note-reader", "public-one");
    const unsubscribe = subscribeSiteCache((event) => events.push(event), { namespace: "note-reader", key });
    const raw = JSON.stringify({ version: SITE_CACHE_VERSION, value: "note", cachedAt: Date.now() });
    onStorage({ key: getSiteCacheKey("note-reader", "public-two"), newValue: raw });
    assert.equal(events.length, 0);
    onStorage({ key, newValue: raw });
    onStorage({ key, oldValue: raw, newValue: null });
    assert.deepEqual(events.map((event) => event.type), ["write", "clear"]);
    unsubscribe();
  });
});

test("broadcast synchronization does not echo unchanged snapshots", () => {
  const storage = new MemoryStorage();
  withBrowserStorages(storage, storage, () => {
    const events = [];
    globalThis.BroadcastChannel = class {
      postMessage(event) { events.push(event); }
    };
    const key = getSiteCacheKey("note-reader", "public-one");
    writeSiteCache(key, { title: "same", tags: [] });
    writeSiteCache(key, { tags: [], title: "same" });
    assert.equal(events.length, 1);
    writeSiteCache(key, { title: "edited", tags: [] });
    assert.equal(events.length, 2);
  });
});

test("reader consumes cache updates without another request and refetches after invalidation", () => {
  const source = readFileSync(new URL("../components/notes/NoteReaderClient.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("reader.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "subscribeSiteCache") callback = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(callback);
  const compiled = ts.transpileModule(`const listener = ${callback.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  let current = { title: "before" };
  let cached = { value: { title: "after" } };
  let requests = 0;
  const listener = new Function("readPublicNoteCache", "setNote", "noteReaderValuesEqual", "loadNote", "noteId",
    `${compiled}; return listener;`)(() => cached, (update) => { current = update(current); },
    (left, right) => JSON.stringify(left) === JSON.stringify(right), () => { requests++; }, "one");
  listener({ type: "write" });
  assert.deepEqual(current, { title: "after" });
  assert.equal(requests, 0);
  listener({ type: "clear" });
  assert.equal(requests, 1);
  cached = null;
  listener({ type: "write" });
  assert.equal(requests, 2);
});

test("chapter refresh preserves usable chapters on failure and ignores results after leaving the note", async () => {
  const source = readFileSync(new URL("../components/notes/NoteReaderClient.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("reader.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect"
      && node.arguments[0]?.getText(ast).includes("chaptersApi.getByNoteId")) callback = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(callback);
  const compiled = ts.transpileModule(`const effect = ${callback.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  for (const scenario of ["failure", "navigation"]) {
    const original = [{ id: "old-chapter", name: "已加载的章节" }];
    let chapters = original;
    let resolve, reject;
    const request = new Promise((yes, no) => { resolve = yes; reject = no; });
    let writes = 0;
    const effect = new Function("note", "noteId", "accessScope", "initialChapters", "initialChaptersLoaded",
      "skipInitialChapterFetchRef", "readPublicChaptersCache", "writePublicChaptersCache", "chaptersApi",
      "setChapters", "noteReaderValuesEqual", `${compiled}; return effect;`)(
      { type: "problem" }, "old-note", "public", [], false, { current: false }, () => null,
      () => { writes++; }, { getByNoteId: () => request },
      (value) => { chapters = typeof value === "function" ? value(chapters) : value; },
      (left, right) => JSON.stringify(left) === JSON.stringify(right));
    const cleanup = effect();
    if (scenario === "failure") reject(new Error("offline"));
    else {
      cleanup?.();
      resolve([{ id: "late-chapter" }]);
    }
    await new Promise((done) => setImmediate(done));
    assert.deepEqual(chapters, original, scenario);
    assert.equal(writes, 0, scenario);
  }
});

test("a slower earlier note request cannot overwrite a newer response", async () => {
  const source = readFileSync(new URL("../components/notes/NoteReaderClient.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("reader.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "loadNote") callback = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(callback);
  const compiled = ts.transpileModule(`const load = ${callback.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const resolvers = [];
  let current = null;
  const writes = [];
  const dependencies = {
    latestNoteLoadRef: { current: 0 }, accessScope: "public", noteId: "one", ownerUserId: null,
    readPublicNoteCache: () => null, readOwnerNoteCache: () => null,
    setNote: (update) => { current = update(current); }, setLoading: () => {}, setLoadError: () => {},
    withNoteReadTimeout: (request) => request,
    notesApi: { getPublishedById: () => new Promise((resolve) => resolvers.push(resolve)) },
    writePublicNoteCache: (note) => writes.push(note), writeOwnerNoteCache: () => {},
    noteReaderValuesEqual: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    NOTE_READ_TIMEOUT_MESSAGE: "timeout", NOTE_READ_ERROR_MESSAGE: "error",
  };
  const load = new Function(...Object.keys(dependencies), `${compiled}; return load;`)(...Object.values(dependencies));
  const earlier = load();
  const newer = load();
  resolvers[1]({ title: "newer" });
  await newer;
  resolvers[0]({ title: "earlier" });
  await earlier;
  assert.deepEqual(current, { title: "newer" });
  assert.deepEqual(writes, [{ title: "newer" }]);
});

test("notes-list cache stores one timestamp and can still read older snapshots", () => {
  const source = readFileSync(new URL("../lib/notes-list-cache.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, (path) => {
    if (path === "@/lib/site-cache") return { getSiteCacheKey, readSiteCache, writeSiteCache };
    if (path === "@/lib/auth-session-slot") return { getActiveAiAccountSlot: () => null };
    throw new Error(`Unexpected dependency: ${path}`);
  });
  const storage = new MemoryStorage();
  withBrowserStorages(storage, storage, () => {
    const key = getSiteCacheKey("notes-list", "public");
    exports.writeNotesCache(key, [], true);
    const envelope = JSON.parse(storage.getItem(key));
    assert.deepEqual(envelope.value, { notes: [], hasMoreNotes: true });
    assert.equal(exports.readNotesCache(key).expiresAt, envelope.cachedAt + 300_000);
    envelope.value.cachedAt = envelope.cachedAt;
    envelope.value.expiresAt = envelope.cachedAt + 300_000;
    storage.setItem(key, JSON.stringify(envelope));
    assert.equal(exports.readNotesCache(key).hasMoreNotes, true);
    const originalFetchedAt = Date.now() - 60_000;
    exports.writeNotesCache(key, [], true, originalFetchedAt);
    assert.equal(exports.readNotesCache(key).expiresAt, originalFetchedAt + 300_000);
  });
});

test("returning to a fresh notes list keeps loaded pages; expiry and explicit retry still fetch", () => {
  const source = readFileSync(new URL("../components/notes/NotesClient.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("notes.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect"
      && node.arguments[0]?.getText(ast).includes("const prepareTimer")) callback = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(callback);
  const compiled = ts.transpileModule(`const effect = ${callback.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  for (const scenario of ["fresh", "expired", "retry"]) {
    let requests = 0;
    let visible = [];
    const pages = Array.from({ length: 36 }, (_, id) => ({ id: String(id) }));
    const timers = [];
    const noop = () => {};
    const dependencies = {
      window: { setTimeout: (callback) => timers.push(callback), clearTimeout: noop },
      latestLoadId: { current: 0 }, handledRetryToken: { current: 0 }, retryToken: scenario === "retry" ? 1 : 0,
      searchQuery: "", directoryKind: "human", selectedType: "all", selectedSubject: "all", sortOrder: "desc",
      canReadUnpublishedNotes: false, getNotesCacheKey: () => "key",
      readNotesCache: () => ({ notes: pages, hasMoreNotes: true, expiresAt: Date.now() + (scenario === "expired" ? -1 : 300_000) }),
      initialRouteReadyRef: { current: false }, initialDirectoryKind: "human", initialHasMoreNotes: true,
      notesRef: { current: pages }, renderedNotesScopeRef: { current: null }, notesScopeKey: "human:public",
      setIsLoadingMore: noop, setIsRefreshingNotes: noop, setSelectedNoteIds: noop, setLoading: noop, setLoadError: noop,
      setVisibleNotes: (notes) => { visible = notes; }, setHasMoreNotes: noop, writeNotesCache: noop,
      fetchNotesPage: () => { requests++; },
    };
    const effect = new Function(...Object.keys(dependencies), `${compiled}; return effect;`)(...Object.values(dependencies));
    effect();
    while (timers.length) timers.shift()();
    assert.equal(visible.length, 36, scenario);
    assert.equal(requests, scenario === "fresh" ? 0 : 1, scenario);
  }
});
