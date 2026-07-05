"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { useToast } from "@/components/ui/Toast";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import {
  buildEconomicsGraphMarkdown,
  economicsGraphTemplateSummaries,
  normalizeEconomicsGraphAIDraft,
  type EconomicsGraphAIDraft,
} from "@/lib/economics-graph-ai";
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

  const validation = useMemo(() => jsonText.trim() ? parseJsonDraft(jsonText) : null, [jsonText]);
  const previewMarkdown = validation?.ok ? buildEconomicsGraphMarkdown(validation.draft.spec) : "";
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

      setJsonText(JSON.stringify(data.draft.spec, null, 2));
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

    onInsert(buildEconomicsGraphMarkdown(validation.draft.spec));
    toast.success("曲线卡片已插入正文");
  }

  return (
    <section className="surface-panel mb-4 p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold text-primary">经济学曲线卡片</p>
          <h2 className="mt-1 font-headline text-lg font-bold text-on-surface">生成交互曲线</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="econ-category-chip">{economicsGraphTemplateSummaries[0]?.title}</span>
          <span className="econ-category-chip">{economicsGraphTemplateSummaries[1]?.title}</span>
          <span className="econ-category-chip">{economicsGraphTemplateSummaries[2]?.title}</span>
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
        </div>
      </div>
    </section>
  );
}
