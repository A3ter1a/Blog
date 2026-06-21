import { profileApi } from "@/lib/supabase";
import { AboutClient } from "@/components/about/AboutClient";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "关于",
  description: "了解 Asteroid 的维护者、学习方向、个人介绍和联系方式。",
  path: "/about",
  keywords: ["Asteroid", "个人博客", "考研学习", "联系方式"],
});

export const revalidate = 0;

export default async function About() {
  const profile = await profileApi.get();

  return <AboutClient profile={profile} />;
}
