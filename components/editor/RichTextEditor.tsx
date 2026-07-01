"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import CharacterCount from "@tiptap/extension-character-count";
import { Markdown } from "tiptap-markdown";
import { useEffect, forwardRef, useImperativeHandle, useRef } from "react";
import { ProblemBlock, parseProblemMarkers } from "@/lib/problem-block-extension";
import { DashedSeparator } from "@/lib/dashed-separator-extension";
import { ColoredHighlight } from "@/lib/colored-highlight-extension";
import { MarkdownImage } from "@/lib/markdown-image-extension";
import { DOMParser, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { repairMarkdown, renderMarkdownToHtml } from "@/lib/markdown";

type MarkdownStorage = {
  markdown: {
    getMarkdown: () => string;
  };
};

export interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  onImageUpload?: (file: File) => Promise<string>;
  onReady?: (editor: Editor) => void;
}

export interface RichTextEditorRef {
  editor: Editor | null;
  insertImage: (url: string) => void;
  insertContent: (content: string) => void;
  insertMarkdown: (content: string) => void;
}

const BODY_INDENT_TEXT = "\u3000\u3000";
const CODE_INDENT_TEXT = "  ";
const INDENT_CANDIDATES = [BODY_INDENT_TEXT, CODE_INDENT_TEXT] as const;
const DATA_IMAGE_PATTERN = /<img\b[^>]*\bsrc=["'](data:image\/[^"']+)["'][^>]*>/gi;

type TextBlockInfo = {
  pos: number;
  node: ProseMirrorNode;
};

function getIndentText(node: ProseMirrorNode): string {
  return node.type.name === "codeBlock" ? CODE_INDENT_TEXT : BODY_INDENT_TEXT;
}

function getSelectedTextBlocks(state: EditorState): TextBlockInfo[] {
  const { selection } = state;

  if (selection.empty) {
    const { $from } = selection;
    if ($from.depth === 0 || !$from.parent.isTextblock) return [];
    return [{ pos: $from.before($from.depth), node: $from.parent }];
  }

  const blocks: TextBlockInfo[] = [];
  state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (!node.isTextblock) return true;
    blocks.push({ pos, node });
    return false;
  });
  return blocks;
}

function removeTextBlockIndent(tr: Transaction, block: TextBlockInfo): boolean {
  const indentText = INDENT_CANDIDATES.find((candidate) => block.node.textContent.startsWith(candidate));
  if (!indentText) return false;

  const start = tr.mapping.map(block.pos + 1);
  tr.delete(start, start + indentText.length);
  return true;
}

function removeCursorIndent(state: EditorState): Transaction | null {
  const { $from } = state.selection;
  if ($from.depth === 0 || !$from.parent.isTextblock) return null;

  const blockStart = $from.start($from.depth);

  for (const indentText of INDENT_CANDIDATES) {
    const from = Math.max(blockStart, $from.pos - indentText.length);
    const textBeforeCursor = state.doc.textBetween(from, $from.pos);
    if (textBeforeCursor === indentText) {
      return state.tr.delete(from, $from.pos);
    }
  }

  const block = { pos: $from.before($from.depth), node: $from.parent };
  const tr = state.tr;
  return removeTextBlockIndent(tr, block) ? tr : null;
}

function handleEditorTab(view: EditorView, event: KeyboardEvent): boolean {
  if (event.key !== "Tab") return false;

  event.preventDefault();
  const { state } = view;

  if (state.selection.empty) {
    if (event.shiftKey) {
      const tr = removeCursorIndent(state);
      if (tr?.docChanged) view.dispatch(tr.scrollIntoView());
      return true;
    }

    const indentText = getIndentText(state.selection.$from.parent);
    view.dispatch(state.tr.insertText(indentText, state.selection.from, state.selection.to).scrollIntoView());
    return true;
  }

  const blocks = getSelectedTextBlocks(state);
  if (blocks.length === 0) return true;

  const tr = state.tr;
  if (event.shiftKey) {
    blocks.forEach((block) => removeTextBlockIndent(tr, block));
  } else {
    blocks.forEach((block) => {
      const start = tr.mapping.map(block.pos + 1);
      tr.insertText(getIndentText(block.node), start);
    });
  }

  if (tr.docChanged) view.dispatch(tr.scrollIntoView());
  return true;
}

