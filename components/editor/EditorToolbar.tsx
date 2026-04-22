"use client";

import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Heading3, Image as ImageIcon, Sigma, Palette, FileText } from "lucide-react";

interface EditorToolbarProps {
  onBold: () => void;
  onItalic: () => void;
  onHeading1: () => void;
  onHeading2: () => void;
  onHeading3: () => void;
  onBulletList: () => void;
  onOrderedList: () => void;
  onImageUpload: () => void;
  onFormulaToImage: () => void;
  onSketchUpload: () => void;
  onQuestionInsert: () => void;
}

export function EditorToolbar({
  onBold,
  onItalic,
  onHeading1,
  onHeading2,
  onHeading3,
  onBulletList,
  onOrderedList,
  onImageUpload,
  onFormulaToImage,
  onSketchUpload,
  onQuestionInsert,
}: EditorToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 p-2 bg-surface-container-low border border-outline-variant/20 rounded-t-xl border-b-0">
      {/* Text Formatting */}
      <ToolbarButton onClick={onBold} tooltip="加粗 (Ctrl+B)">
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={onItalic} tooltip="斜体 (Ctrl+I)">
        <Italic className="w-4 h-4" />
      </ToolbarButton>
      
      <div className="w-px h-6 bg-outline-variant/20 mx-1" />
      
      {/* Headings */}
      <ToolbarButton onClick={onHeading1} tooltip="一级标题">
        <Heading1 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={onHeading2} tooltip="二级标题">
        <Heading2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={onHeading3} tooltip="三级标题">
        <Heading3 className="w-4 h-4" />
      </ToolbarButton>
      
      <div className="w-px h-6 bg-outline-variant/20 mx-1" />
      
      {/* Lists */}
      <ToolbarButton onClick={onBulletList} tooltip="无序列表">
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={onOrderedList} tooltip="有序列表">
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>
      
      <div className="w-px h-6 bg-outline-variant/20 mx-1" />
      
      {/* Drawing & AI Features */}
      <ToolbarButton onClick={onImageUpload} tooltip="插入图片" variant="primary">
        <ImageIcon className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={onFormulaToImage} tooltip="公式转图片" variant="accent">
        <Sigma className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={onSketchUpload} tooltip="AI 草图识别" variant="accent">
        <Palette className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={onQuestionInsert} tooltip="插入题目" variant="accent">
        <FileText className="w-4 h-4" />
      </ToolbarButton>
    </div>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  tooltip: string;
  variant?: "default" | "primary" | "accent";
  children: React.ReactNode;
}

function ToolbarButton({ onClick, tooltip, variant = "default", children }: ToolbarButtonProps) {
  const variantClasses = {
    default: "hover:bg-surface-container-high text-on-surface-variant",
    primary: "hover:bg-primary/10 text-primary",
    accent: "hover:bg-secondary/10 text-secondary",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={`p-2 rounded-lg transition-colors ${variantClasses[variant]}`}
    >
      {children}
    </button>
  );
}
