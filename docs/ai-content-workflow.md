# AI 内容工作流（阶段 2 数据边界）

本阶段只建立本地可复审的数据库结构与权限，不创建真实 Auth 用户、不写入生产数据库、不部署。

阶段总览、验证结果和生产门禁见 [Blog AI 升级复审报告](./ai-upgrade-release-report.md)。

四个学科窗口共用仓库内的 [Blog AI 内容规范](../skills/blog-ai-content/SKILL.md)。它负责把外部资料整理成符合博客渲染链路的 Markdown，并规定讲义拆章、合集增量加入、静默自检和知识点快测的交付边界；博客端不接收或解析原始 PDF、Word 等材料。

使用时让每个学科窗口读取同一份 `skills/blog-ai-content/SKILL.md`，再由窗口提示词提供学科、角色和输出目录。仓库只保存规范源文件，不自动写入用户级 Codex Skill 目录；需要全局发现时，应由用户审核后再复制整个 `skills/blog-ai-content/` 文件夹。

## 账号与身份

`public.ai_profiles.id` 必须等于对应 Supabase Auth 用户的 `id`。四个账号各占一个学科，`subject` 只能是：

- `math`
- `english`
- `politics`
- `economics`

`account_key`、`subject` 和 Auth `id` 是身份字段，写入后不能通过普通更新修改。头像、角色名、简介、学术所属和擅长标签放在 `ai_profiles`，文章正文不重复显示“AI 学科助教”等身份标签。

AI 账号不得出现在 `admin_users`。迁移通过数据库触发器同时拦截两种方向的冲突；账号 provisioning 仍必须由管理员在 Supabase Auth/SQL 中逐项审核完成。

### 持久化学科会话槽

四个 Codex 学科窗口通过应用端会话槽共用同一个浏览器资料，而不共用 Supabase token：

| 槽位 | 固定邮箱 | 完整启动入口 |
| --- | --- | --- |
| `math` | `math.ai@a3ter1a.cn` | `/login?account=math` |
| `english` | `english.ai@a3ter1a.cn` | `/login?account=english` |
| `politics` | `politics.ai@a3ter1a.cn` | `/login?account=politics` |
| `economics` | `economics.ai@a3ter1a.cn` | `/login?account=economics` |

每个槽位使用独立的 Supabase `localStorage storageKey`，管理员继续使用 Supabase 默认 key；当前标签页的槽位只写入 `sessionStorage`。因此浏览器关闭后 token 仍可恢复，但不同标签页不会争用“当前学科”。每个标签页只懒加载当前槽位的一个 client，不会为了保活而创建四个 client、轮询后台或要求四个窗口常驻。

学科入口会锁定邮箱，并在登录后校验 `ai_profiles.subject` 与 `ai_profiles.account_key` 都等于槽位名。默认 `/login` 拒绝四个学科邮箱，避免它们进入管理员默认 storage key。退出只清除当前槽位；清除浏览器站点数据、撤销 refresh token、修改密码或管理员停用账号后才需要重新登录。

同一标签页运行期间不得从一个槽位切换到另一个槽位；需要切换时先退出，再用目标入口完整加载。密码、access token、refresh token 和 Cookie 不得写入提示词、代码、文档或任务日志。

## 内容隔离

| 内容 | 存储位置 | AI 权限 | 管理员权限 |
| --- | --- | --- | --- |
| AI 草稿、来源摘要、静默自检结果 | `ai_content_proposals` | 只读写自己的草稿 | 审核、退回、批准、发布 |
| 已批准后的文章 | `notes`，`author_kind='ai'`，带 `author_profile_id` / `owner_user_id` | 只能读取自己的内容；未发布草稿可编辑 | 全部管理 |
| 用户原有文章 | `notes`，默认 `author_kind='human'` | 不可读写私有人工文章，也不能改变作者归属 | 全部管理 |

AI 直接写入 `notes` 时只能写未发布的、自身学科对应的草稿。批准/发布操作不由 AI RLS policy 暴露，后续阶段由人工审核链完成。

## 合集

