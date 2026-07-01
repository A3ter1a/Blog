import Highlight from "@tiptap/extension-highlight";
import type MarkdownIt from "markdown-it";
import markdownitMark from "markdown-it-mark";
import { COLOR_PREFIX_PATTERN, normalizeHighlightColor } from "@/lib/colored-highlight";

type MarkdownMark = {
  attrs?: {
    color?: unknown;
  };
};

type ColoredHighlightMarkdownIt = MarkdownIt & {
  __asteroidColoredHighlightMark?: boolean;
};

function applyColoredHighlightDOM(element: ParentNode) {
  element.querySelectorAll("mark").forEach((mark) => {
    const firstChild = mark.firstChild;
    if (firstChild?.nodeType !== Node.TEXT_NODE) return;

    const text = firstChild.textContent ?? "";
    const match = text.match(COLOR_PREFIX_PATTERN);
    if (!match) return;

    const color = normalizeHighlightColor(match[1]);
    if (!color) return;

    firstChild.textContent = text.slice(match[0].length);
    mark.setAttribute("data-color", color);
    mark.setAttribute("style", `background-color: ${color}; color: inherit`);
  });
}

export const ColoredHighlight = Highlight.extend({
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: (_state: unknown, mark: MarkdownMark) => {
            const color = normalizeHighlightColor(mark.attrs?.color);
            return color ? `=={${color}}` : "==";
          },
          close: "==",
          expelEnclosingWhitespace: true,
        },
        parse: {
          setup(md: MarkdownIt) {
            const marked = md as ColoredHighlightMarkdownIt;
            if (marked.__asteroidColoredHighlightMark) return;
            marked.use(markdownitMark);
            marked.__asteroidColoredHighlightMark = true;
          },
          updateDOM(element: HTMLElement) {
            applyColoredHighlightDOM(element);
          },
        },
      },
    };
  },
});
