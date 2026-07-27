export const ASSISTANT_MEMORY_STORAGE_KEY = "asteroid:assistant-memory:v1";

export type AssistantMemoryStatus = "proposed" | "accepted" | "rejected";

export type AssistantMemoryCandidate = {
  id: string;
  content: string;
  reason: string;
  sourcePath: string;
  status: AssistantMemoryStatus;
  createdAt: string;
  decidedAt?: string;
};

export function createAssistantMemoryCandidate(
  content: string,
  reason: string,
  sourcePath: string,
  now: string,
): AssistantMemoryCandidate {
  if (!content.trim() || !reason.trim()) throw new Error("记忆候选的内容和理由不能为空");
  return {
    id: `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content: content.trim().slice(0, 1000),
    reason: reason.trim().slice(0, 240),
    sourcePath: sourcePath.trim() || "/",
    status: "proposed",
    createdAt: now,
  };
}

export function decideAssistantMemory(
  candidate: AssistantMemoryCandidate,
  decision: "accepted" | "rejected",
  now: string,
): AssistantMemoryCandidate {
  if (candidate.status !== "proposed") throw new Error("记忆候选已经处理，不能重复决定");
  return { ...candidate, status: decision, decidedAt: now };
}

export function normalizeAssistantMemories(value: unknown): AssistantMemoryCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AssistantMemoryCandidate[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<AssistantMemoryCandidate>;
    if (typeof candidate.id !== "string"
      || typeof candidate.content !== "string"
      || typeof candidate.reason !== "string"
      || typeof candidate.sourcePath !== "string"
      || typeof candidate.createdAt !== "string"
      || !["proposed", "accepted", "rejected"].includes(candidate.status ?? "")) return [];
    return [candidate as AssistantMemoryCandidate];
  }).slice(0, 40);
}

export function buildAcceptedMemoryContext(memories: AssistantMemoryCandidate[]): string {
  return memories
    .filter((memory) => memory.status === "accepted")
    .slice(0, 8)
    .map((memory, index) => `M${index + 1}. ${memory.content}`)
    .join("\n");
}
