# 命题数据与审校契约

## 生成器输入与标准化结果

命题模型直接返回合法 JSON 对象，顶层只要求 `title` 和 `questions`。运行时会根据模式与难度补全并锁定试卷信封：

```json
{
  "title": "试卷标题",
  "questions": [
    {
      "type": "choice",
      "areaId": "calculus",
      "chapterId": "calculus-functions-limits-continuity",
      "knowledgePointIds": ["calc-1-10"],
      "difficulty": "easy",
      "score": 5,
      "question": "题干",
      "options": [
        { "label": "A", "content": "选项 A" },
        { "label": "B", "content": "选项 B" },
        { "label": "C", "content": "选项 C" },
        { "label": "D", "content": "选项 D" }
      ],
      "answer": "B",
      "explanation": "完整解析",
      "rubricSteps": []
    }
  ]
}
```

标准化后的 `Math3SelfTestPaper` 还包含：

| 字段 | 规则 |
|---|---|
| `subject` | 固定为 `math3` |
| `mode` / `difficulty` | 来自请求配置 |
| `durationMinutes` / `totalScore` | 来自固定模式配置 |
| `generatedAt` | ISO 时间 |
| `sourcePolicy` | 记录 2021—2026 真题结构下的原创政策 |
| `blueprint` / `coverageTargets` | 来自固定蓝图 |
| `questions` | 按数组顺序映射到固定题号计划；补全唯一 `id` 和 `index` |
| `verification` | 只有全部审校与结构门通过后才附加 |

当启用真题结构强制模式时，运行时以题号计划覆盖模型返回的 `type`、`score`、`areaId` 和 `difficulty`。这只是防漂移机制；生成器仍应返回正确字段，不能依靠覆盖来掩盖命题错误。

## 单题字段

| 字段 | 必填 | 约束 |
|---|---|---|
| `id` | 标准化后必填 | 全卷唯一；未提供时自动生成 |
| `index` | 标准化后必填 | 与数组位置和固定题号一致 |
| `type` | 是 | `choice`、`fill`、`solution`；最终由题号计划锁定 |
| `areaId` | 是 | `calculus`、`linear-algebra`、`probability-statistics` |
| `chapterId` | 是 | 必须存在且属于该 `areaId` |
| `knowledgePointIds` | 是 | 至少一个有效 ID，全部属于该 `areaId` |
| `difficulty` | 是 | `easy`、`medium`、`hard`；最终由题号计划锁定 |
| `score` | 是 | 必须等于该题号固定分值 |
| `question` | 是 | 中文题干，条件、定义域和符号完整 |
| `options` | 选择题必填 | 恰好四项，标签严格为 A/B/C/D，内容非空、互不重复 |
| `answer` | 是 | 选择题为单个 A—D 字母；填空题短且精确；解答题给出明确结论 |
| `explanation` | 是 | 从条件到结论的完整推导，不只给最终答案 |
| `rubricSteps` | 解答题必填 | 至少两步；每步有 `label`、正分值 `points` 和可核对 `expected`；总分严格等于本题分值。`id` 未提供时按题号和步骤序号生成 |

非选择题不会保留 `options`，非解答题的 `rubricSteps` 标准化为空数组。解答题缺少有效步骤时，标准化器会生成一个兜底步骤，但最终结构门要求至少两步，因此仍会拒绝该卷。有效步骤分值合计与题目分值不同时，标准化器会按比例缩放并保留一位小数，随后结构门仍要求最终合计精确闭合；命题结果应主动给出正确分值，不依赖缩放修复。

步骤 `id` 是后续逐步评分的关联键，应在一题内唯一。当前结构门没有单独检查重复步骤 `id`，因此审校或实现维护时要显式检查；若把它升级为硬门禁，应同时补充回归测试。

## 内容规则

- 只借鉴真题的结构与认知难度，生成原创题；不复制、不近义改写具体真题或商业内容。
- 难度通过推理层数、知识组合和关键转换体现；计算量服务于考点，不以繁算、生僻技巧、缺条件或多解制造“难题”。
- 所有文本使用中文。公式用 Markdown LaTeX：行内 `$...$`，块级 `$$...$$`；所有 `$` 分隔符必须成对。
- 题干、答案和解析均非空，不得含 `TODO`、`TBD`、“待确认/补充/核对”、“无法确定/判断”、“答案略/解析略”、“占位”、“未提供”、“缺少题干”等内容。
- 全卷题目不能重复。结构门对题干做 NFKC 归一化，移除空白和常见标点并转小写后再比较。
- 填空答案面向当前精确自动判分：保持短、规范、无不必要等价变体；需要接受数学等价表达时，应先修改判分器并补测试。

## 三道门禁

### 1. 分科独立初审

按微积分、线性代数、概率论与数理统计分组并行审校。审校器必须不依赖候选答案，从头独立求解每一道题。初审允许返回完整修正题目，但修正后必须重新从头验算最终版本。

每题必须满足：

- `status = passed`；
- `confidence` 在 `[0.9, 1]`；
- `independentResult` 非空；
- `recheckedAfterCorrection = true`；
- `issues` 为空；
- `wellPosed`、`withinSyllabus`、`uniqueAnswer`、`answerCorrect`、`derivationCorrect`、`rubricCorrect`、`difficultyFit`、`notationComplete` 全部为 `true`。

报告必须恰好覆盖本组全部题号，题号不得缺失、重复或越界。任何分组失败都会拒绝整卷。

### 2. 最终结构门

修正后的整卷必须同时满足：

- 题量、总分和逐题分值完全一致；
- 题号、题型、学科位置和难度位置完全匹配固定计划；
- 章节、知识点、文本、LaTeX 与唯一 ID 有效；
- 选择题四项完整、互异且答案为单个 A—D；
- 解答题至少两个评分步骤，步骤内容完整且分值闭合；
- 卷内无归一化后重复题干。

### 3. 高风险题二次终审

终审集合是以下题目的并集：所有解答题、所有 `hard` 题、初审中被修正的题。终审重复完整检查，但不允许再返回修正；发现任何仍需修改、无法确认或置信度不足的问题，整卷拒绝保存。

通过后才写入：

```json
{
  "status": "verified",
  "verifiedAt": "ISO-8601",
  "profileVersion": "当前结构版本",
  "profileLabel": "当前结构名称",
  "reviewMethod": "independent-area-review+high-risk-final-gate",
  "checkedQuestions": 22,
  "finalGateQuestions": 8,
  "correctedQuestionIndexes": [3]
}
```

示例中的题数仅展示字段形态，真实数值必须来自本次卷与审校结果。生成 API 以 `422` 返回被门禁拒绝的卷；前端只有在成功响应含 `paper` 时才创建 `draft` 记录。
