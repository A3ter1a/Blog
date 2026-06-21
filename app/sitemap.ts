import type { MetadataRoute } from "next";
import { getAbsoluteSiteUrl } from "@/lib/site-metadata";
import { notesApi } from "@/lib/supabase";

export const revalidate = 3600;

const staticRoutes: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/notes", changeFrequency: "daily", priority: 0.9 },
  { path: "/tools", changeFrequency: "weekly", priority: 0.8 },
  { path: "/tools/note-qa", changeFrequency: "monthly", priority: 0.7 },
  { path: "/tools/review", changeFrequency: "monthly", priority: 0.7 },
  { path: "/tools/math3-self-test", changeFrequency: "monthly", priority: 0.7 },
  { path: "/tools/problem-booklet", changeFrequency: "monthly", priority: 0.7 },
  { path: "/tools/math3-catalog", changeFrequency: "monthly", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
];

function createStaticEntries(now: Date): MetadataRoute.Sitemap {
  return staticRoutes.map((route) => ({
    url: getAbsoluteSiteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries = createStaticEntries(now);

  try {
    const notes = await notesApi.getSummaries({
      sortOrder: "desc",
      includeCoverImage: false,
    });

    return [
      ...entries,
      ...notes.map((note) => ({
        url: getAbsoluteSiteUrl(`/notes/${note.id}`),
        lastModified: note.updatedAt,
        changeFrequency: "weekly" as const,
        priority: note.type === "essay" ? 0.55 : 0.72,
      })),
    ];
  } catch (error) {
    console.warn("Failed to build note sitemap entries:", error);
    return entries;
  }
}
