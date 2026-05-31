# Asteroid 优化目标与阶段计划

## 长期目标

把 Asteroid 从“已上线的个人博客”继续优化成一个更稳定、更安全、更好维护的个人学习知识库。后续所有改动优先保护公网数据安全、管理员权限、AI API 密钥和生产环境稳定性。

## 当前阶段

当前处于“公网部署安全收尾验收”阶段。

代码侧安全加固和生产安全验收工具已经完成并推送到 `main`，生产部署至少应包含这个安全验收基准提交：

```text
b4258ff Add production security verification checklist
```

如果 Vercel 已部署到它之后的 `main` 提交，也满足这个版本要求。

接下来必须先确认 Vercel 和 Supabase 后台配置已经应用，然后再进入大规模架构优化。

## 阶段计划表

| 阶段 | 目标 | 当前状态 | 验收证据 |
| --- | --- | --- | --- |
| 1. 安全现状确认 | 核对当前分支、提交、安全文件和核心权限链 | 已完成 | `git status` 干净，`main` 与 `origin/main` 同步，安全文件存在 |
| 2. 公网安全收尾 | 确认 `/debug`、AI API、管理员鉴权、RLS 脚本没有明显遗漏 | 自动验收已通过，待后台确认 | 公网 `/debug` 为 404，未登录 `/api/auth/admin` 和 `/api/ai/config` 为 401，首页 HTML 未发现明显创建入口 |
| 3. 后台配置执行 | 在 Vercel 设置服务端环境变量，在 Supabase 执行 RLS 锁定脚本 | 待用户执行 | Vercel 环境变量存在，Supabase policy 与 `admin_users` 生效 |
| 4. 线上验收 | 验证公网未登录访问不能写入、不能调用 AI、不能访问 `/debug` | 自动检查已通过，待人工检查 | 自动脚本已验证关键未登录安全门，仍需无痕窗口和管理员登录后人工确认 |
| 5. 架构清理 | 清理冗余代码、重复数据访问逻辑、旧兼容逻辑和易错模块 | 待开始 | 构建通过，改动有明确范围，删除或合并的逻辑有证据 |
| 6. 题库专项优化 | 继续优化题库编辑、阅读页小题编辑、一键修正和 Markdown 渲染链路 | 待排期 | 题库编辑和阅读页编辑路径行为一致，答案/解析 Markdown 稳定渲染 |
| 7. 稳定性与体验优化 | 在安全边界稳定后，再处理性能、交互、视觉和内容体验 | 待排期 | 构建通过，关键页面可用，未引入新的权限风险 |

## 必须先完成的生产后台动作

这些动作无法只靠本地代码代替：

1. 在 Vercel 设置服务端环境变量：
   - `ADMIN_EMAILS`
   - `DEEPSEEK_API_KEY`
   - `QWEN_API_KEY`
2. 在 Supabase SQL Editor 执行：
   - `supabase/production_rls_lockdown.sql`
3. 在 Supabase 插入管理员邮箱：

```sql
insert into public.admin_users (email)
values ('your_admin_email@example.com')
on conflict (email) do nothing;
```

4. 确认 Vercel 生产部署至少包含提交 `b4258ff`，或已经部署到它之后的 `main` 提交。

## 低风险改造顺序

1. 先完成生产安全验收。
2. 再清理权限、数据访问、AI 调用这些高风险模块的重复逻辑。
3. 然后处理题库专项问题，尤其是 Markdown 渲染、一键修正、题目编辑入口一致性。
4. 最后再做视觉、交互和性能优化。

## 上下文压缩提醒条件

如果后续出现以下情况，应暂停任务并提醒用户触发平台原生上下文压缩：

1. 已完成一个大阶段，例如安全验收结束或题库专项优化结束。
2. 连续修改多个核心模块，当前对话开始变长。
3. 即将进入新主题，例如从安全审计切换到架构清理。
4. 我需要依赖较多历史结论继续工作，且上下文已经明显臃肿。

## 当前发现记录

- `/debug` 页面在非开发环境会调用 `notFound()`，代码侧风险已降到低。
- AI API 路由均调用 `requireAdminRequest()`，未登录无法直接调用。
- 生产环境下 AI key 优先并仅使用服务端环境变量，客户端 key fallback 已禁用。
- 写操作入口已统一加入 `assertAdminWrite()` 前置检查。
- Supabase RLS 仍是最终安全边界，必须执行生产锁定脚本后才算真正完成。
- `npm.cmd run lint` 已通过。
- `npm.cmd run build` 已通过。
- 本地生产服务验证通过：`/debug` 返回 `404`，未登录访问 `/api/auth/admin` 和 `/api/ai/config` 返回 `401`。
- 已新增 `npm run verify:production-security`，用于在 Vercel/Supabase 后台配置完成后重复检查公网关键安全门。
- `npm run verify:production-security -- --url http://127.0.0.1:3011` 已在本地生产服务上验证通过，说明脚本成功路径可用。
- 已新增 `PRODUCTION_SECURITY_CHECKLIST.md`，把 Vercel、Supabase、自动脚本和人工无痕窗口检查整理成逐项清单。
- `npm.cmd run verify:production-security` 已对公网 `https://www.a3ter1a.cn` 验证通过：`/debug` 为 `404`，未登录 `/api/auth/admin` 和 `/api/ai/config` 为 `401`，首页 HTML 未发现明显创建入口。
- 仍需在 Vercel 后台确认生产部署至少包含 `b4258ff`，并在 Supabase 后台确认 RLS 锁定脚本已经执行。
- PowerShell `Get-Content` 读取部分中文文案时出现乱码，但 Node 按 UTF-8 读取能正常显示，初步判断是终端显示编码问题，不应直接按源文件损坏处理。

## 架构扫描第一轮记录

- 数据写入集中在 `notesApi`、`flashcardsApi`、`chaptersApi` 和 `supabase-storage`，目前这些入口都已有管理员前置检查。
- `localStorage` 仍用于阅读偏好、AI 使用统计和本地个人资料，这些属于非敏感配置；生产环境 AI key 已被清空和禁用。
- Markdown 渲染集中在 `lib/markdown.ts` 和 `components/ui/MarkdownContent.tsx`，题库阅读页、编辑器预览、闪卡、AI 提取结果都依赖这条链路。后续题库专项优化应优先从这条链路入手。
- `components/problems/ProblemEditor.tsx` 内部还有一个编辑器专用 `ProblemCard`，同时阅读页使用 `components/problems/ProblemCard.tsx`。这两个题目卡片逻辑存在重复，后续可以作为题库专项优化的重点。
