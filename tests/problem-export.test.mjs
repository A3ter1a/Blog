import test from 'node:test';
import assert from 'node:assert/strict';
import { problemsToStudyMarkdown, toggleProblemRange } from '../lib/problem-export.ts';

const problems = Array.from({length: 30}, (_, index) => ({
  id: `p${index + 1}`, type: 'calculation', difficulty: 'medium', tags: [],
  question: `设 $f(x)=x^2$。\n\n（1）求导数。\n\n（2）计算 $\\int_0^1 f(x)\\,dx$。题目标识 ${index + 1}`,
  answer: '答案内容', explanation: '解析内容',
}));

test('whole collection export contains every question beyond the 12-card window, without backup metadata or solutions', () => {
  const text = problemsToStudyMarkdown('高等数学', problems, problems.map(p => p.id));
  assert.equal((text.match(/^## 第 /gm) || []).length, 30);
  assert.ok(text.includes('## 第 30 题'));
  for (const problem of problems) assert.ok(text.includes(problem.question));
  assert.ok(!text.includes('答案内容') && !text.includes('解析内容') && !text.includes('problems:'));
});

test('sparse export preserves source numbering and order, complete subquestions, options and optional solutions', () => {
  const source = structuredClone(problems);
  source[1].options = [{label:'A',content:'$\\frac{1}{2}$'}, {label:'B',content:'$1$'}];
  const before = JSON.stringify(source);
  const text = problemsToStudyMarkdown('题集', source, ['p30','p2','p2','missing'], true);
  assert.equal((text.match(/^## 第 /gm) || []).length, 2);
  assert.ok(text.indexOf('## 第 2 题') < text.indexOf('## 第 30 题'));
  for (const expected of [source[1].question, 'A. $\\frac{1}{2}$', 'B. $1$', '### 答案', '答案内容', '### 解析', '解析内容']) assert.ok(text.includes(expected));
  assert.equal(JSON.stringify(source), before);
});

test('empty selection never falls back to exporting the collection', () => {
  assert.ok(!problemsToStudyMarkdown('题集', problems, []).includes('## 第'));
});

test('shift selects or deselects a range in either direction and preserves unrelated selections', () => {
  const ids = problems.map(p => p.id);
  assert.deepEqual(toggleProblemRange(['p1','p20'],ids,'p4','p1',true),['p1','p20','p2','p3','p4']);
  assert.deepEqual(toggleProblemRange(['p1','p2','p3','p4','p20'],ids,'p1','p4',true),['p20']);
  assert.deepEqual(toggleProblemRange(['p20'],ids,'p3','missing',true),['p20','p3']);
  assert.deepEqual(toggleProblemRange(['p20'],ids,'p3',null,false),['p20','p3']);
});
