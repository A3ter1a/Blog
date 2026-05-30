import { Node, mergeAttributes } from "@tiptap/core";

type MarkdownSerializerState = {
  write: (text: string) => void;
  closeBlock: (node: unknown) => void;
};

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
        serialize(state: MarkdownSerializerState, node: unknown) {
          state.write("<!--dashed-sep-->");
          state.closeBlock(node);
        },
        parse: {
          /**
           * DOM 后处理：markdown-it (html:false) 会将
           *   <!--dashed-sep-->  转义为  &lt;!--dashed-sep--&gt;
           *   <dashed-separator>  转义为  &lt;dashed-separator&gt;
           * 两者在浏览器 textContent 中都会还原为原始文本。
           * 找到内容完全为这些标记的 <p> 并替换为 <dashed-separator> 元素。
           */
          updateDOM(element: HTMLElement) {
            const MARKERS = ["<!--dashed-sep-->", "<dashed-separator></dashed-separator>"];
            const paragraphs = element.querySelectorAll("p");
            for (const p of paragraphs) {
              if (MARKERS.includes(p.textContent?.trim() || "")) {
                const separator = document.createElement("dashed-separator");
                p.replaceWith(separator);
              }
            }
          },
        },
      },
    };
  },
});
