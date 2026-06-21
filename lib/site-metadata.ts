import type { Metadata } from "next";
import type { Note } from "@/lib/types";

export const SITE_NAME = "Asteroid";
export const SITE_TAGLINE = "知识的沉淀与共鸣";
export const SITE_DESCRIPTION = "个人考研笔记与学习工具库，沉淀数学三、英语一、政治与经济学的笔记、题集和复盘路径。";
export const DEFAULT_SITE_URL = "https://www.a3ter1a.cn";
export const DEFAULT_OG_IMAGE = "/logo.png";

const NO_INDEX_ROBOTS = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
} satisfies Metadata["robots"];

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  image?: string;
  keywords?: string[];
};

type NoIndexMetadataOptions = {
  title: string;
  description: string;
  path?: string;
};

export function getSiteUrl(): string {
  const candidate =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    DEFAULT_SITE_URL;

  const withProtocol = candidate.startsWith("http://") || candidate.startsWith("https://")
    ? candidate
    : `https://${candidate}`;

  return withProtocol.replace(/\/+$/, "");
}

export function getAbsoluteSiteUrl(path = "/"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${normalizedPath}`;
}

export function createTextExcerpt(input: string | undefined, fallback: string, maxLength = 150): string {
  const text = (input ?? "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[\*_>#~$\\{}[\]()]|&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return fallback;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

export function getNoteDescription(note: Note): string {
  const typeLabel = note.type === "problem" ? "题集" : note.type === "essay" ? "随笔" : "笔记";
  const fallback = `${SITE_NAME} 上的一篇${typeLabel}：${note.title}`;
  return createTextExcerpt(note.content, fallback);
}

export function getShareableImageUrl(imageUrl: string | undefined): string {
  if (!imageUrl) return DEFAULT_OG_IMAGE;
  if (imageUrl.startsWith("/") || imageUrl.startsWith("https://") || imageUrl.startsWith("http://")) {
    return imageUrl;
  }
  return DEFAULT_OG_IMAGE;
}

export function createPageMetadata({
  title,
  description,
  path,
  image,
  keywords,
}: PageMetadataOptions): Metadata {
  const imageUrl = getShareableImageUrl(image);

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "website",
      url: path,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: imageUrl,
          alt: `${SITE_NAME} logo`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export function createNoIndexMetadata({
  title,
  description,
  path,
}: NoIndexMetadataOptions): Metadata {
  const metadata: Metadata = {
    title,
    description,
    robots: NO_INDEX_ROBOTS,
  };

  if (path) {
    metadata.alternates = {
      canonical: path,
    };
  }

  return metadata;
}
