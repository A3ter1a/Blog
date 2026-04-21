"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Save, RotateCcw, X, Image as ImageIcon, Sparkles, Plus } from "lucide-react";
import { Subject, subjectMap, NoteType, typeMap, Video, Problem } from "@/lib/types";
import { mockNotes } from "@/lib/mock-data";
import { Playlist } from "@/components/video/Playlist";
import { ProblemEditor } from "@/components/problems/ProblemEditor";
import { chatWithAI } from "@/lib/ai";
import { fileToDataUrl } from "@/lib/utils";
import { useClickOutside } from "@/lib/hooks";
import { useToast } from "@/components/ui/Toast";
import { RichTextEditor, RichTextEditorRef } from "@/components/editor/RichTextEditor";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { FormulaToImage } from "@/components/editor/FormulaToImage";
import { SketchUploader } from "@/components/editor/SketchUploader";
import { uploadImage, generateFileName } from "@/lib/supabase-storage";
import { DiffViewer } from "@/components/ui/DiffViewer";

const tagSuggestionsBySubject: Record<Subject, string[]> = {
  math: ['极限', '连续', '导数', '积分', '微分方程', '线性代数', '矩阵', '秩', '特征值', '特征向量', '概率论', '条件概率', '贝叶斯', '随机变量'],
  english: ['阅读理解', '长难句', '语法', '词汇', '作文', '翻译', '完形填空', '新题型'],
  politics: ['马原', '毛概', '史纲', '思修', '辩证法', '唯物论', '认识论', '政治经济学'],
  economics: ['微观经济学', '宏观经济学', '消费者行为', '效用', '市场结构', 'GDP', '通货膨胀', '财政政策'],
};

const essayTags = ['心情', '感悟', '日常', '思考', '随笔', '生活', '读书', '旅行'];

