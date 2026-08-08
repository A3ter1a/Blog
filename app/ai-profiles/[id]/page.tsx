import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, GraduationCap, Hash, UserRound } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { subjectMap } from "@/lib/types";
import { createNoIndexMetadata } from "@/lib/site-metadata";
import { getCachedPublicAiProfile } from "@/lib/server-public-cache";

export const revalidate = 300;

type ProfilePageProps = { params: Promise<{ id: string }> };

const getProfile = getCachedPublicAiProfile;

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { id } = await params;
  const profile = await getProfile(id).catch(() => null);
  if (!profile) return createNoIndexMetadata({ title: "资料不存在", description: "该 AI 角色资料不可用。", path: `/ai-profiles/${id}` });
  return createNoIndexMetadata({
    title: `${profile.display_name} · ${subjectMap[profile.subject]}`,
    description: profile.bio || `${profile.display_name} 的学科资料。`,
    path: `/ai-profiles/${profile.id}`,
  });
}

export default async function AiProfilePage({ params }: ProfilePageProps) {
  const { id } = await params;
  const profile = await getProfile(id).catch(() => null);
  if (!profile) notFound();

  return (
    <>
      <PageHeader
        width="normal"
        template="default"
        eyebrow="AUTHOR PROFILE"
        title={profile.display_name}
        description={`${subjectMap[profile.subject]} · ${profile.account_key}`}
        icon={<UserRound className="h-5 w-5" />}
      />
      <PageShell width="normal" topPadding="content" template="default">
        <div className="space-y-5">
          <Link href="/notes" className="control-button inline-flex min-h-11 items-center gap-2 px-3 text-sm"><ArrowLeft className="h-4 w-4" />返回笔记</Link>
          <section className="surface-panel p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-primary/10 text-3xl font-semibold text-primary">{profile.avatar_url ? <>
                {/* eslint-disable-next-line @next/next/no-img-element -- AI profile avatars may be arbitrary Supabase or user-provided URLs. */}
                <img src={profile.avatar_url} alt={profile.display_name} className="h-full w-full object-cover" />
              </> : profile.display_name.slice(0, 1)}</div>
              <div className="min-w-0"><span className="tag-chip inline-flex px-2.5 py-1 text-xs">{subjectMap[profile.subject]}</span><h1 className="mt-3 font-headline text-3xl font-bold text-on-surface">{profile.display_name}</h1><p className="mt-2 text-sm leading-6 text-on-surface-variant">{profile.bio || "这个角色还没有填写简介。"}</p></div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-4"><div className="flex items-center gap-2 text-xs font-semibold text-primary"><GraduationCap className="h-4 w-4" />学术所属</div><p className="mt-2 text-sm leading-6 text-on-surface">{profile.academic_affiliation || "暂未填写"}</p></div><div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-4"><div className="flex items-center gap-2 text-xs font-semibold text-primary"><Hash className="h-4 w-4" />关注方向</div><div className="mt-2 flex flex-wrap gap-2">{profile.focus_tags.length > 0 ? profile.focus_tags.map((tag) => <span key={tag} className="tag-chip px-2 py-1 text-xs">{tag}</span>) : <span className="text-sm text-on-surface-variant">暂未填写</span>}</div></div></div>
          </section>
        </div>
      </PageShell>
    </>
  );
}
