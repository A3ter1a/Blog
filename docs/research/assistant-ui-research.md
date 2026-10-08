# Asteroid「问助手」交互调研

日期：2026-10-03  
范围：知识库/文档助手的上下文选择、检索与引用、流式状态、会话历史、错误恢复、输入区、动效与无障碍。  
目标：为 Asteroid 阅读页的「问助手」制定可以落地的交互方案，而不是照抄某个通用聊天窗口。

## 结论先行

Asteroid 目前已经具备一个可用的纵向切片：助手限定在当前笔记、支持选中文字引用、SSE 流式回答、回答来源卡片、停止/重试、未完成片段保留、本地对话恢复和助手记忆候选。下一阶段的主要问题不是“再加一个输入框”，而是把**上下文边界、检索过程、来源证据、会话分支和恢复状态**组织成一条可理解的工作流。

建议将下一阶段拆成以下连续交互：

1. **上下文条**：在抽屉标题下明确显示“当前笔记”与可选中文字；允许移除引用，且发送前能看到本次问题实际使用的范围。
2. **回答状态条**：将“准备索引 → 检索段落 → 组织回答”做成轻量、可中断的状态轨迹；流式正文保持稳定，不因每个 token 重新布局。
3. **证据层**：回答正文和来源列表形成可回溯关系；来源卡片显示章节、摘录和跳转位置，来源展开/收起有一致过渡。
4. **会话工作台**：先做当前笔记内的会话标题、清空、恢复和未完成回答恢复；后续再做从回答分支新问法，避免一开始引入全站多会话管理。
5. **输入与后续问题**：建议问题只写入输入框，不默认立即发送；支持选中引用、草稿保留、停止生成和失败后重试。流式期间可先保留问题，等当前回答结束后再发送。
6. **动效与可访问性**：抽屉、来源展开、引用加入输入框、状态切换和错误出现使用同一套时长/缓动；`prefers-reduced-motion` 下改为淡入或即时切换，键盘焦点和 Escape 行为保持不变。

## Asteroid 当前基线

依据仓库现状（`components/ai-assistant/AssistantDock.tsx`、`lib/note-qa.ts`、`app/globals.css`）：

- 助手是阅读页右侧固定抽屉，`noteId` 固定到当前笔记；移动端会锁定 `body` 滚动。
- 已支持选中文字作为 `activeQuote`，留空时可直接生成“解释这段选中的内容”；问题发送前会把引用放入用户消息。
- 请求支持 SSE；客户端将阶段标记为 `indexing`、`retrieving`、`generating`，有停止生成、未完成片段、重新生成和失败重试。
- 回答保存 `sources`、`totalChunks` 与检索置信度；来源卡片可跳转到笔记章节，并可展开更多来源。
- 会话按笔记写入 `localStorage`（`asteroid:note-assistant:v2:<noteId>`），最多保留 24 条消息；旧版 session storage 会迁移读取。
- 快测、记忆候选、复制、清空对话已经存在，故下一阶段优先修正“可理解性和连续性”，不重复增加无明确任务价值的入口。

当前基线的主要缺口：

- “当前笔记”是隐含在标题和请求参数中的，用户不能在发送前确认检索范围，也没有显式的上下文条状态。
- 来源是回答后的独立列表，尚未把正文中的结论与某个来源建立稳定、可定位的关系。
- 本地恢复是单一会话；清空和重试可用，但没有“从这一条另开问法”的分支语义。
- 有阶段文字和 spinner，但状态切换、引用加入、来源展开、回答出现之间还没有统一的动效语言。

## 项目一：RAGFlow

官方来源：

