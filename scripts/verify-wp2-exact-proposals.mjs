import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeMarkdownRisks } from "../lib/content-contract.ts";
import { normalizeMarkdownForRender, renderMarkdownToHtml } from "../lib/markdown.ts";

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDir = resolve(
  workspace,
  ".local-backups/wp2-markdown-review/wp2-2026-07-12-8e6425fc",
);

function parseArgs(argv) {
  const args = {
    input: resolve(packageDir, "ai-proposals-exact.json"),
    request: resolve(packageDir, "ai-review-request.json"),
    legacy: resolve(packageDir, "ai-proposals-20260720.json"),
    report: resolve(packageDir, "ai-proposals-exact-verification.json"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!["--input", "--request", "--legacy", "--report"].includes(arg)) {
      throw new Error(`未知参数：${arg}`);
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`${arg} 缺少参数值`);
    index += 1;
    args[arg.slice(2)] = resolve(workspace, value);
  }
  return args;
}

function assertInside(parent, child, label) {
  const path = relative(parent, child);
  if (path === "" || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error(`${label} 越界`);
  }
}

function asObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  return value;
}

function asString(value, label) {
  if (typeof value !== "string") throw new Error(`${label} 必须是字符串`);
  return value;
}

function readJson(path, label) {
  return asObject(JSON.parse(readFileSync(path, "utf8")), label);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function extractImageUrls(markdown) {
  return Array.from(markdown.matchAll(/!\[[^\]\n]*\]\(((?:\\.|[^)\n])+)\)/g), (match) => (
    match[1].replace(/\s+"[^"\n]*"$/g, "").replace(/\\([()])/g, "$1").trim()
  )).filter(Boolean);
}

function extractAllUrls(markdown) {
  return Array.from(markdown.matchAll(/https?:\/\/[^\s)\]}>"']+/g), (match) => match[0]);
}

function extractHanSequence(markdown) {
  return markdown.match(/\p{Script=Han}/gu) ?? [];
}

function extractNumberSequence(markdown) {
  return markdown.match(/\d+(?:[.,]\d+)*/g) ?? [];
}

function extractOptionPrefixes(markdown) {
  return Array.from(markdown.matchAll(/(?:^|\n)\s*([A-H])\s*[.．、:：)]/g), (match) => match[1]);
}

function stripMath(markdown) {
  return markdown
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/(?<!\$)\$(?!\$)[^\n$]*?(?<!\$)\$(?!\$)/g, " ")
    .replace(/\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}/g, " ");
}

function proseSkeleton(markdown) {
  return stripMath(markdown)
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~{}\[\]\\]/g, " ")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLowerCase();
}

function countPattern(markdown, pattern) {
  return markdown.match(pattern)?.length ?? 0;
}

const IGNORED_LAYOUT_COMMANDS = new Set([
  "left",
  "right",
  "middle",
  "big",
  "Big",
  "bigg",
  "Bigg",
  "bigl",
  "bigr",
  "Bigl",
  "Bigr",
  "biggl",
  "biggr",
  "Biggl",
  "Biggr",
  "quad",
  "qquad",
  "displaystyle",
  "textstyle",
]);

function semanticTokenSequence(markdown) {
  const normalized = normalizeMarkdownForRender(markdown)
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, " ")
    .replace(/<!--dashed-sep-->|<dashed-separator><\/dashed-separator>|§DASHEDSEP§/g, " ")
    .replace(/Asteroid(?:LatexLineBreak|SignedMathLine|ListMarkerSpace)Token\d*/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}|[*+-]|\d+\.)\s+/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\$+/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  const tokens = normalized.match(
    /\\[A-Za-z]+|\\\\|[A-Za-z]+|\d+(?:[.,]\d+)*|(?:<=|>=|!=|==)|[=+\-*/^_<>|&]/g,
  ) ?? [];

  return tokens.filter((token) => (
    !token.startsWith("\\") || !IGNORED_LAYOUT_COMMANDS.has(token.slice(1))
  ));
}

