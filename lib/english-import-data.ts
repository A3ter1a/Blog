import type { EnglishPassage, EnglishQuestion, EnglishTrainingData } from "./english-training";

export type EnglishPaperImport = {
  year: number;
  paperType: "english1";
  totalScore: number;
  title?: string;
  passages: Array<Omit<EnglishPassage, "id" | "paperId" | "year" | "createdAt" | "updatedAt"> & {
    questions: Array<Omit<EnglishQuestion, "id" | "passageId" | "createdAt" | "updatedAt">>;
  }>;
};

export function mapEnglishImportToTrainingData(input: { papers: EnglishPaperImport[] }): EnglishTrainingData {
  const createdAt = new Date("2026-10-07T00:00:00Z");
  const data: EnglishTrainingData = { papers: [], passages: [], questions: [], attempts: [] };
  for (const paper of input.papers) {
    const paperId = `local-english1-${paper.year}`;
    data.papers.push({ id: paperId, year: paper.year, paperType: paper.paperType, title: paper.title ?? `${paper.year} 年英语一真题`, totalScore: paper.totalScore, createdAt, updatedAt: createdAt });
    for (const { questions, ...passage } of paper.passages) {
      const passageId = `${paperId}-${passage.passageNo}`;
      data.passages.push({ ...passage, id: passageId, paperId, year: paper.year, createdAt, updatedAt: createdAt });
      for (const question of questions) {
        data.questions.push({ ...question, id: `${passageId}-q${question.questionNo}`, passageId, createdAt, updatedAt: createdAt });
      }
    }
  }
  return data;
}
