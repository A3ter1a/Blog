# Asteroid - 知识的小行星

> 知识的沉淀与共鸣

Asteroid 是一个现代化的个人考研笔记平台，专注于知识的高效管理与深度学习体验。

## 项目简介

Asteroid 为考研学习者打造了一个专注、优雅的笔记空间。从数学公式到代码片段，从随笔感悟到题集整理，所有内容都能在这里找到最佳的呈现方式。

## 核心功能

### 笔记管理
- **双类型支持**：笔记（学习内容记录）与题集（题目集合整理）
- **Markdown 渲染**：完整的 Markdown 支持，包含数学公式（LaTeX/KaTeX）
- **封面系统**：支持笔记封面图片，自动展开/收起
- **标签管理**：灵活的标签分类与筛选

### 阅读体验
- **目录导航**：自动从 Markdown 生成目录，支持点击跳转
- **沉浸阅读模式**：全屏阅读，排除干扰
- **暗色模式**：纯黑背景设计，护目舒适
- **响应式布局**：完美适配桌面与移动端

### AI 助手
- **多模型支持**：集成多种 AI 模型，可自由切换
- **智能对话**：基于笔记内容的上下文对话
- **润色功能**：文本润色与对比查看
- **侧边栏模式**：阅读时随时呼出，不影响主内容

### 题集功能
- **难度标记**：基础/中等/困难三级难度
- **题目列表**：彩色方块可视化展示
- **批量管理**：支持题目批量上传与编辑

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router, Turbopack) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS v4 + CSS Variables |
| 动效 | Framer Motion |
| Markdown | react-markdown + remark-math + rehype-katex |
| 数据库 | Supabase |
| AI | Google Gemini API / DeepSeek API |
| 编辑器 | TipTap 富文本编辑器 |

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 pnpm

### 安装步骤

```bash
# 克隆项目
git clone https://github.com/A3ter1a/Blog.git
cd Blog

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入你的配置

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000 即可使用。

## 环境变量

| 变量名 | 说明 | 必填 |
|--------|------|------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase 项目 URL | 是 |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase 匿名 Key | 是 |
| NEXT_PUBLIC_GEMINI_API_KEY | Gemini API Key | 否 |
| NEXT_PUBLIC_DEEPSEEK_API_KEY | DeepSeek API Key | 否 |

## 项目结构

```
├── app/                  # Next.js App Router 页面
│   ├── about/           # 关于页面
│   ├── create/          # 创建/编辑笔记
│   ├── notes/           # 笔记列表与详情
│   ├── globals.css      # 全局样式与设计系统
│   ├── layout.tsx       # 根布局
│   └── page.tsx         # 首页
├── components/          # React 组件
│   ├── ai-assistant/    # AI 助手相关组件
│   ├── editor/          # 编辑器组件
│   ├── layout/          # 布局组件
│   ├── notes/           # 笔记相关组件
│   ├── problems/        # 题集相关组件
│   ├── ui/              # 通用 UI 组件
│   └── video/           # 视频播放组件
├── lib/                 # 工具库与配置
│   ├── ai.ts            # AI 服务配置
│   ├── mock-data.ts     # 模拟数据
│   ├── supabase.ts      # Supabase 客户端
│   └── utils.ts         # 工具函数
└── public/              # 静态资源
```

## 设计系统

本项目采用 **Scholar's Ink** 设计系统，核心理念：

- **安静的权威感**：沉稳的配色，克制的动效
- **无框线设计**：通过留白与层次区分内容
- **玻璃拟态导航**：半透明毛玻璃效果
- **纯暗黑色模式**：#000000 纯黑背景，白色文字

## 脚本命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 构建生产版本
npm run start    # 启动生产服务器
npm run lint     # ESLint 代码检查
```

## 许可证

MIT

---

**Asteroid** — 在这里，知识成为一颗小行星，在浩瀚的学习宇宙中留下轨迹。
