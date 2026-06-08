import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "prosemirror-markdown";

function getProblemBlockMarker(node: ProseMirrorNode): string {
  const noteId = typeof node.attrs.noteId === "string" ? node.attrs.noteId : "";
  const selection = typeof node.attrs.selection === "string" ? node.attrs.selection : "";
  if (noteId && selection) return `<!--asteroid-problems:${noteId}:${selection}-->`;

  const rawNumber = node.attrs.number;
  const number = typeof rawNumber === "number" ? rawNumber : Number(rawNumber) || 1;
  return `<!--problem:${number}-->`;
}

// Problem Block Node View Component
function ProblemBlockView({ node }: NodeViewProps) {
  const noteId = typeof node.attrs.noteId === "string" ? node.attrs.noteId : "";
  const selection = typeof node.attrs.selection === "string" ? node.attrs.selection : "";
  const rawNumber = node.attrs.number;
  const number = typeof rawNumber === "number" ? rawNumber : Number(rawNumber) || 1;
  const isReference = Boolean(noteId && selection);

  return (
    <NodeViewWrapper className="my-6">
      <div className="overflow-hidden rounded-lg border-2 border-primary/20 bg-primary/5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-primary/20 bg-primary/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="editorial-gradient flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-xs font-bold text-on-primary">
              {isReference ? selection : number}
            </span>
            <span className="text-sm font-semibold text-on-surface">
              {isReference ? "题目引用" : "题目"}
            </span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(getProblemBlockMarker(node)).catch(() => {});
            }}
            className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
          >
            复制标记
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div contentEditable={false} suppressContentEditableWarning>
            <p className="text-sm text-on-surface-variant">
              {isReference
                ? "阅读页会在这里展示引用的题目卡片。"
                : "此题目已插入，详细内容请在发布后查看。"}
            </p>
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

// Problem Block Node Extension
export const ProblemBlock = Node.create({
  name: "problemBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      number: {
        default: 1,
        parseHTML: (element) => Number(element.getAttribute("number")) || 1,
        renderHTML: (attributes) => ({ number: attributes.number }),
      },
      noteId: {
        default: "",
        parseHTML: (element) => element.getAttribute("note-id") || "",
        renderHTML: (attributes) => (attributes.noteId ? { "note-id": attributes.noteId } : {}),
      },
      selection: {
        default: "",
        parseHTML: (element) => element.getAttribute("selection") || "",
        renderHTML: (attributes) => (attributes.selection ? { selection: attributes.selection } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "problem-block",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["problem-block", mergeAttributes(HTMLAttributes)];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          state.write(getProblemBlockMarker(node));
          state.closeBlock(node);
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ProblemBlockView);
  },
});

// Helper function to parse problem markers from content
export function parseProblemMarkers(content: string): string {
  return content
    .replace(
      /<!--\s*asteroid-problems:([A-Za-z0-9_-]+):([0-9,\s，、-]+)\s*-->/g,
      '<problem-block note-id="$1" selection="$2"></problem-block>'
    )
    .replace(
      /<!--problem:(\d+)-->/g,
      '<problem-block number="$1"></problem-block>'
    );
}

// Helper function to extract problem number from marker
export function extractProblemNumber(text: string): number | null {
  const match = text.match(/<!--problem:(\d+)-->/);
  return match ? parseInt(match[1]) : null;
}
