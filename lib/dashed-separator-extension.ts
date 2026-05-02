import { Node, mergeAttributes } from "@tiptap/core";

export const DashedSeparator = Node.create({
  name: "dashedSeparator",
  group: "block",
  atom: true,

  parseHTML() {
    return [{ tag: "dashed-separator" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "hr",
      mergeAttributes(HTMLAttributes, {
        "data-type": "dashed",
        class: "dashed-separator",
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write("<!--dashed-sep-->");
          state.closeBlock(node);
        },
      },
    };
  },
});

/** 将 <!--dashed-sep--> 标记转换为 <dashed-separator> 标签 */
export function parseDashedSeparator(content: string): string {
  return content.replace(
    /<!--dashed-sep-->/g,
    '<dashed-separator></dashed-separator>'
  );
}
