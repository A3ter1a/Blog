# Asteroid 生产安全验收清单

这份清单用于确认公网部署后的关键安全门是否真的生效。它不替代代码审计，也不替代 Supabase RLS；它的作用是让每次部署后都能按相同顺序检查，减少漏项。

## 当前结论

当前自动验收已经通过关键未登录安全检查：

- `/debug` 在生产模式返回 `404`
- 未登录访问 `/api/auth/admin` 返回 `401`
- 未登录访问 `/api/ai/config` 返回 `401`
- 未登录首页不再显示明显的“创建”入口

但 Supabase RLS 和管理员登录后的功能仍需要在后台与浏览器中单独确认。

## 第一步：确认 Vercel 部署版本

进入 Vercel 项目后台，确认生产环境部署至少包含这个安全验收基准提交：

```text
b4258ff Add production security verification checklist
```

如果部署在它之后的 `main` 提交上，也可以；如果部署比它更早，先重新部署 `main` 分支。

风险解释：

- 如果线上不是最新提交，`/debug`、AI 接口、创建入口等安全加固可能还没生效。
- 这类问题不是本地代码能解决的，必须在部署平台确认。

## 第二步：确认 Vercel 环境变量

在 Vercel 的 Production 环境中确认以下变量存在：

```env
ADMIN_EMAILS=你的 Supabase Auth 管理员邮箱
DEEPSEEK_API_KEY=你的 DeepSeek key
QWEN_API_KEY=你的 Qwen key
```

注意：

- `ADMIN_EMAILS` 不能写成 `NEXT_PUBLIC_ADMIN_EMAILS`。
- AI key 不能写成 `NEXT_PUBLIC_*`。
- 修改环境变量后，需要重新部署生产环境。

风险解释：

- `NEXT_PUBLIC_*` 会进入前端包，公网访客可能看到。
- 服务端变量不会直接暴露给浏览器，是当前更安全的做法。

## 第三步：确认 Supabase RLS 生产策略

在 Supabase SQL Editor 或后台策略页确认生产 RLS 与 Storage 策略已经生效。

执行前要知道：

- 生产策略应覆盖 `notes`、`chapters`、`problem_practice_statuses`、`math3_self_tests`、`admin_users` 和 `storage.objects`。
- 它的目标是让访客只能读公开内容，不能写入、修改、删除数据。
- 如果未来新增 Storage bucket，需要额外补策略。
- `storage.objects` 是 Supabase 内置表，迁移只创建 policy，不直接 `ALTER TABLE storage.objects`。

当前仓库的标准 SQL 入口是：

1. `supabase/migrations/0001_base_schema.sql`
2. `supabase/migrations/0002_rls_policies.sql`

执行前可以在本地先跑一次资产检查：

```bash
npm run verify:rls-assets
```

这个命令只检查仓库文件，不会连接 Supabase，也不会修改生产数据库。

风险解释：

- 前端隐藏按钮不是安全边界。
- Supabase RLS 才是数据库最后一道门。
- 如果不执行 RLS，即使页面上看不到按钮，也可能存在直接请求数据库的风险。

## 第四步：插入管理员邮箱

在 Supabase SQL Editor 执行：

```sql
insert into public.admin_users (email)
values ('你的管理员邮箱')
on conflict (email) do nothing;
```

这个邮箱必须和 Supabase Auth 登录邮箱一致。

## 第五步：运行自动验收脚本

在项目根目录运行：

```bash
npm run verify:production-security
```

期望看到：

```text
PASS /debug 生产环境不可访问: HTTP 404
PASS 未登录不能确认管理员身份: HTTP 401
PASS 未登录不能读取 AI 配置状态: HTTP 401
PASS 未登录不能测试 AI 配置: HTTP 401
PASS 未登录不能调用 DeepSeek 题目分析: HTTP 401
PASS 未登录不能调用 Qwen OCR: HTTP 401
PASS 未登录不能调用 AI 复习检查: HTTP 401
```

如果脚本显示网络失败，不代表网站一定不安全，只代表当前电脑没有成功连到公网地址。可以换网络、检查代理，或稍后重试。

## 第六步：人工无痕窗口检查

用浏览器无痕窗口打开：

```text
https://www.a3ter1a.cn
```

未登录状态下应满足：

- 导航栏不显示“创建”
- 不能进入创建页面完成发布
- 不能看到删除、批量删除、导入、AI 设置等入口
- 访问 `/debug` 显示 404

## 第七步：管理员登录检查

登录管理员账号后检查：

- 可以进入 `/create`
- 可以创建笔记
- 可以编辑已有笔记
- 可以上传笔记图片
- 可以使用 AI OCR / 分析 / 复习功能
- 可以管理章节和题库

如果管理员无法使用这些功能，优先检查：

- `ADMIN_EMAILS` 是否写对
- `admin_users` 表里是否插入同一个邮箱
- Supabase Auth 是否真的用这个邮箱登录
- 修改 Vercel 环境变量后是否重新部署

## 阶段完成标准

只有同时满足以下条件，才算“公网安全收尾验收完成”：

- Vercel 生产部署确认是最新提交
- Vercel 生产环境变量确认存在且不是 `NEXT_PUBLIC_*`
- Supabase RLS 生产策略已经生效
- 管理员邮箱已加入 `admin_users`
- 自动验收脚本关键检查通过
- 未登录人工检查通过
- 管理员登录后的创建、编辑、AI、上传功能可用

完成这个阶段后，再进入架构优化、题库专项优化和视觉体验优化。
