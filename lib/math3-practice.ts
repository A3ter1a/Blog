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

export interface Math3ScopeProblemSetStat {
  noteId: string;
  title: string;
  totalProblems: number;
  matchedProblems: number;
  matchedChapterIds: string[];
  matchedPointIds: string[];
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
  generatedMath3Tags?: string[],
): string[] {
  const userTags = uniqueStrings(visibleTags.map((tag) => tag.trim()).filter(Boolean));
  const preservedMath3Tags = splitMath3PracticeTags(preservedTags).math3PracticeTags;

  const math3Tags = generatedMath3Tags === undefined
    ? preservedMath3Tags
    : splitMath3PracticeTags(generatedMath3Tags).math3PracticeTags;

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

export function getMath3PointIdsFromTags(tags: string[] = []): string[] {
  return uniqueStrings(
    tags
      .filter((tag) => tag.startsWith(MATH3_POINT_TAG_PREFIX))
      .map((tag) => tag.slice(MATH3_POINT_TAG_PREFIX.length))
      .filter((pointId) => Boolean(getMath3PointById(pointId)))
  );
}

export function getMath3ChapterIdsFromTags(tags: string[] = []): string[] {
  const explicitChapterIds = uniqueStrings(
    tags
      .filter((tag) => tag.startsWith(MATH3_CHAPTER_TAG_PREFIX))
      .map((tag) => tag.slice(MATH3_CHAPTER_TAG_PREFIX.length))
      .filter((chapterId) => Boolean(getMath3ChapterById(chapterId)))
  );

  return uniqueStrings([
    ...explicitChapterIds,
    ...getMath3ChapterIdsFromPointIds(getMath3PointIdsFromTags(tags)),
  ]);
}

export function setMath3ProblemKnowledgeTags(
  tags: string[] = [],
  chapterId?: string,
  pointIds: string[] = [],
): string[] {
  const chapterResult = chapterId ? getMath3ChapterById(chapterId) : null;
  const validChapterId = chapterResult?.chapter.id;
  const validPointIdSet = new Set(chapterResult?.chapter.points.map((pointItem) => pointItem.id) ?? []);
  const validPointTags = validChapterId
    ? uniqueStrings(pointIds)
        .filter((pointId) => validPointIdSet.has(pointId))
        .map(getMath3PointTag)
    : [];
  const visibleTags = splitMath3PracticeTags(tags).visibleTags;

  return uniqueStrings([
    ...visibleTags,
    ...(validChapterId ? [getMath3ChapterTag(validChapterId)] : []),
    ...validPointTags,
  ]);
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

export function getMath3ScopeChapterIds(scope: Math3PracticeScope): string[] {
  if (scope.type === "chapter") return [scope.id];

  const area = getMath3AreaById(scope.id);
  return area ? getMath3AreaChapterIds(area) : [];
}

export function getMath3ChapterPointIds(chapterId: string): string[] {
  const result = getMath3ChapterById(chapterId);
  return result ? result.chapter.points.map((pointItem) => pointItem.id) : [];
}

export function getMath3ScopePointIds(scope: Math3PracticeScope): string[] {
  if (scope.type === "chapter") return getMath3ChapterPointIds(scope.id);

  const area = getMath3AreaById(scope.id);
  return area?.chapters.flatMap((chapter) => chapter.points.map((pointItem) => pointItem.id)) ?? [];
}

export function getMath3PracticeTagsFromProblems(problems: Problem[] = []): string[] {
  const chapterIds = uniqueStrings(problems.flatMap(getMath3ProblemChapterIds));
  const areaIds = Array.from(new Set(
    chapterIds
      .map((chapterId) => getMath3ChapterById(chapterId)?.area.id)
      .filter((areaId): areaId is Math3KnowledgeAreaId => Boolean(areaId))
  ));
  const pointIds = uniqueStrings(problems.flatMap((problem) => getMath3PointIdsFromTags(problem.tags)));

  return uniqueStrings([
    ...areaIds.map(getMath3AreaTag),
    ...chapterIds.map(getMath3ChapterTag),
    ...pointIds.map(getMath3PointTag),
  ]);
}

function getMath3ScopePointTagSet(scope: Math3PracticeScope): Set<string> {
  return new Set(getMath3ScopePointIds(scope).map(getMath3PointTag));
}

function getMath3ScopeChapterIdSet(scope: Math3PracticeScope): Set<string> {
  return new Set(getMath3ScopeChapterIds(scope));
}

function getMath3ChapterIdsFromPointIds(pointIds: string[]): string[] {
  return uniqueStrings(
    pointIds
      .map((pointId) => getMath3PointById(pointId)?.chapter.id)
      .filter((chapterId): chapterId is string => Boolean(chapterId))
  );
}

export function getMath3ProblemChapterIds(problem: Problem): string[] {
  return getMath3ChapterIdsFromTags(problem.tags);
}

function problemMatchesMath3PointTagSet(problem: Problem, pointTagSet: Set<string>): boolean {
  return (problem.tags ?? []).some((tag) => pointTagSet.has(tag));
}

function problemMatchesMath3ChapterSet(problem: Problem, chapterIdSet: Set<string>): boolean {
  return getMath3ProblemChapterIds(problem).some((chapterId) => chapterIdSet.has(chapterId));
}

function legacyNoteScopeTagsMatchMath3Scope(tags: string[] = [], scope: Math3PracticeScope): boolean {
  if (scope.type === "chapter") {
    return tags.includes(getMath3ChapterTag(scope.id));
  }

  const area = getMath3AreaById(scope.id);
  if (!area) return false;

  const chapterTags = new Set(area.chapters.map((chapter) => getMath3ChapterTag(chapter.id)));
  return tags.includes(getMath3AreaTag(scope.id)) || tags.some((tag) => chapterTags.has(tag));
}

function noteTagsMatchMath3Scope(
  tags: string[] = [],
  scope: Math3PracticeScope,
  chapterIdSet = getMath3ScopeChapterIdSet(scope),
  pointTagSet = getMath3ScopePointTagSet(scope),
): boolean {
  const chapterTags = new Set(Array.from(chapterIdSet).map(getMath3ChapterTag));
  return legacyNoteScopeTagsMatchMath3Scope(tags, scope)
    || tags.some((tag) => chapterTags.has(tag))
    || tags.some((tag) => pointTagSet.has(tag));
}

export function getLinkedProblemSetIds(
  problemSets: Note[],
  scope: Math3PracticeScope,
): string[] {
  const chapterIdSet = getMath3ScopeChapterIdSet(scope);
  const pointTagSet = getMath3ScopePointTagSet(scope);

  return problemSets
    .filter((set) =>
      noteTagsMatchMath3Scope(set.tags, scope, chapterIdSet, pointTagSet) ||
      (set.problems ?? []).some((problem) =>
        problemMatchesMath3ChapterSet(problem, chapterIdSet) ||
        problemMatchesMath3PointTagSet(problem, pointTagSet)
      )
    )
    .map((set) => set.id);
}

export function getPracticeProblemKey(noteId: string, problemId: string): string {
  return `${noteId}:${problemId}`;
}

export function flattenPracticeProblems(problemSets: Note[], scope?: Math3PracticeScope): PracticeProblemItem[] {
  const chapterIdSet = scope ? getMath3ScopeChapterIdSet(scope) : null;
  const pointTagSet = scope ? getMath3ScopePointTagSet(scope) : null;

  return problemSets.flatMap((set) =>
    (set.problems ?? [])
      .map((problem, index) => ({ problem, index }))
      .filter(({ problem }) => {
        if (!scope) return true;
        const problemChapterIds = getMath3ProblemChapterIds(problem);
        if (problemChapterIds.length > 0) {
          return chapterIdSet ? problemMatchesMath3ChapterSet(problem, chapterIdSet) : true;
        }

        return legacyNoteScopeTagsMatchMath3Scope(set.tags, scope)
          || (pointTagSet ? problemMatchesMath3PointTagSet(problem, pointTagSet) : false);
      })
      .map(({ problem, index }) => ({
        ...problem,
        practiceKey: getPracticeProblemKey(set.id, problem.id),
        sourceNoteId: set.id,
        sourceNoteTitle: set.title,
        sourceProblemIndex: index,
      }))
  );
}

export function getMath3ScopeProblemSetStats(
  problemSets: Note[],
  scope: Math3PracticeScope,
): Math3ScopeProblemSetStat[] {
  const scopeChapterIdSet = new Set(getMath3ScopeChapterIds(scope));
  const scopePointIdSet = new Set(getMath3ScopePointIds(scope));

  return problemSets
    .map((set) => {
      const matchedProblems = flattenPracticeProblems([set], scope);
      const matchedChapterIds = uniqueStrings([
        ...getMath3ChapterIdsFromTags(set.tags).filter((chapterId) => scopeChapterIdSet.has(chapterId)),
        ...(set.problems ?? []).flatMap((problem) =>
          getMath3ProblemChapterIds(problem).filter((chapterId) => scopeChapterIdSet.has(chapterId))
        ),
      ]);
      const matchedPointIds = uniqueStrings([
        ...getMath3PointIdsFromTags(set.tags).filter((pointId) => scopePointIdSet.has(pointId)),
        ...(set.problems ?? []).flatMap((problem) =>
          getMath3PointIdsFromTags(problem.tags).filter((pointId) => scopePointIdSet.has(pointId))
        ),
      ]);

      return {
        noteId: set.id,
        title: set.title,
        totalProblems: set.problems?.length ?? 0,
        matchedProblems: matchedProblems.length,
        matchedChapterIds,
        matchedPointIds,
      };
    })
    .filter((stat) =>
      stat.matchedProblems > 0 || stat.matchedChapterIds.length > 0 || stat.matchedPointIds.length > 0
    );
}
