import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";

interface ProblemBlockProps {
  node: any;
  updateAttributes: (attrs: any) => void;
}

// Problem Block Node View Component
function ProblemBlockView({ node, updateAttributes }: ProblemBlockProps) {
  const number = node.attrs.number || 1;

  return (
    <NodeViewWrapper className="my-6">
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-primary/10 border-b border-primary/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full editorial-gradient text-on-primary text-sm font-bold flex items-center justify-center">
              {number}
            </span>
            <span className="text-sm font-semibold text-on-surface">题目</span>
          </div>
          <button
            onClick={() => {
              // Copy problem marker
              const text = `<!--problem:${number}-->`;
              navigator.clipboard.writeText(text).catch(() => {});
            }}
            className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-medium"
          >
            复制题号
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div contentEditable={false} suppressContentEditableWarning>
            <p className="text-sm text-on-surface-variant">
              此题目已通过OCR插入，详细内容请在发布后查看
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

  addNodeView() {
    return ReactNodeViewRenderer(ProblemBlockView);
  },
});

// Helper function to parse problem markers from content
export function parseProblemMarkers(content: string): string {
  // Convert <!--problem:N--> markers to problem-block tags
  return content.replace(
    /<!--problem:(\d+)-->/g,
    '<problem-block number="$1"></problem-block>'
  );
}

// Helper function to extract problem number from marker
export function extractProblemNumber(text: string): number | null {
  const match = text.match(/<!--problem:(\d+)-->/);
  return match ? parseInt(match[1]) : null;
}