`note_collections` / `note_collection_items` 是通用合集模型，不新增特殊的 note type。合集可以容纳讲义、普通文章或知识点笔记，并支持逐篇追加、排序、移除和重命名。AI 只能维护自己的 AI 合集及自己的 AI 文章成员；管理员可维护全部合集。

## 应用迁移顺序

在本地或一次性影子数据库演练时，将 `0023_ai_content_accounts_and_collections.sql` 放在当前 `0022_private_note_rag_operator_fix.sql` 之后。此文件不包含 `insert into auth.users` 或四个账号的具体邮箱/密码，因此不会意外创建账号或产生生产数据。

## 复审重点

1. 两个 AI 账号互相读取/更新/删除 proposal、note、collection 和 collection item 均应被 RLS 拒绝。
2. AI 账号对人工文章、管理员账号和其他学科 profile 的写入应被拒绝。
3. AI 不能把 proposal 状态直接改成 `approved` / `published`，也不能通过 `notes` 直接发布；这些状态由后续人工审核阶段接管。
4. 管理员可以读取所有 AI 内容并维护 profile、合集和审核状态。
5. 匿名用户只能读取激活的角色资料、已发布文章、已发布合集及其中已发布文章。

## 阶段 3：Markdown 提案与静默自检

博客端只接收已经由 Codex Skill 处理完成的 Markdown，不负责接收或解析 PDF、Word 等原始材料。AI 学科账号通过以下接口写入自己的提案：

- `GET /api/ai/content-proposals`：读取自己的提案和当前角色资料；
- `POST /api/ai/content-proposals`：创建提案并立即执行自检；
- `PATCH /api/ai/content-proposals/:id`：只编辑自己的草稿或退回返修提案；
- `POST /api/ai/content-proposals/:id/self-check`：重新执行自检；
- `POST /api/ai/content-proposals/:id/submit`：自检通过后提交人工审核。

自检只保留当前结果，不展示修改历史，覆盖 Markdown 数学定界符、代码块围栏、图片标记、正文排版和标题层级。高风险问题会保留草稿并阻止提交；通过后状态为 `self_checked`，提交后为 `pending_review`。AI 账号不能批准或发布。

工作台位于 `/tools/ai-content`，使用真实博客 Markdown 预览。未登录或非 AI 账号只能看到安全门；四个 Auth 账号的具体 provisioning 仍需单独审核，不在迁移或本地演练中自动创建。

## 阶段 4：版本锚定人工审核与发布

管理员审核工作台位于 `/tools/ai-review`，与 AI 工作台分离。接口全部走管理员 bearer token：

- `GET /api/ai/content-review`：按状态读取审核队列；
- `GET /api/ai/content-review/:id`：读取提案、角色资料和批注；
- `POST /api/ai/content-review/:id`：创建正文选区批注；
- `PATCH /api/ai/content-review/:id`：退回返修、批准、驳回、发布或批准并发布；
- `PATCH|DELETE /api/ai/content-review/:id/comments/:commentId`：解决、忽略或删除批注。

批注保存 `proposal_content_version`、`selection_start`、`selection_end`、`quoted_text` 和正文。选区偏移使用浏览器 JavaScript 的 UTF-16 单元；服务端会重新切片正文并校验引用文本。提案正文发生变化后，旧批注保留为历史证据，但审核页会标记为“内容已更新，请重新选择”，禁止静默套用。

AI 提案在提交审核后被冻结；只有退回为 `changes_requested` 后才能再次编辑。管理员批准后可以单独发布，也可以一次完成“批准并发布”。`publish_ai_content_proposal` 是管理员专用的数据库事务函数：新文章写入现有 `notes` 结构并设置 `author_kind='ai'`、`author_profile_id`、`owner_user_id`、`is_published=true`；重复调用只刷新同一篇文章，不会产生重复 note。文章阅读页会显示角色头像/名字并链接到 `/ai-profiles/:id`，资料页单独展示简介、学术所属和关注方向。

阶段 4 仍只在本地/一次性 PostgreSQL 夹具中验证。真实 Auth provisioning、生产迁移和发布均未执行。

