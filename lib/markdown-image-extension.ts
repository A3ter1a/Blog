import Image from "@tiptap/extension-image";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

type MarkdownSerializerStateLike = {
  write: (content?: string) => void;
  closeBlock: (node: ProseMirrorNode) => void;
  esc: (text: string, startOfLine?: boolean) => string;
};

function escapeImageUrl(value: unknown): string {
  return String(value ?? "").replace(/[()]/g, "\\$&");
}

function escapeImageTitle(value: unknown): string {
  return String(value ?? "").replace(/"/g, '\\"');
}

export const MarkdownImage = Image.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerStateLike, node: ProseMirrorNode) {
          const src = escapeImageUrl(node.attrs.src);
          const alt = state.esc(String(node.attrs.alt ?? ""));
          const title = node.attrs.title ? ` "${escapeImageTitle(node.attrs.title)}"` : "";

          state.write(`![${alt}](${src}${title})`);
          state.closeBlock(node);
        },
      },
    };
  },
});
