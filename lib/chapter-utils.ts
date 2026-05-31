import type { Chapter } from "@/lib/types";

function compareChapters(a: Chapter, b: Chapter): number {
  const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (orderDiff !== 0) return orderDiff;
  return a.name.localeCompare(b.name, "zh-CN");
}

function sameParent(a?: string, b?: string): boolean {
  return (a || undefined) === (b || undefined);
}

export function normalizeChapterName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function getRootChapters(chapters: Chapter[]): Chapter[] {
  return chapters
    .filter((chapter) => !chapter.parentId)
    .sort(compareChapters);
}

export function getChildChapters(chapters: Chapter[], parentId: string): Chapter[] {
  return chapters
    .filter((chapter) => chapter.parentId === parentId)
    .sort(compareChapters);
}

export function hasSiblingChapterName(
  chapters: Chapter[],
  name: string,
  parentId?: string,
  excludeId?: string,
): boolean {
  const normalizedName = normalizeChapterName(name).toLocaleLowerCase();
  if (!normalizedName) return false;

  return chapters.some((chapter) => (
    chapter.id !== excludeId
    && sameParent(chapter.parentId, parentId)
    && normalizeChapterName(chapter.name).toLocaleLowerCase() === normalizedName
  ));
}
