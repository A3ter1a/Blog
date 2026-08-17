"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import { CheckCircle2, Eraser, Loader2, Sparkles } from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { useToast } from "@/components/ui/Toast";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import {
  buildEconomicsGraphMarkdown,
  economicsGraphTemplateSummaries,
  normalizeEconomicsGraphAIDraft,
  type EconomicsGraphAIDraft,
} from "@/lib/economics-graph-ai";
import { checkEconomicsGraphLayers, type EconomicsGraphStroke } from "@/lib/economics-graphs";
import { AI_CONFIG_STORAGE_KEY, normalizeAIConfig } from "@/lib/ai-config";

type EconomicsGraphAIResponse = {
  draft?: EconomicsGraphAIDraft;
  markdown?: string;
  error?: string;
  success?: boolean;
};

interface EconomicsGraphComposerProps {
  onInsert: (markdown: string) => void;
}

function readLocalAIConfig() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(AI_CONFIG_STORAGE_KEY);
    return raw ? normalizeAIConfig(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function getResponseError(data: EconomicsGraphAIResponse, fallback: string): string {
  return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
}

function parseJsonDraft(value: string) {
  try {
    return normalizeEconomicsGraphAIDraft(JSON.parse(value));
  } catch {
    return { ok: false as const, message: "JSON 格式不正确" };
  }
}

export function EconomicsGraphComposer({ onInsert }: EconomicsGraphComposerProps) {
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [rationale, setRationale] = useState("");
  const [reviewNotes, setReviewNotes] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawPoints, setDrawPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const drawCanvasRef = useRef<SVGSVGElement | null>(null);

  const customStrokes = useMemo<EconomicsGraphStroke[]>(() => drawPoints.length > 1
    ? [{
      id: "free-curve-1",
      label: "手绘曲线",
      color: "#0f766e",
      path: `M ${drawPoints.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" L ")}`,
    }]
    : [], [drawPoints]);

  const validation = useMemo(() => jsonText.trim() ? parseJsonDraft(jsonText) : null, [jsonText]);
  const previewSpec = validation?.ok
    ? { ...validation.draft.spec, customStrokes: [...(validation.draft.spec.customStrokes ?? []), ...customStrokes] }
    : null;
  const previewMarkdown = previewSpec ? buildEconomicsGraphMarkdown(previewSpec) : "";
  const layerChecks = previewSpec ? checkEconomicsGraphLayers(previewSpec) : [];
  const canGenerate = prompt.trim().length > 0 && !isGenerating;
  const canInsert = Boolean(validation?.ok);

  async function generateGraph() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    setIsGenerating(true);
    setError(null);

    try {
      const localConfig = readLocalAIConfig();
      const headers = await buildAuthHeaders({ "Content-Type": "application/json" });
      const res = await fetch("/api/ai/economics-graph", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: trimmedPrompt,
          apiKey: localConfig?.deepseekApiKey,
          model: localConfig?.deepseekModel,
        }),
      });
      const data: EconomicsGraphAIResponse = await res.json().catch(() => ({}));

      if (!res.ok || !data.success || !data.draft) {
        throw new Error(getResponseError(data, "曲线生成失败"));
      }

      setJsonText(JSON.stringify({ ...data.draft.spec, customStrokes }, null, 2));
      setRationale(data.draft.rationale);
      setReviewNotes(data.draft.reviewNotes);
      toast.success("曲线结构已生成");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "曲线生成失败";
      setError(message);
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  }

  function insertGraph() {
    if (!validation?.ok) {
      toast.error(validation?.message ?? "请先生成或填写结构化 JSON");
      return;
    }

    onInsert(buildEconomicsGraphMarkdown(previewSpec ?? validation.draft.spec));
    toast.success("曲线卡片已插入正文");
  }

  function getDrawPoint(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(80, Math.min(580, ((event.clientX - rect.left) / rect.width) * 640)),
      y: Math.max(52, Math.min(340, ((event.clientY - rect.top) / rect.height) * 420)),
    };
  }

  return (
    <section className="surface-panel mb-4 p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold text-primary">经济学曲线卡片</p>
          <h2 className="mt-1 font-headline text-lg font-bold text-on-surface">生成交互曲线</h2>
        </div>
        <div className="flex max-w-xl flex-wrap gap-2">
          {economicsGraphTemplateSummaries.slice(0, 9).map((template) => (
            <span className="econ-category-chip" key={template.id}>{template.title}</span>
          ))}
          {economicsGraphTemplateSummaries.length > 9 && (
            <span className="econ-category-chip">+{economicsGraphTemplateSummaries.length - 9} 个专属模板</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-on-surface-variant">需求</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="field-control min-h-32 w-full resize-y px-4 py-3 text-sm leading-6"
              placeholder="例如：解释垄断厂商为什么 MR 低于需求曲线，并标出利润最大化产量和价格"
              maxLength={1200}
            />
          </label>

          <button
            type="button"
            onClick={generateGraph}
            disabled={!canGenerate}
            className="control-button control-button-primary h-10 justify-center px-4 text-sm"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isGenerating ? "生成中" : "生成结构"}
          </button>

          {(rationale || reviewNotes.length > 0 || error) && (
            <div className="surface-muted space-y-3 p-3 text-sm">
              {error && <p className="text-error">{error}</p>}
              {rationale && <p className="text-on-surface">{rationale}</p>}
              {reviewNotes.length > 0 && (
                <div className="flex gap-2 text-on-surface-variant">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{reviewNotes.join("；")}</span>
                </div>
              )}
            </div>
          )}

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-on-surface-variant">结构</span>
            <textarea
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              className="field-control min-h-44 w-full resize-y px-4 py-3 font-mono text-xs leading-5"
              placeholder={'{\n  "template": "monopoly-mr-mc",\n  "title": "垄断厂商利润最大化",\n  "focus": ["mr", "mc", "e-mr-mc"]\n}'}
              spellCheck={false}
            />
          </label>

          {validation && !validation.ok && (
            <p className="text-sm text-error">{validation.message}</p>
          )}

          <button
            type="button"
            onClick={insertGraph}
            disabled={!canInsert}
            className="control-button h-10 justify-center px-4 text-sm"
          >
            插入正文
          </button>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-on-surface-variant">自由曲线</div>
            <button
              type="button"
              onClick={() => setDrawPoints([])}
              disabled={drawPoints.length === 0}
              className="control-button h-8 min-h-0 px-2 text-xs"
              title="清除手绘曲线"
            >
              <Eraser className="h-3.5 w-3.5" />清除
            </button>
          </div>
          <div className="mb-4 overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-lowest">
            <svg
              ref={drawCanvasRef}
              viewBox="0 0 640 420"
              className="econ-graph-drawing-canvas"
              role="img"
              aria-label="经济学自由曲线绘图区"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setIsDrawing(true);
                setDrawPoints([getDrawPoint(event)]);
              }}
              onPointerMove={(event) => {
                if (!isDrawing) return;
                setDrawPoints((current) => [...current, getDrawPoint(event)].slice(-180));
              }}
              onPointerUp={() => setIsDrawing(false)}
              onPointerCancel={() => setIsDrawing(false)}
            >
              <path d="M80 340 H580 M80 340 V52" className="econ-graph-drawing-axes" />
              <path d={customStrokes[0]?.path ?? ""} className="econ-graph-drawing-stroke" />
              <text x="540" y="382" className="econ-graph-drawing-label">Q</text>
              <text x="42" y="58" className="econ-graph-drawing-label">P</text>
            </svg>
          </div>
          <div className="mb-2 text-sm font-medium text-on-surface-variant">预览</div>
          <div className="min-h-80 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3">
            {previewMarkdown ? (
              <MarkdownContent
                content={previewMarkdown}
                enableEconomicsGraphs
                className="text-on-surface"
              />
            ) : (
              <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-outline-variant/30 px-4 text-center text-sm text-on-surface-variant">
                生成或填写结构后显示预览
              </div>
            )}
          </div>
          {layerChecks.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="经济学图像四层自检">
              {layerChecks.map((check) => (
                <div key={check.id} className={`rounded-lg border px-2.5 py-2 text-xs ${check.passed ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700" : "border-amber-500/25 bg-amber-500/10 text-amber-700"}`}>
                  <div className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="h-3.5 w-3.5" />{check.label}</div>
                  <div className="mt-1 opacity-80">{check.detail}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
