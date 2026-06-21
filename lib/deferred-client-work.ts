export function scheduleDeferredClientWork(work: () => void, delayMs = 0): () => void {
  if (typeof window === "undefined") return () => {};

  const timer = window.setTimeout(work, delayMs);
  return () => window.clearTimeout(timer);
}
