import type {
  EnglishAnswerSnapshot,
  EnglishGradeOrigin,
  EnglishPassageRoundLedger,
  EnglishRoundRecord,
  EnglishRoundGrade,
  EnglishRoundRevision,
  EnglishRoundStatus,
} from "./english-round-history";

export type EnglishTrainingPersistenceMode = "legacy" | "dual" | "shared";
export type EnglishTrainingCommandAction = "save_draft" | "submit" | "start_next";

export type UnreconciledEnglishLocalHistory = {
  passageId: string;
  round: 1 | 2 | 3;
  reason: "missing_round" | "draft_differs" | "missing_revision" | "answer_differs";
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function asRows(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.flatMap((item): UnknownRecord[] => {
      const record = asRecord(item);
      return record ? [record] : [];
    })
    : [];
}

function readAnswers(value: unknown): EnglishAnswerSnapshot {
  const payload = asRecord(value);
  const answers = asRecord(payload?.answers);
  if (!answers) return {};
  return Object.fromEntries(Object.entries(answers).flatMap(([questionId, answer]) => (
    typeof answer === "string" ? [[questionId, answer]] : []
  )));
}

function readDate(value: unknown, fallback: string): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function readRoundStatus(value: unknown): EnglishRoundStatus | null {
  return value === "in_progress" || value === "submitted" || value === "sealed" || value === "abandoned"
    ? value
    : null;
}

function readGradeOrigin(value: unknown): EnglishGradeOrigin | null {
  return value === "system_scored" || value === "ai_suggested" || value === "user_final" || value === "legacy_imported"
    ? value
    : null;
}

function gradePriority(origin: EnglishGradeOrigin): number {
  if (origin === "user_final") return 4;
  if (origin === "system_scored") return 3;
  if (origin === "legacy_imported") return 2;
  return 1;
}

function mapRevision(value: UnknownRecord): EnglishRoundRevision | null {
  const id = typeof value.id === "string" ? value.id : "";
  const revisionNo = typeof value.revision_no === "number" ? value.revision_no : Number(value.revision_no);
  const kind = value.kind === "submission" || value.kind === "correction" ? value.kind : null;
  const grades: EnglishRoundGrade[] = asRows(value.grades)
    .flatMap((grade) => {
      const origin = readGradeOrigin(grade.origin);
      const score = typeof grade.score === "number" ? grade.score : Number(grade.score);
      const maxScore = typeof grade.max_score === "number" ? grade.max_score : Number(grade.max_score);
      const id = typeof grade.id === "string" ? grade.id : "";
      const gradeSeq = typeof grade.grade_seq === "number" ? grade.grade_seq : Number(grade.grade_seq ?? 1);
      const breakdown = asRecord(grade.breakdown);
      return origin && id && Number.isInteger(gradeSeq) && gradeSeq > 0 && Number.isFinite(score) && Number.isFinite(maxScore)
        ? [{
          id,
          origin,
          gradeSeq,
          score,
          maxScore,
          ...(typeof grade.feedback === "string" && grade.feedback ? { feedback: grade.feedback } : {}),
          ...(breakdown ? { breakdown } : {}),
          createdAt: readDate(grade.created_at, new Date(0).toISOString()),
        }]
        : [];
    })
    .sort((left, right) => gradePriority(right.origin) - gradePriority(left.origin) || right.gradeSeq - left.gradeSeq);
  const grade = grades[0];
  if (!id || !Number.isInteger(revisionNo) || revisionNo < 1 || !kind || !grade) return null;

  return {
    id,
    revisionNo,
    kind,
    answers: readAnswers(value.response_payload),
    score: grade.score,
    maxScore: grade.maxScore,
    gradeOrigin: grade.origin,
    grades,
    createdAt: readDate(value.created_at, new Date(0).toISOString()),
  };
}

/**
 * 将一次 PostgREST 嵌套快照转换为 UI 共享的三轮账本。
 * 缺少正式评分的半成品 revision 不会伪装成已完成成绩。
 */
export function mapEnglishTrainingCoreRows(value: unknown): EnglishPassageRoundLedger[] {
  const ledgers = new Map<string, EnglishPassageRoundLedger>();
  const rows = asRows(value)
    .sort((left, right) => Number(left.round) - Number(right.round));

  for (const row of rows) {
    const passageId = typeof row.english_passage_id === "string" ? row.english_passage_id : "";
    const round = Number(row.round);
    const status = readRoundStatus(row.status);
    if (!passageId || !Number.isInteger(round) || round < 1 || round > 3 || !status) continue;

    const startedAt = readDate(row.started_at, readDate(row.created_at, new Date(0).toISOString()));
    const updatedAt = readDate(row.updated_at, startedAt);
    const record: EnglishRoundRecord = {
      round: round as 1 | 2 | 3,
      status,
      startedAt,
      updatedAt,
      draftAnswers: status === "in_progress" ? readAnswers(row.draft_payload) : {},
      revisions: asRows(row.attempt_revisions)
        .flatMap((revision) => mapRevision(revision) ?? [])
        .sort((left, right) => left.revisionNo - right.revisionNo),
      ...(typeof row.abandon_reason === "string" && row.abandon_reason.trim()
        ? { abandonReason: row.abandon_reason }
        : {}),
    };

    const existing = ledgers.get(passageId);
    const nextUpdatedAt = existing && existing.updatedAt > updatedAt ? existing.updatedAt : updatedAt;
    ledgers.set(passageId, {
      passageId,
      rounds: [...(existing?.rounds ?? []).filter((item) => item.round !== record.round), record]
        .sort((left, right) => left.round - right.round),
      updatedAt: nextUpdatedAt,
    });
  }

  return [...ledgers.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function answersEqual(left: EnglishAnswerSnapshot, right: EnglishAnswerSnapshot): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => (left[key] ?? "") === (right[key] ?? ""));
}

/**
 * 切到 dual/shared 前拒绝静默隐藏仅存在于 localStorage 的轮次或纠正。
 * 历史重评分可以改变分数来源，但同 revision_no 的答案快照必须可对上。
 */
export function findUnreconciledEnglishLocalHistory(
  localLedgers: EnglishPassageRoundLedger[],
  sharedLedgers: EnglishPassageRoundLedger[],
): UnreconciledEnglishLocalHistory[] {
  const sharedByPassage = new Map(sharedLedgers.map((ledger) => [ledger.passageId, ledger]));
  const issues: UnreconciledEnglishLocalHistory[] = [];

  for (const local of localLedgers) {
    const shared = sharedByPassage.get(local.passageId);
    for (const localRound of local.rounds) {
      const sharedRound = shared?.rounds.find((round) => round.round === localRound.round);
      const meaningfulLocalRound = localRound.round > 1
        || localRound.revisions.length > 0
        || Object.values(localRound.draftAnswers).some((answer) => answer !== "");
      if (!sharedRound) {
        if (meaningfulLocalRound) issues.push({ passageId: local.passageId, round: localRound.round, reason: "missing_round" });
        continue;
      }

      if (localRound.status === "in_progress"
        && !answersEqual(localRound.draftAnswers, sharedRound.draftAnswers)) {
        issues.push({ passageId: local.passageId, round: localRound.round, reason: "draft_differs" });
      }
      for (const localRevision of localRound.revisions) {
        const sharedRevision = sharedRound.revisions.find((revision) => revision.revisionNo === localRevision.revisionNo);
        if (!sharedRevision) {
          issues.push({ passageId: local.passageId, round: localRound.round, reason: "missing_revision" });
        } else if (!answersEqual(localRevision.answers, sharedRevision.answers)) {
          issues.push({ passageId: local.passageId, round: localRound.round, reason: "answer_differs" });
        }
      }
    }
  }

  return issues;
}
