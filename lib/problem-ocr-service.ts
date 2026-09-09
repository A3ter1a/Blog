import { mergeSingleImageProblems } from "./problem-ocr-single-image.ts";
import { callDeepSeek, callQwenVision, callDeepSeekVision } from "./ai-client.ts";
import { parseAIJson } from "./ai-json.ts";
import {
  DEFAULT_QWEN_ENDPOINT,
  DEFAULT_DEEPSEEK_OCR_MODEL,
  type OcrProvider,
  getQwenOcrModelCandidates,
  isQwenOcrModel,
} from "./ai-config.ts";
import { normalizeProblemForWrite } from "./content-contract.ts";
import { extractOptions } from "./utils.ts";
import type { Difficulty, Problem, ProblemType } from "./types.ts";

type VisionCaller = typeof callQwenVision;
type TextCaller = typeof callDeepSeek;
type ExtractedProblem = Partial<Problem> & { suggestedChapter?: string | null; confidence?: number };

export class ProblemOcrServiceError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ProblemOcrServiceError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message.trim() : fallback;
}

function shouldTryNextOcrModel(message: string): boolean {
  const normalized = message.toLowerCase();
  if (/(401|403|unauthorized|forbidden|api key|access denied|fetch failed|network|timeout|enotfound|econn)/i.test(message)) {
    return false;
  }
  return ["quota", "free", "limit", "rate", "429", "insufficient", "balance", "exceeded", "model", "vision", "image", "multimodal"]
    .some((keyword) => normalized.includes(keyword));
}

export async function recognizeProblemImage(
  input: { apiKey: string; model: string; imageBase64: string; mimeType: string; signal?: AbortSignal; provider?: OcrProvider },
  callVision: VisionCaller = callQwenVision,
  callDeepSeekImage: typeof callDeepSeekVision = callDeepSeekVision,
): Promise<{ text: string; model: string }> {
  if (!input.apiKey.trim() || !input.imageBase64.trim()) {
    throw new ProblemOcrServiceError("缺少必要参数 (imageBase64, apiKey)", 400);
  }
  if (input.provider !== "deepseek" && !isQwenOcrModel(input.model)) {
    throw new ProblemOcrServiceError(`模型 ${input.model} 不支持图片输入，不能用于 OCR。请改用 Qwen3.7 Plus 或 Qwen3-VL 系列。`, 400);
  }
  const mimeType = input.mimeType.trim().toLowerCase().startsWith("image/") ? input.mimeType.trim().toLowerCase() : "image/jpeg";
  const prompt = `Extract all text from this image. This image contains exactly ONE complete exam problem, including its shared stem and all subquestions.
Please follow these rules:
1. Preserve ALL mathematical formulas in LaTeX format: inline formulas use $...$, display formulas use $$...$$
2. Maintain the original structure: title/number, question, options, and short answer if visible
3. Keep line breaks between different parts of the problem; do not merge everything into one paragraph
4. Correct only obvious OCR noise, and keep uncertain characters as close to the image as possible
5. Output ONLY the extracted text, no additional commentary
6. For Chinese text, preserve original characters`;

  if (input.provider === "deepseek") {
    const result = await callDeepSeekImage(input.apiKey, input.imageBase64, prompt, mimeType, input.signal);
    return { ...result, model: DEFAULT_DEEPSEEK_OCR_MODEL };
  }

  const failures: string[] = [];
  for (const candidateModel of getQwenOcrModelCandidates(input.model)) {
    try {
      const result = await callVision(input.apiKey, candidateModel, DEFAULT_QWEN_ENDPOINT, input.imageBase64, prompt, mimeType, input.signal);
      const text = result.text.trim();
      if (text) return { text, model: candidateModel };
      failures.push(`${candidateModel}: OCR 返回空文本`);
    } catch (error: unknown) {
      if (input.signal?.aborted) throw error;
      const message = getErrorMessage(error, "OCR 识别失败");
      failures.push(`${candidateModel}: ${message}`);
      if (!shouldTryNextOcrModel(message)) break;
    }
  }

  throw new ProblemOcrServiceError(failures.at(-1) || "OCR 识别失败");
}

const ALLOWED_TYPES = new Set(["choice", "fill", "calculation", "proof", "proofEssay"]);
const ALLOWED_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

