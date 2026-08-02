"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ExternalLink, Layers3, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useCollectionWorkspace } from "@/hooks/useCollectionWorkspace";
import { subjectMap, typeMap } from "@/lib/types";
import type { CollectionDetail } from "@/lib/collections-contract";

function statusLabel(published: boolean): string {
  return published ? "已发布" : "私有草稿";
}

export function CollectionWorkspace() {
  const toast = useToast();
  const {
    loading,
    collections,
    availableNotes,
    role,
    error,
    reload,
    getDetail,
    create,
    update,
    remove,
    addNote,
    reorder,
    removeNote,
  } = useCollectionWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedSummary = useMemo(() => collections.find((item) => item.id === selectedId) ?? null, [collections, selectedId]);

  const selectCollection = async (id: string) => {
    setSelectedId(id);
    setBusy(true);
    try {
      const next = await getDetail(id);
      setDetail(next);
      setTitle(next.title);
      setDescription(next.description);
      setSubject(next.subject ?? "");
      setIsPublished(next.isPublished);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "合集详情读取失败");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!selectedId && collections[0]) {
      const timer = window.setTimeout(() => void selectCollection(collections[0].id), 0);
      return () => window.clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- select only the first collection after initial load.
  }, [collections, selectedId]);

  const refreshDetail = async () => {
    if (!selectedId) return;
    const next = await getDetail(selectedId);
    setDetail(next);
    setTitle(next.title);
    setDescription(next.description);
    setSubject(next.subject ?? "");
    setIsPublished(next.isPublished);
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || busy) return;
    setBusy(true);
    try {
      const payload = await create({ title: newTitle.trim(), subject: subject || undefined });
      const created = payload.collection as { id?: string } | undefined;
      setNewTitle("");
      toast.success("合集已创建，可以继续逐篇加入内容");
      if (created?.id) await selectCollection(created.id);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "合集创建失败");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!selectedId || busy) return;
    setBusy(true);
    try {
      await update(selectedId, { title, description, subject: subject || null, isPublished });
      await refreshDetail();
      toast.success("合集信息已保存");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "合集保存失败");
    } finally {
      setBusy(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedId || !selectedNoteId || busy) return;
    setBusy(true);
    try {
      await addNote(selectedId, selectedNoteId);
      await refreshDetail();
      setSelectedNoteId("");
      toast.success("内容已加入合集");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "加入合集失败");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || busy || !window.confirm("确定删除这个合集吗？原文章不会被删除。")) return;
    setBusy(true);
    try {
      await remove(selectedId);
      setDetail(null);
      setSelectedId(null);
      toast.success("合集已删除，文章保持不变");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "合集删除失败");
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    if (!detail || busy) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= detail.items.length) return;
    const current = detail.items[index];
    const target = detail.items[targetIndex];
    setBusy(true);
    try {
      await reorder(detail.id, current.id, target.sortOrder);
      await reorder(detail.id, target.id, current.sortOrder);
      await refreshDetail();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "合集排序失败");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveNote = async (itemId: string) => {
    if (!detail || busy) return;
    setBusy(true);
    try {
      await removeNote(detail.id, itemId);
      await refreshDetail();
      toast.success("内容已从合集移除");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "移除合集内容失败");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="surface-panel flex min-h-64 items-center justify-center gap-3 p-8 text-sm text-on-surface-variant"><Loader2 className="h-5 w-5 animate-spin text-primary" />正在加载合集工作台…</div>;
  if (error || !role) return <section className="surface-panel mx-auto max-w-2xl space-y-4 p-8 text-center"><Layers3 className="mx-auto h-10 w-10 text-primary/45" /><h2 className="font-headline text-xl font-bold text-on-surface">需要登录后管理合集</h2><p className="text-sm leading-6 text-on-surface-variant">{error ?? "管理员或 AI 学科账号才能创建、编辑自己的合集。"}</p><div className="flex flex-wrap items-center justify-center gap-2"><button type="button" onClick={() => void reload()} className="control-button control-button-primary inline-flex px-4 py-2.5 text-sm">重试</button><Link href="/login" className="control-button inline-flex px-4 py-2.5 text-sm">前往登录</Link></div></section>;

  return (
    <div className="space-y-5">
      <section className="surface-panel flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="eyebrow-chip w-fit px-2.5 py-1 text-[11px]">增量整理</p><h2 className="mt-2 font-headline text-xl font-bold text-on-surface">合集工作台</h2><p className="mt-1 text-sm leading-6 text-on-surface-variant">合集只是可编辑目录；文章仍保持独立页面和原有 Markdown 格式。{role === "ai" && " AI 合集需要管理员审核后才能公开。"}</p></div>
        <div className="flex w-full gap-2 sm:w-auto"><input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void handleCreate(); }} className="field-control h-10 min-w-0 flex-1 px-3 text-sm sm:w-56" placeholder="新合集名称" /><button type="button" onClick={() => void handleCreate()} disabled={busy || !newTitle.trim()} className="control-button control-button-primary inline-flex shrink-0 items-center gap-1.5 px-3 text-sm"><Plus className="h-4 w-4" />新建</button></div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="surface-panel p-3">
          <div className="mb-2 flex items-center justify-between px-2"><h3 className="font-semibold text-on-surface">我的可管理合集</h3><span className="text-xs text-on-surface-variant">{collections.length}</span></div>
          {collections.length === 0 ? <p className="px-2 py-8 text-sm leading-6 text-on-surface-variant">还没有合集，从右上角创建第一个。</p> : <div className="space-y-1.5">{collections.map((collection) => <button type="button" key={collection.id} onClick={() => void selectCollection(collection.id)} className={`w-full rounded-xl border px-3 py-3 text-left transition ${collection.id === selectedId ? "border-primary/40 bg-primary/5" : "border-transparent hover:border-outline-variant/25 hover:bg-surface-container-low"}`}><span className="block truncate text-sm font-semibold text-on-surface">{collection.title}</span><span className="mt-1 flex items-center justify-between text-xs text-on-surface-variant"><span>{collection.itemCount} 篇</span><span>{statusLabel(collection.isPublished)}</span></span></button>)}</div>}
        </aside>

        <section className="surface-panel min-w-0 p-5">
          {!detail ? <div className="flex min-h-80 items-center justify-center text-sm text-on-surface-variant">选择一个合集开始编辑。</div> : <>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Collection metadata</p><h3 className="mt-1 font-headline text-xl font-bold text-on-surface">编辑合集</h3></div><div className="flex gap-2">{detail.isPublished && <Link href={`/collections/${detail.id}`} className="control-button inline-flex items-center gap-1.5 px-3 py-2 text-xs"><ExternalLink className="h-3.5 w-3.5" />查看公开页</Link>}<button type="button" onClick={() => void handleDelete()} disabled={busy} className="control-button control-button-danger inline-flex items-center gap-1.5 px-3 py-2 text-xs"><Trash2 className="h-3.5 w-3.5" />删除合集</button></div></div>
            <div className="grid gap-4 md:grid-cols-2"><label className="block"><span className="field-label">合集名称</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="field-control h-11 w-full px-3 text-sm" /></label><label className="block"><span className="field-label">所属学科</span><select value={subject} onChange={(event) => setSubject(event.target.value)} className="field-control h-11 w-full px-3 text-sm"><option value="">不指定</option><option value="math">{subjectMap.math}</option><option value="english">{subjectMap.english}</option><option value="politics">{subjectMap.politics}</option><option value="economics">{subjectMap.economics}</option></select></label></div>
            <label className="mt-4 block"><span className="field-label">简介</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="field-control min-h-24 w-full resize-y px-3 py-3 text-sm leading-6" placeholder="可选：说明这个合集的范围和阅读顺序。" /></label>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant/15 bg-surface-container-low p-3"><label className={`inline-flex items-center gap-2 text-sm ${role === "ai" ? "text-on-surface-variant" : "text-on-surface"}`}><input type="checkbox" checked={isPublished} onChange={(event) => setIsPublished(event.target.checked)} disabled={role === "ai"} className="h-4 w-4 accent-primary" />公开显示{role === "ai" && "（需管理员发布）"}</label><button type="button" onClick={() => void handleSave()} disabled={busy || !title.trim()} className="control-button control-button-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm"><Save className="h-4 w-4" />保存信息</button></div>

            <div className="mt-6 border-t border-outline-variant/15 pt-5"><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Ordered items</p><h4 className="mt-1 font-headline text-lg font-bold text-on-surface">合集内容</h4></div><span className="text-xs text-on-surface-variant">{detail.items.length} 篇</span></div><div className="flex flex-col gap-2 sm:flex-row"><select value={selectedNoteId} onChange={(event) => setSelectedNoteId(event.target.value)} className="field-control h-10 min-w-0 flex-1 px-3 text-sm"><option value="">选择要加入的文章或题集</option>{availableNotes.filter((note) => !detail.items.some((item) => item.noteId === note.id)).map((note) => <option key={note.id} value={note.id}>{note.title}{note.subject ? ` · ${subjectMap[note.subject]}` : ""}{!note.isPublished ? " · 草稿" : ""}</option>)}</select><button type="button" onClick={() => void handleAddNote()} disabled={busy || !selectedNoteId} className="control-button control-button-primary inline-flex h-10 items-center justify-center gap-1.5 px-3 text-sm"><Plus className="h-4 w-4" />加入合集</button></div>
              {detail.items.length === 0 ? <p className="py-10 text-center text-sm text-on-surface-variant">还没有内容，可以从上面逐篇加入。</p> : <ol className="mt-4 space-y-2">{detail.items.map((item, index) => <li key={item.id} className="flex items-center gap-2 rounded-xl border border-outline-variant/15 bg-surface-container-low p-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1">{item.note ? <><span className="block truncate text-sm font-semibold text-on-surface">{item.note.title}</span><span className="mt-0.5 block text-xs text-on-surface-variant">{typeMap[item.note.type]}{item.note.subject ? ` · ${subjectMap[item.note.subject]}` : ""}</span></> : <span className="text-sm text-on-surface-variant">文章已删除</span>}</span><div className="flex shrink-0 items-center gap-1"><button type="button" title="上移" onClick={() => void handleMove(index, -1)} disabled={busy || index === 0} className="control-button h-8 w-8 p-0"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" title="下移" onClick={() => void handleMove(index, 1)} disabled={busy || index === detail.items.length - 1} className="control-button h-8 w-8 p-0"><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" title="从合集移除" onClick={() => void handleRemoveNote(item.id)} disabled={busy} className="control-button control-button-danger h-8 w-8 p-0"><Trash2 className="h-3.5 w-3.5" /></button></div></li>)}</ol>}
            </div>
          </>}
        </section>
      </div>
      {selectedSummary && <p className="text-xs text-on-surface-variant">最后更新：{new Date(selectedSummary.updatedAt).toLocaleString("zh-CN")}</p>}
    </div>
  );
}