- [RAGFlow Quickstart（官方仓库文档）](https://github.com/infiniflow/ragflow/blob/main/docs/quickstart.mdx)
- [RAGFlow citation prompt（官方源码）](https://github.com/infiniflow/ragflow/blob/main/internal/rag/prompts/citation_prompt.md)

### 可确认的设计

- RAGFlow 把“上传/解析 → 查看 chunk → 人工介入 → 检索测试 → 创建聊天助手”作为连续流程，而不是把检索完全隐藏在聊天窗口里。Quickstart 明确提供 chunk 快照预览、悬停快速查看、双击编辑关键词/问题，以及 Retrieval testing。
- 聊天助手绑定一个或多个 dataset，并在助手配置中明确空检索时的响应策略：可以严格限制在数据集内，也可以允许模型自由回答，但文档明确提示后者可能产生幻觉。
- 官方 citation prompt 规定来源 ID 的格式、句末放置、每个列表元素分别引用以及不能为没有证据的内容伪造引用。这说明引用不是装饰卡片，而是回答内容的可核验契约。

### 对 Asteroid 的借鉴判断

- **可直接借鉴**：在问助手中公开“检索到了几段、依据强度、来源章节/摘录”，并提供轻量来源展开；检索失败时明确显示“当前笔记没有找到足够依据”，而不是让模型用泛化知识填空。
- **需要改造**：RAGFlow 的 dataset/chunk 管理适合企业知识库，Asteroid 是单篇学习笔记阅读。可借鉴“可见、可干预”的原则，但界面只保留当前笔记的来源范围和章节定位，不引入 chunk 编辑器。
- **不适合**：把解析、索引配置、rerank 等管理流程塞进阅读抽屉；这会打断阅读任务，也与 Asteroid 的轻量本地审查模式冲突。

## 项目二：Open WebUI

官方来源：

- [Follow-Up Prompts（官方文档）](https://docs.openwebui.com/features/chat-conversations/chat-features/follow-up-prompts/)
- [Essentials / task models / context management（官方文档）](https://docs.openwebui.com/getting-started/essentials/)
- [Citation events for tools（官方文档）](https://docs.openwebui.com/features/extensibility/plugin/development/)
- [Chat message model（官方源码）](https://github.com/open-webui/open-webui/blob/main/backend/open_webui/models/chat_messages.py)

### 可确认的设计

- 每次回答后可以生成 follow-up 问题 chips；官方同时提供三种策略：关闭、只保留最近回答、保留整段知识探索历史。
- 点击 follow-up 默认可以配置为“插入输入框后编辑”，也可以配置为立即发送；此外，第一条 follow-up 会以输入框中的灰色 ghost text 出现，用户按 `Tab` 才采纳，开始输入其他内容就消失。
- 设置中将标题、标签、follow-up 和 autocomplete 作为后台 task model 工作，并明确提醒：把昂贵的主模型用于这些短任务会拖慢体验；弱设备可以直接关闭 autocomplete/follow-up 等任务。
- Citation event 以 `document`、`metadata`、`source` 等结构传递来源，使来源卡片不是依赖回答文本猜测出来的 UI；源码模型还保留 `sources`、`status_history`、`error`、`done`、`context_summary` 等字段，说明流式回答需要可持久化的状态，而不只是最终字符串。

### 对 Asteroid 的借鉴判断

- **可直接借鉴**：建议问题点击后先写入 textarea，不要默认发出请求；当输入为空且回答完成时，第一条建议可以用很弱的 ghost hint 呈现，但必须支持 `Tab` 采纳并在用户输入时立即消失。
- **可直接借鉴**：把回答阶段和错误/完成状态作为消息数据的一部分，恢复时保留“未完成回答”和状态，而不是只恢复纯文本。
- **需要改造**：Open WebUI 的 task model、全局知识库和工具调用很多，Asteroid 只需要一个当前笔记助手；后台生成建议问题可以先复用当前模型或静态建议，等性能与成本有真实证据再拆 task model。
- **不适合**：将 autocomplete 做成每次击键请求。Asteroid 的中文学习输入更需要稳定的手写/粘贴体验；自动补全会干扰引用、公式和 Markdown 片段。

## 项目三：LobeHub / LobeChat

官方来源：[LobeChat 官方仓库 README](https://github.com/bellroy/lobe-chat)

### 可确认的设计

- README 将 Branching Conversations 作为一等能力：可以从任意消息建立分支，保留原上下文，并区分“继续当前讨论”和“从该消息开始一个独立主题”。
- 文件上传和 Knowledge Base 与对话直接结合；官方强调可以在对话中启用或切换不同知识库/文件，且知识库管理、文件预览、分块/向量化属于可见的产品能力。
- README 还把 Markdown、代码高亮、LaTeX、Mermaid 和主题/移动端适配列为整体对话体验的一部分；这符合 Asteroid 的笔记、公式和图表阅读场景，但不能直接复制其完整 AI 工作台。

### 对 Asteroid 的借鉴判断

- **可直接借鉴**：在回答操作中提供“从这里继续追问”与“另开一个问法”两个语义；前者沿用当前笔记上下文，后者复制当前问题/引用但生成一个独立本地会话。这样比把所有回答堆在一条长记录里更适合复习对照。
- **需要改造**：当前阶段只做当前笔记内的本地会话分支和简短标题，先不做全局 agent/知识库切换；会话切换动画应是抽屉内消息列表的交叉淡入，而不是整个阅读页重排。
- **不适合**：引入完整插件市场、Artifacts、联网搜索和多模型工作台作为“问助手”默认入口。这些能力会扩大权限、配置和认知负担，且不是本阶段阅读理解任务。

## 项目四：LibreChat

官方来源：

- [Message Composer（官方文档）](https://www.librechat.ai/docs/features/composer)
- [Forking Chats（官方文档）](https://www.librechat.ai/docs/features/fork)
- [Agents（官方文档）](https://www.librechat.ai/docs/features/agents)
- [Your First Chat（官方文档）](https://www.librechat.ai/docs/quick_start/first_chat)

### 可确认的设计

- Composer 把附件、引用、工具、技能和当前启用项称为 staged context，并把它们显示在输入框上方；每项都有移除操作，发送时才进入下一条消息。
- 响应流式期间，输入框仍可继续输入；根据模式，Enter 可以排队或 steer 当前运行，队列中的消息可以编辑、移除、立即发送和重排。
- 官方提供从任意消息 fork 的会话，并让用户选择复制可见消息、相关分支或全部上下文；原会话保持不变。
- Agents 文档强调会话 starters 只把问题放进输入框，不自动发送；这与“先确认，再提问”的可控交互一致。

### 对 Asteroid 的借鉴判断

- **可直接借鉴**：把选中文字、当前笔记、模式和待发送问题作为 composer 上方的 staged context；允许在发送前移除引用；把建议问题放入输入框而不是直接请求。
- **需要改造**：Asteroid 可以先做单条“待发送问题”状态，不必马上做可拖拽队列。真正需要的是流式回答中继续编辑、停止后保留草稿、回答结束后再发送，避免双击发送造成上下文竞态。
- **可直接借鉴**：从一条回答重新生成时保留原问题和引用；后续再添加“另开问法”以避免覆盖旧答案。
- **不适合**：工具、MCP、技能、附件 palette 的完整复杂度；当前笔记助手只需要“引用当前选区”和“来源跳转”两个上下文入口。

## 交互方案归纳

### 1. 上下文不是装饰标签，而是发送契约

每条待发送问题上方应显示：

- `当前笔记：{标题}`（固定，暂不允许跨笔记检索）；
- `引用：{选中文本摘要}`（可删除）；
- `回答方式：快速 / 深度`（沿用现有设置）；
- 发送后实际检索到的来源数量和置信度。

如果未来支持跨笔记检索，再将范围做成可切换的 segmented control；在当前阶段不要提供一个看似可切换、实际没有后端语义的控件。

### 2. 流式状态要表达“下一步”，不要展示内部思维

建议状态轨迹：

`准备本篇笔记 → 查找相关段落 → 整理回答`

每一步使用短标签和轻微淡入/颜色变化；只有超过约 300ms 才显示，避免闪烁。正文开始流式输出后，状态条折叠为“回答生成中”，保留“停止”按钮；不展示模型隐性 chain-of-thought。回答完成后状态条变成来源摘要，如“依据较强 · 检索 4 段”。

### 3. 引用要能回答“这句话从哪来”

第一阶段可维持当前来源卡片，但需要：

- 每个来源保留稳定 ID、章节标题、摘录和深链接；
- 来源展开/收起使用高度 + opacity 过渡，完成后将焦点留在切换按钮；
- 以后若后端能返回回答中的来源 ID，再将 `[S1]` 这类标记映射到对应卡片；在此之前不要让模型自由生成编号，避免伪引用；
- 检索置信度低时明确告诉用户“依据较弱”，并提供“查看来源/重新提问”而不是用强烈的成功动效掩盖不确定性。

### 4. 动效规格（配套而非装饰）

沿用 Asteroid 已有 `lib/motion.ts` 和 `MotionProvider`，建议冻结以下语义：

| 状态 | 动效 | 建议规格 | 中断/降级 |
| --- | --- | --- | --- |
| 打开抽屉 | 右侧滑入 + scrim 淡入 | 220–280ms，强调缓动 | Escape、关闭按钮和点击 scrim 立即可用 |
| 关闭抽屉 | 滑出 + scrim 淡出 | 与打开同一曲线 | 关闭后焦点回到“问助手”按钮 |
| 引用加入输入框 | quote card 从输入区上方淡入并轻微下移 | 160–200ms | `prefers-reduced-motion` 仅淡入 |
| 检索/生成阶段切换 | 标签交叉淡入，spinner 不改变布局 | 140–180ms | 超过 300ms 才显示阶段 |
| 新消息 | 气泡淡入 + 4–8px 位移 | 160–220ms | 流式 delta 不逐字做位移动画 |
| 来源展开 | 内容高度展开 + opacity | 180–240ms | 键盘焦点留在切换控件 |
| 错误/恢复 | 错误卡片淡入，保留片段不跳位 | 160–200ms | 重试期间按钮进入明确 busy 状态 |

所有动画都必须允许中断；不能把阅读正文、输入框或来源定位锁在过渡中。`prefers-reduced-motion` 应替换或取消非必要位移/缩放。MDN 说明该媒体特性用于检测设备的减弱动效偏好；W3C 的 SC 2.3.3 要求交互触发的非必要动画可以关闭。

### 5. 键盘、焦点和移动端

- 抽屉打开后焦点进关闭按钮或标题，`Tab` 在抽屉内循环，`Escape` 关闭，关闭后焦点回到触发按钮；这是 WAI-ARIA modal dialog pattern 的要求。
- 发送按钮、停止按钮、重试按钮均使用真实 `button` 和明确 `aria-label`；状态文本用 `role="status"`，错误用 `role="alert"`，避免仅依赖颜色和 spinner。
- 移动端保持 body 锁定与抽屉内部滚动；来源卡片和建议问题命中区至少 44px，避免把横向阅读页挤出屏幕。
- 流式回答期间允许编辑下一条草稿，但只在后端明确支持队列/steer 时发送；当前先禁用重复发送，保留草稿，避免竞态。

## 推荐的 Asteroid 实施顺序

### 阶段 A：上下文与状态切片

范围：`AssistantDock` 的上下文条、状态轨迹、建议问题插入输入框、已有来源卡片动效。  
不做：跨笔记检索、全局会话页、插件/MCP、真实后台 task model。  
验收：回答前能确认当前笔记和引用；阶段状态可见且可停止；建议问题不会未经确认自动发送；来源展开和抽屉开关有统一动效；桌面 `2560×1440`、移动 `390×844`、键盘与 reduced-motion 均可用。

### 阶段 B：恢复与分支切片

范围：当前笔记内的会话标题、未完成回答恢复、从回答重新生成、从回答另开问法。  
不做：跨笔记知识库管理、联网搜索、工具市场。  
验收：刷新/关闭抽屉后能恢复；失败可重试且保留片段；另开问法不会覆盖原回答；返回笔记不丢阅读滚动位置。

### 阶段 C：证据与性能收口

范围：来源 ID 与回答锚点、来源列表折叠、流式 delta 批量刷新、长对话滚动锚点。  
不做：更换模型供应商或 Supabase 数据结构。  
验收：来源可跳转、来源展开不抖动；长回答滚动稳定；控制台无新增错误；低动效模式下内容仍完整可读。

## 不应照抄的做法

- 不把“模型选择、工具、联网搜索、记忆、知识库管理”全部堆进一个右侧抽屉；Asteroid 的核心任务是读懂一篇笔记。
- 不以 spinner、逐字位移或大面积滑动制造“AI 很忙”的错觉；动效必须解释状态变化，并且在减弱动效模式下可被替换。
- 不把来源列表当作回答可信度的替代品；来源必须与检索结果和跳转位置绑定，找不到依据时要明确说找不到。
- 不在没有稳定后端语义时提供跨笔记范围切换、队列/steer 或自动 follow-up；表面上可点、实际没有行为会再次造成用户所说的“粗糙”。

## 官方来源索引

1. RAGFlow：<https://github.com/infiniflow/ragflow/blob/main/docs/quickstart.mdx>；<https://github.com/infiniflow/ragflow/blob/main/internal/rag/prompts/citation_prompt.md>
2. Open WebUI：<https://docs.openwebui.com/features/chat-conversations/chat-features/follow-up-prompts/>；<https://docs.openwebui.com/getting-started/essentials/>；<https://docs.openwebui.com/features/extensibility/plugin/development/>；<https://github.com/open-webui/open-webui/blob/main/backend/open_webui/models/chat_messages.py>
3. LobeHub / LobeChat：<https://github.com/bellroy/lobe-chat>
4. LibreChat：<https://www.librechat.ai/docs/features/composer>；<https://www.librechat.ai/docs/features/fork>；<https://www.librechat.ai/docs/features/agents>
5. 可访问性规范：<https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/>；<https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions>；<https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion>
