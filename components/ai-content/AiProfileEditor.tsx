"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, UserRound, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { AiWorkspaceProfile } from "@/hooks/useAiContentWorkspace";
import { clearSiteCacheNamespace } from "@/lib/site-cache";

type AiProfileEditorProps = {
  profile: AiWorkspaceProfile;
  onSaved?: () => void | Promise<void>;
};

type ProfileDraft = {
  display_name: string;
  avatar_url: string;
  bio: string;
  academic_affiliation: string;
  focus_tags: string;
};

function toDraft(profile: AiWorkspaceProfile): ProfileDraft {
  return {
    display_name: profile.display_name,
    avatar_url: profile.avatar_url ?? "",
    bio: profile.bio,
    academic_affiliation: profile.academic_affiliation,
    focus_tags: profile.focus_tags.join(", "),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readError(value: unknown): string {
  return isRecord(value) && typeof value.error === "string" ? value.error : "角色资料保存失败，请稍后重试";
}

export function AiProfileEditor({ profile, onSaved }: AiProfileEditorProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => toDraft(profile));
  const [saving, setSaving] = useState(false);

  const updateDraft = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetchWithAuth("/api/ai/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: draft.display_name,
          avatar_url: draft.avatar_url,
          bio: draft.bio,
          academic_affiliation: draft.academic_affiliation,
          focus_tags: draft.focus_tags.split(/[,，]/),
        }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(payload));
      clearSiteCacheNamespace("note-author");
      setOpen(false);
      toast.success("角色资料已保存，文章作者卡片会同步更新");
      await onSaved?.();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "角色资料保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="control-button inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm"
        onClick={() => {
          setDraft(toDraft(profile));
          setOpen(true);
        }}
      >
        <Pencil className="h-4 w-4" />
        编辑角色资料
      </button>
    );
  }

  return (
    <section className="surface-panel border-primary/20 bg-primary/[0.025] p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <UserRound className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">角色资料</p>
          </div>
          <h3 className="mt-1 font-headline text-lg font-semibold text-on-surface">填写文章作者会展示的资料</h3>
          <p className="mt-1 text-sm leading-6 text-on-surface-variant">
            这里填写头像、角色名、简介和学术所属；保存后，点击文章作者头像或名字即可进入你的资料页。账号身份和学科归属不能在这里修改。
          </p>
        </div>
        <button
          type="button"
          className="control-button inline-flex h-9 w-9 shrink-0 items-center justify-center p-0"
          aria-label="关闭角色资料编辑"
          onClick={() => setOpen(false)}
          disabled={saving}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="field-label">角色名</span>
          <input
            value={draft.display_name}
            onChange={(event) => updateDraft("display_name", event.target.value)}
            className="field-control h-11 w-full px-3 text-sm"
            maxLength={80}
            placeholder="例如：守岸人"
          />
        </label>
        <label className="block">
          <span className="field-label">头像地址（可选）</span>
          <input
            value={draft.avatar_url}
            onChange={(event) => updateDraft("avatar_url", event.target.value)}
            className="field-control h-11 w-full px-3 text-sm"
            maxLength={500}
            placeholder="https://…"
            inputMode="url"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="field-label">个人简介</span>
          <textarea
            value={draft.bio}
            onChange={(event) => updateDraft("bio", event.target.value)}
            className="field-control min-h-28 w-full resize-y px-3 py-2.5 text-sm leading-6"
            maxLength={2_000}
            placeholder="介绍你的角色定位、教学方式和擅长内容…"
          />
        </label>
        <label className="block">
          <span className="field-label">学术所属</span>
          <input
            value={draft.academic_affiliation}
            onChange={(event) => updateDraft("academic_affiliation", event.target.value)}
            className="field-control h-11 w-full px-3 text-sm"
            maxLength={200}
            placeholder="例如：经济学 · 微观经济学"
          />
        </label>
        <label className="block">
          <span className="field-label">关注方向（逗号分隔）</span>
          <input
            value={draft.focus_tags}
            onChange={(event) => updateDraft("focus_tags", event.target.value)}
            className="field-control h-11 w-full px-3 text-sm"
            placeholder="例如：宏观经济, 图表分析"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-on-surface-variant">头像留空时会使用角色名首字显示。</span>
        <button type="button" className="control-button px-4 py-2.5 text-sm" onClick={() => setOpen(false)} disabled={saving}>取消</button>
        <button type="button" className="control-button control-button-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? "保存中…" : "保存资料"}
        </button>
      </div>
    </section>
  );
}
