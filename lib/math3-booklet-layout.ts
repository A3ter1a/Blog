import type { Math3SelfTestQuestion } from "./math3-self-test";

export type Math3BookletOrientation = "landscape" | "portrait";
export type Math3ObjectiveSection = "choice" | "fill";

export interface Math3ObjectiveBookletPage<TQuestion> {
  section: Math3ObjectiveSection;
  questions: TQuestion[];
}

export type Math3ChoiceOptionLayout = "single-row" | "double-row";

type ObjectiveQuestionLike = Pick<Math3SelfTestQuestion, "type" | "question" | "options">;

const PAGE_LIMITS: Record<Math3BookletOrientation, Record<Math3ObjectiveSection, {
  maxQuestions: number;
  maxCharacters: number;
}>> = {
  landscape: {
    choice: { maxQuestions: 5, maxCharacters: 1650 },
    fill: { maxQuestions: 6, maxCharacters: 1100 },
  },
  portrait: {
    choice: { maxQuestions: 5, maxCharacters: 1350 },
    fill: { maxQuestions: 6, maxCharacters: 1000 },
  },
};

function estimateQuestionCharacters(question: ObjectiveQuestionLike): number {
  return question.question.length
    + (question.options ?? []).reduce((sum, option) => sum + option.content.length + 12, 0);
}

function estimateOptionDisplayUnits(value: string): number {
  const visibleText = value
    .replace(/\\[a-zA-Z]+/g, "x")
    .replace(/[$*_`{}\[\]()]/g, "");
  return Array.from(visibleText).reduce((units, character) => (
    units + (/^[\u0000-\u024f]$/.test(character) ? 0.55 : 1)
  ), 0);
}

export function getMath3ChoiceOptionLayout(
  options: Array<{ content: string }> | null | undefined,
  orientation: Math3BookletOrientation = "landscape",
): Math3ChoiceOptionLayout {
  if (!options || options.length <= 1) return "single-row";
  const optionUnits = options.map((option) => estimateOptionDisplayUnits(option.content));
  const longestOption = Math.max(...optionUnits);
  const totalUnits = optionUnits.reduce((sum, units) => sum + units, 0);
  const limits = orientation === "landscape"
    ? { longest: 18, total: 60 }
    : { longest: 12, total: 42 };
  return options.length <= 4 && longestOption <= limits.longest && totalUnits <= limits.total
    ? "single-row"
    : "double-row";
}

function paginateSection<TQuestion extends ObjectiveQuestionLike>(
  questions: TQuestion[],
  section: Math3ObjectiveSection,
  orientation: Math3BookletOrientation,
): Math3ObjectiveBookletPage<TQuestion>[] {
  const limits = PAGE_LIMITS[orientation][section];
  const pages: Math3ObjectiveBookletPage<TQuestion>[] = [];
  let current: TQuestion[] = [];
  let currentCharacters = 0;

  for (const question of questions) {
    const questionCharacters = estimateQuestionCharacters(question);
    const exceedsCount = current.length >= limits.maxQuestions;
    const exceedsCharacters = current.length > 0 && currentCharacters + questionCharacters > limits.maxCharacters;
    if (exceedsCount || exceedsCharacters) {
      pages.push({ section, questions: current });
      current = [];
      currentCharacters = 0;
    }
    current.push(question);
    currentCharacters += questionCharacters;
  }

  if (current.length > 0) pages.push({ section, questions: current });
  return pages;
}

export function paginateMath3ObjectiveQuestions<TQuestion extends ObjectiveQuestionLike>(
  questions: TQuestion[],
  orientation: Math3BookletOrientation,
): Math3ObjectiveBookletPage<TQuestion>[] {
  const choices = questions.filter((question) => question.type === "choice");
  const fills = questions.filter((question) => question.type === "fill");
  return [
    ...paginateSection(choices, "choice", orientation),
    ...paginateSection(fills, "fill", orientation),
  ];
}
