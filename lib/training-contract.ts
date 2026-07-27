export type AttemptSourceKind = "english_passage" | "math_paper" | "note_problem";
export type AttemptStatus = "created" | "in_progress" | "submitted" | "sealed" | "abandoned";
export type RevisionKind = "submission" | "correction";
export type GradeOrigin = "system_scored" | "ai_suggested" | "user_final" | "legacy_imported";
export type ScoringMode = "objective" | "subjective" | "math";

export interface AttemptContractRecord {
  id: string;
  round: 1 | 2 | 3;
  status: AttemptStatus;
}

export interface RevisionContractRecord {
  id: string;
  attemptId: string;
  revisionNo: number;
  kind: RevisionKind;
}

export interface GradeContractRecord {
  id: string;
  revisionId: string;
  origin: GradeOrigin;
  gradeSeq: number;
  score: number;
}

export interface EffectiveTrainingResult {
  attempt: AttemptContractRecord;
  revision: RevisionContractRecord;
  grade: GradeContractRecord;
}

export function planStartNextRound(previous: AttemptContractRecord): {
  previousStatus: "sealed" | "abandoned";
  nextRound: 2 | 3;
} {
  if (previous.round === 3) {
    throw new Error("第三轮之后不能再创建新轮次。");
  }
  if (previous.status !== "submitted" && previous.status !== "abandoned") {
    throw new Error("只有已提交或已放弃的轮次可以开始下一轮。");
  }

  return {
    previousStatus: previous.status === "submitted" ? "sealed" : "abandoned",
    nextRound: (previous.round + 1) as 2 | 3,
  };
}

export function canAppendRevision(attempt: AttemptContractRecord, kind: RevisionKind): boolean {
  if (kind === "submission") {
    return attempt.status === "in_progress";
  }

  return attempt.status === "submitted" || attempt.status === "sealed";
}

export function getNextRevisionNo(
  revisions: RevisionContractRecord[],
  attemptId: string,
): number {
  const revisionNumbers = revisions
    .filter((revision) => revision.attemptId === attemptId)
    .map((revision) => revision.revisionNo);

  if (revisionNumbers.some((revisionNo) => !Number.isInteger(revisionNo) || revisionNo < 1)) {
    throw new Error("revision_no 必须是从 1 开始的正整数。");
  }
  if (new Set(revisionNumbers).size !== revisionNumbers.length) {
    throw new Error("同一 attempt 内的 revision_no 不能重复。");
  }

  return revisionNumbers.length === 0 ? 1 : Math.max(...revisionNumbers) + 1;
}

export function isOfficialGradeOrigin(origin: GradeOrigin, mode: ScoringMode): boolean {
  if (mode === "objective") return origin === "system_scored";
  return origin === "user_final";
}

export function selectOfficialGradeForRevision(
  grades: GradeContractRecord[],
  revisionId: string,
  mode: ScoringMode,
): GradeContractRecord | null {
  return grades
    .filter((grade) => grade.revisionId === revisionId && isOfficialGradeOrigin(grade.origin, mode))
    .sort((left, right) => right.gradeSeq - left.gradeSeq || right.id.localeCompare(left.id))[0] ?? null;
}

export function selectCurrentEffectiveRevision(
  attemptId: string,
  revisions: RevisionContractRecord[],
  grades: GradeContractRecord[],
  mode: ScoringMode,
): { revision: RevisionContractRecord; grade: GradeContractRecord } | null {
  const attemptRevisions = revisions
    .filter((revision) => revision.attemptId === attemptId)
    .sort((left, right) => right.revisionNo - left.revisionNo || right.id.localeCompare(left.id));

  for (const revision of attemptRevisions) {
    const grade = selectOfficialGradeForRevision(grades, revision.id, mode);
    if (grade) return { revision, grade };
  }

  return null;
}

export function selectLatestEffectivePaperResult(
  attempts: AttemptContractRecord[],
  revisions: RevisionContractRecord[],
  grades: GradeContractRecord[],
  mode: ScoringMode,
): EffectiveTrainingResult | null {
  const completedAttempts = attempts.filter((attempt) => (
    attempt.status === "submitted" || attempt.status === "sealed"
  ));
  const rounds = new Set<number>();

  for (const attempt of completedAttempts) {
    if (rounds.has(attempt.round)) {
      throw new Error("同一来源在同一轮次只能有一个 attempt。");
    }
    rounds.add(attempt.round);
  }

  for (const attempt of completedAttempts.sort((left, right) => right.round - left.round)) {
    const effective = selectCurrentEffectiveRevision(attempt.id, revisions, grades, mode);
    if (effective) {
      return {
        attempt,
        revision: effective.revision,
        grade: effective.grade,
      };
    }
  }

  return null;
}
