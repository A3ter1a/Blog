export const PRELOAD_TIMEOUT_MESSAGE = "预加载超时";

export function isPreloadTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === PRELOAD_TIMEOUT_MESSAGE;
}

/** Resolve a server-side preload within a bounded window without cancelling the underlying task. */
export function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(PRELOAD_TIMEOUT_MESSAGE));
    }, timeoutMs);

    task.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}
