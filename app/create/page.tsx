"use client";

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import type { Editor } from "@tiptap/react";
import { Save, RotateCcw, X, Image as ImageIcon, Sparkles, FolderTree, Columns, Maximize2, Eye, Loader2 } from "lucide-react";
import { Subject, subjectMap, NoteType, typeMap, Video, Problem } from "@/lib/types";
import { Playlist } from "@/components/video/Playlist";
import { ProblemEditor } from "@/components/problems/ProblemEditor";
import { ChapterManager } from "@/components/chapters/ChapterManager";
import { useToast } from "@/components/ui/Toast";
import { RichTextEditor, RichTextEditorRef } from "@/components/editor/RichTextEditor";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { ContentPreview } from "@/components/ui/ContentPreview";
import { FormulaFixer } from "@/components/editor/FormulaFixer";
import { uploadImage, generateFileName } from "@/lib/supabase-storage";
import { repairMarkdown } from "@/lib/markdown";
import { splitMath3PracticeTags } from "@/lib/math3-practice";
import { AdminGate } from "@/components/auth/AdminGate";
import { useCoverUpload } from "@/hooks/useCoverUpload";
import { useNoteSave } from "@/hooks/useNoteSave";
import { type ImportDraft, type NoteEditorDraft, useNoteEditorRoute } from "@/hooks/useNoteEditorRoute";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPendingImportDraft(): ImportDraft | null {
  if (typeof window === "undefined") return null;

  const searchParams = new URLSearchParams(window.location.search);
  if (!searchParams.get("import")) return null;

  const importData = sessionStorage.getItem("pendingImport");
  if (!importData) return null;

  try {
    const parsed: unknown = JSON.parse(importData);
    if (!isRecord(parsed)) return null;

    return {
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      content: typeof parsed.content === "string" ? parsed.content : undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
      noteType: parsed.noteType === "note" || parsed.noteType === "problem" || parsed.noteType === "essay" ? parsed.noteType : undefined,
      subject: parsed.subject === "math" || parsed.subject === "english" || parsed.subject === "politics" || parsed.subject === "economics" ? parsed.subject : undefined,
      problems: Array.isArray(parsed.problems) ? (parsed.problems as Problem[]) : undefined,
      coverImage: typeof parsed.coverImage === "string" ? parsed.coverImage : undefined,
      videos: Array.isArray(parsed.videos) ? (parsed.videos as Video[]) : undefined,
    };
  } catch (error) {
    console.error("Failed to parse import data:", error);
    return null;
  }
}

