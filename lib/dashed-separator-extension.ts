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
        parse: {
          setup(md: any) {
            // Guard against duplicate registration (setup runs on every parse() call)
            if (md.__dashedSepSetup) return;
            md.__dashedSepSetup = true;

            // Core rule: replace paragraphs whose sole content is <!--dashed-sep-->
            // with html_block tokens outputting <dashed-separator> tags.
            // This runs inside markdown-it's pipeline so it works regardless of the
            // `html` option (unlike injecting tags into raw markdown source).
            md.core.ruler.before("normalize", "dashed_sep_block", (state: any) => {
              const newTokens: any[] = [];
              for (let i = 0; i < state.tokens.length; i++) {
                const token = state.tokens[i];
                if (
                  token.type === "paragraph_open" &&
                  i + 2 < state.tokens.length &&
                  state.tokens[i + 1].type === "inline" &&
                  state.tokens[i + 1].content.trim() === "<!--dashed-sep-->" &&
                  state.tokens[i + 2].type === "paragraph_close"
                ) {
                  const htmlToken = new state.Token("html_block", "", 0);
                  htmlToken.content = "<dashed-separator></dashed-separator>";
                  newTokens.push(htmlToken);
                  i += 2; // skip inline + paragraph_close
                } else {
                  newTokens.push(token);
                }
              }
              state.tokens = newTokens;
            });
          },
        },
      },
    };
  },
});

/**
 * 将 <!--dashed-sep--> 标记转换为 <dashed-separator> 标签。
 *
 * @deprecated RichTextEditor 的 markdown 解析已由扩展内部的 parse.setup
 * markdown-it 规则处理，调用方无需再手动调用此函数。
 * 仅保留用于不经过 tiptap-markdown 解析器的场景（ContentPreview 等已有独立管道）。
 */
export function parseDashedSeparator(content: string): string {
  return content.replace(
    /<!--dashed-sep-->/g,
    "<dashed-separator></dashed-separator>"
  );
}
