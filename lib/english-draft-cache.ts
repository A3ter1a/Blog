export type EnglishDraftAnswers = Record<string, Record<string, string>>;
const VERSION = 1;
const MAX_CHARACTERS = 2_000_000;

function cacheKey(userId: string): string {
  return `asteroid:english-unsaved:v${VERSION}:${encodeURIComponent(userId)}`;
}

export function readEnglishDraftAnswers(userId: string | null): EnglishDraftAnswers {
  if (!userId || typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(cacheKey(userId));
    if (!raw || raw.length > MAX_CHARACTERS) return {};
    const entry = JSON.parse(raw);
    if (entry?.version !== VERSION || !entry.answers || typeof entry.answers !== "object" || Array.isArray(entry.answers)) return {};
    return Object.fromEntries(Object.entries(entry.answers).flatMap(([roundKey, answers]) => {
      if (!/^.+:[123]$/.test(roundKey) || !answers || typeof answers !== "object" || Array.isArray(answers)) return [];
      const fields = Object.entries(answers);
      if (fields.some(([, answer]) => typeof answer !== "string")) return [];
      return [[roundKey, Object.fromEntries(fields)]];
    })) as EnglishDraftAnswers;
  } catch {
    return {};
  }
}

export function writeEnglishDraftAnswers(userId: string | null, answers: EnglishDraftAnswers): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    if (Object.keys(answers).length === 0) {
      window.sessionStorage.removeItem(cacheKey(userId));
      return true;
    }
    const raw = JSON.stringify({ version: VERSION, answers });
    if (raw.length > MAX_CHARACTERS) return false;
    window.sessionStorage.setItem(cacheKey(userId), raw);
    return true;
  } catch {
    return false;
  }
}
