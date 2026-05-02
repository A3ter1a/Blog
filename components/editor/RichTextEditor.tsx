"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import CharacterCount from "@tiptap/extension-character-count";
import Highlight from "@tiptap/extension-highlight";
import { Markdown } from "tiptap-markdown";
import { useEffect, forwardRef, useImperativeHandle, useRef } from "react";
import { ProblemBlock, parseProblemMarkers } from "@/lib/problem-block-extension";
import { DashedSeparator } from "@/lib/dashed-separator-extension";
import { DOMParser } from "@tiptap/pm/model";
import markdownit from "markdown-it";
import markdownitMark from "markdown-it-mark";

// Module-level markdown-it instance for paste handling (stateless, safe to reuse)
const md = markdownit({ html: false, breaks: true }).use(markdownitMark);

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  onImageUpload?: (file: File) => Promise<string>;
  onReady?: () => void;
}

export interface RichTextEditorRef {
  editor: Editor | null;
  insertImage: (url: string) => void;
  insertContent: (content: string) => void;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ content, onChange, placeholder = "在此输入内容，支持 Markdown 语法...", onImageUpload, onReady }, ref) => {
    const isFocusedRef = useRef(false);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: false,
        }),
        Image.configure({
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
        Highlight.configure({
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
      onCreate: () => onReady?.(),
      onFocus: () => { isFocusedRef.current = true; },
      onBlur: () => { isFocusedRef.current = false; },
      content: parseProblemMarkers(content),
      onUpdate: ({ editor }) => {
        onChange((editor.storage as any).markdown.getMarkdown());
      },
      immediatelyRender: false,
      editorProps: {
        handlePaste: (view, event) => {
          // Only handle plain text pastes
          const text = event.clipboardData?.getData('text/plain');
          if (!text || !text.trim()) return false;

          // Prevent default paste (which would use HTML from VS Code etc.,
          // potentially creating code blocks via <pre><code>)
          event.preventDefault();

          try {
            // Parse pasted text as Markdown with module-level markdown-it instance
            const html = md.render(text);
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
    }), [editor]);

    // 当外部 content 变化时更新编辑器（仅在编辑器未聚焦时同步，
    // 避免在用户输入过程中覆盖编辑器内容导致光标跳动）
    useEffect(() => {
      if (!editor || isFocusedRef.current) return;
      if (content !== (editor.storage as any).markdown.getMarkdown()) {
        editor.commands.setContent(parseProblemMarkers(content));
      }
    }, [content, editor]);

    if (!editor) return null;

    return (
      <EditorContent
        editor={editor}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            if (e.shiftKey) {
              // Shift+Tab: 删除光标前的两个空格
              const { state } = editor;
              const { $from } = state.selection;
              const textBefore = state.doc.textBetween(Math.max(0, $from.pos - 2), $from.pos);
              if (textBefore === "  ") {
                editor.chain().focus()
                  .setTextSelection({ from: $from.pos - 2, to: $from.pos })
                  .deleteSelection()
                  .run();
              }
            } else {
              // Tab: 插入两个空格作为缩进
              editor.chain().focus().insertContent("  ").run();
            }
          }
        }}
        className="prose prose-sm max-w-none p-6 min-h-[400px] focus:outline-none
          [&_.ProseMirror]:min-h-[400px] [&_.ProseMirror]:outline-none
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-on-surface-variant/40
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none
          [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:rounded-lg [&_.ProseMirror_img]:my-4
          [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mb-4
          [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:mb-3
          [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:mb-2
          [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:ml-6 [&_.ProseMirror_ul]:my-2
          [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:ml-6 [&_.ProseMirror_ol]:my-2
          [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-primary/30
          [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:my-2
          [&_.ProseMirror_code]:bg-surface-container-high [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5
          [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:text-sm
          [&_.ProseMirror_pre]:bg-surface-container-high [&_.ProseMirror_pre]:p-4
          [&_.ProseMirror_pre]:rounded-lg [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:my-3
          [&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline
          [&_.ProseMirror_hr]:my-4 [&_.ProseMirror_hr]:border-0 [&_.ProseMirror_hr]:border-t [&_.ProseMirror_hr]:border-solid [&_.ProseMirror_hr]:border-black
          [&_.ProseMirror_hr[data-type=dashed]]:my-6 [&_.ProseMirror_hr[data-type=dashed]]:border-0 [&_.ProseMirror_hr[data-type=dashed]]:border-t [&_.ProseMirror_hr[data-type=dashed]]:border-dashed [&_.ProseMirror_hr[data-type=dashed]]:border-black
          [&_.ProseMirror_mark]:rounded-sm [&_.ProseMirror_mark]:px-1 [&_.ProseMirror_mark]:py-0.5"
      />
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";
