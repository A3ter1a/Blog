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

// AI API Config
export interface APIConfig {
  id: string;
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  isActive: boolean;
}

export const aiProviders = [
  { value: "qwen", label: "通义千问", shortLabel: "Qwen", defaultModel: "qwen-plus", defaultUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { value: "deepseek", label: "DeepSeek", shortLabel: "DeepSeek", defaultModel: "deepseek-chat", defaultUrl: "https://api.deepseek.com" },
  { value: "gemini", label: "Google Gemini", shortLabel: "Gemini", defaultModel: "gemini-2.0-flash", defaultUrl: "" },
  { value: "openai", label: "OpenAI", shortLabel: "OpenAI", defaultModel: "gpt-4o", defaultUrl: "https://api.openai.com/v1" },
  { value: "claude", label: "Claude", shortLabel: "Claude", defaultModel: "claude-3-5-sonnet-20241022", defaultUrl: "https://api.anthropic.com/v1" },
];

export const aiModelsByProvider: Record<string, { value: string; label: string }[]> = {
  gemini: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-2.0-pro", label: "Gemini 2.0 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  ],
  openai: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ],
  deepseek: [
    { value: "deepseek-chat", label: "DeepSeek Chat" },
    { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  ],
  qwen: [
    { value: "qwen-plus", label: "Qwen Plus" },
    { value: "qwen-max", label: "Qwen Max" },
    { value: "qwen-turbo", label: "Qwen Turbo" },
    { value: "qwen-long", label: "Qwen Long" },
    { value: "qwen-vl-plus", label: "Qwen VL Plus" },
    { value: "qwen-vl-max", label: "Qwen VL Max" },
  ],
  claude: [
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
  ],
};

// 短标签（用于 AI 面板显示）
export const aiModelShortLabels: Record<string, { value: string; label: string }[]> = {
  gemini: [
    { value: "gemini-2.0-flash", label: "2.0 Flash" },
    { value: "gemini-2.0-pro", label: "2.0 Pro" },
    { value: "gemini-1.5-flash", label: "1.5 Flash" },
  ],
  openai: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "4o Mini" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5" },
  ],
  deepseek: [
    { value: "deepseek-chat", label: "Chat" },
    { value: "deepseek-reasoner", label: "Reasoner" },
  ],
  qwen: [
    { value: "qwen-plus", label: "Qwen Plus" },
    { value: "qwen-max", label: "Qwen Max" },
    { value: "qwen-turbo", label: "Qwen Turbo" },
    { value: "qwen-vl-plus", label: "VL Plus" },
    { value: "qwen-vl-max", label: "VL Max" },
  ],
  claude: [
    { value: "claude-3-5-sonnet-20241022", label: "3.5 Sonnet" },
    { value: "claude-3-opus-20240229", label: "3 Opus" },
    { value: "claude-3-haiku-20240307", label: "3 Haiku" },
  ],
};

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