function renderWarningCode(args) {
  const message = args.map((value) => String(value)).join(" ");
  const katexCode = message.match(/\[([A-Za-z0-9]+)\]\s*$/)?.[1];
  if (katexCode) return katexCode;
  if (message.includes("No character metrics")) return "missingCharacterMetrics";
  return "unclassifiedRenderWarning";
}

function renderDiagnostic(markdown) {
  const warningCodes = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warningCodes.push(renderWarningCode(args));
  try {
    renderMarkdownToHtml(markdown);
    return { pass: true, warningCodes };
  } catch {
    return { pass: false, warningCodes };
  } finally {
    console.warn = originalWarn;
  }
}

function countValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function warningCountsWorsened(sourceCodes, reviewedCodes) {
  const sourceCounts = countValues(sourceCodes);
  const reviewedCounts = countValues(reviewedCodes);
  return Array.from(reviewedCounts).some(([code, count]) => (
    count > (sourceCounts.get(code) ?? 0)
  ));
}

function mathProfile(markdown) {
  return {
    displayMarkers: countPattern(markdown, /(?<!\\)\$\$/g),
    inlineMarkers: countPattern(markdown.replace(/(?<!\\)\$\$/g, ""), /(?<!\\)\$/g),
    beginEnvironments: countPattern(markdown, /\\begin\{[^}]+\}/g),
    endEnvironments: countPattern(markdown, /\\end\{[^}]+\}/g),
    matrixRowBreaks: countPattern(markdown, /\\\\/g),
    integrals: countPattern(markdown, /\\int\b/g),
    differentialCommands: countPattern(markdown, /\\(?:mathrm|operatorname)\s*\{d\}/g),
  };
}