export default function CreatePage() {
  const router = useRouter();
  const toast = useToast();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string>("");
  const [noteType, setNoteType] = useState<NoteType>("note");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<Subject>("math");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [editableTags, setEditableTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [content, setContent] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [coverImage, setCoverImage] = useState("");
  const [showVideoSection, setShowVideoSection] = useState(false);
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [showSketchModal, setShowSketchModal] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [originalContent, setOriginalContent] = useState("");
  const [polishedContent, setPolishedContent] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichTextEditorRef>(null);

  // Load note data if in edit mode or import mode
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const editId = searchParams.get("edit");
    const importMode = searchParams.get("import");
    
    if (editId) {
      const existingNote = mockNotes.find((n) => n.id === editId);
      if (existingNote) {
        setIsEditMode(true);
        setEditingId(editId);
        setNoteType(existingNote.type);
        setTitle(existingNote.title);
        setSubject(existingNote.subject || "math");
        setSelectedTags(existingNote.tags);
        setContent(existingNote.content);
        setVideos(existingNote.videos || []);
        setProblems(existingNote.problems || []);
        setCoverImage(existingNote.coverImage || "");
      }
    } else if (importMode) {
      // Import mode: load data from sessionStorage
      const importData = sessionStorage.getItem('pendingImport');
      if (importData) {
        try {
          const parsed = JSON.parse(importData);
          setTitle(parsed.title || "");
          setContent(parsed.content || "");
          setSelectedTags(parsed.tags || []);
          
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

  // Filter suggestions based on input and current type
  const currentTags = noteType === "essay" ? essayTags : (tagSuggestionsBySubject[subject] || []);
  const filteredSuggestions = currentTags.filter(
    (tag) => tag.includes(tagInput) && !selectedTags.includes(tag)
  );

  const addTag = (tag: string) => {
    if (tag && !selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setSelectedTags(selectedTags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      addTag(tagInput.trim());
    }
    if (e.key === "Backspace" && !tagInput && selectedTags.length > 0) {
      removeTag(selectedTags[selectedTags.length - 1]);
    }
  };

  const tagContainerRef = useClickOutside(() => setShowTagSuggestions(false), showTagSuggestions);

  // Tag editing handlers
  const handleStartEditTags = () => {
    setIsEditingTags(true);
    setEditableTags([...selectedTags]);
    setNewTagInput("");
  };

  const handleAddTag = () => {
    const newTag = newTagInput.trim();
    if (newTag && !editableTags.includes(newTag)) {
      setEditableTags([...editableTags, newTag]);
      setNewTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditableTags(editableTags.filter(tag => tag !== tagToRemove));
  };

  const handleSaveTags = () => {
    setSelectedTags(editableTags);
    setIsEditingTags(false);
    setNewTagInput("");
  };

  const handleCancelEditTags = () => {
    setIsEditingTags(false);
    setNewTagInput("");
  };

  const handleSave = () => {
    const noteData = {
      noteType,
      title,
      subject: noteType === "essay" ? undefined : subject,
      tags: selectedTags,
      content,
      videos,
      problems: noteType === "problem" ? problems : undefined,
      coverImage: coverImage || undefined,
    };

    if (isEditMode) {
      const existingNote = mockNotes.find((n) => n.id === editingId);
      if (existingNote) {
        existingNote.type = noteData.noteType;
        existingNote.title = noteData.title;
        existingNote.subject = noteData.subject;
        existingNote.tags = noteData.tags;
        existingNote.content = noteData.content;
        existingNote.videos = noteData.videos;
        existingNote.problems = noteData.problems;
        existingNote.coverImage = noteData.coverImage;
        existingNote.updatedAt = new Date();
      }
      toast.success("笔记已更新！");
      router.push(`/notes/${editingId}`);
    } else {
      const newNote = {
        id: Date.now().toString(),
        type: noteData.noteType,
        title: noteData.title,
        content: noteData.content,
        subject: noteData.subject,
        tags: noteData.tags,
        videos: noteData.videos,
        problems: noteData.problems,
        coverImage: noteData.coverImage,
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublished: true,
      };
      mockNotes.unshift(newNote);
      toast.success("笔记已创建！");
      router.push(`/notes/${newNote.id}`);
    }
  };

  const handleClear = () => {
    setTitle("");
    setContent("");
    setSelectedTags([]);
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

          {/* Tags - With Edit Mode */}
          <div ref={tagContainerRef as React.Ref<HTMLDivElement>} className={isEssay ? "md:col-span-2" : ""}>
            <label className="block text-sm font-medium text-on-surface-variant mb-3">
              标签
            </label>
            {isEditingTags ? (
              // Edit Mode: Show editable tags with input and save/cancel buttons
              <div className="flex items-center gap-2 flex-wrap p-3 bg-surface-container-low rounded-xl">
                {editableTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                  placeholder="添加标签..."
                  className="px-2 py-1 bg-surface-container-lowest rounded-md text-sm min-w-[100px] outline-none focus:ring-1 focus:ring-primary flex-1"
                />
                <button
                  type="button"
                  onClick={handleSaveTags}
                  className="px-3 py-1.5 rounded-md bg-primary text-on-primary text-sm hover:opacity-90 transition-opacity"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={handleCancelEditTags}
                  className="px-3 py-1.5 rounded-md bg-surface-container-high text-on-surface-variant text-sm hover:bg-surface-container-highest transition-colors"
                >
                  取消
                </button>
              </div>
            ) : (
              // View Mode: Show tags with input and edit button inside
              <div className="relative">
                <div
                  className="w-full min-h-[48px] px-4 py-2 bg-surface-container-low rounded-xl border-b-2 border-outline-variant/30 focus-within:border-primary transition-colors duration-200 flex flex-wrap gap-2 items-center cursor-text"
                  onClick={() => tagInputRef.current?.focus()}
                >
                  {selectedTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-sm"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={tagInput}
                    onChange={(e) => {
                      setTagInput(e.target.value);
                      setShowTagSuggestions(true);
                    }}
                    onFocus={() => setShowTagSuggestions(true)}
                    onKeyDown={handleTagKeyDown}
                    placeholder={selectedTags.length === 0 ? "输入或选择标签..." : ""}
                    className="flex-1 min-w-[100px] bg-transparent outline-none text-on-surface placeholder:text-on-surface-variant/40 text-sm"
                  />
                  {/* Edit Button inside the tag container */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEditTags();
                    }}
                    className="flex-shrink-0 p-1.5 rounded-lg text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
                    title="编辑标签"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Tag Suggestions */}
                {showTagSuggestions && (
                  <div className="absolute z-10 w-full mt-1 bg-surface-container-lowest rounded-xl shadow-elevated p-3 max-h-64 overflow-y-auto">
                    <p className="text-xs text-on-surface-variant/60 mb-2">
                      {isEssay ? "常用标签" : `${subjectMap[subject]} 相关标签`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {filteredSuggestions.length > 0 ? (
                        filteredSuggestions.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => addTag(tag)}
                            className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-sm hover:bg-primary/10 hover:text-primary transition-colors duration-200"
                          >
                            {tag}
                          </button>
                        ))
                      ) : (
                        <p className="text-sm text-on-surface-variant/40 py-2">没有匹配的标签</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
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
