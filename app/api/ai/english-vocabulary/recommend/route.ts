import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import { parseAIJson } from "@/lib/ai-json";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";
import type {
  EnglishVocabularyEntryType,
  EnglishVocabularyPartOfSpeech,
  EnglishVocabularySourceArea,
} from "@/lib/english-training";

const allowedEntryTypes = new Set<EnglishVocabularyEntryType>(["word", "collocation", "familiar_meaning"]);
const allowedPartOfSpeech = new Set<EnglishVocabularyPartOfSpeech>(["n", "v", "adj", "adv", "prep", "conj", "phr", "other"]);
const allowedSourceAreas = new Set<EnglishVocabularySourceArea>(["passage", "question", "option"]);

type RecommendedVocabulary = {
  entryType: EnglishVocabularyEntryType;
  word: string;
  partOfSpeech: EnglishVocabularyPartOfSpeech;
  definition: string;
  sourceArea: EnglishVocabularySourceArea;
  questionNo: string;
  optionLabel: string;
  sourceExcerpt: string;
  highlightText: string;
  note: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value).trim();
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function extractItems(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (isRecord(parsed) && Array.isArray(parsed.items)) return parsed.items;
  if (isRecord(parsed) && Array.isArray(parsed.vocabulary)) return parsed.vocabulary;
  return [];
}

function normalizeItems(parsed: unknown): RecommendedVocabulary[] {
  const seen = new Set<string>();
  return extractItems(parsed).flatMap((item) => {
    const raw = isRecord(item) ? item : {};
    const entryType = toString(raw.entryType || raw.entry_type);
    const partOfSpeech = toString(raw.partOfSpeech || raw.part_of_speech);
    const sourceArea = toString(raw.sourceArea || raw.source_area);
    const word = toString(raw.word || raw.term);
    const definition = toString(raw.definition || raw.meaning);
    const sourceExcerpt = toString(raw.sourceExcerpt || raw.source_excerpt);
    const highlightText = toString(raw.highlightText || raw.highlight_text || word);

    if (!word || !definition || !sourceExcerpt) return [];

    const normalized: RecommendedVocabulary = {
      entryType: allowedEntryTypes.has(entryType as EnglishVocabularyEntryType)
        ? entryType as EnglishVocabularyEntryType
        : "word",
      word: word.slice(0, 120),
      partOfSpeech: allowedPartOfSpeech.has(partOfSpeech as EnglishVocabularyPartOfSpeech)
        ? partOfSpeech as EnglishVocabularyPartOfSpeech
        : "other",
      definition: definition.slice(0, 300),
      sourceArea: allowedSourceAreas.has(sourceArea as EnglishVocabularySourceArea)
        ? sourceArea as EnglishVocabularySourceArea
        : "passage",
      questionNo: toString(raw.questionNo || raw.question_no).slice(0, 20),
      optionLabel: toString(raw.optionLabel || raw.option_label).toUpperCase().slice(0, 4),
      sourceExcerpt: sourceExcerpt.slice(0, 520),
      highlightText: highlightText.slice(0, 160),
      note: toString(raw.note || raw.reason).slice(0, 260),
    };

    const key = `${normalized.entryType}:${normalized.word.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const body = await req.json();
    const submitted = body?.submitted === true;
    if (!submitted) {
      return NextResponse.json({ error: "提交本篇后才能使用 AI 推荐", success: false }, { status: 400 });
    }

    const passage = isRecord(body?.passage) ? body.passage : {};
    const questions: unknown[] = Array.isArray(body?.questions) ? body.questions : [];
    const apiKey = resolveAIKey("deepseek", body?.apiKey);
    const model = typeof body?.model === "string" && body.model.trim()
      ? body.model.trim()
      : DEFAULT_DEEPSEEK_MODEL;

    const content = truncateText(toString(passage.content), 15000);
    if (!apiKey || !content) {
      return NextResponse.json({ error: "缺少 DeepSeek API Key 或篇章内容", success: false }, { status: 400 });
    }

    const normalizedQuestions = questions.slice(0, 12).map((question) => {
      const q = isRecord(question) ? question : {};
      const options = Array.isArray(q.options)
        ? q.options.map((option: unknown) => {
            const rawOption = isRecord(option) ? option : {};
            return {
              label: toString(rawOption.label).slice(0, 4),
              content: truncateText(toString(rawOption.content), 360),
            };
          })
        : [];

      return {
        questionNo: toString(q.questionNo),
        stem: truncateText(toString(q.stem), 600),
        options,
        standardAnswer: toString(q.standardAnswer),
        userAnswer: toString(q.userAnswer),
        isCorrect: q.isCorrect === true ? true : q.isCorrect === false ? false : null,
      };
    });

    const systemPrompt = `You extract high-value vocabulary for a Chinese student preparing for English I postgraduate entrance exams.
Return one valid JSON object only:
{
  "items": [
    {
      "entryType": "word" | "collocation" | "familiar_meaning",
      "word": "word or phrase",
      "partOfSpeech": "n" | "v" | "adj" | "adv" | "prep" | "conj" | "phr" | "other",
      "definition": "concise Chinese meaning in this exam context",
      "sourceArea": "passage" | "question" | "option",
      "questionNo": "",
      "optionLabel": "",
      "sourceExcerpt": "exact short source text from passage, stem, or option",
      "highlightText": "exact term to highlight inside sourceExcerpt",
      "note": "short Chinese reason or usage note"
    }
  ]
}
Rules:
- Recommend 8 to 14 items only.
- Prefer terms that affect comprehension, wrong answers, option traps, collocations, and familiar words with uncommon meanings.
- If the same word or phrase appears multiple times, output it only once.
- If a term appears in both the passage and a question or option, prefer the question/option source when it is an exam trap.
- sourceExcerpt must be copied from the provided text, not invented.
- Do not include full explanations or unrelated grammar notes.
- Use "familiar_meaning" only when the surface word is common but the exam meaning is easy to misread.
- Return JSON only.`;

    const userPrompt = JSON.stringify({
      paper: {
        year: passage.year,
        section: passage.section,
        passageNo: passage.passageNo,
      },
      passage: content,
      questions: normalizedQuestions,
    });

    const { content: aiContent, tokensUsed } = await callDeepSeek(
      apiKey,
      model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.2, maxTokens: 4096, responseFormat: "json_object" },
    );

    const items = normalizeItems(parseAIJson(aiContent)).slice(0, 16);
    return NextResponse.json({ items, tokensUsed, success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "AI 推荐失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
