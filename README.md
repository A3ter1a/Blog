# Asteroid - 考研笔记网站

A3ter1a 的个人考研笔记网站，基于 Scholar's Ink 设计系统构建。

## 技术栈

- **框架**: Next.js 14+ (App Router)
- **样式**: Tailwind CSS
- **动效**: Framer Motion
- **平滑滚动**: Lenis
- **数据库**: Supabase
- **AI**: Google Gemini API

## 功能特性

- 笔记/题集分类管理
- Markdown 编辑器
- AI 辅助阅读
- AI OCR 图片识别
- 搜索与筛选
- 响应式设计

## 快速开始

1. 克隆项目
```bash
git clone <your-repo>
cd Blog
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
```bash
cp .env.example .env.local
# 编辑 .env.local 填入你的 API Keys
```

4. 启动开发服务器
```bash
npm run dev
```

5. 访问 http://localhost:3000

## 环境变量

| 变量名 | 说明 |
|--------|------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase 项目 URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase 匿名 Key |
| NEXT_PUBLIC_GEMINI_API_KEY | Gemini API Key |

## 设计系统

本项目严格遵循 Scholar's Ink 设计系统：
- 安静的权威感 (Quiet Luxury)
- 无双线规则 (No-Line Rule)
- 玻璃拟态导航 (Glassmorphism)
- 编辑器风格排版

---

Asteroid — 知识的沉淀与共鸣
