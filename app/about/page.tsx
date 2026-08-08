import { AboutClient } from "@/components/about/AboutClient";
import { createPageMetadata } from "@/lib/site-metadata";
import { DEFAULT_PROFILE } from "@/lib/profile";
import { getCachedPublicProfile } from "@/lib/server-public-cache";

export const metadata = createPageMetadata({
  title: "关于",
  description: "了解 Asteroid 的维护者、学习方向、个人介绍和联系方式。",
  path: "/about",
  keywords: ["Asteroid", "个人博客", "考研学习", "联系方式"],
});

export const revalidate = 300;

const PROFILE_REQUEST_TIMEOUT_MS = 2_500;

async function getPublicProfileWithTimeout() {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getCachedPublicProfile(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("公开资料加载超时")),
          PROFILE_REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    console.warn("Falling back to the default public profile:", error);
    return DEFAULT_PROFILE;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export default async function About() {
  const profile = await getPublicProfileWithTimeout();

  return <AboutClient profile={profile} />;
}
