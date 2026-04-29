export type NoteType = 'note' | 'problem' | 'essay';
export type Subject = 'math' | 'english' | 'politics' | 'economics';

// 题型
export type ProblemType = 'choice' | 'fill' | 'calculation' | 'proof' | 'proofEssay';
export const problemTypeMap: Record<ProblemType, string> = {
  choice: '选择题',
  fill: '填空题',
  calculation: '计算题',
  proof: '证明题',
  proofEssay: '论述题',
};

// 难度
export type Difficulty = 'easy' | 'medium' | 'hard';
export const difficultyMap: Record<Difficulty, string> = {
  easy: '基础',
  medium: '中等',
  hard: '困难',
};
export const difficultyColorMap: Record<Difficulty, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard: 'bg-red-100 text-red-700',
};

// 选项
export interface ProblemOption {
  label: string;
  content: string;
}

// AI处理状态
export type AIStatus = 'none' | 'scanning' | 'scanned' | 'complete' | 'error';

// 单道题目
export interface Problem {
  id: string;
  type: ProblemType;
  difficulty: Difficulty;
  question: string;
  options?: ProblemOption[];
  answer: string;
  explanation: string;
  tips?: string;
  source?: string;
  tags: string[];
  // AI/OCR 增强字段 (optional for backward compatibility)
  chapterId?: string;
  aiStatus?: AIStatus;
  ocrSource?: { imageUrl: string; processedAt: string };
  aiResult?: {
    rawQuestion: string;
    rawAnswer: string;
    rawExplanation: string;
    confidence: number;
  };
}

// 章节分类
export interface Chapter {
  id: string;
  noteId?: string;        // null = global template, set = note-specific
  name: string;
  parentId?: string;      // multi-level nesting
  sortOrder: number;
  description?: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 章节统计
export interface ChapterStats {
  chapterId: string;
  chapterName: string;
  totalProblems: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  typeDistribution: Record<ProblemType, number>;
}

// AI API 配置
export interface AIConfig {
  deepseekApiKey: string;
  deepseekModel: string;
  qwenApiKey: string;
  qwenModel: string;
  qwenApiEndpoint: string;
}

// AI API 使用统计
export interface AIUsageStats {
  deepseek: { totalTokens: number; totalCost: number; lastUsed?: string };
  qwen: { totalImages: number; totalCost: number; lastUsed?: string };
}

// 视频平台类型
export type VideoPlatform = 'bilibili' | 'youtube';

export const platformMap: Record<VideoPlatform, string> = {
  bilibili: 'Bilibili',
  youtube: 'YouTube',
};

// B站视频
export interface BilibiliVideo {
  bvid: string;
  cid?: string;
  p?: number;
  title: string;
  cover?: string;
  author?: string;
  duration?: string;
}

// YouTube视频
export interface YouTubeVideo {
  videoId: string;
  title: string;
  cover?: string;
  author?: string;
  duration?: string;
}

// 统一视频类型
export interface Video {
  id: string;
  platform: VideoPlatform;
  title: string;
  bilibili?: BilibiliVideo;
  youtube?: YouTubeVideo;
}

export interface Note {
  id: string;
  type: NoteType;
  title: string;
  content: string;
  subject?: Subject;       // 随笔没有科目
  tags: string[];
  coverImage?: string;
  videos?: Video[];
  problems?: Problem[];
  createdAt: Date;
  updatedAt: Date;
  isPublished: boolean;
}

export const subjectMap: Record<Subject, string> = {
  math: '数学',
  english: '英语',
  politics: '政治',
  economics: '经济学',
};

export const typeMap: Record<NoteType, string> = {
  note: '笔记',
  problem: '题集',
  essay: '随笔',
};

// Profile link
export interface ProfileLink {
  name: string;
  icon: string;
  href: string;
  variant: "default" | "secondary" | "dark" | "primary";
  linkType?: "link" | "number";
}

// Profile (used by SettingsPanel / ProfileEditor)
export interface Profile {
  name: string;
  avatar: string;
  tagline: string;
  badges: string[];
  links: ProfileLink[];
  footer: string;
}

// Flashcard for spaced repetition
export interface Flashcard {
  id: string;
  noteId: string;
  question: string;
  answer: string;
  interval: number; // Days until next review
  repetition: number; // Number of consecutive successful reviews
  easeFactor: number; // Difficulty multiplier (default 2.5)
  nextReview: Date;
  lastReview?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;
