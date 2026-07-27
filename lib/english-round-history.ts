export const ENGLISH_ROUND_HISTORY_STORAGE_KEY = "asteroid:english-round-history:v1";
export const ENGLISH_ROUND_HISTORY_CHANGE_EVENT = "asteroid-english-round-history-change";

export type EnglishRoundStatus = "in_progress" | "submitted" | "sealed" | "abandoned";
export type EnglishRevisionKind = "submission" | "correction";
export type EnglishGradeOrigin = "system_scored" | "ai_suggested" | "user_final" | "legacy_imported";
export type EnglishAnswerSnapshot = Record<string, string>;

export type EnglishRoundGrade = {
  id: string;
  origin: EnglishGradeOrigin;
  gradeSeq: number;
  score: number;
  maxScore: number;
  feedback?: string;
  breakdown?: Record<string, unknown>;
  createdAt: string;
};

export type EnglishRoundRevision = {
  id: string;
  revisionNo: number;
  kind: EnglishRevisionKind;
  answers: EnglishAnswerSnapshot;
  score: number;
  maxScore: number;
  gradeOrigin: EnglishGradeOrigin;
  grades?: EnglishRoundGrade[];
  createdAt: string;
};

export type EnglishRoundRecord = {
  round: 1 | 2 | 3;
  status: EnglishRoundStatus;
  startedAt: string;
  updatedAt: string;
  draftAnswers: EnglishAnswerSnapshot;
  revisions: EnglishRoundRevision[];
  abandonReason?: string;
};

export type EnglishPassageRoundLedger = {
  passageId: string;
  rounds: EnglishRoundRecord[];
  updatedAt: string;
};

type LegacyAttemptSnapshot = {
  passageId: string;
  status: "in_progress" | "submitted";
  answers: EnglishAnswerSnapshot;
  score: number;
  maxScore: number;
  startedAt: string;
  submittedAt?: string;
  updatedAt: string;
};

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneAnswers(answers: EnglishAnswerSnapshot): EnglishAnswerSnapshot {
  return Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, String(value ?? "")]));
}

export function getEnglishRound(
  ledger: EnglishPassageRoundLedger | undefined,
  round: number,
): EnglishRoundRecord | undefined {
  return ledger?.rounds.find((item) => item.round === round);
}

export function getLatestEnglishRoundRevision(
  round: EnglishRoundRecord | undefined,
): EnglishRoundRevision | undefined {
  return round?.revisions.reduce<EnglishRoundRevision | undefined>((latest, revision) => (
    !latest || revision.revisionNo > latest.revisionNo ? revision : latest
  ), undefined);
}

export function getLatestFormalEnglishRoundRevision(
  round: EnglishRoundRecord | undefined,
): EnglishRoundRevision | undefined {
  return round?.revisions.reduce<EnglishRoundRevision | undefined>((latest, revision) => (
    revision.gradeOrigin !== "ai_suggested"
      && (!latest || revision.revisionNo > latest.revisionNo)
      ? revision
      : latest
  ), undefined);
}

export function getEffectiveEnglishRoundResult(
  ledger: EnglishPassageRoundLedger | undefined,
): { round: EnglishRoundRecord; revision: EnglishRoundRevision } | undefined {
  if (!ledger) return undefined;
  const completed = [...ledger.rounds]
    .filter((round) => round.status === "submitted" || round.status === "sealed")
    .sort((left, right) => right.round - left.round);
  for (const round of completed) {
    const revision = getLatestFormalEnglishRoundRevision(round);
    if (revision) return { round, revision };
  }
  return undefined;
}

export function getPreferredEnglishRound(ledger: EnglishPassageRoundLedger | undefined): 1 | 2 | 3 {
  const inProgress = ledger?.rounds.find((round) => round.status === "in_progress");
  if (inProgress) return inProgress.round;
  return ledger?.rounds.reduce<1 | 2 | 3>((latest, round) => Math.max(latest, round.round) as 1 | 2 | 3, 1) ?? 1;
}

export function importLegacyEnglishAttempt(
  ledger: EnglishPassageRoundLedger | undefined,
  legacy: LegacyAttemptSnapshot,
): EnglishPassageRoundLedger {
  if (ledger?.rounds.some((round) => round.round === 1)) return ledger;

  const revision: EnglishRoundRevision | undefined = legacy.status === "submitted"
    ? {
      id: createId("legacy-revision"),
      revisionNo: 1,
      kind: "submission",
      answers: cloneAnswers(legacy.answers),
      score: legacy.score,
      maxScore: legacy.maxScore,
      gradeOrigin: "legacy_imported",
      createdAt: legacy.submittedAt ?? legacy.updatedAt,
    }
    : undefined;
  const round: EnglishRoundRecord = {
    round: 1,
    status: legacy.status,
    startedAt: legacy.startedAt,
    updatedAt: legacy.updatedAt,
    draftAnswers: legacy.status === "in_progress" ? cloneAnswers(legacy.answers) : {},
    revisions: revision ? [revision] : [],
  };

  return {
    passageId: legacy.passageId,
    rounds: [round],
    updatedAt: legacy.updatedAt,
  };
}

export function createEmptyEnglishLedger(passageId: string, now: string): EnglishPassageRoundLedger {
  return {
    passageId,
    rounds: [{
      round: 1,
      status: "in_progress",
      startedAt: now,
      updatedAt: now,
      draftAnswers: {},
      revisions: [],
    }],
    updatedAt: now,
  };
}

