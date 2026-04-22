"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, Strikethrough, List, ListOrdered, Quote,
  Heading1, Heading2, Heading3, Code, Code2, Link as LinkIcon,
  Minus, Image as ImageIcon, Undo, Redo, Highlighter,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface EditorToolbarProps {
  editor: Editor | null;
  onImageUpload: () => void;
  onFormulaToImage: () => void;
  onSketchUpload: () => void;
  onQuestionInsert: () => void;
}

export function EditorToolbar({
  editor,
  onImageUpload,
  onFormulaToImage,
  onSketchUpload,
  onQuestionInsert,
}: EditorToolbarProps) {
  if (!editor) return null;

  const btnClass = (active: boolean, disabled: boolean) =>
    `p-2 rounded-lg transition-colors ${
      disabled
        ? "opacity-40 cursor-not-allowed text-on-surface-variant/40"
        : active
        ? "bg-primary/10 text-primary"
        : "hover:bg-surface-container-high text-on-surface-variant"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 bg-surface-container-low border border-outline-variant/20 rounded-t-xl border-b-0">
      {/* Undo / Redo */}
      <ToolbarBtn
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        tooltip="撤销 (Ctrl+Z)"
      >
        <Undo className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        tooltip="重做 (Ctrl+Y)"
      >
        <Redo className="w-4 h-4" />
      </ToolbarBtn>

      <div className="w-px h-6 bg-outline-variant/20 mx-1" />

      {/* Text Formatting */}
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        tooltip="加粗 (Ctrl+B)"
      >
        <Bold className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        tooltip="斜体 (Ctrl+I)"
      >
        <Italic className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        tooltip="删除线"
      >
        <Strikethrough className="w-4 h-4" />
      </ToolbarBtn>

      <div className="w-px h-6 bg-outline-variant/20 mx-1" />

      {/* Headings */}
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        tooltip="一级标题"
      >
        <Heading1 className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        tooltip="二级标题"
      >
        <Heading2 className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        tooltip="三级标题"
      >
        <Heading3 className="w-4 h-4" />
      </ToolbarBtn>

      <div className="w-px h-6 bg-outline-variant/20 mx-1" />

      {/* Lists & Blockquote */}
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        tooltip="无序列表"
      >
        <List className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        tooltip="有序列表"
      >
        <ListOrdered className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        tooltip="引用"
      >
        <Quote className="w-4 h-4" />
      </ToolbarBtn>

      <div className="w-px h-6 bg-outline-variant/20 mx-1" />

      {/* Code */}
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
        tooltip="行内代码"
      >
        <Code className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        tooltip="代码块"
      >
        <Code2 className="w-4 h-4" />
      </ToolbarBtn>

      <div className="w-px h-6 bg-outline-variant/20 mx-1" />

      {/* Highlight */}
      <HighlightColorPicker editor={editor} />

      <div className="w-px h-6 bg-outline-variant/20 mx-1" />

      {/* Link & Horizontal Rule */}
      <ToolbarBtn
        onClick={() => {
          const url = window.prompt("输入链接地址:");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        active={editor.isActive("link")}
        tooltip="插入链接"
      >
        <LinkIcon className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        tooltip="分割线"
      >
        <Minus className="w-4 h-4" />
      </ToolbarBtn>

      <div className="w-px h-6 bg-outline-variant/20 mx-1" />

      {/* Advanced Features */}
      <ToolbarBtn onClick={onImageUpload} tooltip="插入图片" accent>
        <ImageIcon className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn onClick={onFormulaToImage} tooltip="公式转图片" accent>
        <span className="text-sm font-serif font-bold">Σ</span>
      </ToolbarBtn>
      <ToolbarBtn onClick={onSketchUpload} tooltip="AI 草图识别" accent>
        <span className="text-sm font-bold">AI</span>
      </ToolbarBtn>
      <ToolbarBtn onClick={onQuestionInsert} tooltip="插入题目" accent>
        <span className="text-sm font-bold">题</span>
      </ToolbarBtn>
    </div>
  );
}

interface ToolbarBtnProps {
  onClick: () => void;
  tooltip: string;
  active?: boolean;
  disabled?: boolean;
  accent?: boolean;
  children: React.ReactNode;
}

function ToolbarBtn({ onClick, tooltip, active, disabled, accent, children }: ToolbarBtnProps) {
  const baseClass = "p-2 rounded-lg transition-colors";
  const stateClass = disabled
    ? "opacity-40 cursor-not-allowed text-on-surface-variant/40"
    : active
    ? "bg-primary/10 text-primary"
    : accent
    ? "hover:bg-secondary/10 text-secondary"
    : "hover:bg-surface-container-high text-on-surface-variant";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      title={tooltip}
      disabled={disabled}
      className={`${baseClass} ${stateClass}`}
    >
      {children}
    </button>
  );
}

const HIGHLIGHT_COLORS = [
  { color: "#fef08a", label: "黄色" },
  { color: "#bbf7d0", label: "绿色" },
  { color: "#bfdbfe", label: "蓝色" },
  { color: "#fecaca", label: "红色" },
  { color: "#fbcfe8", label: "粉色" },
  { color: "#e9d5ff", label: "紫色" },
  { color: "#fed7aa", label: "橙色" },
  { color: "#ccfbf1", label: "青色" },
];

interface HighlightColorPickerProps {
  editor: Editor;
}

function HighlightColorPicker({ editor }: HighlightColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isActive = editor.isActive("highlight");

  return (
    <div className="relative" ref={dropdownRef}>
      <ToolbarBtn
        onClick={() => {
          if (isActive) {
            editor.chain().focus().unsetHighlight().run();
          } else {
            setIsOpen(!isOpen);
          }
        }}
        active={isActive}
        tooltip="文本高亮"
      >
        <Highlighter className="w-4 h-4" />
      </ToolbarBtn>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-surface-container-lowest rounded-lg shadow-elevated border border-outline-variant/20 z-50">
          <div className="grid grid-cols-4 gap-1">
            {HIGHLIGHT_COLORS.map(({ color, label }) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  editor.chain().focus().toggleHighlight({ color }).run();
                  setIsOpen(false);
                }}
                className="w-8 h-8 rounded-md border border-outline-variant/30 hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
                title={label}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