## 阶段 8：讲义知识点快测

讲义的知识点快测是独立于 Markdown 正文的附属内容。AI 账号在 `/tools/ai-content` 选中自己的讲义后，可以让模型生成 5–12 道题；模型输出必须先经过结构、答案覆盖和解析覆盖自检。题目、选项、答案、解析、知识点和难度分别保存到：

- `ai_knowledge_quizzes`：讲义提案关联、审核状态、版本、来源 checksum 和自检结果；
- `ai_knowledge_quiz_items`：题目、选项、答案、解析、知识点和来源标题；
- `ai_knowledge_quiz_attempts`：用户作答、服务端判分结果和得分。

AI 只能在草稿、自检、退回返修或驳回状态编辑；提交为 `pending_review` 后数据库 RLS 冻结修改。管理员在 `/tools/ai-review` 的“讲义知识点快测审核”区查看答案和解析，可以退回返修、批准、驳回或发布/绑定讲义。只有 `approved` / `published` 且已关联 `note_id` 的快测会被笔记阅读助手加载；普通助手返回的题目投影会剥离答案和解析，提交后由服务端按私有答案判分。

相关接口：

- AI：`POST /api/ai/knowledge-quizzes/:proposalId/generate`、`PATCH|GET /api/ai/knowledge-quizzes/:id`、`POST /api/ai/knowledge-quizzes/:id/submit`；
- 管理员：`GET /api/ai/knowledge-quiz-review`、`GET|PATCH /api/ai/knowledge-quiz-review/:id`；
- 阅读助手：`GET /api/knowledge-quizzes?noteId=...`、`POST /api/knowledge-quizzes/:id/attempt`。

迁移 `0027_ai_knowledge_quizzes.sql` 建立表和基础 RLS，`0028_ai_knowledge_quiz_insert_policy_fix.sql` 修复已执行 `0027` 的 self-checked 插入策略，并收紧提交后的编辑边界。两份迁移只在本地/影子演练中验证，未执行生产迁移。

## 阶段复审证据

阶段 3–8 的桌面端证据保存在 `output/playwright/`，并由 `npm run verify:ai-upgrade-browser-evidence` 检查图片可读性和桌面/窄桌面尺寸。阶段 5 使用完整页面截图（高度大于视口）以保留合集列表；阶段 6、8 的部分截图由浏览器保存为 JPEG，文件扩展名沿用历史产物。阶段 8 截图是未登录安全门，不代表真实管理员审核已完成。

| 阶段 | 1440 证据 | 1024 证据 | 证据性质 |
| --- | --- | --- | --- |
| 3 | `stage3-ai-content-1440-gate.png` | `stage3-ai-content-1024-gate.png` | 未登录安全门/工作台视觉检查 |
| 4 | `stage4-ai-review-1440-gate.png` | `stage4-ai-review-1024-gate.png` | 未登录安全门/审核页视觉检查 |
| 5 | `stage5-collection-workspace-1440-mock.png` | `stage5-collection-workspace-1024-mock.png` | 合集工作台 mock 视觉检查 |
| 6 | `stage6-message-center-cancelled-1440.png` | `stage6-message-center-1024-viewport.png` | 消息中心状态视觉检查 |
| 7 | `stage7-note-reader-1440.png` | `stage7-note-reader-1024.png` | 笔记阅读器与助手抽屉视觉检查 |
| 8 | `stage8-ai-review-unauthenticated-1440.png` | `stage8-ai-review-unauthenticated-1024.png` | 未登录安全门视觉检查 |
| 9 | `stage9-roleplay-settings-1440.png` | `stage9-roleplay-settings-1024.png` | 设置面板角色显示开关视觉检查 |

数据库边界复审使用一次性本地 PostgreSQL 17.10 演练脚本：`verify:wp8-ai-content-local`、`verify:wp11-collections-local`、`verify:wp12-job-center-local` 和 `verify:wp13-ai-knowledge-quiz-local` 均通过，结果文件仅保留在 `.local-backups/*/latest-result.json`，外部连接数为 0。
