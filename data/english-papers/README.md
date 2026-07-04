# 英语真题导入

这里放本地清洗后的英语一真题 JSON。完整真题正文不要提交进仓库，`.gitignore` 已默认忽略本目录下除 `english1-sample.json` 外的 JSON 和导出的 SQL。

## 校验

```bash
npm.cmd run import:english-papers -- --input data/english-papers/english1-2007-2026.json --strict-complete
```

## 直接写入 Supabase

需要本地环境变量 `SUPABASE_SERVICE_ROLE_KEY`。

```bash
npm.cmd run import:english-papers -- --input data/english-papers/english1-2007-2026.json --apply --target production --confirm-year-range 2007-2026 --strict-complete
```

## 生成 SQL

如果不想把 service role key 放到本机，可以生成 SQL 后在 Supabase SQL Editor 执行。

```bash
npm.cmd run import:english-papers -- --input data/english-papers/english1-2007-2026.json --emit-sql data/english-papers/english1-2007-2026.sql --strict-complete
```

导入器只 upsert `english_papers`、`english_passages`、`english_questions`，不会写入 `notes`、旧 `problems`、`math3_self_tests`、`problem_practice_statuses`、作答记录或生词表。
