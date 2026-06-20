import { profileApi } from "@/lib/supabase";
import { AboutClient } from "@/components/about/AboutClient";

export const revalidate = 0;

export default async function About() {
  const profile = await profileApi.get();

  return <AboutClient profile={profile} />;
}