function profilesEqual(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function itemMap(items, label) {
  if (!Array.isArray(items)) throw new Error(`${label}.items 必须是数组`);
  const map = new Map();
  for (const [index, rawItem] of items.entries()) {
    const item = asObject(rawItem, `${label}.items[${index}]`);
    const reviewId = asString(item.reviewId, `${label}.items[${index}].reviewId`);
    if (!reviewId || map.has(reviewId)) throw new Error(`${label} reviewId 缺失或重复`);
    map.set(reviewId, item);
  }
  return map;
}

function verify() {
  const args = parseArgs(process.argv.slice(2));
  for (const [label, path] of Object.entries(args)) assertInside(workspace, path, label);

  const requestPackage = readJson(args.request, "requestPackage");
  const legacyPackage = readJson(args.legacy, "legacyPackage");
  const exactPackage = readJson(args.input, "exactPackage");
  const requestById = itemMap(requestPackage.items, "requestPackage");
  const legacyById = itemMap(legacyPackage.items, "legacyPackage");
  const exactById = itemMap(exactPackage.items, "exactPackage");

  if (requestById.size !== 11 || legacyById.size !== 11 || exactById.size !== 11) {
    throw new Error("request/legacy/exact 必须全部是 11 条");
  }
  if (exactPackage.itemCount !== 11 || exactPackage.invalidItemCount !== 0 || exactPackage.exactCaptureCount !== 11) {
    throw new Error("exact 根级计数不符合 11/11 契约");
  }

  const diagnostics = [];
  let structuralFailureCount = 0;
  for (const [reviewId, requestItem] of requestById) {
    const legacyItem = legacyById.get(reviewId);
    const exactItem = exactById.get(reviewId);
    if (!legacyItem || !exactItem) throw new Error("三份包的 reviewId 集合不一致");

    const sourceText = asString(requestItem.sourceText, `${reviewId}.request.sourceText`);
    const sourceChecksum = asString(requestItem.sourceChecksum, `${reviewId}.request.sourceChecksum`);
    const reviewedMarkdown = asString(exactItem.reviewedMarkdown, `${reviewId}.reviewedMarkdown`);
    const reviewedChecksum = asString(exactItem.reviewedChecksum, `${reviewId}.reviewedChecksum`);
    const sourceStable = sha256(sourceText) === sourceChecksum
      && legacyItem.sourceChecksum === sourceChecksum
      && exactItem.sourceChecksum === sourceChecksum
      && legacyItem.sourceText === sourceText
      && exactItem.sourceText === sourceText;
    const locationStable = legacyItem.noteId === requestItem.noteId
      && exactItem.noteId === requestItem.noteId
      && legacyItem.fieldPath === requestItem.fieldPath
      && exactItem.fieldPath === requestItem.fieldPath;
    const reviewedChecksumValid = sha256(reviewedMarkdown) === reviewedChecksum;
    const imageUrlsPreserved = extractImageUrls(sourceText)
      .every((url) => reviewedMarkdown.includes(url));
    const allUrlsPreserved = extractAllUrls(sourceText)
      .every((url) => reviewedMarkdown.includes(url));
    const apiResponseExact = exactItem.captureKind !== "api_json_response" || (
      exactItem.apiResponse?.success === true
      && exactItem.apiResponse?.markdown === reviewedMarkdown
      && exactItem.apiResponse?.model === "deepseek-v4-pro"
      && exactItem.apiResponse?.chunkIndex === 1
      && exactItem.apiResponse?.chunkCount === 1
    );

    const sourceRender = renderDiagnostic(sourceText);
    const reviewedRender = renderDiagnostic(reviewedMarkdown);
    const renderPass = reviewedRender.pass;
    const renderWarningsWorsened = warningCountsWorsened(
      sourceRender.warningCodes,
      reviewedRender.warningCodes,
    );
    const sourceRisks = analyzeMarkdownRisks(sourceText, sourceText).map((risk) => risk.code);
    const reviewedRisks = analyzeMarkdownRisks(reviewedMarkdown, reviewedMarkdown).map((risk) => risk.code);
    const transitionRisks = analyzeMarkdownRisks(sourceText, reviewedMarkdown).map((risk) => risk.code);
    const sourceMathProfile = mathProfile(sourceText);
    const reviewedMathProfile = mathProfile(reviewedMarkdown);
    const sourceCollapsedDisplayMathCount = countPattern(sourceText, /\$\$[^$\n]+\$\$\$\$/g);
    const reviewedCollapsedDisplayMathCount = countPattern(reviewedMarkdown, /\$\$[^$\n]+\$\$\$\$/g);
    const semanticTokensEqual = arraysEqual(
      semanticTokenSequence(sourceText),
      semanticTokenSequence(reviewedMarkdown),
    );
    const changed = sourceText !== reviewedMarkdown;
    const structuralPass = sourceStable
      && locationStable
      && reviewedChecksumValid
      && imageUrlsPreserved
      && allUrlsPreserved
      && apiResponseExact
      && renderPass;
    const deterministicSafetyCandidate = structuralPass
      && semanticTokensEqual
      && reviewedRisks.length === 0
      && !renderWarningsWorsened
      && reviewedCollapsedDisplayMathCount <= sourceCollapsedDisplayMathCount;
    if (!structuralPass) structuralFailureCount += 1;

    diagnostics.push({
      reviewId,
      fieldPath: exactItem.fieldPath,
      captureKind: exactItem.captureKind,
      sourceLength: sourceText.length,
      reviewedLength: reviewedMarkdown.length,
      changed,
      structuralPass,
      sourceStable,
      locationStable,
      reviewedChecksumValid,
      imageUrlsPreserved,
      allUrlsPreserved,
      apiResponseExact,
      renderPass,
      sourceRenderWarningCodes: sourceRender.warningCodes,
      reviewedRenderWarningCodes: reviewedRender.warningCodes,
      renderWarningsWorsened,
      sourceRiskCodes: sourceRisks,
      reviewedRiskCodes: reviewedRisks,
      transitionRiskCodes: transitionRisks,
      hanSequenceEqual: arraysEqual(extractHanSequence(sourceText), extractHanSequence(reviewedMarkdown)),
      numberSequenceEqual: arraysEqual(extractNumberSequence(sourceText), extractNumberSequence(reviewedMarkdown)),
      optionPrefixesEqual: arraysEqual(extractOptionPrefixes(sourceText), extractOptionPrefixes(reviewedMarkdown)),
      proseSkeletonEqual: proseSkeleton(sourceText) === proseSkeleton(reviewedMarkdown),
      mathProfileChanged: !profilesEqual(sourceMathProfile, reviewedMathProfile),
      matrixRowBreakChanged: sourceMathProfile.matrixRowBreaks !== reviewedMathProfile.matrixRowBreaks,
      integralCountChanged: sourceMathProfile.integrals !== reviewedMathProfile.integrals,
      differentialCommandCountChanged: sourceMathProfile.differentialCommands !== reviewedMathProfile.differentialCommands,
      sourceCollapsedDisplayMathCount,
      reviewedCollapsedDisplayMathCount,
      semanticTokensEqual,
      deterministicClassification: !changed
        ? "no_op"
        : deterministicSafetyCandidate
          ? "safe_candidate"
          : "manual_reject",
    });
  }

  const apiCount = diagnostics.filter((item) => item.captureKind === "api_json_response").length;
  const snapshotCount = diagnostics.filter((item) => item.captureKind === "editor_text_snapshot").length;
  if (apiCount !== 8 || snapshotCount !== 0 || structuralFailureCount !== 0) {
    throw new Error(`精确捕获矩阵失败：api=${apiCount}, snapshot=${snapshotCount}, structuralFailures=${structuralFailureCount}`);
  }

  const report = {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    inputFile: relative(workspace, args.input).replaceAll("\\", "/"),
    itemCount: diagnostics.length,
    apiJsonResponseCount: apiCount,
    legacyExactCount: diagnostics.length - apiCount,
    snapshotCount,
    structuralFailureCount,
    changedItemCount: diagnostics.filter((item) => item.changed).length,
    reviewedRiskItemCount: diagnostics.filter((item) => item.reviewedRiskCodes.length > 0).length,
    hanSequenceMismatchCount: diagnostics.filter((item) => !item.hanSequenceEqual).length,
    numberSequenceMismatchCount: diagnostics.filter((item) => !item.numberSequenceEqual).length,
    optionPrefixMismatchCount: diagnostics.filter((item) => !item.optionPrefixesEqual).length,
    proseSkeletonMismatchCount: diagnostics.filter((item) => !item.proseSkeletonEqual).length,
    mathProfileChangedCount: diagnostics.filter((item) => item.mathProfileChanged).length,
    matrixRowBreakChangedCount: diagnostics.filter((item) => item.matrixRowBreakChanged).length,
    integralCountChangedCount: diagnostics.filter((item) => item.integralCountChanged).length,
    differentialCommandCountChangedCount: diagnostics.filter((item) => item.differentialCommandCountChanged).length,
    renderWarningWorsenedCount: diagnostics.filter((item) => item.renderWarningsWorsened).length,
    semanticTokenMismatchCount: diagnostics.filter((item) => !item.semanticTokensEqual).length,
    safeCandidateCount: diagnostics.filter((item) => item.deterministicClassification === "safe_candidate").length,
    noOpCount: diagnostics.filter((item) => item.deterministicClassification === "no_op").length,
    manualRejectCount: diagnostics.filter((item) => item.deterministicClassification === "manual_reject").length,
    diagnostics,
  };
  writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    structuralValid: true,
    itemCount: report.itemCount,
    apiJsonResponseCount: report.apiJsonResponseCount,
    snapshotCount: report.snapshotCount,
    changedItemCount: report.changedItemCount,
    reviewedRiskItemCount: report.reviewedRiskItemCount,
    hanSequenceMismatchCount: report.hanSequenceMismatchCount,
    numberSequenceMismatchCount: report.numberSequenceMismatchCount,
    optionPrefixMismatchCount: report.optionPrefixMismatchCount,
    proseSkeletonMismatchCount: report.proseSkeletonMismatchCount,
    mathProfileChangedCount: report.mathProfileChangedCount,
    matrixRowBreakChangedCount: report.matrixRowBreakChangedCount,
    integralCountChangedCount: report.integralCountChangedCount,
    differentialCommandCountChangedCount: report.differentialCommandCountChangedCount,
    renderWarningWorsenedCount: report.renderWarningWorsenedCount,
    semanticTokenMismatchCount: report.semanticTokenMismatchCount,
    safeCandidateCount: report.safeCandidateCount,
    noOpCount: report.noOpCount,
    manualRejectCount: report.manualRejectCount,
  }));
}

verify();
