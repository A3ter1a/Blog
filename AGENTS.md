<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project-specific workflow

For UI/UX, responsive layout, motion, interaction feedback, or page-performance work, read [`skills/asteroid-ui-ux/SKILL.md`](skills/asteroid-ui-ux/SKILL.md) before editing. It defines the Asteroid-specific evidence, vertical-slice, browser-verification, and human-review gates.

## 文案与页面密度规范

- 页面文案必须服务于任务、状态、错误恢复、表单填写或真实内容。删除没有信息增量或操作价值的口号、装饰性英文标签、重复说明和空泛引导语。
- 新增组件前先确认每一段文字对应的用户动作或状态；无法说明用途的文字不进入页面。
- 已有必要的错误、加载、权限、保存和导入导出提示可以保留，但应简洁、具体，并直接说明用户下一步。
