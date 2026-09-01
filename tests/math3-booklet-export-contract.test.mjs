import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const component = readFileSync(resolve("components/tools/Math3SelfTest.tsx"), "utf8");
const css = readFileSync(resolve("app/globals.css"), "utf8");
const skill = readFileSync(resolve("skills/math3-paper-simulation/SKILL.md"), "utf8");
const exportReference = readFileSync(resolve("skills/math3-paper-simulation/references/exam-and-export.md"), "utf8");
const verification = readFileSync(resolve("lib/math3-paper-verification.ts"), "utf8");
const layout = readFileSync(resolve("lib/math3-booklet-layout.ts"), "utf8");

test("数学三题目册和答案册使用固定 9 面分页契约", () => {
  assert.match(component, /showSectionHeading/);
  assert.match(component, /Math3BookletAnswerObjectivePage/);
  assert.match(component, /Math3BookletAnswerSolutionPage/);
  assert.doesNotMatch(component, /Math3BookletAnswerPage/);
  assert.doesNotMatch(component, /解答题 · 一题一面/);
  assert.doesNotMatch(component, /客观题页/);
  assert.match(component, /三、解答题：第 17～22 题/);
});

test("数学三打印样式锁定 iPad 横屏继承字号并禁用网页式答案卡片", () => {
  const math3PrintCss = css.slice(css.indexOf("@media print"));
  assert.match(math3PrintCss, /\.math3-booklet-page,\s*\n\s*\.math3-booklet-cover[\s\S]*?font-size: 11\.5pt !important/);
  assert.match(math3PrintCss, /\.math3-booklet-section-heading[\s\S]*?font-size: 11\.5pt !important/);
  assert.match(math3PrintCss, /\.math3-booklet-page-footer[\s\S]*?font-size: 11\.5pt !important/);
  assert.match(math3PrintCss, /\.booklet-page\s*\{[\s\S]*?position: relative !important/);
  assert.match(math3PrintCss, /\.math3-booklet-page-footer\s*\{[\s\S]*?position: absolute !important[\s\S]*?top: 8mm !important[\s\S]*?right: 18\.1mm !important[\s\S]*?text-align: right !important/);
  assert.doesNotMatch(math3PrintCss, /\.math3-booklet-section-heading[\s\S]*?font-size: 13pt !important/);
  assert.doesNotMatch(component, /bg-green-50|bg-sky-50|border-green-200|border-sky-200/);
});

test("数学三 skill 要求选定浏览器打印入口与生成后门禁同时同步", () => {
  assert.match(skill, /选定的真实打印入口与对应 CSS\/模板同时落地/);
  assert.match(skill, /Blog is optional/);
  assert.match(skill, /standalone local HTML\/CSS/);
  assert.match(skill, /导出同步门禁/);
  assert.match(skill, /ReportLab/);
  assert.match(skill, /window\.print/);
  assert.match(exportReference, /scripts\/verify_booklet_structure\.py/);
  assert.match(exportReference, /不得使用 `questions\.map\(question => one answer page\)`/);
});

test("完整卷客观题分页在代码层固定为 5+5+6", () => {
  assert.match(layout, /mode: Math3SelfTestMode = "quick"/);
  assert.match(layout, /chunkSection\(choices, "choice", 5\)/);
  assert.match(layout, /chunkSection\(fills, "fill", 6\)/);
  assert.match(component, /paginateMath3ObjectiveQuestions\(test\.paper\.questions, orientation, test\.mode\)/);
});

test("数学三命题校验拒绝常见的一维公式降级", () => {
  assert.match(verification, /unicode_square_root/);
  assert.match(verification, /plain_fraction/);
  assert.match(verification, /plain_limit/);
  assert.match(verification, /matrix_literal/);
  assert.match(verification, /plain_infinity_index/);
});
