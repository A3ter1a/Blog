"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Save, RotateCcw, X, Image as ImageIcon, Sparkles } from "lucide-react";
import { Subject, subjectMap, NoteType, typeMap, Video, Problem } from "@/lib/types";
import { notesApi } from "@/lib/supabase";
import { Playlist } from "@/components/video/Playlist";
import { ProblemEditor } from "@/components/problems/ProblemEditor";
import { fileToDataUrl } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { RichTextEditor, RichTextEditorRef } from "@/components/editor/RichTextEditor";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { ContentPreview } from "@/components/ui/ContentPreview";
import { FormulaFixer } from "@/components/editor/FormulaFixer";
import { uploadImage, generateFileName } from "@/lib/supabase-storage";

export default function CreatePage() {
  const router = useRouter();
  const toast = useToast();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string>("");
  const [noteType, setNoteType] = useState<NoteType>("note");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<Subject>("math");
  const [tagInput, setTagInput] = useState("");
  const [content, setContent] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [coverImage, setCoverImage] = useState("");
  const [showVideoSection, setShowVideoSection] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [showFormulaFixer, setShowFormulaFixer] = useState(false);
  const editorRef = useRef<RichTextEditorRef>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);

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

  // Check editor readiness on mount
  useEffect(() => {
    const timer = setInterval(() => {
      if (editorRef.current?.editor) {
        setEditorReady(true);
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // Load note data if in edit mode or import mode
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const editId = searchParams.get("edit");
    const importMode = searchParams.get("import");
    
    if (editId) {
      notesApi.getById(editId).then((existingNote) => {
        if (existingNote) {
          setIsEditMode(true);
          setEditingId(editId);
          setNoteType(existingNote.type);
          setTitle(existingNote.title);
          setSubject(existingNote.subject || "math");
          setTagInput(existingNote.tags.join(", "));
          setContent(existingNote.content);
          setVideos(existingNote.videos || []);
          setProblems(existingNote.problems || []);
          setCoverImage(existingNote.coverImage || "");
        }
      }).catch((error) => {
        console.error("Failed to load note:", error);
        toast.error("加载笔记失败");
      });
    } else if (importMode) {
      // Import mode: load data from sessionStorage
      const importData = sessionStorage.getItem('pendingImport');
      if (importData) {
        try {
          const parsed = JSON.parse(importData);
          setTitle(parsed.title || "");
          setContent(parsed.content || "");
          setTagInput((parsed.tags || []).join(", "));
          
          if (parsed.noteType) setNoteType(parsed.noteType);
          if (parsed.subject) setSubject(parsed.subject);
          if (parsed.problems && parsed.problems.length > 0) {
            setProblems(parsed.problems);
          }
          
          toast.success('已自动填充导入内容，请检查后发布');
          sessionStorage.removeItem('pendingImport');
        } catch (e) {
          console.error('Failed to parse import data:', e);
        }
      }
    }
  }, []);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("请输入标题");
      return;
    }

    const tags = tagInput.split(/[,，]/).map(t => t.trim()).filter(Boolean);

    const noteData = {
      noteType,
      title,
      subject: noteType === "essay" ? undefined : subject,
      tags,
      content,
      videos,
      problems: noteType === "problem" ? problems : undefined,
      coverImage: coverImage || undefined,
    };

    try {
      if (isEditMode) {
        await notesApi.update(editingId, {
          type: noteData.noteType,
          title: noteData.title,
          subject: noteData.subject,
          tags: noteData.tags,
          content: noteData.content,
          videos: noteData.videos,
          problems: noteData.problems,
          coverImage: noteData.coverImage,
        });
        toast.success("笔记已更新！");
        router.push(`/notes/${editingId}`);
      } else {
        const newNote = await notesApi.create({
          type: noteData.noteType,
          title: noteData.title,
          subject: noteData.subject,
          tags: noteData.tags,
          content: noteData.content,
          videos: noteData.videos,
          problems: noteData.problems,
          coverImage: noteData.coverImage,
          isPublished: true,
        });
        toast.success("笔记已创建！");
        router.push(`/notes/${newNote.id}`);
      }
    } catch (error: any) {
      console.error("Failed to save note:", error);
      toast.error(`保存失败：${error.message || "未知错误"}`);
    }
  };

  const handleClear = () => {
    setTitle("");
    setContent("");
    setTagInput("");
    setVideos([]);
    setProblems([]);
  };

  // Editor toolbar handlers - only complex operations remain
  const handleEditorImageUpload = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const path = generateFileName("note", file.name.split(".").pop() || "png");
        const url = await uploadImage(file, path);
        editorRef.current?.insertImage(url);
        toast.success("图片已插入");
      } catch (err: any) {
        toast.error(`图片上传失败：${err.message}`);
      }
    };
    input.click();
  };

  const isEssay = noteType === "essay";
  const isProblem = noteType === "problem";

  return (
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
          className="mb-6"
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
          className="mb-6"
        >
          <label className="block text-sm font-medium text-on-surface-variant mb-3">
            封面图片（可选）
          </label>
          <div className="flex gap-3 items-start">
            <input
              type="text"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="输入图片 URL..."
              className="flex-1 px-4 py-3 bg-surface-container-low rounded-xl input-soft text-on-surface placeholder:text-on-surface-variant/40"
            />
            <label
              className="p-3 rounded-xl bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer flex-shrink-0"
              title="上传图片"
            >
              <ImageIcon className="w-5 h-5" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const dataUrl = await fileToDataUrl(file);
                    setCoverImage(dataUrl);
                  }
                }}
              />
            </label>
            {coverImage && (
              <button
                type="button"
                onClick={() => setCoverImage("")}
                className="p-3 rounded-xl bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          {coverImage && (
            <div className="mt-3 rounded-xl overflow-hidden max-h-48">
              <img src={coverImage} alt="封面预览" className="w-full h-48 object-cover" />
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
            <div className="bg-surface-container-low rounded-xl p-4">
              <ProblemEditor problems={problems} onChange={setProblems} />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-on-surface-variant">
                  内容
                </label>
                <div className="flex items-center gap-2">
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
                  <span className="text-xs text-on-surface-variant/40">编辑 · 预览</span>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Editor Panel */}
                <div className="flex flex-col">
                  <div className="sticky top-24 z-30 mb-2">
                    {editorReady && (
                      <EditorToolbar
                        editor={editorRef.current?.editor ?? null}
                        onImageUpload={handleEditorImageUpload}
                      />
                    )}
                  </div>
                  <div
                    ref={editorScrollRef}
                    onScroll={handleEditorScroll}
                    className="overflow-y-auto rounded-xl border border-outline-variant/20 bg-surface-container-low
                      [&::-webkit-scrollbar]:w-1.5
                      [&::-webkit-scrollbar-thumb]:bg-outline-variant/30
                      [&::-webkit-scrollbar-thumb]:rounded-full"
                    style={{ maxHeight: 'calc(100vh - 500px)', minHeight: '400px' }}
                  >
                    <RichTextEditor
                      ref={editorRef}
                      content={content}
                      onChange={setContent}
                      placeholder={isEssay ? "记录你的想法..." : "在此输入内容，支持 Markdown 语法..."}
                    />
                    {/* Character Count */}
                    <div className="flex justify-between items-center px-4 pb-2 text-xs text-on-surface-variant/60">
                      <span>
                        字数: {content.replace(/\s/g, "").length.toLocaleString()} |
                        字符: {content.length.toLocaleString()}
                      </span>
                      <span>Markdown</span>
                    </div>
                  </div>
                </div>

                {/* Preview Panel */}
                <div className="flex flex-col">
                  <div className="mb-2 text-xs font-medium text-on-surface-variant/40">
                    实时预览
                  </div>
                  <div
                    ref={previewScrollRef}
                    onScroll={handlePreviewScroll}
                    className="overflow-y-auto rounded-xl border border-outline-variant/20 bg-surface-container-low
                      [&::-webkit-scrollbar]:w-1.5
                      [&::-webkit-scrollbar-thumb]:bg-outline-variant/30
                      [&::-webkit-scrollbar-thumb]:rounded-full"
                    style={{ maxHeight: 'calc(100vh - 500px)', minHeight: '400px' }}
                  >
                    <div className="p-6">
                      <ContentPreview content={content} className="text-on-surface-variant" />
                    </div>
                  </div>
                </div>
              </div>
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
            className="px-6 py-3 rounded-xl bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-all duration-300 flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            清空
          </button>
          <button
            onClick={handleSave}
            className="px-8 py-3 rounded-xl editorial-gradient text-on-primary font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-300 shadow-elevated shadow-primary/10 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            发布
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
    </main>
  );
}
