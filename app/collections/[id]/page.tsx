import { CollectionDetailClient } from "@/components/collections/CollectionDetailClient";
import { createPageMetadata } from "@/lib/site-metadata";
import { getCachedPublishedCollection } from "@/lib/server-public-cache";
import { withTimeout } from "@/lib/with-timeout";

export const revalidate = 60;
const SERVER_PRELOAD_TIMEOUT_MS = 1_500;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (process.env.ASTEROID_OFFLINE_BUILD === "1") return createPageMetadata({ title: "合集", description: "持续整理的文章合集。", path: `/collections/${id}` });
  try {
    const collection = await withTimeout(getCachedPublishedCollection(id), SERVER_PRELOAD_TIMEOUT_MS);
    return createPageMetadata({
      title: collection?.title ?? "合集",
      description: collection?.description || "持续整理的文章合集。",
      path: `/collections/${id}`,
    });
  } catch {
    return createPageMetadata({ title: "合集", description: "持续整理的文章合集。", path: `/collections/${id}` });
  }
}

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const collection = process.env.ASTEROID_OFFLINE_BUILD === "1"
    ? null
    : await withTimeout(getCachedPublishedCollection(id), SERVER_PRELOAD_TIMEOUT_MS).catch(() => null);

  return <CollectionDetailClient key={id} id={id} initialCollection={collection} />;
}
