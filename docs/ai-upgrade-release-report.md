# Blog AI 升级复审报告

## 结论

当前工作树已经形成可本地复审的桌面端 AI 内容工作流。AI 学科账号、内容隔离、讲义拆章合集、文章自检/审核/批注/发布、消息中心、笔记阅读助手、角色显示开关、共用 Skill 和讲义知识点快测均已落地；没有执行生产迁移、真实账号 provisioning 或部署。

## 阶段状态

| 阶段 | 交付 | 状态 |
| --- | --- | --- |
| 1 | 代码结构、普通文章存储和 UI 基线 | 已完成 |
| 2 | 四学科 AI profile、最小权限、RLS、内容隔离 | 已完成 |
| 3 | Markdown 提案、静默自检、AI 工作台 | 已完成 |
| 4 | 人工审核、UTF-16 选区批注、版本锚定发布 | 已完成 |
| 5 | 通用合集、章节分篇、增量加入/排序/移除 | 已完成 |
| 6 | 消息中心三态、失败/取消可见、取消和三天清理 | 已完成 |
| 7 | 阅读页专属助手抽屉、目录栏隐藏/恢复、角色显示开关 | 已完成 |
| 8 | 讲义知识点快测生成、自检、审核、绑定、服务端判分 | 已完成 |
| 9 | 共用 `blog-ai-content` Skill、浏览器证据清单和跨尺寸复审 | 已完成 |
| 10 | 真实 Auth 账号、生产迁移、管理员登录验收和部署 | 待用户授权 |

## 关键边界

- AI 只能读写自己的学科内容；提交审核后由 RLS 冻结，不能批准、发布或触碰人工文章。
- 讲义正文仍是普通 `notes.content` Markdown；题目、答案、解析和作答记录保存在独立快测表，不进入正文。
- 合集只是可增量编辑的目录，不改变普通文章的 `note` 存储格式。
- 阅读助手仅在笔记阅读页挂载，并按当前笔记加载已发布快测；未审核题目不可调用。
- 设置中的“角色扮演相关显示”只控制头像、角色名和资料入口，关闭后正文按普通内容展示。
- Skill 源文件为 [skills/blog-ai-content/SKILL.md](../skills/blog-ai-content/SKILL.md)，已复制到用户级 `C:\Users\phoen\.codex\skills\blog-ai-content`；两份文件 SHA-256 一致。

## 验证证据

### 代码与资产

```text
npx.cmd tsc --noEmit                         PASS
npm.cmd run lint -- --quiet                  PASS
npm.cmd run test:run                         PASS (73/73)
npm.cmd run build:offline                    PASS (45 routes)
npm.cmd run verify:blog-ai-content-skill    PASS
npm.cmd run verify:ai-upgrade-browser-evidence PASS (stages 3–9)
```

阶段资产验证：`verify:wp8-ai-content-assets`、`verify:wp9-ai-content-assets`、`verify:wp10-ai-review-assets`、`verify:wp11-collections-assets`、`verify:wp12-job-center-assets`、`verify:wp13-note-assistant-assets` 和 `verify:wp13-ai-knowledge-quiz-assets` 均通过。

### 数据库/RLS 演练

以下脚本在一次性 PostgreSQL 17.10、`127.0.0.1` 临时库中通过，外部连接数均为 0，并只保留本地结果摘要：

- `verify:wp8-ai-content-local`：跨学科隔离、人工文章保护、审核发布事务和合集成员隔离；
- `verify:wp11-collections-local`：增量追加、AI 私有合集和匿名公开边界；
- `verify:wp12-job-center-local`：所有者取消、跨用户拒绝、活动任务保护和终态三天保留；
- `verify:wp13-ai-knowledge-quiz-local`：自检插入、审核冻结、管理员批准和匿名拒绝。

### 浏览器证据

证据文件在 `output/playwright/`，包含 1440 桌面和 1024 窄桌面检查。阶段 8 是未登录安全门，不能冒充真实管理员审核；阶段 9 是真实本地设置面板的角色显示开关交互。

## 生产门禁

仍需用户明确决定后才能执行：四个 Supabase Auth 身份的邮箱/角色名/头像、生产迁移窗口、管理员登录浏览器验收和部署策略。当前没有任何生产写入、账号创建、外部 API 调用或部署动作。
