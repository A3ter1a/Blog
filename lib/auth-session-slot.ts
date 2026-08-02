export const AI_ACCOUNT_SLOTS = ["math", "english", "politics", "economics"] as const;

export type AiAccountSlot = (typeof AI_ACCOUNT_SLOTS)[number];

export type AiAccountSlotConfig = {
  slot: AiAccountSlot;
  label: string;
  email: string;
};

export const AI_ACCOUNT_SLOT_CONFIG: Record<AiAccountSlot, AiAccountSlotConfig> = {
  math: { slot: "math", label: "数学", email: "math.ai@a3ter1a.cn" },
  english: { slot: "english", label: "英语", email: "english.ai@a3ter1a.cn" },
  politics: { slot: "politics", label: "政治", email: "politics.ai@a3ter1a.cn" },
  economics: { slot: "economics", label: "经济学", email: "economics.ai@a3ter1a.cn" },
};

export const AI_ACCOUNT_SLOT_QUERY_PARAM = "account";
const ACTIVE_AI_ACCOUNT_SLOT_SESSION_KEY = "asteroid-active-ai-account-slot";

export function normalizeAiAccountSlot(value: unknown): AiAccountSlot | null {
  return typeof value === "string" && AI_ACCOUNT_SLOTS.includes(value as AiAccountSlot)
    ? value as AiAccountSlot
    : null;
}

export function getAiAccountSlotForEmail(email: string | null | undefined): AiAccountSlot | null {
  if (typeof email !== "string") return null;
  const normalizedEmail = email.trim().toLowerCase();
  return AI_ACCOUNT_SLOTS.find((slot) => (
    AI_ACCOUNT_SLOT_CONFIG[slot].email.toLowerCase() === normalizedEmail
  )) ?? null;
}

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function getActiveAiAccountSlot(): AiAccountSlot | null {
  if (!canUseSessionStorage()) return null;

  try {
    const querySlot = normalizeAiAccountSlot(
      new URLSearchParams(window.location.search).get(AI_ACCOUNT_SLOT_QUERY_PARAM),
    );
    if (querySlot) {
      window.sessionStorage.setItem(ACTIVE_AI_ACCOUNT_SLOT_SESSION_KEY, querySlot);
      return querySlot;
    }

    return normalizeAiAccountSlot(
      window.sessionStorage.getItem(ACTIVE_AI_ACCOUNT_SLOT_SESSION_KEY),
    );
  } catch {
    return null;
  }
}

export function clearActiveAiAccountSlot(): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(ACTIVE_AI_ACCOUNT_SLOT_SESSION_KEY);
  } catch {
    // Ignore unavailable storage in restricted browser contexts.
  }
}

export function getAiAccountAuthStorageKey(supabaseUrl: string, slot: AiAccountSlot): string {
  let projectRef = "project";
  try {
    projectRef = new URL(supabaseUrl).hostname.split(".")[0] || projectRef;
  } catch {
    // The Supabase client will report the invalid URL; keep this key deterministic.
  }
  return `asteroid-${projectRef}-auth-${slot}`;
}

export function getAuthCacheKey(baseKey: string): string {
  return `${baseKey}:${getActiveAiAccountSlot() ?? "default"}`;
}

export function getAiAccountSlotPath(path: string, slot: AiAccountSlot | null): string {
  if (!slot) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${AI_ACCOUNT_SLOT_QUERY_PARAM}=${encodeURIComponent(slot)}`;
}

export function isExpectedAiAccountEmail(slot: AiAccountSlot, email: string | null | undefined): boolean {
  return getAiAccountSlotForEmail(email) === slot;
}

export function doesAiProfileMatchSlot(slot: AiAccountSlot, value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return profile.subject === slot && profile.account_key === slot;
}