function getFileExtension(file: File): string {
  const nameExtension = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : undefined;
  if (nameExtension) return nameExtension;

  const mimeExtension = file.type.split("/")[1]?.split("+")[0]?.toLowerCase();
  return mimeExtension || "png";
}

async function dataUrlToFile(dataUrl: string, index: number): Promise<File | null> {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const extension = blob.type.split("/")[1]?.split("+")[0]?.toLowerCase() || "png";
    return new File([blob], `pasted-image-${Date.now()}-${index}.${extension}`, { type: blob.type || "image/png" });
  } catch {
    return null;
  }
}

function getClipboardImageFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

function getClipboardDataImageSources(dataTransfer: DataTransfer): string[] {
  const html = dataTransfer.getData("text/html");
  if (!html.includes("data:image/")) return [];

  return Array.from(html.matchAll(DATA_IMAGE_PATTERN), (match) => match[1])
    .filter((src): src is string => Boolean(src));
}

async function insertUploadedImages(
  view: EditorView,
  files: File[],
  uploadImage: (file: File) => Promise<string>,
) {
  const selectionBookmark = view.state.selection.getBookmark();
  const uploadedImages: Array<{ url: string; file: File }> = [];

  for (const file of files) {
    const url = await uploadImage(file);
    uploadedImages.push({ url, file });
  }

  if (uploadedImages.length === 0) return;

  const { schema } = view.state;
  let tr = view.state.tr.setSelection(selectionBookmark.resolve(view.state.doc));

  uploadedImages.forEach(({ url, file }) => {
    const imageNode = schema.nodes.image.create({
      src: url,
      alt: file.name || `粘贴图片.${getFileExtension(file)}`,
    });

    tr = tr.replaceSelectionWith(imageNode, false);

    if (schema.nodes.paragraph) {
      const insertPos = tr.selection.to;
      tr = tr.insert(insertPos, schema.nodes.paragraph.create());
      tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
    }
  });

  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ content, onChange, placeholder = "在此输入内容，支持 Markdown 语法...", onImageUpload, onReady }, ref) => {
    const isFocusedRef = useRef(false);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: false,
          bulletList: {
            keepMarks: true,
            keepAttributes: false,
          },
          orderedList: {
            keepMarks: true,
            keepAttributes: false,
          },
        }),
        MarkdownImage.configure({
          inline: false,
          allowBase64: true,
        }),
        Placeholder.configure({
          placeholder,
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: "text-primary underline",
          },
        }),
        CharacterCount.configure({
          limit: null,
        }),
        ColoredHighlight.configure({
          multicolor: true,
        }),
        ProblemBlock,
        DashedSeparator,
        Markdown.configure({
          html: false,
          transformPastedText: false,
          transformCopiedText: true,
          breaks: true,
        }),
      ],
      onCreate: ({ editor }) => onReady?.(editor),
      onFocus: () => { isFocusedRef.current = true; },
      onBlur: () => { isFocusedRef.current = false; },
      content: parseProblemMarkers(content),
      onUpdate: ({ editor }) => {
        onChange((editor.storage as unknown as MarkdownStorage).markdown.getMarkdown());
      },
      immediatelyRender: false,
      editorProps: {
        handleKeyDown: handleEditorTab,
        handlePaste: (view, event) => {
          const clipboardData = event.clipboardData;
          if (!clipboardData) return false;

          const imageFiles = getClipboardImageFiles(clipboardData);
          if (imageFiles.length > 0) {
            event.preventDefault();
            if (onImageUpload) {
              void insertUploadedImages(view, imageFiles, onImageUpload).catch((error: unknown) => {
                console.error("Failed to upload pasted image:", error);
              });
            }
            return true;
          }

          const dataImageSources = getClipboardDataImageSources(clipboardData);
          if (dataImageSources.length > 0) {
            event.preventDefault();
            if (onImageUpload) {
              void (async () => {
                const files = await Promise.all(dataImageSources.map(dataUrlToFile));
                await insertUploadedImages(view, files.filter((file): file is File => Boolean(file)), onImageUpload);
              })().catch((error: unknown) => {
                console.error("Failed to upload pasted data image:", error);
              });
            }
            return true;
          }

          // Only handle plain text pastes
          const text = clipboardData.getData('text/plain');
          if (!text || !text.trim()) return false;

          // Prevent default paste (which would use HTML from VS Code etc.,
          // potentially creating code blocks via <pre><code>)
          event.preventDefault();

          try {
            const html = renderMarkdownToHtml(repairMarkdown(text), { renderMath: false });
            const dom = document.createElement('div');
            dom.innerHTML = html;
            const slice = DOMParser.fromSchema(view.state.schema).parseSlice(dom, {
              preserveWhitespace: true,
            });
            view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          } catch {
            // Fallback: insert as plain text
            view.dispatch(view.state.tr.insertText(text).scrollIntoView());
          }

          return true;
        },
      },
    });

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      editor,
      insertImage: (url: string) => {
        editor?.chain().focus().setImage({ src: url }).run();
      },
      insertContent: (content: string) => {
        editor?.chain().focus().insertContent(content).run();
      },
      insertMarkdown: (markdown: string) => {
        const current = editor
          ? (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown()
          : content;
        const next = `${current.trimEnd()}${markdown}`;
        onChange(next);
        editor?.commands.setContent(parseProblemMarkers(next));
      },
    }), [content, editor, onChange]);

    // 当外部 content 变化时更新编辑器（仅在编辑器未聚焦时同步，
    // 避免在用户输入过程中覆盖编辑器内容导致光标跳动）
    useEffect(() => {
      if (!editor || isFocusedRef.current) return;
      if (content !== (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown()) {
        editor.commands.setContent(parseProblemMarkers(content));
      }
    }, [content, editor]);

    if (!editor) return null;

    return (
      <EditorContent
        editor={editor}
        className="markdown-surface markdown-compact p-6 min-h-[400px] focus:outline-none
          [&_.ProseMirror]:min-h-[400px] [&_.ProseMirror]:outline-none
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-on-surface-variant/40
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none
          [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:rounded-lg [&_.ProseMirror_img]:my-4
          [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-7 [&_.ProseMirror_ul]:my-3
          [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-7 [&_.ProseMirror_ol]:my-3
          [&_.ProseMirror_li]:pl-1 [&_.ProseMirror_li]:my-1.5
          [&_.ProseMirror_li>p]:my-0.5
          [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-primary/30
          [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:my-2
          [&_.ProseMirror_code]:bg-surface-container-high [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5
          [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:text-sm
          [&_.ProseMirror_pre]:bg-surface-container-high [&_.ProseMirror_pre]:p-4
          [&_.ProseMirror_pre]:rounded-lg [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:my-3
          [&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline
          [&_.ProseMirror_hr]:my-4 [&_.ProseMirror_hr]:border-0 [&_.ProseMirror_hr]:border-t [&_.ProseMirror_hr]:border-solid [&_.ProseMirror_hr]:border-black
          [&_.ProseMirror_hr[data-type=dashed]]:my-6 [&_.ProseMirror_hr[data-type=dashed]]:border-0 [&_.ProseMirror_hr[data-type=dashed]]:border-t [&_.ProseMirror_hr[data-type=dashed]]:border-dashed [&_.ProseMirror_hr[data-type=dashed]]:border-black
          [&_.ProseMirror_mark]:rounded-md [&_.ProseMirror_mark]:px-1.5 [&_.ProseMirror_mark]:py-0.5
          [&_.ProseMirror_mark]:box-decoration-clone"
      />
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";
