import type { Note, Problem } from "./types";
import {
  math3KnowledgeAreas,
  type Math3KnowledgeArea,
  type Math3KnowledgeAreaId,
  type Math3KnowledgeChapter,
  type Math3KnowledgePoint,
} from "./math3-knowledge";

export const MATH3_AREA_TAG_PREFIX = "math3-area:";
export const MATH3_CHAPTER_TAG_PREFIX = "math3-chapter:";
export const MATH3_POINT_TAG_PREFIX = "math3-point:";

const MATH3_PRACTICE_TAG_PREFIXES = [
  MATH3_AREA_TAG_PREFIX,
  MATH3_CHAPTER_TAG_PREFIX,
  MATH3_POINT_TAG_PREFIX,
];

export type Math3PracticeScope =
  | { type: "area"; id: Math3KnowledgeAreaId; title: string }
  | { type: "chapter"; id: string; title: string; areaId: Math3KnowledgeAreaId };

export interface PracticeProblemItem extends Problem {
  practiceKey: string;
  sourceNoteId: string;
  sourceNoteTitle: string;
  sourceProblemIndex: number;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function isMath3PracticeTag(tag: string): boolean {
  return MATH3_PRACTICE_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix));
}

export function splitMath3PracticeTags(tags: string[] = []): {
  visibleTags: string[];
  math3PracticeTags: string[];
} {
  const normalizedTags = uniqueStrings(tags.map((tag) => tag.trim()).filter(Boolean));

  return {
    visibleTags: normalizedTags.filter((tag) => !isMath3PracticeTag(tag)),
    math3PracticeTags: normalizedTags.filter(isMath3PracticeTag),
  };
}

export function getVisibleNoteTags(tags: string[] = []): string[] {
  return splitMath3PracticeTags(tags).visibleTags;
}

export function mergeVisibleTagsWithMath3Tags(
  visibleTags: string[],
  preservedTags: string[] = [],
): string[] {
  const userTags = uniqueStrings(visibleTags.map((tag) => tag.trim()).filter(Boolean));
  const math3Tags = splitMath3PracticeTags(preservedTags).math3PracticeTags;
  return uniqueStrings([...userTags, ...math3Tags]);
}

export function getMath3AreaTag(areaId: Math3KnowledgeAreaId): string {
  return `${MATH3_AREA_TAG_PREFIX}${areaId}`;
}

export function getMath3ChapterTag(chapterId: string): string {
  return `${MATH3_CHAPTER_TAG_PREFIX}${chapterId}`;
}

export function getMath3PointTag(pointId: string): string {
  return `${MATH3_POINT_TAG_PREFIX}${pointId}`;
}

export function getMath3ScopeKey(scope: Math3PracticeScope): string {
  return `${scope.type}:${scope.id}`;
}

export function getMath3ScopeTag(scope: Math3PracticeScope): string {
  return scope.type === "area" ? getMath3AreaTag(scope.id) : getMath3ChapterTag(scope.id);
}

export function setMath3ScopeLinked(
  tags: string[],
  scope: Math3PracticeScope,
  linked: boolean,
  pointIds: string[] = [],
): string[] {
  const scopeTag = getMath3ScopeTag(scope);
  const pointTagsToAdd = pointIds.map(getMath3PointTag);
  const chapterPointTags = scope.type === "chapter"
    ? getMath3ChapterPointIds(scope.id).map(getMath3PointTag)
    : [];
  const pointTagsToRemove = new Set(scope.type === "chapter" ? chapterPointTags : pointTagsToAdd);
  const nextTags = tags.filter((tag) => tag !== scopeTag && !pointTagsToRemove.has(tag));
  if (linked) nextTags.push(scopeTag, ...pointTagsToAdd);
  return uniqueStrings(nextTags);
}

export function getMath3AreaById(areaId: Math3KnowledgeAreaId): Math3KnowledgeArea | undefined {
  return math3KnowledgeAreas.find((area) => area.id === areaId);
}

export function getMath3ChapterById(chapterId: string): {
  area: Math3KnowledgeArea;
  chapter: Math3KnowledgeChapter;
} | null {
  for (const area of math3KnowledgeAreas) {
    const chapter = area.chapters.find((item) => item.id === chapterId);
    if (chapter) return { area, chapter };
  }

  return null;
}

export function getMath3PointById(pointId: string): {
  area: Math3KnowledgeArea;
  chapter: Math3KnowledgeChapter;
  point: Math3KnowledgePoint;
} | null {
  for (const area of math3KnowledgeAreas) {
    for (const chapter of area.chapters) {
      const pointItem = chapter.points.find((item) => item.id === pointId);
      if (pointItem) return { area, chapter, point: pointItem };
    }
  }

  return null;
}

export function getMath3AreaChapterIds(area: Math3KnowledgeArea): string[] {
  return area.chapters.map((chapter) => chapter.id);
}

export function getMath3ChapterPointIds(chapterId: string): string[] {
  const result = getMath3ChapterById(chapterId);
  return result ? result.chapter.points.map((pointItem) => pointItem.id) : [];
}

export function getLinkedProblemSetIds(
  problemSets: Note[],
  scope: Math3PracticeScope,
): string[] {
  const scopeTag = getMath3ScopeTag(scope);
  const pointTags = scope.type === "chapter"
    ? new Set(getMath3ChapterPointIds(scope.id).map(getMath3PointTag))
    : null;

  return problemSets
    .filter((set) => set.tags.includes(scopeTag) || Boolean(pointTags && set.tags.some((tag) => pointTags.has(tag))))
    .map((set) => set.id);
}

export function getAreaPracticeProblemSetIds(
  problemSets: Note[],
  area: Math3KnowledgeArea,
): string[] {
  const areaTag = getMath3AreaTag(area.id);
  const chapterTags = new Set(area.chapters.map((chapter) => getMath3ChapterTag(chapter.id)));
  const pointTags = new Set(area.chapters.flatMap((chapter) =>
    chapter.points.map((pointItem) => getMath3PointTag(pointItem.id))
  ));

  return problemSets
    .filter((set) => (
      set.tags.includes(areaTag) ||
      set.tags.some((tag) => chapterTags.has(tag) || pointTags.has(tag))
    ))
    .map((set) => set.id);
}

export function getPracticeProblemKey(noteId: string, problemId: string): string {
  return `${noteId}:${problemId}`;
}

export function flattenPracticeProblems(problemSets: Note[]): PracticeProblemItem[] {
  return problemSets.flatMap((set) =>
    (set.problems ?? []).map((problem, index) => ({
      ...problem,
      practiceKey: getPracticeProblemKey(set.id, problem.id),
      sourceNoteId: set.id,
      sourceNoteTitle: set.title,
      sourceProblemIndex: index,
    }))
  );
}
