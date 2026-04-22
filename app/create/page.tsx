"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Save, RotateCcw, X, Image as ImageIcon, Sparkles, Plus } from "lucide-react";
import { Subject, subjectMap, NoteType, typeMap, Video, Problem } from "@/lib/types";
import { notesApi } from "@/lib/supabase";
import { Playlist } from "@/components/video/Playlist";
import { ProblemEditor } from "@/components/problems/ProblemEditor";
import { chatWithAI } from "@/lib/ai";
import { fileToDataUrl } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { RichTextEditor, RichTextEditorRef } from "@/components/editor/RichTextEditor";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { FormulaToImage } from "@/components/editor/FormulaToImage";
import { SketchUploader } from "@/components/editor/SketchUploader";
import { QuestionInserter } from "@/components/editor/QuestionInserter";
import { uploadImage, generateFileName } from "@/lib/supabase-storage";
import { DiffViewer } from "@/components/ui/DiffViewer";

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
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [showSketchModal, setShowSketchModal] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [originalContent, setOriginalContent] = useState("");
  const [polishedContent, setPolishedContent] = useState("");
  const editorRef = useRef<RichTextEditorRef>(null);

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
    console.log("Saving note with tags:", tags);

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

  const [isPolishing, setIsPolishing] = useState(false);

  const handlePolish = async () => {
    if (!content.trim()) {
      toast.info("请先输入内容");
      return;
    }
    setIsPolishing(true);
    setOriginalContent(content);
    try {
      const result = await chatWithAI(
        `请对以下笔记内容进行润色，要求：
1. 优化语言表达，使其更加流畅、专业
2. 保持原有结构和核心内容不变
3. 修正语法错误和不通顺的句子
4. 如果是数学内容，确保公式格式正确（$$ 包裹的 LaTeX）
5. 返回润色后的完整 Markdown 内容

原始内容：
${content}`,
        content
      );
      setPolishedContent(result);
      setShowDiffModal(true);
    } catch (error: any) {
      toast.error(`润色失败：${error.message}`);
    } finally {
      setIsPolishing(false);
    }
  };

  const handleApplyPolished = () => {
    setContent(polishedContent);
    setShowDiffModal(false);
    toast.success("已应用润色结果");
  };

  // Editor toolbar handlers
  const handleEditorBold = () => editorRef.current?.insertContent("**bold**");
  const handleEditorItalic = () => editorRef.current?.insertContent("*italic*");
  const handleEditorH1 = () => editorRef.current?.insertContent("\n# ");
  const handleEditorH2 = () => editorRef.current?.insertContent("\n## ");
  const handleEditorH3 = () => editorRef.current?.insertContent("\n### ");
  const handleEditorBulletList = () => editorRef.current?.insertContent("\n- ");
  const handleEditorOrderedList = () => editorRef.current?.insertContent("\n1. ");
  
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

  const handleFormulaInsert = (imageUrl: string) => {
    editorRef.current?.insertImage(imageUrl);
    toast.success("公式图片已插入");
  };

  const handleSketchInsert = (imageUrl: string) => {
    editorRef.current?.insertImage(imageUrl);
    toast.success("草图识别完成");
  };

  const handleQuestionInsert = (problemNumber: number, problem: Problem) => {
    // Add problem to the problems array
    setProblems([...problems, problem]);
    
    // Insert problem marker into content
    const problemMarker = `\n<!--problem:${problemNumber}-->\n`;
    editorRef.current?.insertContent(problemMarker);
    toast.success(`题目 ${problemNumber} 已插入`);
  };

  const isEssay = noteType === "essay";
  const isProblem = noteType === "problem";

  return (
    <main className="pt-24 pb-20 min-h-screen">
      <div className="max-w-6xl mx-auto px-6">
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
              <label className="block text-sm font-medium text-on-surface-variant mb-3">
                内容（Markdown）
              </label>
              <EditorToolbar
                onBold={handleEditorBold}
                onItalic={handleEditorItalic}
                onHeading1={handleEditorH1}
                onHeading2={handleEditorH2}
                onHeading3={handleEditorH3}
                onBulletList={handleEditorBulletList}
                onOrderedList={handleEditorOrderedList}
                onImageUpload={handleEditorImageUpload}
                onFormulaToImage={() => setShowFormulaModal(true)}
                onSketchUpload={() => setShowSketchModal(true)}
                onQuestionInsert={() => setShowQuestionModal(true)}
              />
              <RichTextEditor
                ref={editorRef}
                content={content}
                onChange={setContent}
                placeholder={isEssay ? "记录你的想法..." : "在此输入内容，支持 Markdown 语法..."}
              />
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
            onClick={handlePolish}
            disabled={isPolishing}
            className="px-6 py-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className={`w-4 h-4 ${isPolishing ? "animate-spin" : ""}`} />
            {isPolishing ? "润色中..." : "润色"}
          </button>
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

      {/* Formula to Image Modal */}
      <FormulaToImage
        isOpen={showFormulaModal}
        onClose={() => setShowFormulaModal(false)}
        onInsert={handleFormulaInsert}
      />

      {/* Sketch Upload Modal */}
      <SketchUploader
        isOpen={showSketchModal}
        onClose={() => setShowSketchModal(false)}
        onInsert={handleSketchInsert}
      />

      {/* Question Inserter Modal */}
      <QuestionInserter
        isOpen={showQuestionModal}
        onClose={() => setShowQuestionModal(false)}
        onInsert={handleQuestionInsert}
        existingProblems={problems}
      />

      {/* Diff Viewer Modal */}
      <DiffViewer
        isOpen={showDiffModal}
        onClose={() => setShowDiffModal(false)}
        original={originalContent}
        polished={polishedContent}
        onApply={handleApplyPolished}
      />
    </main>
  );
}
