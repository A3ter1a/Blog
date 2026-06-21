# Asteroid

> 知识的小行星：一个面向考研复习与长期知识沉淀的个人学习博客。

Asteroid 不是单纯的文章展示站，而是把「笔记、题集、复盘、数学三工具、AI 辅助」收进同一个轻量工作台的学习知识库。它面向一个真实的复习场景：内容要能公开阅读，后台写入要安全，数学公式和题目排版要舒服，做题后的复盘路径也要能留下痕迹。

- 线上站点：[www.a3ter1a.cn](https://www.a3ter1a.cn)
- 技术方向：Next.js 16 App Router、React 19、TypeScript、Supabase、Tailwind CSS v4
- 设计取向：温润米色背景、深蓝黑文字、克制动效、偏阅读型的信息密度

## 项目定位

Asteroid 的核心目标是把备考期间分散的学习材料变成一个可检索、可复盘、可持续维护的系统：

- **公开侧**：访客可以阅读已发布的笔记、题集、关于页面和学习工具入口。
- **管理侧**：管理员通过登录和白名单邮箱进行创建、编辑、导入、上传与删除。
- **学习侧**：数学三题目、章节目录、自测、错题复盘和 PDF 做题本形成闭环。
- **生产侧**：数据库迁移、RLS、服务端 AI Key、SEO、站点地图和错误页都按部署环境收口。

## 功能概览

### 笔记与阅读

- Markdown 与富文本编辑，支持 LaTeX / KaTeX 数学公式、代码块、表格与引用。
- 笔记、随笔、题集三类内容，支持封面、标签、章节、搜索与筛选。
- 正文页提供目录联动、阅读进度、暗色阅读和更适合长文的排版宽度。
- 自定义 404 / 错误页、robots.txt、sitemap.xml 和文章级分享元数据。

### 题集与复盘

- 题目卡片支持题干、答案、解析、难度、章节与参考内容。
- 错题复盘中心集中查看答错、跳过和未掌握题目。
- PDF 做题本可从题集中批量选择题目，导出横屏一题一页的题目册和答案册。
- 做题状态和数学三自测记录通过 Supabase RLS 限制到当前登录用户。

### 数学三工具

- 数学三知识目录按考纲章节组织知识点，并可从目录范围进入刷题队列。
- 数学三自测支持生成安心卷、模拟卷或拔高卷，进入计时考试并保存复盘记录。
- AI 分类和自测评分能力通过服务端接口封装，避免把生产 Key 暴露到浏览器。

### AI 辅助

- OCR 上传识别、笔记分析、文本润色、Note QA 和数学三相关生成接口。
- DeepSeek / Qwen Vision 等配置优先走服务端环境变量。
- AI 输出统一经过 JSON 解析和错误兜底，降低模型返回格式漂移带来的前端风险。

## 页面地图

| 路由 | 说明 |
| --- | --- |
| `/` | 首页，展示站点定位、最近内容和轻量视觉动效 |
| `/notes` | 笔记列表，支持类型、标签、搜索和卡片浏览 |
| `/notes/[id]` | 笔记 / 题集详情页，包含正文、目录、题目与阅读偏好 |
| `/create` | 管理员创建与编辑入口 |
| `/tools` | 学习工具入口 |
| `/tools/note-qa` | 基于已发布内容的笔记问答 |
| `/tools/review` | 错题复盘中心 |
| `/tools/math3-self-test` | 数学三自测 |
| `/tools/math3-catalog` | 数学三知识目录 |
| `/tools/problem-booklet` | PDF 做题本导出 |
| `/about` | 个人介绍与联系方式 |
| `/login` | 管理员登录 |

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 框架 | Next.js 16.2.4, App Router, Turbopack |
| 运行时 | React 19.2, TypeScript 5 |
| 样式 | Tailwind CSS v4, CSS Variables |
| 动效 | Framer Motion |
| 编辑器 | TipTap 3 |
| Markdown | markdown-it, KaTeX |
| 数据库 | Supabase Auth, Database, Storage |
| AI | DeepSeek API, Qwen Vision API |
| 图标 | lucide-react |

## 本地运行

### 环境要求

- Node.js `>=20.9.0`
- npm
- Supabase 项目与对应环境变量

### 启动步骤

```bash
git clone https://github.com/A3ter1a/Blog.git
cd Blog

npm install
cp .env.example .env.local
npm run dev
```

开发服务默认运行在 `http://localhost:3000`。

## 环境变量

| 变量名 | 说明 | 必填 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | 是 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名 Key | 是 |
| `NEXT_PUBLIC_SITE_URL` | 生产站点地址，用于 SEO、robots 和 sitemap | 是 |
| `ADMIN_EMAILS` | 允许使用后台写入能力的管理员邮箱，逗号分隔 | 是 |
| `DEEPSEEK_API_KEY` | 服务端 DeepSeek API Key | 否 |
| `QWEN_API_KEY` | 服务端 Qwen Vision API Key | 否 |

## 数据库与权限

生产环境以 `supabase/migrations/` 为唯一标准入口：

1. 在 Supabase SQL Editor 执行 `supabase/migrations/0001_base_schema.sql`
2. 继续执行 `supabase/migrations/0002_rls_policies.sql`
3. 将 Supabase Auth 管理员邮箱插入 `public.admin_users`
4. 运行只读脚本 `supabase/verification.sql`，确认表结构、RLS、策略、Storage bucket 和管理员邮箱匹配状态

不要在生产环境继续使用旧的 `supabase-init.sql`。当前迁移会把公开阅读、管理员写入、个人练习记录和图片存储权限分开处理。

## 常用验证

```bash
npm run verify:predeploy
npm run verify:production-security
```

- `verify:predeploy` 会依次执行 lint、RLS 本地资产检查和生产构建，适合作为上线前本地总检查。
- 如需单项排查，可分别运行 `npm run lint -- --quiet`、`npm run verify:rls-assets` 或 `npm run build`。
- `verify:rls-assets` 只检查本地迁移和验证脚本是否完整，不连接生产数据库。
- `verify:production-security` 用于检查公开部署前后的关键安全配置。
- 做数据库变更后，还需要在 Supabase SQL Editor 运行 `supabase/verification.sql` 做线上核验。

## 项目结构

```text
app/                  Next.js App Router 页面、API、SEO 和错误兜底
components/           UI、布局、笔记、题集、编辑器、工具和设置组件
lib/                  Supabase 访问层、领域类型、Markdown、AI、导入导出与工具函数
scripts/              本地安全与迁移资产验证脚本
supabase/             数据库迁移、RLS 策略和只读核验 SQL
public/               Logo、favicon、社交图标等静态资源
```

## 设计原则

- 保持阅读优先：正文行宽、行高、数学公式和目录联动优先服务长时间阅读。
- 保持后台克制：工具页更像学习工作台，而不是营销落地页。
- 保持安全边界：公开读和管理员写分离，服务端 Key 不下发到浏览器。
- 保持轻量验证：优先用可重复的脚本检查部署风险，避免依赖临时手动判断。

## License

MIT
