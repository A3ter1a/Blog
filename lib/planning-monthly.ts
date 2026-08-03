import { createHash } from "node:crypto";
import {
  brushStageLabels,
  studySubjectLabels,
  studyTimelines,
  type BrushStage,
  type StudySubjectId,
} from "../components/home/studyTimelineData.ts";
import { getMonthNumber } from "./study-timeline.ts";

export const PLANNING_API_SCHEMA_VERSION = 1 as const;
export const PLANNING_TIME_ZONE = "Asia/Shanghai" as const;
export const DEFAULT_PLANNING_CYCLE_ID = "kaoyan-2027" as const;

const PLANNING_YEAR = 2026;
const PLANNING_MONTH_NUMBERS = [7, 8, 9, 10, 11, 12] as const;
const SOURCE_REVISION = "study-timeline-v1" as const;

export type PlanningCycle = {
  id: string;
  label: string;
  targetExamYear: number;
  planningMonths: string[];
  timezone: typeof PLANNING_TIME_ZONE;
};

export const planningCycles: Record<string, PlanningCycle> = {
  [DEFAULT_PLANNING_CYCLE_ID]: {
    id: DEFAULT_PLANNING_CYCLE_ID,
    label: "2027 年考研备考周期",
    targetExamYear: 2027,
    planningMonths: PLANNING_MONTH_NUMBERS.map((month) => formatPlanningMonth(month)),
    timezone: PLANNING_TIME_ZONE,
  },
};

export type MonthlyPlanningItem = {
  id: string;
  externalKey: string;
  cycleId: string;
  month: string;
  subjectId: StudySubjectId;
  subjectLabel: string;
  title: string;
  stage: BrushStage;
  stageLabel: string;
  order: number;
};

export type MonthlyPlanningSnapshot = {
  schemaVersion: typeof PLANNING_API_SCHEMA_VERSION;
  cycle: {
    id: string;
    label: string;
    targetExamYear: number;
    planningMonths: string[];
  };
  month: {
    key: string;
    label: string;
    number: number;
  };
  timezone: typeof PLANNING_TIME_ZONE;
  source: {
    kind: "study-timeline";
    revision: typeof SOURCE_REVISION;
  };
  updatedAt: null;
  changeTracking: "etag";
  capabilities: {
    taskStatus: false;
    exactDate: false;
  };
  items: MonthlyPlanningItem[];
};

export function formatPlanningMonth(monthNumber: number): string {
  return `${PLANNING_YEAR}-${String(monthNumber).padStart(2, "0")}`;
}

export function isPlanningMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function getPlanningCycle(cycleId: string): PlanningCycle | null {
  return planningCycles[cycleId] ?? null;
}

export function buildMonthlyPlanningSnapshot(
  cycleId: string,
  monthKey: string,
): MonthlyPlanningSnapshot {
  const cycle = getPlanningCycle(cycleId);
  if (!cycle) {
    throw new Error(`Unknown planning cycle: ${cycleId}`);
  }

  if (!isPlanningMonthKey(monthKey) || !cycle.planningMonths.includes(monthKey)) {
    throw new Error(`Month is outside planning cycle: ${monthKey}`);
  }

  const monthNumber = Number(monthKey.slice(5, 7));
  const items: MonthlyPlanningItem[] = [];

  for (const subject of studyTimelines) {
    const month = subject.months.find((candidate) => getMonthNumber(candidate.label) === monthNumber);
    if (!month) continue;

    for (const task of month.tasks) {
      items.push({
        id: `${cycle.id}:${task.id}`,
        externalKey: task.id,
        cycleId: cycle.id,
        month: monthKey,
        subjectId: subject.id,
        subjectLabel: studySubjectLabels[subject.id],
        title: task.title,
        stage: task.stage,
        stageLabel: brushStageLabels[task.stage],
        order: items.length + 1,
      });
    }
  }

  return {
    schemaVersion: PLANNING_API_SCHEMA_VERSION,
    cycle: {
      id: cycle.id,
      label: cycle.label,
      targetExamYear: cycle.targetExamYear,
      planningMonths: [...cycle.planningMonths],
    },
    month: {
      key: monthKey,
      label: `${monthNumber}月`,
      number: monthNumber,
    },
    timezone: PLANNING_TIME_ZONE,
    source: {
      kind: "study-timeline",
      revision: SOURCE_REVISION,
    },
    updatedAt: null,
    changeTracking: "etag",
    capabilities: {
      taskStatus: false,
      exactDate: false,
    },
    items,
  };
}

export function computePlanningEtag(snapshot: MonthlyPlanningSnapshot): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(snapshot), "utf8")
    .digest("hex");

  return `"${digest}"`;
}