function normalizeProblems(parsed: unknown): ExtractedProblem[] {
  const record = isRecord(parsed) ? parsed : {};
  // Providers can follow the JSON instruction while using common question-field aliases.
  // Only accept known containers and a textual stem; never stringify arbitrary objects.
  const candidates = Array.isArray(parsed) ? parsed
    : Array.isArray(record.problems) && record.problems.length > 0 ? record.problems
    : Array.isArray(record.questions) ? record.questions
    : toText(record.question) || toText(record.stem) ? [record] : [];
  return candidates.flatMap((value) => {
    const raw = isRecord(value) ? value : {};
    const question = toText(raw.question) || toText(raw.stem);
    if (!question) return [];
    const typeText = toText(raw.type);
    const difficultyText = toText(raw.difficulty);
    const type = (ALLOWED_TYPES.has(typeText) ? typeText : "calculation") as ProblemType;
    const difficulty = (ALLOWED_DIFFICULTIES.has(difficultyText) ? difficultyText : "medium") as Difficulty;
    const confidence = Number(raw.confidence);
    const options = Array.isArray(raw.options)
      ? raw.options.flatMap((option, index) => {
          const candidate = isRecord(option) ? option : {};
          const content = isRecord(option) ? toText(candidate.content) || toText(candidate.text) : toText(option);
          return content ? [{ label: toText(candidate.label) || String.fromCharCode(65 + index), content }] : [];
        })
      : undefined;
    return [normalizeProblemForWrite({
      question,
      answer: toText(raw.answer),
      explanation: "",
      type,
      difficulty,
      suggestedChapter: raw.suggestedChapter ? toText(raw.suggestedChapter) : null,
      options: type === "choice" ? options?.length ? options : extractOptions(question) : undefined,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    }, "ai") as ExtractedProblem];
  });
}