export function saveEnglishRoundDraft(
  ledger: EnglishPassageRoundLedger,
  roundNo: 1 | 2 | 3,
  answers: EnglishAnswerSnapshot,
  now: string,
): EnglishPassageRoundLedger {
  const round = getEnglishRound(ledger, roundNo);
  if (!round) throw new Error(`第 ${roundNo} 轮不存在`);
  if (round.status !== "in_progress") throw new Error("已提交或封存轮次不能保存为草稿");

  return {
    ...ledger,
    updatedAt: now,
    rounds: ledger.rounds.map((item) => item.round === roundNo ? {
      ...item,
      draftAnswers: cloneAnswers(answers),
      updatedAt: now,
    } : item),
  };
}

export function submitEnglishRoundRevision(
  ledger: EnglishPassageRoundLedger,
  roundNo: 1 | 2 | 3,
  input: {
    answers: EnglishAnswerSnapshot;
    score: number;
    maxScore: number;
    gradeOrigin: EnglishGradeOrigin;
    now: string;
  },
): EnglishPassageRoundLedger {
  const round = getEnglishRound(ledger, roundNo);
  if (!round) throw new Error(`第 ${roundNo} 轮不存在`);
  if (round.status === "abandoned") throw new Error("已放弃轮次不能追加提交");

  const latest = getLatestEnglishRoundRevision(round);
  const revision: EnglishRoundRevision = {
    id: createId("revision"),
    revisionNo: (latest?.revisionNo ?? 0) + 1,
    kind: latest ? "correction" : "submission",
    answers: cloneAnswers(input.answers),
    score: input.score,
    maxScore: input.maxScore,
    gradeOrigin: input.gradeOrigin,
    createdAt: input.now,
  };

  return {
    ...ledger,
    updatedAt: input.now,
    rounds: ledger.rounds.map((item) => item.round === roundNo ? {
      ...item,
      status: item.status === "sealed" ? "sealed" : "submitted",
      updatedAt: input.now,
      draftAnswers: {},
      revisions: [...item.revisions, revision],
    } : item),
  };
}

export function startNextEnglishRound(
  ledger: EnglishPassageRoundLedger,
  now: string,
): EnglishPassageRoundLedger {
  const latest = ledger.rounds.reduce((current, round) => round.round > current.round ? round : current);
  if (latest.round >= 3) throw new Error("最多只允许三轮训练");
  if (latest.status !== "submitted" && latest.status !== "abandoned") {
    throw new Error("当前轮提交或放弃后才能开始下一轮");
  }

  const nextRound = (latest.round + 1) as 2 | 3;
  return {
    ...ledger,
    updatedAt: now,
    rounds: [
      ...ledger.rounds.map((round) => round.round === latest.round && round.status === "submitted"
        ? { ...round, status: "sealed" as const, updatedAt: now }
        : round),
      {
        round: nextRound,
        status: "in_progress",
        startedAt: now,
        updatedAt: now,
        draftAnswers: {},
        revisions: [],
      },
    ],
  };
}

export function normalizeEnglishRoundLedgers(value: unknown): EnglishPassageRoundLedger[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): EnglishPassageRoundLedger[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<EnglishPassageRoundLedger>;
    if (typeof candidate.passageId !== "string" || !Array.isArray(candidate.rounds)) return [];
    const rounds = candidate.rounds.flatMap((round): EnglishRoundRecord[] => {
      if (!round
        || typeof round !== "object"
        || ![1, 2, 3].includes(round.round)
        || !["in_progress", "submitted", "sealed", "abandoned"].includes(round.status)
        || !Array.isArray(round.revisions)
        || typeof round.startedAt !== "string"
        || typeof round.updatedAt !== "string") return [];
      const revisions = round.revisions.filter((revision): revision is EnglishRoundRevision => (
        Boolean(revision)
        && typeof revision.id === "string"
        && Number.isInteger(revision.revisionNo)
        && revision.revisionNo > 0
        && ["submission", "correction"].includes(revision.kind)
        && Boolean(revision.answers)
        && typeof revision.answers === "object"
        && Number.isFinite(revision.score)
        && Number.isFinite(revision.maxScore)
        && ["system_scored", "ai_suggested", "user_final", "legacy_imported"].includes(revision.gradeOrigin)
        && typeof revision.createdAt === "string"
      ));
      return [{
        ...round,
        round: round.round as 1 | 2 | 3,
        draftAnswers: round.draftAnswers && typeof round.draftAnswers === "object"
          ? cloneAnswers(round.draftAnswers)
          : {},
        revisions: revisions.sort((left, right) => left.revisionNo - right.revisionNo),
      }];
    });
    if (rounds.length === 0) return [];
    return [{
      passageId: candidate.passageId,
      rounds: rounds.sort((left, right) => left.round - right.round),
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date(0).toISOString(),
    }];
  });
}

export function readEnglishRoundLedgers(): EnglishPassageRoundLedger[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeEnglishRoundLedgers(JSON.parse(localStorage.getItem(ENGLISH_ROUND_HISTORY_STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function writeEnglishRoundLedgers(ledgers: EnglishPassageRoundLedger[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ENGLISH_ROUND_HISTORY_STORAGE_KEY, JSON.stringify(ledgers));
  window.dispatchEvent(new Event(ENGLISH_ROUND_HISTORY_CHANGE_EVENT));
}

export function upsertEnglishRoundLedger(
  ledgers: EnglishPassageRoundLedger[],
  ledger: EnglishPassageRoundLedger,
): EnglishPassageRoundLedger[] {
  return [ledger, ...ledgers.filter((item) => item.passageId !== ledger.passageId)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
