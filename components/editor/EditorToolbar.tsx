"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, Strikethrough, List, ListOrdered, Quote,
  Heading1, Heading2, Heading3, Code, Code2, Link as LinkIcon,
  Minus, Image as ImageIcon, Undo, Redo, Highlighter, FileText, ListChecks, Divide,
  IndentDecrease, IndentIncrease,
} from "lucide-react";
import { useState } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";

interface EditorToolbarProps {
  editor: Editor | null;
  onImageUpload: () => void;
}

export function EditorToolbar({
  editor,
  onImageUpload,
}: EditorToolbarProps) {
  if (!editor) return null;

  const isInsideList = editor.isActive("bulletList") || editor.isActive("orderedList");
  const toggleList = (kind: "bullet" | "ordered") => {
    const chain = editor.chain().focus();
    if (!isInsideList) {
      chain.clearNodes();
    }

    if (kind === "bullet") {
      chain.toggleBulletList().run();
      return;
    }

    chain.toggleOrderedList().run();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-2 py-2">
      <ToolbarGroup label="历史">
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
      </ToolbarGroup>

      <ToolbarGroup label="文字">
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
      </ToolbarGroup>

      <ToolbarGroup label="标题">
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
      </ToolbarGroup>

      <ToolbarGroup label="段落结构">
        <ToolbarBtn
          onClick={() => toggleList("bullet")}
          active={editor.isActive("bulletList")}
          tooltip="无序列表"
        >
          <List className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => toggleList("ordered")}
          active={editor.isActive("orderedList")}
          tooltip="有序列表"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().liftListItem("listItem").run()}
          disabled={!isInsideList || !editor.can().liftListItem("listItem")}
          tooltip="减少列表缩进"
        >
          <IndentDecrease className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
          disabled={!isInsideList || !editor.can().sinkListItem("listItem")}
          tooltip="增加列表缩进"
        >
          <IndentIncrease className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          tooltip="引用"
        >
          <Quote className="w-4 h-4" />
        </ToolbarBtn>
      </ToolbarGroup>

      <ToolbarGroup label="代码与高亮">
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
        <HighlightColorPicker editor={editor} />
      </ToolbarGroup>

      <ToolbarGroup label="插入">
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
        <ToolbarBtn
          onClick={() => editor.chain().focus().insertContent({ type: "dashedSeparator" }).run()}
          tooltip="虚线分隔线"
        >
          <Divide className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn onClick={onImageUpload} tooltip="插入图片" accent>
          <ImageIcon className="w-4 h-4" />
        </ToolbarBtn>
      </ToolbarGroup>

      <ToolbarGroup label="数学笔记">
        <ToolbarBtn
          onClick={() => editor.chain().focus().insertContent("\n\n> **题干：** \n\n").run()}
          tooltip="插入题干区块"
        >
          <FileText className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().insertContent("\n\n> **解答：** \n\n").run()}
          tooltip="插入解答区块"
        >
          <Quote className="w-4 h-4" />
        </ToolbarBtn>
        <StepLabelPicker editor={editor} />
      </ToolbarGroup>
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

function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-0.5 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/75 p-1 shadow-sm"
    >
      {children}
    </div>
  );
}

function ToolbarBtn({ onClick, tooltip, active, disabled, accent, children }: ToolbarBtnProps) {
  const baseClass = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";
  const stateClass = disabled
    ? "opacity-40 cursor-not-allowed text-on-surface-variant/40"
    : active
    ? "border-primary/20 bg-primary/10 text-primary shadow-sm"
    : accent
    ? "text-secondary hover:border-secondary/20 hover:bg-secondary/10 hover:shadow-sm"
    : "text-on-surface-variant hover:border-outline-variant/30 hover:bg-surface-container-high hover:text-on-surface";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      onMouseDown={(event) => event.preventDefault()}
      title={tooltip}
      aria-label={tooltip}
      aria-pressed={active}
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
  const dropdownRef = useClickOutside<HTMLDivElement>(() => setIsOpen(false), isOpen);

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
          <div className="grid grid-cols-4 gap-2">
            {HIGHLIGHT_COLORS.map(({ color, label }) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  editor.chain().focus().setHighlight({ color }).run();
                  setIsOpen(false);
                }}
                className="w-10 h-10 rounded-lg border-2 border-outline-variant/20 hover:border-primary/50 hover:scale-110 transition-all cursor-pointer"
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

// Step Label Picker Component
const STEP_LABELS = [
  "第一步：",
  "第二步：",
  "第三步：",
  "第四步：",
  "第五步：",
  "解：",
  "证明：",
  "因为",
  "所以",
];

interface StepLabelPickerProps {
  editor: Editor;
}

function StepLabelPicker({ editor }: StepLabelPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useClickOutside<HTMLDivElement>(() => setIsOpen(false), isOpen);

  return (
    <div className="relative" ref={dropdownRef}>
      <ToolbarBtn
        onClick={() => setIsOpen(!isOpen)}
        tooltip="插入步骤标签"
      >
        <ListChecks className="w-4 h-4" />
      </ToolbarBtn>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-surface-container-lowest rounded-lg shadow-elevated border border-outline-variant/20 z-50 min-w-[120px]">
          <div className="flex flex-col gap-1">
            {STEP_LABELS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  editor.chain().focus().insertContent(label).run();
                  setIsOpen(false);
                }}
                className="px-3 py-1.5 rounded-md text-sm text-on-surface hover:bg-surface-container-high text-left transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

