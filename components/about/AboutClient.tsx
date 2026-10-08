"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import type { Profile } from "@/lib/types";
import { surfaceMotion, uiMotion } from "@/lib/motion";
import { useToast } from "@/components/ui/Toast";

const iconMap: Record<string, string> = {
  mail: "/icons/email.svg",
  github: "/icons/github.svg",
  weibo: "/icons/weibo.svg",
  zhihu: "/icons/zhihu.svg",
  qq: "/icons/qq.svg",
  wechat: "/icons/wechat.svg",
  bilibili: "/icons/bilibili.svg",
  tiktok: "/icons/tiktok.svg",
};

function isUsableLink(href: string) {
  const value = href.trim();
  if (!value || value === "#") return false;
  try {
    const protocol = new URL(value, "https://asteroid.local").protocol;
    return ["http:", "https:", "mailto:", "tel:"].includes(protocol);
  } catch {
    return false;
  }
}

export function AboutClient({ profile }: { profile: Profile }) {
  const toast = useToast();
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const handleCopyContact = async (name: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedLink(name);
      toast.success(`${name}号码已复制`);
      window.setTimeout(() => setCopiedLink((current) => current === name ? null : current), 1800);
    } catch {
      toast.error(`无法复制${name}号码，请手动选择复制`);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-surface px-4 pb-16 pt-24 sm:px-6">
      <motion.section
        variants={surfaceMotion}
        initial="initial"
        animate="animate"
        transition={{ duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
        className="mb-12 flex w-full max-w-2xl flex-col items-center text-center"
      >
        <div className="relative mb-8">
          <div className="relative h-32 w-32 overflow-hidden rounded-full border border-outline-variant/20 bg-surface-container-lowest shadow-ambient md:h-40 md:w-40">
            {profile.avatar ? (
              /* eslint-disable-next-line @next/next/no-img-element -- User profile avatars can be data URLs or arbitrary external URLs. */
              <img src={profile.avatar} alt={profile.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center editorial-gradient font-headline text-4xl font-bold text-on-primary">
                {profile.name.slice(0, 2)}
              </div>
            )}
          </div>
        </div>

        <motion.h1
          variants={surfaceMotion}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.04, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
          className="mb-4 font-headline text-4xl font-bold text-primary md:text-5xl"
        >
          {profile.name}
        </motion.h1>

        <motion.p
          variants={surfaceMotion}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.08, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
          className="max-w-md font-headline text-lg italic leading-relaxed text-on-surface-variant md:text-xl"
        >
          {profile.tagline}
        </motion.p>

        <motion.div
          variants={surfaceMotion}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.12, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
          className="mt-6 flex flex-wrap justify-center gap-2"
          aria-label="个人标签"
        >
          {profile.badges.map((badge, index) => (
            <span key={`${badge}-${index}`} className="tag-chip px-3 py-1.5 text-sm">
              {badge}
            </span>
          ))}
        </motion.div>
      </motion.section>

      <motion.section
        variants={surfaceMotion}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.14, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
        className="w-full max-w-md"
      >
        <div className="surface-panel overflow-hidden divide-y divide-outline-variant/10">
          {profile.links.map((link, index) => {
            const iconSrc = iconMap[link.icon] || "/icons/email.svg";
            const linkAvailable = link.linkType !== "number" && isUsableLink(link.href);
            const numberAvailable = link.linkType === "number" && Boolean(link.href.trim());
            const content = (
              <>
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                    <Image src={iconSrc} alt="" width={28} height={28} className="h-7 w-7" />
                  </div>
                  <div className="flex min-w-0 flex-col text-left">
                    <span className="font-medium text-on-surface">{link.name}</span>
                    {numberAvailable && <span className="text-xs text-on-surface-variant">{link.href}</span>}
                    {!numberAvailable && !linkAvailable && <span className="text-xs text-on-surface-variant/60">尚未公开</span>}
                  </div>
                </div>
                {(linkAvailable || numberAvailable) && (numberAvailable ? (
                  copiedLink === link.name
                    ? <Check className="h-5 w-5 text-primary" aria-label="已复制" />
                    : <Copy className="h-5 w-5 text-outline-variant" aria-label="复制号码" />
                ) : (
                  <ArrowUpRight className="motion-icon-shift h-5 w-5 text-outline-variant group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                ))}
              </>
            );

            if (linkAvailable) {
              return (
                <a
                  key={`${link.name}-${index}`}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="motion-ui group flex items-center justify-between gap-3 p-4 text-on-surface hover:bg-surface-container-low"
                >
                  {content}
                </a>
              );
            }

            if (numberAvailable) {
              return (
                <button
                  key={`${link.name}-${index}`}
                  type="button"
                  onClick={() => void handleCopyContact(link.name, link.href)}
                  className="motion-ui group flex w-full items-center justify-between gap-3 p-4 text-left text-on-surface hover:bg-surface-container-low"
                >
                  {content}
                </button>
              );
            }

            return (
              <div key={`${link.name}-${index}`} className="flex items-center justify-between gap-3 p-4 text-on-surface">
                {content}
              </div>
            );
          })}
        </div>
      </motion.section>
    </main>
  );
}