function cleanOcrQuestionText(ocrText: string): string {
  return ocrText
    .replace(/^\s*(?:以下是(?:图片中)?(?:提取|识别)到的文字|识别结果|提取结果)\s*[:：]\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isLikelyProblemText(ocrText: string): boolean {
  const text = cleanOcrQuestionText(ocrText);
  if (text.length < 8 || /^\s*(?:无法|未能|没有|看不清|抱歉|sorry)/i.test(text)) return false;
  return /(?:求|若|设|已知|证明|计算|解|选择|填空|下列|函数|方程|积分|极限|矩阵|概率|定义|判断|问|答案|例题|题目|试题)/.test(text)
    || /(?:\\(?:frac|lim|int|sum|sqrt|begin)|[$=≈≤≥<>^_]|[A-F][.、]\s*\S)/.test(text);
}

function buildOcrFallbackProblem(ocrText: string): ExtractedProblem {
  const question = cleanOcrQuestionText(ocrText);
  const type: ProblemType = /(?:论述|分析说明|简答)/.test(question)
    ? "proofEssay"
    : /(?:证明|证得|证：)/.test(question)
      ? "proof"
      : /(?:填空|_{2,}|____|________|\(\s*\)|（\s*）)/.test(question)
        ? "fill"
        : /[A-F][.、]\s*\S/.test(question)
          ? "choice"
          : "calculation";
  return normalizeProblemForWrite({
    question,
    answer: "",
    explanation: "",
    type,
    difficulty: "medium",
    suggestedChapter: null,
    options: type === "choice" ? extractOptions(question) : undefined,
    confidence: 0.25,
  }, "ai") as ExtractedProblem;
}

const OCR_JSON_MAX_TOKENS = 8192;

function requireCompleteExtraction(result: Awaited<ReturnType<TextCaller>>): void {
  if (result.finishReason === "length") {
    throw new ProblemOcrServiceError("图片文字已识别，但题目整理输出被截断。请去除图片中无关的边缘内容后重试，并保留完整题干和所有小问。", 422);
  }
}

async function parseOrRepairAIJson(content: string, apiKey: string, model: string, callText: TextCaller, signal?: AbortSignal) {
  try {
    return { parsed: parseAIJson(content), tokensUsed: 0 };
  } catch {
    const repaired = await callText(apiKey, model, [
      { role: "system", content: "You repair malformed JSON. Return valid JSON only." },
      { role: "user", content: `Repair the following AI output into one valid JSON object only.
It must match this shape: {"problems":[{"question":"","answer":"","type":"calculation","difficulty":"medium","suggestedChapter":null,"options":[],"confidence":0.5}]}.
Keep the original math content. Escape all LaTeX backslashes correctly for JSON strings. Return JSON only.\n\nBroken output:\n${content}` },
    ], { temperature: 0, maxTokens: OCR_JSON_MAX_TOKENS, thinking: "disabled", responseFormat: "json_object", signal });
    requireCompleteExtraction(repaired);
    return { parsed: parseAIJson(repaired.content), tokensUsed: repaired.tokensUsed };
  }
}

export async function analyzeProblemOcrText(
  input: { apiKey: string; model: string; ocrText: string; chapterContext?: string[]; signal?: AbortSignal },
  callText: TextCaller = callDeepSeek,
): Promise<{ problems: ExtractedProblem[]; tokensUsed: number; extractionMode: "primary" | "rescue" | "ocrFallback"; warning?: string }> {
  const ocrText = input.ocrText.trim();
  if (!ocrText || !input.apiKey.trim()) throw new ProblemOcrServiceError("缺少必要参数 (ocrText, apiKey)", 400);
  const chapters = (input.chapterContext ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 200);
  const chapterHint = chapters.length > 0
    ? `\nAvailable chapters: ${chapters.join(", ")}. Suggest the best matching chapter from this list, or suggest a new chapter name if none match.`
    : "\nSuggest an appropriate chapter name for this problem.";
  const systemPrompt = `You are a math problem extraction assistant for a Chinese exam-study knowledge base. Each image contains EXACTLY ONE complete exam problem, possibly with multiple subquestions. Given OCR text from ONE image, return one JSON object with this structure:
{"problems":[{"question":"problem text with preserved LaTeX","answer":"short answer only","type":"choice|fill|calculation|proof|proofEssay","difficulty":"easy|medium|hard","suggestedChapter":null,"options":[{"label":"A","content":"option text"}],"confidence":0.5}]}.
Rules:
- Return EXACTLY ONE problems-array item for this image. NEVER split (1), (2), ①, ② or other subquestions into separate problems. Keep the shared stem and ALL subquestions together in question, with their numbering intact
- If the image contains no usable problem, return {"problems":[]}
- Preserve ALL LaTeX formulas and delimiters in question, answer, and options
- Correct obvious OCR mistakes only when the intended content is clear; do not silently rewrite uncertain text
- If an answer is visible, preserve it; if it is not visible, infer only a short answer when reliable and lower confidence, otherwise leave answer empty
- For choice problems, answer should usually be only the option letter and A/B/C/D options must move into the options array
- options is only for choice questions; omit it or return an empty array for other types
- Do not output explanations, hints, or detailed solution steps
- Return valid JSON only, without markdown fences or commentary
- Escape LaTeX backslashes correctly for JSON strings.${chapterHint}`;
  const primary = await callText(input.apiKey, input.model, [
    { role: "system", content: systemPrompt },
    { role: "user", content: ocrText },
  ], { temperature: 0.2, maxTokens: OCR_JSON_MAX_TOKENS, thinking: "disabled", responseFormat: "json_object", signal: input.signal });
  requireCompleteExtraction(primary);
  let totalTokensUsed = primary.tokensUsed;
  let parsed;
  try {
    parsed = await parseOrRepairAIJson(primary.content, input.apiKey, input.model, callText, input.signal);
  } catch (error: unknown) {
    if (input.signal?.aborted || error instanceof ProblemOcrServiceError) throw error;
    throw new ProblemOcrServiceError(`AI 返回格式解析失败，已尝试自动修复但仍失败：${getErrorMessage(error, "未知格式错误")}`, 422);
  }
  totalTokensUsed += parsed.tokensUsed;
  let problems = normalizeProblems(parsed.parsed);
  let extractionMode: "primary" | "rescue" | "ocrFallback" = "primary";
  const shouldRescue = problems.length === 0 && isLikelyProblemText(ocrText);

  if (shouldRescue) {
    try {
      const rescue = await callText(input.apiKey, input.model, [
        { role: "system", content: `The previous extraction returned no usable problems, but the OCR text appears to contain an exam question. Extract exactly one complete problem whenever possible. Keep the shared stem and every subquestion together; never split subquestions. Keep incomplete visible text, leave uncertain answers empty, use confidence 0.2-0.5, preserve LaTeX and choice options, and return valid JSON only with the same problems-array shape.${chapterHint}` },
        { role: "user", content: ocrText },
      ], { temperature: 0, maxTokens: OCR_JSON_MAX_TOKENS, thinking: "disabled", responseFormat: "json_object", signal: input.signal });
      requireCompleteExtraction(rescue);
      totalTokensUsed += rescue.tokensUsed;
      const rescueParsed = await parseOrRepairAIJson(rescue.content, input.apiKey, input.model, callText, input.signal);
      totalTokensUsed += rescueParsed.tokensUsed;
      const rescued = normalizeProblems(rescueParsed.parsed);
      if (rescued.length > 0) {
        problems = rescued;
        extractionMode = "rescue";
      }
    } catch (error: unknown) {
      if (input.signal?.aborted || error instanceof ProblemOcrServiceError) throw error;
      // The deterministic OCR fallback below preserves visible evidence.
    }
  }

  if (problems.length === 0 && shouldRescue) {
    problems = [buildOcrFallbackProblem(ocrText)];
    extractionMode = "ocrFallback";
  }
  const wasSplit = problems.length > 1;
  problems = mergeSingleImageProblems(problems, ocrText);
  const warning = wasSplit ? "模型将小问拆开，已按一图一题保留完整原文并合并答案，请核对小问编号。" : extractionMode === "ocrFallback"
    ? "图片文字已识别，已将整张图片保留为一道题目的原文草稿，请核对题干、所有小问和答案。"
    : extractionMode === "rescue"
      ? "首次分析为空，已通过补救提取生成题目，请快速核对题干与答案。"
      : undefined;
  return { problems, tokensUsed: totalTokensUsed, extractionMode, warning };
}
