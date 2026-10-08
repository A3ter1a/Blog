/** Keep post-login navigation inside learning pages, never external/auth/API URLs. */
export function getLoginReturnPath(value: string | null): string {
  const fallback = "/tools";
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\s]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://study.invalid");
    if (url.origin !== "https://study.invalid"
      || !/^\/(?:tools|notes|collections|create|edit)(?:\/|$)/.test(url.pathname)) return fallback;
    // A return target must not select another account's session slot. Keep
    // safe task context such as `edit`, `import`, `directory`, and `from` so
    // login returns to the exact work surface instead of a blank entry page.
    const safeSearch = new URLSearchParams();
    for (const [key, entry] of url.searchParams) {
      if (!key || /^(?:account|slot|next)$/i.test(key)) continue;
      if (/[\u0000-\u0020]/.test(key) || /[\u0000-\u0020]/.test(entry)) continue;
      if (entry.length > 512) continue;
      safeSearch.append(key, entry);
    }
    const query = safeSearch.toString();
    return `${url.pathname}${query ? `?${query}` : ""}`;
  } catch {
    return fallback;
  }
}
