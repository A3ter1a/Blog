import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SHADOW_PROJECT_REF = "qyjfcebqjtphlpsvizxo";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECTIVE_SECTIONS = new Set(["reading", "cloze", "new_type"]);
const SUBJECTIVE_SECTIONS = new Set(["translation", "writing"]);

function readArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${item} 缺少参数值`);
    options[item.slice(2)] = value;
    index += 1;
  }
  return options;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseLoginFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return {
    email: values.email ?? values.username ?? "",
    password: values.password ?? "",
  };
}

async function fetchJson(url, options = {}, label = "request") {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const record = asRecord(body);
    const detail = String(record.error ?? record.message ?? record.msg ?? `HTTP ${response.status}`).slice(0, 500);
    const error = new Error(`${label} 失败（${response.status}）：${detail}`);
    error.status = response.status;
    error.body = record;
    throw error;
  }
  return body;
}

function getLedger(body, passageId) {
  const ledgers = Array.isArray(body?.ledgers) ? body.ledgers : [];
  return ledgers.find((item) => item?.passageId === passageId);
}

function getRound(ledger, round) {
  return ledger?.rounds?.find((item) => item?.round === round);
}

function getLatestRevision(round) {
  return [...(round?.revisions ?? [])].sort((left, right) => right.revisionNo - left.revisionNo)[0];
}

function hasGradeOrigin(revision, origin) {
  return Array.isArray(revision?.grades) && revision.grades.some((grade) => grade?.origin === origin);
}

function restUrl(baseUrl, table, params) {
  const url = new URL(`/rest/v1/${table}`, baseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args["env-file"]) process.loadEnvFile(path.resolve(args["env-file"]));
  const baseUrl = new URL(args["base-url"] ?? "");
  const loginPath = path.resolve(args["login-path"] ?? "");
  const manifestPath = path.resolve(args.manifest ?? "");
  const resultPath = path.resolve(args.result ?? "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  assert(baseUrl.protocol === "http:" && ["127.0.0.1", "localhost"].includes(baseUrl.hostname),
    "E2E 只允许调用本机 HTTP 应用");
  assert(supabaseUrl && anonKey, "Preview Supabase 环境变量缺失");
  const shadowUrl = new URL(supabaseUrl);
  assert(shadowUrl.hostname === `${SHADOW_PROJECT_REF}.supabase.co`,
    "拒绝执行：Preview 环境未指向 fixed Shadow");
  assert(loginPath && manifestPath && resultPath, "E2E 路径参数不完整");

  const login = parseLoginFile(await readFile(loginPath, "utf8"));
  assert(login.email && login.password, "本地登录文件缺少 email 或 password");

  const authBody = await fetchJson(
    new URL("/auth/v1/token?grant_type=password", shadowUrl),
    {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify(login),
      timeoutMs: 30_000,
    },
    "fixed Shadow 登录",
  );
  const accessToken = String(authBody?.access_token ?? "");
  const userId = String(authBody?.user?.id ?? "");
  assert(accessToken && UUID_PATTERN.test(userId), "fixed Shadow 登录未返回有效会话");

  const apiHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const restHeaders = { Authorization: `Bearer ${accessToken}`, apikey: anonKey };
  const appRequest = (pathname, options = {}, label = pathname) => fetchJson(
    new URL(pathname, baseUrl),
    {
      ...options,
      headers: { ...apiHeaders, ...(options.headers ?? {}) },
    },
    label,
  );
  const restRequest = (table, params, label) => fetchJson(
    restUrl(shadowUrl, table, params),
    { headers: restHeaders, timeoutMs: 30_000 },
    label,
  );

  const admin = await appRequest("/api/auth/admin", {}, "管理员会话检查");
  assert(admin?.success === true && admin?.isAdmin === true, "登录用户不是 fixed Shadow 管理员");

  const initial = await appRequest("/api/english/attempt", {}, "共享英语账本基线");
  assert(initial?.mode === "dual", `预期 dual 模式，实际为 ${String(initial?.mode)}`);
  const initialLedgerCount = Array.isArray(initial?.ledgers) ? initial.ledgers.length : 0;
  assert(initialLedgerCount >= 28, `共享英语账本基线不足：${initialLedgerCount}`);

  const [passages, sharedUsedRows, legacyUsedRows] = await Promise.all([
    restRequest("english_passages", {
      select: "id,section,year,passage_no,total_score",
      order: "year.asc,passage_no.asc",
    }, "读取英语题组"),
    restRequest("attempts", {
      select: "english_passage_id",
      user_id: `eq.${userId}`,
      source_kind: "eq.english_passage",
    }, "读取共享已用题组"),
    restRequest("english_attempts", {
      select: "passage_id",
      user_id: `eq.${userId}`,
    }, "读取旧路径已用题组"),
  ]);
  assert(Array.isArray(passages), "英语题组响应形状无效");
  const usedPassages = new Set([
    ...(Array.isArray(sharedUsedRows) ? sharedUsedRows.map((row) => row?.english_passage_id) : []),
    ...(Array.isArray(legacyUsedRows) ? legacyUsedRows.map((row) => row?.passage_id) : []),
  ].filter((value) => typeof value === "string"));

  const candidates = passages.filter((passage) => UUID_PATTERN.test(String(passage?.id ?? ""))
    && !usedPassages.has(passage.id));
  const questionCache = new Map();
  const getQuestions = async (passageId) => {
    if (!questionCache.has(passageId)) {
      const rows = await restRequest("english_questions", {
        select: "id,passage_id,standard_answer,score,sort_order",
        passage_id: `eq.${passageId}`,
        order: "sort_order.asc",
      }, "读取英语题目");
      questionCache.set(passageId, Array.isArray(rows) ? rows : []);
    }
    return questionCache.get(passageId);
  };

  let objectivePassage;
  let objectiveQuestions;
  for (const candidate of candidates.filter((passage) => OBJECTIVE_SECTIONS.has(passage.section))) {
    const questions = await getQuestions(candidate.id);
    if (questions.length > 0 && questions.every((question) => UUID_PATTERN.test(String(question?.id ?? ""))
      && typeof question.standard_answer === "string"
      && question.standard_answer.trim())) {
      objectivePassage = candidate;
      objectiveQuestions = questions;
      break;
    }
  }
  let subjectivePassage;
  let subjectiveQuestions;
  for (const candidate of candidates
    .filter((passage) => SUBJECTIVE_SECTIONS.has(passage.section))
    .sort((left, right) => (left.section === "translation" ? -1 : 1) - (right.section === "translation" ? -1 : 1))) {
    const questions = await getQuestions(candidate.id);
    const maxScore = questions.reduce((sum, question) => sum + Number(question?.score ?? 0), 0);
    if (questions.length > 0 && maxScore > 0
      && questions.every((question) => UUID_PATTERN.test(String(question?.id ?? "")))) {
      subjectivePassage = candidate;
      subjectiveQuestions = questions;
      break;
    }
  }
  assert(objectivePassage && objectiveQuestions, "没有找到未使用且具有完整标准答案的客观题组");
  assert(subjectivePassage && subjectiveQuestions, "没有找到未使用且可评分的主观题组");

  const manifest = {
    version: 1,
    shadowProjectRef: SHADOW_PROJECT_REF,
    userId,
    objectivePassageId: objectivePassage.id,
    subjectivePassageId: subjectivePassage.id,
    createdAt: new Date().toISOString(),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

  const objectiveAnswers = Object.fromEntries(
    objectiveQuestions.map((question) => [question.id, question.standard_answer]),
  );
  const wrongObjectiveAnswers = { ...objectiveAnswers };
  const firstObjectiveQuestionId = objectiveQuestions[0].id;
  wrongObjectiveAnswers[firstObjectiveQuestionId] = "__WP5_INTENTIONAL_WRONG_ANSWER__";

  const postAttempt = (payload, label) => appRequest("/api/english/attempt", {
    method: "POST",
    body: JSON.stringify(payload),
  }, label);
  const objectiveDraft = await postAttempt({
    passageId: objectivePassage.id,
    round: 1,
    action: "save_draft",
    answers: objectiveAnswers,
    commandId: randomUUID(),
  }, "客观题第一轮草稿");
  assert(objectiveDraft.mode === "dual", "客观题草稿未走 dual 模式");
  assert(getRound(getLedger(objectiveDraft, objectivePassage.id), 1)?.status === "in_progress",
    "客观题第一轮草稿状态不是 in_progress");

  const objectiveRound1 = await postAttempt({
    passageId: objectivePassage.id,
    round: 1,
    action: "submit",
    answers: objectiveAnswers,
    commandId: randomUUID(),
  }, "客观题第一轮提交");
  const objectiveRound1Record = getRound(getLedger(objectiveRound1, objectivePassage.id), 1);
  const objectiveRound1Revision = getLatestRevision(objectiveRound1Record);
  assert(objectiveRound1Record?.status === "submitted", "客观题第一轮未进入 submitted");
  assert(objectiveRound1Revision?.gradeOrigin === "system_scored", "客观题第一轮没有 system_scored");
  assert(objectiveRound1?.attempt?.status === "submitted", "客观题第一轮没有 dual 旧路径投影");

  const objectiveRound2Start = await postAttempt({
    passageId: objectivePassage.id,
    round: 1,
    action: "start_next",
    answers: {},
    commandId: randomUUID(),
  }, "客观题开始第二轮");
  const objectiveAfterStart = getLedger(objectiveRound2Start, objectivePassage.id);
  assert(getRound(objectiveAfterStart, 1)?.status === "sealed", "客观题第一轮未封存");
  assert(getRound(objectiveAfterStart, 2)?.status === "in_progress", "客观题第二轮未开始");

  const objectiveWrong = await postAttempt({
    passageId: objectivePassage.id,
    round: 2,
    action: "submit",
    answers: wrongObjectiveAnswers,
    commandId: randomUUID(),
  }, "客观题第二轮错误提交");
  const wrongRound = getRound(getLedger(objectiveWrong, objectivePassage.id), 2);
  const wrongRevision = getLatestRevision(wrongRound);
  assert(wrongRound?.status === "submitted" && wrongRevision?.gradeOrigin === "system_scored",
    "客观题第二轮错误提交没有形成系统评分");

  const objectiveCorrected = await postAttempt({
    passageId: objectivePassage.id,
    round: 2,
    action: "submit",
    answers: objectiveAnswers,
    commandId: randomUUID(),
  }, "客观题第二轮纠正提交");
  const correctedRound = getRound(getLedger(objectiveCorrected, objectivePassage.id), 2);
  const correctedRevision = getLatestRevision(correctedRound);
  assert(correctedRound?.revisions?.length === 2, "客观题第二轮没有保留两次 immutable revisions");
  assert(correctedRevision?.kind === "correction", "客观题纠正提交没有标记为 correction");
  assert(correctedRevision?.score >= wrongRevision?.score, "客观题纠正后分数没有提升或持平");

  const subjectiveAnswers = Object.fromEntries(subjectiveQuestions.map((question) => [
    question.id,
    "用于 WP5 受控端到端验证的简短作答。",
  ]));
  const subjectiveMaxScore = subjectiveQuestions
    .reduce((sum, question) => sum + Number(question?.score ?? 0), 0);
  const suggestion = {
    score: Number((subjectiveMaxScore * 0.6).toFixed(1)),
    maxScore: subjectiveMaxScore,
    feedback: "WP5 受控验证建议分；仅用于验证建议、终分与下一轮门禁。",
    strengths: ["建议评分事件已按 append-only 方式记录"],
    issues: ["本次安全验证未向外部模型发送 fixed Shadow 题目数据"],
    suggestions: ["真实模型样例需单独取得数据外发授权后执行"],
    confidence: 0.5,
  };

  const subjectiveSuggestion = await appRequest("/api/english/subjective", {
    method: "POST",
    body: JSON.stringify({
      action: "record_suggestion",
      passageId: subjectivePassage.id,
      round: 1,
      answers: subjectiveAnswers,
      commandId: randomUUID(),
      suggestion,
    }),
  }, "记录主观题 AI 建议");
  const subjectiveRound1 = getRound(getLedger(subjectiveSuggestion, subjectivePassage.id), 1);
  const subjectiveRevision = getLatestRevision(subjectiveRound1);
  assert(subjectiveRound1?.status === "submitted", "主观题建议提交未进入 submitted");
  assert(subjectiveRevision?.gradeOrigin === "ai_suggested", "主观题建议未保持 advisory 来源");

  let formalGateRejected = false;
  try {
    await postAttempt({
      passageId: subjectivePassage.id,
      round: 1,
      action: "start_next",
      answers: {},
      commandId: randomUUID(),
    }, "主观题未终分时开始下一轮");
  } catch (error) {
    formalGateRejected = Number(error?.status) >= 400;
  }
  assert(formalGateRejected, "主观题没有终分时错误地允许开始下一轮");

  const subjectiveFinal = await appRequest("/api/english/subjective", {
    method: "POST",
    body: JSON.stringify({
      action: "confirm_final",
      passageId: subjectivePassage.id,
      revisionId: subjectiveRevision.id,
      commandId: randomUUID(),
      score: Number(suggestion.score),
      feedback: suggestion.feedback,
      breakdown: suggestion.breakdown ?? {
        strengths: suggestion.strengths ?? [],
        issues: suggestion.issues ?? [],
        suggestions: suggestion.suggestions ?? [],
        confidence: suggestion.confidence ?? null,
      },
    }),
  }, "确认主观题用户终分");
  const finalRevision = getLatestRevision(getRound(getLedger(subjectiveFinal, subjectivePassage.id), 1));
  assert(finalRevision?.gradeOrigin === "user_final" && hasGradeOrigin(finalRevision, "ai_suggested"),
    "主观题终分没有同时保留 ai_suggested 与 user_final");

  const subjectiveRound2Start = await postAttempt({
    passageId: subjectivePassage.id,
    round: 1,
    action: "start_next",
    answers: {},
    commandId: randomUUID(),
  }, "主观题终分后开始第二轮");
  const subjectiveAfterStart = getLedger(subjectiveRound2Start, subjectivePassage.id);
  assert(getRound(subjectiveAfterStart, 1)?.status === "sealed", "主观题终分后第一轮未封存");
  assert(getRound(subjectiveAfterStart, 2)?.status === "in_progress", "主观题终分后第二轮未开始");

  const result = {
    version: 1,
    ok: true,
    shadowProjectRef: SHADOW_PROJECT_REF,
    mode: initial.mode,
    initialLedgerCount,
    objective: {
      section: objectivePassage.section,
      questionCount: objectiveQuestions.length,
      round1Score: objectiveRound1Revision.score,
      round2InitialScore: wrongRevision.score,
      round2CorrectedScore: correctedRevision.score,
      revisionCount: correctedRound.revisions.length,
      legacyProjected: objectiveRound1?.attempt?.status === "submitted",
    },
    subjective: {
      section: subjectivePassage.section,
      questionCount: subjectiveQuestions.length,
      externalModelSkipped: true,
      externalModelSkipReason: "fixed Shadow 题目数据未获外发授权",
      model: "not-called",
      tokensUsed: 0,
      suggestedScore: Number(suggestion.score),
      formalGateRejected,
      finalOrigin: finalRevision.gradeOrigin,
      nextRoundStarted: getRound(subjectiveAfterStart, 2)?.status === "in_progress",
    },
    cleanupVerified: false,
    completedAt: new Date().toISOString(),
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write("WP5 Preview API E2E core passed; awaiting exact cleanup verification.\n");
}

main().catch(async (error) => {
  const args = readArgs(process.argv.slice(2));
  const resultPath = args.result ? path.resolve(args.result) : "";
  const message = error instanceof Error ? error.message : "WP5 Preview API E2E 失败";
  if (resultPath) {
    const failure = {
      version: 1,
      ok: false,
      shadowProjectRef: SHADOW_PROJECT_REF,
      error: message.slice(0, 800),
      cleanupVerified: false,
      failedAt: new Date().toISOString(),
    };
    await writeFile(resultPath, `${JSON.stringify(failure, null, 2)}\n`, "utf8").catch(() => {});
  }
  console.error(message);
  process.exitCode = 1;
});
