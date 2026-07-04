# 英语真题导入

这里放本地清洗后的英语一真题 JSON。完整真题正文不要提交进仓库，`.gitignore` 已默认忽略本目录下除 `english1-sample.json` 外的 JSON 和导出的 SQL。

## 校验

```bash
npm.cmd run import:english-papers -- --input data/english-papers/english1-2007-2026.json --strict-complete
```

## 从本地 PDF 抽取

完整 JSON 会被 `.gitignore` 忽略，不要提交真题正文。

```bash
python scripts/extract-english-papers-from-pdfs.py --source "C:\Users\phoen\Downloads\Compressed" --output data/english-papers/english1-2007-2026.json
```

PDF 中文参考译文的文本层有字体编码问题，脚本不会把乱码作为标准答案导入。翻译和写作不需要标准答案，`standardAnswer` 留空，后续统一走 AI 评分；客观题答案从答案页导入。

不建议把作文页图片用 base64 直接写入数据库。若后续需要保留图表原图，优先上传到 Supabase Storage 后在题组里保存图片 URL。

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

Supabase SQL Editor 对单次 query 有大小限制。推荐生成按年份拆分的小文件，然后按年份顺序逐个执行：

```bash
npm.cmd run import:english-papers -- --input data/english-papers/english1-2007-2026.json --emit-sql-dir data/english-papers/sql-chunks --strict-complete
```

生成后执行 `data/english-papers/sql-chunks/english1-2007.sql` 到 `english1-2026.sql`，每次只粘贴一个文件。

导入器只 upsert `english_papers`、`english_passages`、`english_questions`，不会写入 `notes`、旧 `problems`、`math3_self_tests`、`problem_practice_statuses`、作答记录或生词表。
