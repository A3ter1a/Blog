export interface EconomicsSourceCitation {
  documentTitle: string;
  chapter: string;
  pageStart: number;
  pageEnd?: number;
}

export interface EconomicsConceptContract {
  term: string;
  rigorousDefinition: string;
  plainExplanation: string;
  formulaOrGraph: string;
  commonConfusions: string[];
  examExpression: string;
  citation: EconomicsSourceCitation;
}

export interface EconomicsConceptValidation {
  valid: boolean;
  missing: string[];
}

export function validateEconomicsConcept(
  concept: EconomicsConceptContract,
): EconomicsConceptValidation {
  const missing: string[] = [];
  if (!concept.term.trim()) missing.push("term");
  if (!concept.rigorousDefinition.trim()) missing.push("rigorousDefinition");
  if (!concept.plainExplanation.trim()) missing.push("plainExplanation");
  if (!concept.formulaOrGraph.trim()) missing.push("formulaOrGraph");
  if (concept.commonConfusions.length === 0 || concept.commonConfusions.some((item) => !item.trim())) {
    missing.push("commonConfusions");
  }
  if (!concept.examExpression.trim()) missing.push("examExpression");
  if (!concept.citation.documentTitle.trim()) missing.push("citation.documentTitle");
  if (!concept.citation.chapter.trim()) missing.push("citation.chapter");
  if (!Number.isInteger(concept.citation.pageStart) || concept.citation.pageStart < 1) {
    missing.push("citation.pageStart");
  }
  if (
    concept.citation.pageEnd !== undefined
    && (!Number.isInteger(concept.citation.pageEnd) || concept.citation.pageEnd < concept.citation.pageStart)
  ) {
    missing.push("citation.pageEnd");
  }

  return { valid: missing.length === 0, missing };
}

export function formatEconomicsCitation(citation: EconomicsSourceCitation): string {
  const pages = citation.pageEnd && citation.pageEnd !== citation.pageStart
    ? `第 ${citation.pageStart}–${citation.pageEnd} 页`
    : `第 ${citation.pageStart} 页`;
  return `${citation.documentTitle} · ${citation.chapter} · ${pages}`;
}
