# 数学三真题导入资产

这里的导入文件由 `scripts/build-math3-papers.py` 从本地 PDF 生成，真题原 PDF 不进入仓库；生成的 JSON、SQL 也被 `.gitignore` 忽略，避免把整套试题内容和个人下载目录提交到 Git。

## 生成

```powershell
python scripts/build-math3-papers.py `
  --answer-dir 'C:\Users\phoen\Downloads\Compressed' `
  --question-dir 'tmp\math3-source' `
  --output 'data\math-papers\math3-2007-2026.json'
```

`--question-dir` 可以放补充下载的题目册；`--answer-dir` 放用户自己的答案解析 PDF。脚本会按年份识别题数和分值，并把公式/矩阵未进入 PDF 文本层的题目标为 `needs_visual_review`。

## 校验与导入

默认只做 dry-run：

```powershell
npm run verify:math3-papers -- --input data/math-papers/math3-2007-2026.json --strict-complete
```

生成可在 SQL Editor 执行的 additive upsert：

```powershell
npm run import:math3-papers -- `
  --input data/math-papers/math3-2007-2026.json `
  --emit-sql data/math-papers/math3-2007-2026.sql `
  --strict-complete
```

正式写入 Supabase 只能使用 `SUPABASE_SERVICE_ROLE_KEY`，不能用 anon key；脚本不会删除旧题目，也不会写入 notes、attempts 或 RAG 表。视觉复核未完成时，必须显式传 `--allow-unverified` 才允许 apply。

数学真题表属于固定题源，RAG 仍然是私人笔记的检索派生层，二者不自动混写。RAG 的迁移、服务端 RPC 和本地静态门已经完成；远端迁移及真实笔记索引需要单独的目标环境和凭据。
