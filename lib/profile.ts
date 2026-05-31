import type { Profile, ProfileLink } from "./types";

const linkVariants: ProfileLink["variant"][] = ["default", "secondary", "dark", "primary"];
const linkTypes: NonNullable<ProfileLink["linkType"]>[] = ["link", "number"];

export const DEFAULT_PROFILE: Profile = {
  name: "A3ter1a",
  avatar: "",
  tagline: "博观而约取，厚积而薄发。在这场孤独的修行中，我们终将听见远方的回响。",
  badges: ["星月女神 Asteria", "考研人 | 数学 · 英语 · 政治 · 经济学"],
  links: [
    { name: "QQ", icon: "qq", href: "", variant: "default", linkType: "number" },
    { name: "微信", icon: "wechat", href: "", variant: "secondary", linkType: "number" },
    { name: "B站", icon: "bilibili", href: "#", variant: "dark", linkType: "link" },
    { name: "Github", icon: "github", href: "#", variant: "primary", linkType: "link" },
  ],
  footer: "Asteroid — 知识的沉淀与共鸣",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeAvatar(value: unknown): string {
  const avatar = asString(value);
  return avatar.startsWith("data:") ? "" : avatar;
}

function normalizeProfileLink(value: unknown, fallback: ProfileLink): ProfileLink {
  if (!isRecord(value)) return fallback;

  const variant = asString(value.variant);
  const linkType = asString(value.linkType);

  return {
    name: asString(value.name, fallback.name),
    icon: asString(value.icon, fallback.icon),
    href: asString(value.href, fallback.href),
    variant: linkVariants.includes(variant as ProfileLink["variant"])
      ? variant as ProfileLink["variant"]
      : fallback.variant,
    linkType: linkTypes.includes(linkType as NonNullable<ProfileLink["linkType"]>)
      ? linkType as NonNullable<ProfileLink["linkType"]>
      : fallback.linkType,
  };
}

export function normalizeProfile(value: unknown): Profile {
  if (!isRecord(value)) return DEFAULT_PROFILE;

  const rawLinks = Array.isArray(value.links) ? value.links : [];
  const links = rawLinks.map((link, index) => (
    normalizeProfileLink(link, DEFAULT_PROFILE.links[index] ?? DEFAULT_PROFILE.links[0])
  ));

  return {
    name: asString(value.name, DEFAULT_PROFILE.name),
    avatar: normalizeAvatar(value.avatar),
    tagline: asString(value.tagline, DEFAULT_PROFILE.tagline),
    badges: asStringArray(value.badges),
    links,
    footer: asString(value.footer, DEFAULT_PROFILE.footer),
  };
}
