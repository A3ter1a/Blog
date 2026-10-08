"use client";

import { forwardRef, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { RichTextEditorProps, RichTextEditorRef } from "./RichTextEditor";

const RichTextEditorLazy = lazy(async () => {
  const editorModule = await import("./RichTextEditor");
  return { default: editorModule.RichTextEditor };
});

export const LazyRichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>((props, ref) => (
  <Suspense
    fallback={
      <div className={`flex items-center justify-center gap-2 p-6 text-sm text-on-surface-variant ${props.density === "compact" ? "min-h-[220px]" : "min-h-[280px]"}`}>
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>正在加载正文编辑器...</span>
      </div>
    }
  >
    <RichTextEditorLazy ref={ref} {...props} />
  </Suspense>
));

LazyRichTextEditor.displayName = "LazyRichTextEditor";
