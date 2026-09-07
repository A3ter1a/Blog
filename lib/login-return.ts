/** Keep post-login navigation inside learning pages, never external/auth/API URLs. */
export function getLoginReturnPath(value: string | null): string {
  const fallback = "/tools";
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\s]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://study.invalid");
    if (url.origin !== "https://study.invalid"
      || !/^\/(?:tools|notes|collections|create|edit)(?:\/|$)/.test(url.pathname)) return fallback;
    // A return target must not select another account's session slot.
    return url.pathname;
  } catch {
    return fallback;
  }
}