export default function CreatePage() {
  const router = useRouter();
  const toast = useToast();
  const [initialImportDraft] = useState<ImportDraft | null>(getPendingImportDraft);
  const [initialImportTagParts] = useState(() => splitMath3PracticeTags(initialImportDraft?.tags));

  const [noteType, setNoteType] = useState<NoteType>(initialImportDraft?.noteType ?? "note");
  const [title, setTitle] = useState(initialImportDraft?.title ?? "");
  const [subject, setSubject] = useState<Subject>(initialImportDraft?.subject ?? "math");
  const [tagInput, setTagInput] = useState(initialImportTagParts.visibleTags.join(", "));
  const [preservedMath3PracticeTags, setPreservedMath3PracticeTags] = useState<string[]>(
    initialImportTagParts.math3PracticeTags
  );
  const [content, setContent] = useState(initialImportDraft?.content ?? "");
  const [videos, setVideos] = useState<Video[]>(initialImportDraft?.videos ?? []);
  const [problems, setProblems] = useState<Problem[]>(initialImportDraft?.problems ?? []);
  const [hasProblemChanges, setHasProblemChanges] = useState(false);
  const {
    coverImage,
    coverPreviewSrc,
    coverUploadError,
    isUploadingCover,
    setCoverImageUrl,
    clearCoverImage,
    handleCoverImageUpload,
  } = useCoverUpload(initialImportDraft?.coverImage ?? "");
  const { isSaving, saveNote } = useNoteSave();
  const [showVideoSection, setShowVideoSection] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [showFormulaFixer, setShowFormulaFixer] = useState(false);
  const [showChapterManager, setShowChapterManager] = useState(false);
  const [viewMode, setViewMode] = useState<"split" | "editor" | "preview">("split");
  const editorRef = useRef<RichTextEditorRef>(null);
  const [toolbarEditor, setToolbarEditor] = useState<Editor | null>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);

  const applyDraft = useCallback((draft: NoteEditorDraft) => {
    setNoteType(draft.noteType);
    setTitle(draft.title);
    setSubject(draft.subject);
    setTagInput(draft.tagInput);
    setContent(draft.content);
    setVideos(draft.videos);
    setProblems(draft.problems);
    setHasProblemChanges(false);
    setCoverImageUrl(draft.coverImage);
    setPreservedMath3PracticeTags(draft.preservedMath3PracticeTags);
  }, [setCoverImageUrl]);

  const resetDraft = useCallback(() => {
    setNoteType("note");
    setTitle("");
    setSubject("math");
    setTagInput("");
    setContent("");
    setVideos([]);
    setProblems([]);
    setHasProblemChanges(false);
    setCoverImageUrl("");
    setPreservedMath3PracticeTags([]);
  }, [setCoverImageUrl]);

  const {
    routeReady,
    isEditMode,
    editingId,
    isLoadingExistingNote,
    loadError,
  } = useNoteEditorRoute({
    initialImportDraft,
    applyDraft,
    resetDraft,
  });

  // Synchronize scroll between editor and preview panels
  const syncScroll = useCallback((source: HTMLDivElement, target: HTMLDivElement) => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;

    const ratio = source.scrollTop / Math.max(1, source.scrollHeight - source.clientHeight);
    target.scrollTop = ratio * Math.max(0, target.scrollHeight - target.clientHeight);

    requestAnimationFrame(() => { isSyncingScroll.current = false; });
  }, []);

  const handleEditorScroll = useCallback(() => {
    if (editorScrollRef.current && previewScrollRef.current) {
      syncScroll(editorScrollRef.current, previewScrollRef.current);
    }
  }, [syncScroll]);

  const handlePreviewScroll = useCallback(() => {
    if (previewScrollRef.current && editorScrollRef.current) {
      syncScroll(previewScrollRef.current, editorScrollRef.current);
    }
  }, [syncScroll]);

  const handleProblemsChange = useCallback((nextProblems: Problem[]) => {
    setProblems(nextProblems);
    setHasProblemChanges(true);
  }, []);

  const handleChapterDeleted = useCallback((chapterId: string) => {
    const affectedCount = problems.filter((problem) => problem.chapterId === chapterId).length;
    if (affectedCount === 0) return;

    setProblems((currentProblems) => currentProblems.map((problem) => {
      if (problem.chapterId !== chapterId) return problem;
      return { ...problem, chapterId: undefined };
    }));

    setHasProblemChanges(true);
    toast.info(`已将 ${affectedCount} 道题移到无章节，保存笔记后生效`);
  }, [problems, toast]);

  const handleAutoRepairMarkdown = useCallback(() => {
    const repaired = repairMarkdown(content);
    if (repaired === content.trim()) {
      toast.info("Markdown 已经很干净");
      return;
    }

    setContent(repaired);
    editorRef.current?.editor?.commands.setContent(repaired);
    toast.success("已自动修正 Markdown 语法");
  }, [content, toast]);

  const handleSave = async () => {
    const result = await saveNote({
      isEditMode,
      editingId,
      noteType,
      title,
      subject,
      tagInput,
      content,
      videos,
      problems,
      coverImage,
      isUploadingCover,
      preservedMath3PracticeTags,
    });

    if (!result) return;
    setHasProblemChanges(false);
    router.push("/notes/" + result.id);
  };

  const handleClear = () => {
    if (isSaving) return;
    resetDraft();
    setHasProblemChanges(true);
  };

  // Editor toolbar handlers - only complex operations remain
  const handleEditorImageUpload = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error("请选择图片文件");
        input.value = "";
        return;
      }
      if (!editorRef.current?.editor) {
        toast.error("编辑器还没有准备好，请稍后再试");
        input.value = "";
        return;
      }

      try {
        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        const path = generateFileName("note", ext);
        const url = await uploadImage(file, path);
        editorRef.current.insertImage(url);
        toast.success("图片已插入");
      } catch (err: unknown) {
        toast.error(`图片上传失败：${err instanceof Error ? err.message : "未知错误"}`);
      } finally {
        input.value = "";
      }
    };
    input.click();
  };

  const isEssay = noteType === "essay";
  const isProblem = noteType === "problem";

  if (!routeReady || isLoadingExistingNote) {
    return (
      <AdminGate>
        <main className="pt-32 pb-20 min-h-screen flex items-center justify-center">
          <div className="flex items-center gap-3 text-on-surface-variant">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span>正在准备编辑器...</span>
          </div>
        </main>
      </AdminGate>
    );
  }

  if (loadError) {
    return (
      <AdminGate>
        <main className="pt-32 pb-20 min-h-screen flex items-center justify-center px-6">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-bold text-on-surface">无法编辑这篇笔记</h1>
            <p className="text-sm text-on-surface-variant">{loadError}</p>
            <button
              type="button"
              onClick={() => router.push("/notes")}
              className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors text-sm font-medium"
            >
              返回笔记列表
            </button>
          </div>
        </main>
      </AdminGate>
    );
  }

  return (
    <AdminGate>
    <main className="pt-24 pb-20 min-h-screen">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-primary font-headline">
            {isEditMode ? "编辑" : "创建新"}{typeMap[noteType]}
          </h1>
        </motion.div>

        {/* Type Selector */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <label className="block text-sm font-medium text-on-surface-variant mb-3">
            类型
          </label>
          <div className="flex gap-3">
            {(["note", "problem", "essay"] as NoteType[]).map((type) => (
              <button
                key={type}
                onClick={() => setNoteType(type)}
                className={`px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                  noteType === type
                    ? "editorial-gradient text-on-primary shadow-ambient"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {typeMap[type]}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Title Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-8"
        >
          <label className="block text-sm font-medium text-on-surface-variant mb-3">
            标题
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入标题..."
            className="w-full px-4 py-3 bg-surface-container-low rounded-xl input-soft text-on-surface placeholder:text-on-surface-variant/40"
          />
        </motion.div>

        {/* Cover Image Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="mb-8"
        >
          <label className="block text-sm font-medium text-on-surface-variant mb-3">
            封面图片（可选）
          </label>
          <div className="flex gap-3 items-start">
            <input
              type="text"
              value={coverImage}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="输入图片 URL..."
              className="flex-1 px-4 py-3 bg-surface-container-low rounded-xl input-soft text-on-surface placeholder:text-on-surface-variant/40"
            />
            <label
              className={`p-3 rounded-xl bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors flex-shrink-0 ${
                isUploadingCover ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
              }`}
              title={isUploadingCover ? "上传中" : "上传图片"}
              aria-disabled={isUploadingCover}
            >
              {isUploadingCover ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploadingCover}
                onChange={handleCoverImageUpload}
              />
            </label>
            {coverImage && (
              <button
                type="button"
                onClick={clearCoverImage}
                className="p-3 rounded-xl bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          {coverUploadError && (
            <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
              {coverUploadError}
            </div>
          )}
          {isUploadingCover && (
            <div className="mt-3 flex items-center gap-2 text-sm text-on-surface-variant/60">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              正在上传封面图片...
            </div>
          )}
          {coverPreviewSrc && (
            <div className="mt-3 rounded-xl overflow-hidden max-h-48">
              {/* eslint-disable-next-line @next/next/no-img-element -- Cover previews can be external URLs or legacy data URLs. */}
              <img src={coverPreviewSrc} alt="封面预览" className="w-full h-48 object-cover" />
            </div>
          )}
        </motion.div>

        {/* Subject & Tags Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid md:grid-cols-2 gap-6 mb-6"
        >
          {/* Subject - Card Grid (hidden for essay) */}
          {!isEssay && (
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-3">
                科目
              </label>
              <div className="grid grid-cols-4 gap-3">
                {(Object.keys(subjectMap) as Subject[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSubject(key)}
                    className={`px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                      subject === key
                        ? "editorial-gradient text-on-primary shadow-ambient"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {subjectMap[key]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tags - Simple comma-separated input */}
          <div className={isEssay ? "md:col-span-2" : ""}>
            <label className="block text-sm font-medium text-on-surface-variant mb-3">
              标签
            </label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="输入标签，用逗号分隔..."
              className="w-full px-4 py-3 bg-surface-container-low rounded-xl input-soft text-on-surface placeholder:text-on-surface-variant/40"
            />
          </div>
        </motion.div>

        {/* Content Editor / Problem Editor */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-8"
        >
          {isProblem ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-on-surface-variant">
                  题目
                </label>
                <button
                  onClick={() => setShowChapterManager(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-all text-xs font-medium"
                >
                  <FolderTree className="w-3.5 h-3.5" />
                  章节管理
                </button>
              </div>
              <ProblemEditor
                problems={problems}
                onChange={handleProblemsChange}
                noteId={isEditMode ? editingId : undefined}
                hasUnsavedChanges={isEditMode && hasProblemChanges}
              />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-on-surface-variant">
                  内容
                </label>
                <div className="flex items-center gap-2">
                  {/* Mode Toggle */}
                  <div className="flex rounded-lg border border-outline-variant/20 overflow-hidden">
                    <button
                      onClick={() => setViewMode("split")}
                      className={`px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                        viewMode === "split"
                          ? "bg-primary/10 text-primary"
                          : "text-on-surface-variant hover:bg-surface-container-high"
                      }`}
                    >
                      <Columns className="w-3.5 h-3.5" />
                      分屏
                    </button>
                    <button
                      onClick={() => setViewMode("editor")}
                      className={`px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                        viewMode === "editor"
                          ? "bg-primary/10 text-primary"
                          : "text-on-surface-variant hover:bg-surface-container-high"
                      }`}
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      仅编辑
                    </button>
                    <button
                      onClick={() => setViewMode("preview")}
                      className={`px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                        viewMode === "preview"
                          ? "bg-primary/10 text-primary"
                          : "text-on-surface-variant hover:bg-surface-container-high"
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      仅预览
                    </button>
                  </div>
                  <button
                    onClick={() => setShowFormulaFixer(true)}
                    disabled={!editorReady || content.length === 0}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium
                      bg-amber-50 border border-amber-200 text-amber-700
                      hover:bg-amber-100 transition-colors
                      disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    修正公式
                  </button>
                  <button
                    onClick={handleAutoRepairMarkdown}
                    disabled={content.length === 0}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium
                      bg-primary/10 border border-primary/15 text-primary
                      hover:bg-primary/15 transition-colors
                      disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    自动修正 Markdown
                  </button>
                </div>
              </div>

              {viewMode === "split" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Editor Panel */}
                  <div
                    className="flex flex-col rounded-xl border border-outline-variant/20 bg-surface-container-low overflow-hidden"
                    style={{ maxHeight: 'calc(100vh - 500px)', minHeight: '400px' }}
                  >
                    {/* Sticky Toolbar */}
                    {editorReady && (
                      <div className="sticky top-0 z-10 shrink-0 border-b border-outline-variant/20">
                        <EditorToolbar
                          editor={toolbarEditor}
                          onImageUpload={handleEditorImageUpload}
                        />
                      </div>
                    )}
                    {/* Scrollable Editor */}
                    <div
                      ref={editorScrollRef}
                      onScroll={handleEditorScroll}
                      className="overflow-y-auto flex-1 min-h-0
                        [&::-webkit-scrollbar]:w-1.5
                        [&::-webkit-scrollbar-thumb]:bg-outline-variant/30
                        [&::-webkit-scrollbar-thumb]:rounded-full"
                    >
                      <RichTextEditor
                        ref={editorRef}
                        content={content}
                        onChange={setContent}
                        onReady={(editor) => {
                          setEditorReady(true);
                          setToolbarEditor(editor);
                        }}
                        placeholder={isEssay ? "记录你的想法..." : "在此输入内容，支持 Markdown 语法..."}
                      />
                      {/* Character Count */}
                      <div className="flex justify-between items-center px-6 pb-3 text-xs text-on-surface-variant/60">
                        <span>
                          字数: {content.replace(/\s/g, "").length.toLocaleString()} |
                          字符: {content.length.toLocaleString()}
                        </span>
                        <span>Markdown</span>
                      </div>
                    </div>
                  </div>

                  {/* Preview Panel */}
                  <div
                    className="flex flex-col rounded-xl border border-outline-variant/20 bg-surface-container-low overflow-hidden"
                    style={{ maxHeight: 'calc(100vh - 500px)', minHeight: '400px' }}
                  >
                    {/* Preview Header */}
                    <div className="shrink-0 border-b border-outline-variant/20 px-4 py-2 flex items-center" style={{ minHeight: '48px' }}>
                      <span className="text-xs font-medium text-on-surface-variant/40">实时预览</span>
                    </div>
                    {/* Scrollable Preview */}
                    <div
                      ref={previewScrollRef}
                      onScroll={handlePreviewScroll}
                      className="overflow-y-auto flex-1 min-h-0
                        [&::-webkit-scrollbar]:w-1.5
                        [&::-webkit-scrollbar-thumb]:bg-outline-variant/30
                        [&::-webkit-scrollbar-thumb]:rounded-full"
                    >
                      <div className="p-6">
                        <ContentPreview content={content} className="text-on-surface-variant" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {viewMode === "editor" && (
                <div
                  className="flex flex-col rounded-xl border border-outline-variant/20 bg-surface-container-low overflow-hidden"
                  style={{ maxHeight: 'calc(100vh - 400px)', minHeight: '500px' }}
                >
                  {editorReady && (
                    <div className="sticky top-0 z-10 shrink-0 border-b border-outline-variant/20">
                      <EditorToolbar
                        editor={toolbarEditor}
                        onImageUpload={handleEditorImageUpload}
                      />
                    </div>
                  )}
                  <div
                    ref={editorScrollRef}
                    className="overflow-y-auto flex-1 min-h-0
                      [&::-webkit-scrollbar]:w-1.5
                      [&::-webkit-scrollbar-thumb]:bg-outline-variant/30
                      [&::-webkit-scrollbar-thumb]:rounded-full"
                  >
                    <RichTextEditor
                      ref={editorRef}
                      content={content}
                      onChange={setContent}
                      onReady={(editor) => {
                        setEditorReady(true);
                        setToolbarEditor(editor);
                      }}
                      placeholder={isEssay ? "记录你的想法..." : "在此输入内容，支持 Markdown 语法..."}
                    />
                    <div className="flex justify-between items-center px-6 pb-3 text-xs text-on-surface-variant/60">
                      <span>
                        字数: {content.replace(/\s/g, "").length.toLocaleString()} |
                        字符: {content.length.toLocaleString()}
                      </span>
                      <span>Markdown</span>
                    </div>
                  </div>
                </div>
              )}

              {viewMode === "preview" && (
                <div className="py-6">
                  <ContentPreview content={content} className="text-on-surface-variant text-lg leading-relaxed" />
                </div>
              )}
            </>
          )}
        </motion.div>

        {/* Video Section (hidden for essay) */}
        {!isEssay && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-medium text-on-surface-variant">
                关联视频（可选）
              </label>
              <button
                onClick={() => setShowVideoSection(!showVideoSection)}
                className="text-sm text-primary hover:text-primary-container transition-colors duration-200"
              >
                {showVideoSection ? "收起" : "展开"}
              </button>
            </div>

            {showVideoSection && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="p-6 bg-surface-container-low rounded-xl overscroll-contain"
              >
                <Playlist
                  videos={videos}
                  onChange={setVideos}
                  editable={true}
                />
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex gap-4 justify-end"
        >
          <button
            onClick={handleClear}
            disabled={isSaving}
            className="px-6 py-3 rounded-xl bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-all duration-300 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-4 h-4" />
            清空
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-8 py-3 rounded-xl editorial-gradient text-on-primary font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-300 shadow-elevated shadow-primary/10 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? "保存中" : isEditMode ? "更新" : "发布"}
          </button>
        </motion.div>
      </div>
      {/* Formula Fixer Dialog */}
      <FormulaFixer
        isOpen={showFormulaFixer}
        onClose={() => setShowFormulaFixer(false)}
        content={content}
        onApplyFixes={(fixedContent) => {
          setContent(fixedContent);
        }}
      />

      {/* Chapter Manager Modal */}
      <ChapterManager
        isOpen={showChapterManager}
        onClose={() => setShowChapterManager(false)}
        noteId={isEditMode ? editingId : undefined}
        onChapterDeleted={handleChapterDeleted}
      />
    </main>
    </AdminGate>
  );
}
