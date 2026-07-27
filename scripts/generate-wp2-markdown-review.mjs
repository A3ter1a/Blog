import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdownToHtml } from "../lib/markdown.ts";

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)));
const planRoot = resolve(workspace, ".local-backups/wp2-markdown-migration");
const reviewRoot = resolve(workspace, ".local-backups/wp2-markdown-review");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--plan") {
      args.plan = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`未知参数：${arg}`);
  }
  return args;
}

function assertInside(parent, child, label) {
  const relativePath = relative(parent, child);
  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`${label} 越界：${child}`);
  }
}

function latestPlanPath() {
  const candidates = readdirSync(planRoot)
    .filter((name) => name.endsWith(".json"))
    .map((name) => resolve(planRoot, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  if (candidates.length === 0) throw new Error("本地 WP2 migration plan 不存在");
  return candidates[0];
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isolateRenderedHtml(html) {
  return html.replace(/<img\b[^>]*>/gi, '<span class="image-placeholder">[图片已隔离，不发起外网请求]</span>');
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

function buildReviewId(item) {
  return `review-${sha256(`${item.noteId}\u001f${item.fieldPath}`).slice(0, 12)}`;
}

function riskLabel(code) {
  return ({
    collapsed_display_math: "展示公式粘连",
    latex_environment_outside_math: "LaTeX 环境位于定界符外",
    normalization_changed_math: "规范化触及公式语义",
    unbalanced_display_math: "展示公式定界符未配对",
    unbalanced_inline_math: "行内公式定界符未配对",
  })[code] ?? code;
}

function renderReviewItem(item, index) {
  const reviewId = buildReviewId(item);
  const risks = item.risks.map((risk) => `
    <li><strong>${escapeHtml(riskLabel(risk.code))}</strong><span>${escapeHtml(risk.message)}</span></li>`).join("");

  return `
  <article class="review-card" id="${reviewId}">
    <header>
      <div>
        <span class="case-index">案例 ${index + 1}</span>
        <h2>${escapeHtml(item.noteTitle || "未命名文章")}</h2>
        <p>${escapeHtml(item.fieldPath)}</p>
      </div>
      <span class="decision hold">保持原文</span>
    </header>
    <ul class="risk-list">${risks}</ul>
    <a class="case-link" href="cases/${reviewId}.html">打开单项复核 →</a>
  </article>`;
}

function renderCaseHtml({ item, index, total, katexCss }) {
  const reviewId = buildReviewId(item);
  const risks = item.risks.map((risk) => `
    <li><strong>${escapeHtml(riskLabel(risk.code))}</strong><span>${escapeHtml(risk.message)}</span></li>`).join("");
  const rendered = isolateRenderedHtml(renderMarkdownToHtml(item.beforeText));

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'self' data:; img-src data:;">
  <title>案例 ${index + 1} · ${escapeHtml(item.noteTitle || "未命名文章")}</title>
  <style>${katexCss.replaceAll("assets/katex-fonts/", "../assets/katex-fonts/")}</style>
  <style>
    :root { color-scheme: light; font-family: Inter, "Noto Sans SC", "Microsoft YaHei", sans-serif; background: #f3efe8; color: #17253a; }
    * { box-sizing: border-box; }
    body { margin: 0; background: radial-gradient(circle at top left, #fff 0, #f5f0e8 42%, #ece4da 100%); }
    main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 34px 0 72px; }
    nav { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid #263c55; padding-bottom: 14px; }
    nav a { color: #243b53; font-size: 13px; font-weight: 800; text-decoration: none; }
    header { display: flex; justify-content: space-between; gap: 20px; align-items: start; padding: 28px 0 18px; }
    .eyebrow { color: #9b4f38; font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 8px 0 6px; font: 500 clamp(30px, 5vw, 56px)/1.05 Georgia, "Songti SC", serif; }
    header p { margin: 0; color: #6b7280; font-family: ui-monospace, monospace; font-size: 12px; }
    .decision { border: 1px solid currentColor; color: #9b4f38; padding: 6px 10px; font-size: 12px; font-weight: 800; white-space: nowrap; }
    .risk-list { display: grid; gap: 8px; margin: 0 0 22px; padding: 0; list-style: none; }
    .risk-list li { display: grid; grid-template-columns: minmax(180px, .45fr) 1fr; gap: 16px; border-block-start: 1px solid #d5c9bb; padding-top: 8px; font-size: 13px; }
    .risk-list span { color: #667085; }
    .compare-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(280px, .7fr); gap: 20px; align-items: start; }
    .compare-grid > section { min-width: 0; border: 1px solid #d5c9bb; background: rgba(255,253,250,.86); padding: 18px; }
    h2 { margin: 0 0 14px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
    .markdown-surface { overflow-wrap: anywhere; line-height: 1.8; }
    .markdown-surface pre { overflow-x: auto; background: #f1ede6; padding: 12px; }
    .markdown-surface .katex-display { overflow-x: auto; overflow-y: hidden; padding: 6px 0; }
    .image-placeholder, .proposal-empty { display: grid; place-items: center; min-height: 140px; border: 1px dashed #bdad99; background: #f7f1e9; color: #795548; text-align: center; padding: 16px; }
    .proposal-empty span { margin-top: 8px; color: #6b7280; font-size: 13px; line-height: 1.7; }
    details { margin-top: 18px; border-top: 1px solid #d5c9bb; padding-top: 12px; }
    summary { cursor: pointer; color: #526174; font-size: 13px; font-weight: 700; }
    details pre { max-height: 36rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: #17253a; color: #edf2f7; padding: 16px; font: 12px/1.65 ui-monospace, Consolas, monospace; }
    @media (max-width: 820px) { .compare-grid { grid-template-columns: 1fr; } .risk-list li { grid-template-columns: 1fr; gap: 4px; } header { display: grid; } }
  </style>
</head>
<body>
  <main>
    <nav><a href="../index.html">← 返回风险总览</a><span>案例 ${index + 1} / ${total}</span></nav>
    <header>
      <div><span class="eyebrow">${reviewId}</span><h1>${escapeHtml(item.noteTitle || "未命名文章")}</h1><p>${escapeHtml(item.fieldPath)}</p></div>
      <span class="decision">保持原文</span>
    </header>
    <ul class="risk-list">${risks}</ul>
    <div class="compare-grid">
      <section><h2>当前网站渲染</h2><div class="markdown-surface">${rendered}</div></section>
      <section><h2>AI 建议状态</h2><div class="proposal-empty"><strong>尚未调用模型</strong><span>请求包已生成。模型输出需经 checksum、确定性 normalizer、风险检测和人工确认后才具备写入资格。</span></div></section>
    </div>
    <details><summary>查看原始 Markdown</summary><pre>${escapeHtml(item.beforeText)}</pre></details>
  </main>
</body>
</html>`;
}

function renderHtml({ batchId, totalCount, safeCount, reviewItems, riskCounts, katexCss }) {
  const riskSummary = Object.entries(riskCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => `<li><span>${escapeHtml(riskLabel(code))}</span><strong>${count}</strong></li>`)
    .join("");
  const cards = reviewItems.map(renderReviewItem).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'self' data:; img-src data:;">
  <title>Asteroid WP2 Markdown 高风险复核</title>
  <style>${katexCss}</style>
  <style>
    :root { color-scheme: light; font-family: Inter, "Noto Sans SC", "Microsoft YaHei", sans-serif; background: #f3efe8; color: #17253a; }
    * { box-sizing: border-box; }
    body { margin: 0; background: radial-gradient(circle at top left, #fff 0, #f5f0e8 42%, #ece4da 100%); }
    main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 80px; }
    .hero { display: grid; grid-template-columns: 1.5fr 1fr; gap: 24px; border-block: 1px solid #263c55; padding: 28px 0; }
    .eyebrow, .case-index { color: #9b4f38; font-size: 12px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 10px 0; font-family: Georgia, "Songti SC", serif; font-size: clamp(34px, 6vw, 72px); line-height: .98; font-weight: 500; }
    .hero p { max-width: 48rem; line-height: 1.8; color: #526174; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); align-content: end; gap: 12px; }
    .stat { border-left: 1px solid #b8aa98; padding-left: 14px; }
    .stat strong { display: block; font: 500 32px/1 Georgia, serif; }
    .stat span { display: block; margin-top: 8px; color: #6b7280; font-size: 12px; }
    .risk-summary { display: flex; flex-wrap: wrap; gap: 10px; padding: 20px 0 4px; list-style: none; }
    .risk-summary li { display: flex; gap: 12px; border-bottom: 1px solid #b8aa98; padding: 8px 4px; color: #526174; font-size: 13px; }
    .review-list { display: grid; gap: 28px; margin-top: 36px; }
    .review-card { background: rgba(255,255,255,.76); border-top: 3px solid #243b53; box-shadow: 0 18px 52px -42px #17253a; padding: 24px; }
    .review-card > header { display: flex; justify-content: space-between; gap: 20px; align-items: start; }
    .review-card h2 { margin: 6px 0 4px; font: 500 28px/1.2 Georgia, "Songti SC", serif; }
    .review-card header p { margin: 0; color: #6b7280; font-family: ui-monospace, monospace; font-size: 12px; }
    .decision { border: 1px solid currentColor; padding: 6px 10px; font-size: 12px; font-weight: 800; white-space: nowrap; }
    .hold { color: #9b4f38; }
    .risk-list { display: grid; gap: 8px; margin: 22px 0; padding: 0; list-style: none; }
    .risk-list li { display: grid; grid-template-columns: minmax(180px, .45fr) 1fr; gap: 16px; border-block-start: 1px solid #ddd3c7; padding-top: 8px; font-size: 13px; }
    .risk-list span { color: #667085; }
    .case-link { display: inline-flex; margin-top: 12px; border-bottom: 1px solid #243b53; padding: 6px 0; color: #243b53; font-size: 13px; font-weight: 800; text-decoration: none; }
    .compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .compare-grid > section { min-width: 0; border: 1px solid #ddd3c7; background: #fffdfa; padding: 18px; }
    h3 { margin: 0 0 14px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
    .markdown-surface { overflow-wrap: anywhere; line-height: 1.78; }
    .markdown-surface pre { overflow-x: auto; background: #f1ede6; padding: 12px; }
    .markdown-surface .katex-display { overflow-x: auto; overflow-y: hidden; padding: 6px 0; }
    .image-placeholder, .proposal-empty { display: grid; place-items: center; min-height: 110px; border: 1px dashed #bdad99; background: #f7f1e9; color: #795548; text-align: center; padding: 16px; }
    .proposal-empty span { margin-top: 8px; max-width: 30rem; color: #6b7280; font-size: 13px; line-height: 1.7; }
    details { margin-top: 16px; border-top: 1px solid #ddd3c7; padding-top: 12px; }
    summary { cursor: pointer; color: #526174; font-size: 13px; font-weight: 700; }
    details pre { max-height: 28rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: #17253a; color: #edf2f7; padding: 16px; font: 12px/1.65 ui-monospace, Consolas, monospace; }
    footer { margin-top: 40px; border-top: 1px solid #263c55; padding-top: 18px; color: #667085; font-size: 12px; }
    @media (max-width: 820px) { .hero, .compare-grid { grid-template-columns: 1fr; } .stats { margin-top: 8px; } .risk-list li { grid-template-columns: 1fr; gap: 4px; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div>
        <span class="eyebrow">AST-WP2 · ${escapeHtml(batchId)}</span>
        <h1>Markdown 高风险复核</h1>
        <p>确定性规则已安全处理 ${safeCount} 个字段。下面 ${reviewItems.length} 个字段触及数学语义边界，当前全部保持原文；本页不含写入按钮，也不连接 Supabase 或模型服务。</p>
      </div>
      <div class="stats">
        <div class="stat"><strong>${totalCount}</strong><span>扫描字段</span></div>
        <div class="stat"><strong>${safeCount}</strong><span>确定性变更</span></div>
        <div class="stat"><strong>${reviewItems.length}</strong><span>高风险保留</span></div>
      </div>
    </section>
    <ul class="risk-summary">${riskSummary}</ul>
    <section class="review-list">${cards}</section>
    <footer>离线审阅产物 · 图片外链已隔离 · 原文和请求包只保存在 .local-backups</footer>
  </main>
</body>
</html>`;
}

const args = parseArgs(process.argv.slice(2));
const planPath = resolve(workspace, args.plan ?? latestPlanPath());
assertInside(planRoot, planPath, "migration plan");
const plan = asObject(JSON.parse(readFileSync(planPath, "utf8")), "migration plan");
const batchId = asString(plan.batchId, "batchId");
if (!/^[A-Za-z0-9._-]{1,200}$/.test(batchId)) throw new Error("batchId 含不安全字符");
if (!Array.isArray(plan.snapshots)) throw new Error("migration plan 缺少 snapshots");

const snapshots = plan.snapshots.map((value, index) => {
  const item = asObject(value, `snapshots[${index}]`);
  const beforeText = asString(item.beforeText, `snapshots[${index}].beforeText`);
  const afterText = asString(item.afterText, `snapshots[${index}].afterText`);
  const beforeChecksum = asString(item.beforeChecksum, `snapshots[${index}].beforeChecksum`);
  const afterChecksum = asString(item.afterChecksum, `snapshots[${index}].afterChecksum`);
  if (sha256(beforeText) !== beforeChecksum || sha256(afterText) !== afterChecksum) {
    throw new Error(`snapshots[${index}] checksum 不匹配`);
  }
  return {
    ...item,
    noteId: asString(item.noteId, `snapshots[${index}].noteId`),
    noteTitle: asString(item.noteTitle, `snapshots[${index}].noteTitle`),
    fieldPath: asString(item.fieldPath, `snapshots[${index}].fieldPath`),
    beforeText,
    afterText,
    beforeChecksum,
    afterChecksum,
    risks: Array.isArray(item.risks) ? item.risks.map((risk) => asObject(risk, "risk")) : [],
  };
});

const reviewItems = snapshots.filter((item) => item.requiresReview === true);
if (reviewItems.length === 0) throw new Error("migration plan 没有高风险复核项");
for (const item of reviewItems) {
  if (item.beforeChecksum !== item.afterChecksum || item.beforeText !== item.afterText) {
    throw new Error(`高风险项 ${buildReviewId(item)} 已被自动改写，拒绝生成误导性报告`);
  }
}

const safeCount = snapshots.filter((item) => item.requiresReview !== true && item.beforeChecksum !== item.afterChecksum).length;
const riskCounts = reviewItems.flatMap((item) => item.risks).reduce((counts, risk) => {
  const code = asString(risk.code, "risk.code");
  counts[code] = (counts[code] ?? 0) + 1;
  return counts;
}, {});

const outputDir = resolve(reviewRoot, batchId);
assertInside(reviewRoot, outputDir, "review output");
mkdirSync(outputDir, { recursive: true });
const caseDir = resolve(outputDir, "cases");
mkdirSync(caseDir, { recursive: true });
const fontSource = resolve(workspace, "node_modules/katex/dist/fonts");
const fontTarget = resolve(outputDir, "assets/katex-fonts");
mkdirSync(resolve(outputDir, "assets"), { recursive: true });
cpSync(fontSource, fontTarget, { recursive: true, force: true });
const katexCss = readFileSync(resolve(workspace, "node_modules/katex/dist/katex.min.css"), "utf8")
  .replaceAll("url(fonts/", "url(assets/katex-fonts/");

const requestPackage = {
  packageVersion: 1,
  batchId,
  generatedAt: new Date().toISOString(),
  recommendedProvider: "deepseek",
  recommendedModel: "deepseek-v4-pro",
  mode: "proposal_only",
  items: reviewItems.map((item) => ({
    reviewId: buildReviewId(item),
    noteId: item.noteId,
    noteTitle: item.noteTitle,
    noteUpdatedAt: item.noteUpdatedAt,
    fieldPath: item.fieldPath,
    sourceText: item.beforeText,
    sourceChecksum: item.beforeChecksum,
    risks: item.risks,
    constraints: [
      "只修复已标记的 Markdown/LaTeX 结构问题",
      "保持事实、数字、题意、答案和文字顺序",
      "返回完整字段，不直接写数据库",
    ],
  })),
};

const summary = {
  summaryVersion: 1,
  batchId,
  sourcePlan: relative(workspace, planPath).replaceAll("\\", "/"),
  inspectedFieldCount: snapshots.length,
  deterministicChangeCount: safeCount,
  requiresReviewCount: reviewItems.length,
  reviewNoteCount: new Set(reviewItems.map((item) => item.noteId)).size,
  highRiskItemsPreserved: true,
  riskCounts,
  casePageCount: reviewItems.length,
  htmlPath: relative(workspace, resolve(outputDir, "index.html")).replaceAll("\\", "/"),
  requestPackagePath: relative(workspace, resolve(outputDir, "ai-review-request.json")).replaceAll("\\", "/"),
};

writeFileSync(resolve(outputDir, "index.html"), renderHtml({
  batchId,
  totalCount: snapshots.length,
  safeCount,
  reviewItems,
  riskCounts,
  katexCss,
}), "utf8");
reviewItems.forEach((item, index) => {
  writeFileSync(
    resolve(caseDir, `${buildReviewId(item)}.html`),
    renderCaseHtml({ item, index, total: reviewItems.length, katexCss }),
    "utf8",
  );
});
writeFileSync(resolve(outputDir, "ai-review-request.json"), `${JSON.stringify(requestPackage, null, 2)}\n`, "utf8");
writeFileSync(resolve(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log(JSON.stringify(summary));
