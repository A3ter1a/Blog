"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { Profile } from "@/lib/types";
import { DEFAULT_PROFILE } from "@/lib/profile";
import { profileApi } from "@/lib/supabase";

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

export default function About() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);

  useEffect(() => {
    let mounted = true;

    void profileApi.get().then((nextProfile) => {
      if (mounted) setProfile(nextProfile);
    });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center bg-surface px-4 pb-16 pt-24 sm:px-6">
      {/* Profile Header */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-12 flex w-full max-w-2xl flex-col items-center text-center"
      >
        {/* Avatar */}
        <div className="relative mb-8">
          <div className="relative h-32 w-32 overflow-hidden rounded-full border border-outline-variant/20 bg-surface-container-lowest shadow-ambient md:h-40 md:w-40">
            {profile.avatar ? (
              /* eslint-disable-next-line @next/next/no-img-element -- User profile avatars can be data URLs or arbitrary external URLs. */
              <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full editorial-gradient flex items-center justify-center text-on-primary text-4xl font-bold font-headline">
                {profile.name.slice(0, 2)}
              </div>
            )}
          </div>
        </div>

        {/* Name */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mb-4 font-headline text-4xl font-bold text-primary md:text-5xl"
        >
          {profile.name}
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="max-w-md font-headline text-lg italic leading-relaxed text-on-surface-variant md:text-xl"
        >
          {profile.tagline}
        </motion.p>

        {/* Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-6 flex flex-wrap justify-center gap-2"
        >
          {profile.badges.map((badge, i) => (
            <span
              key={i}
              className="tag-chip px-3 py-1.5 text-sm"
            >
              {badge}
            </span>
          ))}
        </motion.div>
      </motion.section>

      {/* Links - Apple Card Style */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="w-full max-w-md"
      >
        <div className="surface-panel overflow-hidden divide-y divide-outline-variant/10">
          {profile.links.map((link, index) => {
            const iconSrc = iconMap[link.icon] || "/icons/email.svg";
            const isLink = link.linkType !== "number";

            const Content = (
              <>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 flex items-center justify-center">
                    <Image src={iconSrc} alt={link.name} width={28} height={28} className="w-7 h-7" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">{link.name}</span>
                    {link.linkType === "number" && link.href && (
                      <span className="text-xs text-on-surface-variant/60">{link.href}</span>
                    )}
                  </div>
                </div>
                {isLink && (
                  <ChevronRight className="w-5 h-5 text-outline-variant transition-transform duration-200 group-hover:translate-x-0.5" />
                )}
              </>
            );

            if (isLink) {
              return (
                <motion.a
                  key={`${link.name}-${index}`}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + index * 0.1, duration: 0.4 }}
                  whileHover={{ backgroundColor: "rgba(234,232,231,0.8)" }}
                  className="group flex items-center justify-between p-4 transition-all duration-200 text-on-surface"
                >
                  {Content}
                </motion.a>
              );
            }

            return (
              <motion.div
                key={`${link.name}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + index * 0.1, duration: 0.4 }}
                className="flex items-center justify-between p-4 text-on-surface"
              >
                {Content}
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="mt-16 text-center"
      >
        <p className="text-on-surface-variant/60 text-sm font-headline italic">
          {profile.footer}
        </p>
      </motion.footer>
    </main>
  );
}
