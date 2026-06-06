import {
  math3KnowledgeAreas,
  type Math3KnowledgeAreaId,
} from "./math3-knowledge";
import { getMath3ChapterById } from "./math3-practice";

export interface Math3ProblemClassifyInput {
  id: string;
  index: number;
  type: string;
  question: string;
  answer?: string;
  options?: Array<{ label: string; content: string }>;
}

export interface Math3ChapterAssignment {
  problemId: string;
  chapterId: string;
  areaId: Math3KnowledgeAreaId;
  confidence: number;
  reason: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function clampConfidence(value: unknown): number {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0.5;
  return Math.min(1, Math.max(0, confidence));
}

export function getMath3ChapterPromptContext(): string {
  return math3KnowledgeAreas
    .map((area) => {
      const chapters = area.chapters
        .map((chapter) => {
          const pointTitles = chapter.points.map((point) => point.title).join("；");
          return `- ${chapter.id}：${chapter.title}。${chapter.summary}。知识点：${pointTitles}`;
        })
        .join("\n");
      return `${area.id} ${area.title}（参考权重 ${area.examWeight}）\n${chapters}`;
    })
    .join("\n\n");
}

export function normalizeMath3ChapterAssignments(
  value: unknown,
  problemIds: string[],
): Math3ChapterAssignment[] {
  const payload = isRecord(value) ? value : {};
  const rawAssignments = Array.isArray(payload.assignments)
    ? payload.assignments
    : Array.isArray(value)
      ? value
      : [];
  const validProblemIds = new Set(problemIds);

  return rawAssignments.flatMap((raw): Math3ChapterAssignment[] => {
    const item = isRecord(raw) ? raw : {};
    const problemId = getString(item.problemId);
    const chapterId = getString(item.chapterId);
    const chapterResult = getMath3ChapterById(chapterId);

    if (!validProblemIds.has(problemId) || !chapterResult) return [];

    return [{
      problemId,
      chapterId: chapterResult.chapter.id,
      areaId: chapterResult.area.id,
      confidence: clampConfidence(item.confidence),
      reason: getString(item.reason).slice(0, 80),
    }];
  });
}
