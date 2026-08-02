"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowUpRight,
  Bell,
  BookOpen,
  Bookmark,
  Brain,
  Check,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Clock,
  FileText,
  Layers,
  LayoutDashboard,
  MessageCircle,
  MoreHorizontal,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  Pause,
  Play,
  Quote,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  StepForward,
  UserRound,
  Users,
  X,
} from "lucide-react";

type LabView = "notes" | "review" | "messages" | "memory" | "roles" | "graphs";
type ToastTone = "success" | "info" | "danger";
type Toast = { message: string; tone: ToastTone };
type MessageStatus = "pending" | "running" | "completed" | "cancelled";
type MessageBucket = Exclude<MessageStatus, "cancelled">;
type NoteFilter = "all" | "讲义" | "文章";
type ReviewTab = "preview" | "diff" | "comments";
type MemoryTab = "pending" | "enabled" | "disabled";
type ReadingTab = "要点" | "公式" | "说明";

type Note = {
  id: string;
  title: string;
  type: "讲义" | "文章";
  subject: string;
  author: string;
  avatar: string;
  updated: string;
  collection: string;
  excerpt: string;
};

const notes: Note[] = [
  {
    id: "micro-demand",
    title: "需求、供给与均衡：从曲线到结论",
    type: "讲义",
    subject: "经济学",
    author: "澄川",
    avatar: "澄",
    updated: "刚刚",
    collection: "微观经济学 · 第 1 章",
    excerpt: "把价格变化、曲线移动与新均衡分成三步读，避免把沿曲线移动写成需求变化。",
  },
  {
    id: "english-structure",
    title: "长难句的主干、修饰与转折",
    type: "文章",
    subject: "英语",
    author: "言川",
    avatar: "言",
    updated: "昨天",
    collection: "英语阅读 · 句法",
    excerpt: "先找谓语，再拆修饰层，最后确认转折关系和作者真正态度。",
  },
  {
    id: "politics-timeline",
    title: "近代中国革命的主线与转折",
    type: "讲义",
    subject: "政治",
    author: "砚知",
    avatar: "砚",
    updated: "2 天前",
    collection: "政治 · 时间线",
    excerpt: "用时间线串起阶段目标、主要矛盾和政策转向，避免只背事件名称。",
  },
  {
    id: "math-limit",
    title: "极限的定义、估计与常见误区",
    type: "文章",
    subject: "数学",
    author: "序衡",
    avatar: "序",
    updated: "3 天前",
    collection: "数学三 · 微积分",
    excerpt: "从定义出发理解极限，图像只负责呈现变化，不替代证明条件。",
  },
];

const noteReadingContent: Record<string, { paragraphs: string[]; heading: string; detail: string; hasGraph?: boolean }> = {
  "micro-demand": {
    paragraphs: [
      "理解供需图像时，第一步不是急着判断价格升降，而是先确认哪一条曲线发生了移动。价格变化通常表现为沿着同一条曲线移动，非价格因素变化才会让整条曲线移动。",
      "把均衡点看成两个条件同时成立的位置：买方愿意购买的数量等于卖方愿意提供的数量。图像卡片会把“曲线移动”和“新均衡”拆成可暂停的步骤。",
    ],
    heading: "先读坐标，再读交点",
    detail: "用“条件 → 曲线 → 新均衡”的顺序复述，能减少把需求变化和需求量变化混为一谈。",
    hasGraph: true,
  },
  "english-structure": {
    paragraphs: [
      "长难句不要从生词开始。先圈出谓语和连接词，再把插入语、定语从句与非谓语结构暂时收进括号，主干就会显出来。",
      "读完主干后，再确认转折、让步或因果关系，最后把修饰层放回原位，检查作者真正强调的对象。",
    ],
    heading: "先找主干，再恢复修饰",
    detail: "遇到句子过长时，先回答“谁做了什么”，再处理“在什么条件下、以什么方式”。",
  },
  "politics-timeline": {
    paragraphs: [
      "近代中国革命的线索不能只按事件名称记忆。先标出阶段目标，再把主要矛盾、代表性政策与结果放在同一条时间线上。",
      "当阶段发生转折时，优先解释“为什么变”和“变了什么”，这样才能把材料从孤立的年份还原成连续的历史逻辑。",
    ],
    heading: "用阶段目标串起转折",
    detail: "复述时按“背景 → 目标 → 主要矛盾 → 结果”四格检查，避免只背结论。",
  },
  "math-limit": {
    paragraphs: [
      "极限的直觉来自趋近，但证明必须回到定义。先说明自变量如何靠近目标，再确认函数值被什么范围控制。",
      "图像可以帮助观察变化方向，却不能替代 ε–δ 条件。遇到估计题时，先写出已知界，再逐步收紧误差范围。",
    ],
    heading: "直觉观察，定义收口",
    detail: "把每一步估计写成可检查的不等式，能避免把“看起来趋近”当成完整证明。",
  },
};

const navItems: Array<{ id: LabView; label: string; icon: LucideIcon; count?: string }> = [
  { id: "notes", label: "笔记目录", icon: BookOpen },
  { id: "review", label: "文章审核", icon: ClipboardCheck, count: "3" },
  { id: "messages", label: "消息中心", icon: Bell, count: "4" },
  { id: "memory", label: "助手记忆", icon: Brain },
  { id: "roles", label: "角色资料", icon: Users },
  { id: "graphs", label: "知识图像", icon: Orbit },
];

const messageItems = [
  {
    id: "review-1",
    title: "需求、供给与均衡等待审核",
    description: "澄川提交了第 2 个版本，包含 1 个待处理批注。",
    status: "pending" as MessageStatus,
    time: "刚刚",
    target: "review" as LabView,
    priority: "高",
  },
  {
    id: "ocr-1",
    title: "整套题图 OCR 正在处理",
    description: "第 3 / 12 组，预计还需 2 分钟。",
    status: "running" as MessageStatus,
    time: "6 分钟前",
    target: "messages" as LabView,
    priority: "中",
  },
  {
    id: "memory-1",
    title: "发现 2 条助手记忆候选",
    description: "学习偏好与项目约定等待你的确认。",
    status: "pending" as MessageStatus,
    time: "18 分钟前",
    target: "memory" as LabView,
    priority: "中",
  },
  {
    id: "graph-1",
    title: "知识图像视觉检查已完成",
    description: "3 个视口通过，截图已保存到本地报告。",
    status: "completed" as MessageStatus,
    time: "昨天",
    target: "graphs" as LabView,
    priority: "低",
  },
];

const initialMessageState: Record<string, MessageStatus> = Object.fromEntries(
  messageItems.map((item) => [item.id, item.status]),
);

const memoryCandidates = [
  { id: "m1", title: "偏好先看结论，再展开推导", scope: "全局", kind: "个人偏好", confidence: "高", state: "待审核" },
  { id: "m2", title: "微观经济学讲义按章节拆分成合集", scope: "经济学", kind: "项目约定", confidence: "高", state: "待审核" },
  { id: "m3", title: "学习进度类记忆每 90 天复核", scope: "全局", kind: "项目约定", confidence: "中", state: "已启用" },
];

const roles = [
  { profile: "math", subject: "数学", name: "序衡", avatar: "序", tone: "blue", bio: "把定义、推导和图像之间的关系讲清楚。", tags: ["公式", "证明", "数学三"] },
  { profile: "english", subject: "英语", name: "言川", avatar: "言", tone: "violet", bio: "从句法主干到语篇态度，帮助你稳定拆解长难句。", tags: ["阅读", "翻译", "句法"] },
  { profile: "politics", subject: "政治", name: "砚知", avatar: "砚", tone: "amber", bio: "把时间线、概念和历史条件放回同一张地图。", tags: ["时间线", "马原", "史纲"] },
  { profile: "economics", subject: "经济学", name: "澄川", avatar: "澄", tone: "teal", bio: "用曲线、模型和现实直觉连接抽象结论。", tags: ["微观", "曲线", "模型"] },
];

const reviewComments = [
  { author: "你", label: "批注 01", text: "这里需要补充“其他条件不变”的条件边界。", state: "待处理" },
  { author: "系统自检", label: "格式检查", text: "H2–H4 层级、公式和动态图结构均通过。", state: "已通过" },
];

const reviewItems = [
  { id: "review-demand", title: "需求、供给与均衡", meta: "澄川 · v2", detail: "有 1 条批注", tone: "high" },
  { id: "review-english", title: "长难句的主干、修饰与转折", meta: "言川 · v1", detail: "待自检", tone: "normal" },
  { id: "review-politics", title: "近代中国革命的主线", meta: "砚知 · v3", detail: "已通过自检", tone: "done" },
];

function initials(name: string) {
  return name.slice(0, 1);
}

function KnowledgeGraphCard({
  favorite,
  step,
  playing,
  onFavorite,
  onStep,
  onPlay,
  onReset,
  onToast,
}: {
  favorite: boolean;
  step: number;
  playing: boolean;
  onFavorite: () => void;
  onStep: (value: number) => void;
  onPlay: () => void;
  onReset: () => void;
  onToast: (message: string, tone?: ToastTone) => void;
}) {
  const stageLabels = ["原始均衡", "需求增加", "新均衡"];
  const [readingTab, setReadingTab] = useState<ReadingTab>("要点");
  const stageDescriptions = [
    "先确认纵轴是价格、横轴是数量，再读两条曲线的交点。",
    "需求曲线向右移动，原因应写成非价格因素发生变化。",
    "沿着新交点投影，分别得到新的均衡价格与均衡数量。",
  ];
  const demandPath = step === 0 ? "M76 226 C172 92 290 116 532 238" : step === 1 ? "M112 208 C208 74 330 92 568 220" : "M106 198 C206 66 338 82 570 208";
  const supplyPath = "M86 82 C188 158 306 198 552 262";
  const equilibrium = step === 0 ? { x: 294, y: 167 } : step === 1 ? { x: 334, y: 154 } : { x: 358, y: 145 };
  const readingTitle = readingTab === "公式" ? "均衡条件" : readingTab === "说明" ? "阅读提示" : stageLabels[step];
  const readingCopy = readingTab === "公式"
    ? "均衡点满足 Qd(P) = Qs(P)。先写清楚条件，再判断曲线移动对 P 与 Q 的方向。"
    : readingTab === "说明"
      ? "图像只呈现关系，不代替文字条件。悬停或选中原文时，应能回到对应段落继续阅读。"
      : stageDescriptions[step];

  return (
    <section className="ui-lab-graph-card" aria-labelledby="ui-lab-graph-title">
      <div className="ui-lab-graph-head">
        <div>
          <div className="ui-lab-card-kicker">KNOWLEDGE GRAPH · V2</div>
          <h3 id="ui-lab-graph-title">需求移动如何改变均衡</h3>
          <p>参数和教学步骤由 AI 根据正文生成，卡片只负责可靠呈现。</p>
        </div>
        <div className="ui-lab-graph-actions">
          <button
            type="button"
            className={`ui-lab-icon-button ${favorite ? "is-favorite" : ""}`}
            onClick={() => {
              onFavorite();
              onToast(favorite ? "已取消收藏" : "已收藏到知识图像", "success");
            }}
            aria-label={favorite ? "取消收藏知识图像" : "收藏知识图像"}
            title={favorite ? "取消收藏" : "收藏"}
          >
            <Bookmark size={16} strokeWidth={1.8} fill={favorite ? "currentColor" : "none"} />
          </button>
          <button type="button" className="ui-lab-icon-button" aria-label="打开知识图像更多操作" title="更多操作">
            <MoreHorizontal size={17} />
          </button>
        </div>
      </div>

      <div className="ui-lab-graph-body">
        <div className="ui-lab-graph-visual">
          <svg viewBox="0 0 640 330" role="img" aria-labelledby="graph-title graph-desc">
            <title id="graph-title">需求曲线移动与均衡变化</title>
            <desc id="graph-desc">当前处于第 {step + 1} 个教学步骤，{stageDescriptions[step]}</desc>
            <g className="ui-lab-svg-grid">
              {[80, 160, 240, 320, 400, 480, 560].map((x) => <line key={`x-${x}`} x1={x} y1="44" x2={x} y2="276" />)}
              {[60, 110, 160, 210, 260].map((y) => <line key={`y-${y}`} x1="64" y1={y} x2="580" y2={y} />)}
            </g>
            <path className="ui-lab-svg-axis" d="M64 276 H584 M64 276 V38" />
            <text className="ui-lab-svg-axis-label" x="575" y="304">数量 Q</text>
            <text className="ui-lab-svg-axis-label" x="24" y="46">价格 P</text>
            <path className="ui-lab-svg-curve ui-lab-svg-demand" d={demandPath} />
            <path className="ui-lab-svg-curve ui-lab-svg-supply" d={supplyPath} />
            <line className="ui-lab-svg-guide" x1={equilibrium.x} y1={equilibrium.y} x2={equilibrium.x} y2="276" />
            <line className="ui-lab-svg-guide" x1="64" y1={equilibrium.y} x2={equilibrium.x} y2={equilibrium.y} />
            <circle className="ui-lab-svg-point" cx={equilibrium.x} cy={equilibrium.y} r="7" />
            <text className="ui-lab-svg-label" x={equilibrium.x + 12} y={equilibrium.y - 10}>E{step === 0 ? "₀" : "₁"}</text>
            <text className="ui-lab-svg-label ui-lab-svg-demand-label" x="490" y={step === 0 ? 222 : 202}>D{step === 0 ? "₀" : "₁"}</text>
            <text className="ui-lab-svg-label ui-lab-svg-supply-label" x="510" y="255">S</text>
          </svg>
          <div className="ui-lab-graph-caption"><span className="ui-lab-legend-dot demand" />需求 <span className="ui-lab-legend-dot supply" />供给 <span className="ui-lab-legend-dot equilibrium" />均衡点</div>
        </div>

        <div className="ui-lab-graph-reading">
          <div className="ui-lab-step-count">STEP {step + 1} / 3</div>
          <h4>{readingTitle}</h4>
          <p>{readingCopy}</p>
          <div className="ui-lab-graph-fact"><span>当前结论</span><strong>{step === 0 ? "P₀ · Q₀" : step === 1 ? "需求右移" : "P₁ ↑ · Q₁ ↑"}</strong></div>
          <div className="ui-lab-graph-tabs" role="tablist" aria-label="图像阅读方式">
            {(["要点", "公式", "说明"] as ReadingTab[]).map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={readingTab === tab} className={readingTab === tab ? "is-active" : ""} onClick={() => setReadingTab(tab)}>{tab}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="ui-lab-graph-controls">
        <div className="ui-lab-step-buttons">
          <button type="button" className="ui-lab-control-button" onClick={onPlay} aria-label={playing ? "暂停动画" : "播放动画"}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? "暂停" : "播放"}</button>
          <button type="button" className="ui-lab-control-button" onClick={() => onStep(Math.min(2, step + 1))}><StepForward size={15} />单步</button>
          <button type="button" className="ui-lab-control-button quiet" onClick={onReset} aria-label="重置知识图像"><RotateCcw size={14} />重置</button>
        </div>
        <div className="ui-lab-timeline" aria-label="知识图像教学步骤">
          {stageLabels.map((label, index) => <button key={label} type="button" className={index <= step ? "is-done" : ""} onClick={() => onStep(index)}><span>{index + 1}</span>{label}</button>)}
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="ui-lab-section-heading">
      <div><div className="ui-lab-section-overline">LOCAL MOCK WORKSPACE</div><h1>{title}</h1><p>{description}</p></div>
      {action}
    </div>
  );
}

export default function AiUpgradeLab() {
  const [view, setView] = useState<LabView>("notes");
  const [selectedNoteId, setSelectedNoteId] = useState(notes[0].id);
  const [noteFilter, setNoteFilter] = useState<NoteFilter>("all");
  const [directoriesOpen, setDirectoriesOpen] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState("");
  const [assistantMessages, setAssistantMessages] = useState([
    { role: "assistant", text: "我会只围绕当前笔记回答。你可以选中文字后让我解释，也可以直接问这张图的推导顺序。" },
  ]);
  const [favorite, setFavorite] = useState(false);
  const [graphStep, setGraphStep] = useState(0);
  const [graphPlaying, setGraphPlaying] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("待处理");
  const [reviewTab, setReviewTab] = useState<ReviewTab>("preview");
  const [selectedReviewId, setSelectedReviewId] = useState(reviewItems[0].id);
  const [messageTab, setMessageTab] = useState<MessageBucket>("pending");
  const [messageState, setMessageState] = useState<Record<string, MessageStatus>>(initialMessageState);
  const [memoryState, setMemoryState] = useState<Record<string, string>>({ m1: "待审核", m2: "待审核", m3: "已启用" });
  const [memoryTab, setMemoryTab] = useState<MemoryTab>("pending");
  const [roleplayVisible, setRoleplayVisible] = useState(true);
  const [selectedRole, setSelectedRole] = useState(roles[3].profile);
  const [toast, setToast] = useState<Toast | null>(null);

  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedNoteId) ?? notes[0], [selectedNoteId]);
  const visibleNotes = useMemo(() => noteFilter === "all" ? notes : notes.filter((note) => note.type === noteFilter), [noteFilter]);
  const currentRole = roles.find((role) => role.profile === selectedRole) ?? roles[3];
  const pendingCount = Object.values(messageState).filter((status) => status === "pending").length;
  const runningCount = Object.values(messageState).filter((status) => status === "running").length;
  const memoryCounts = useMemo(() => ({
    pending: Object.values(memoryState).filter((state) => state === "待审核").length,
    enabled: Object.values(memoryState).filter((state) => state === "已启用").length,
    disabled: Object.values(memoryState).filter((state) => state === "已拒绝" || state === "已停用").length,
  }), [memoryState]);
  const messageCounts = useMemo(() => ({
    pending: Object.values(messageState).filter((status) => status === "pending").length,
    running: Object.values(messageState).filter((status) => status === "running").length,
    completed: Object.values(messageState).filter((status) => status === "completed" || status === "cancelled").length,
  }), [messageState]);

  useEffect(() => {
    if (!graphPlaying || graphStep >= 2) return;
    const timer = window.setInterval(() => setGraphStep((value) => Math.min(2, value + 1)), 900);
    return () => window.clearInterval(timer);
  }, [graphPlaying, graphStep]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function showToast(message: string, tone: ToastTone = "info") {
    setToast({ message, tone });
  }

  function resetMock() {
    setView("notes");
    setSelectedNoteId(notes[0].id);
    setNoteFilter("all");
    setDirectoriesOpen(true);
    setAssistantOpen(false);
    setAssistantDraft("");
    setAssistantMessages([{ role: "assistant", text: "我会只围绕当前笔记回答。你可以选中文字后让我解释，也可以直接问这张图的推导顺序。" }]);
    setFavorite(false);
    setGraphStep(0);
    setGraphPlaying(false);
    setReviewStatus("待处理");
    setReviewTab("preview");
    setSelectedReviewId(reviewItems[0].id);
    setMessageTab("pending");
    setMessageState(initialMessageState);
    setMemoryState({ m1: "待审核", m2: "待审核", m3: "已启用" });
    setMemoryTab("pending");
    setRoleplayVisible(true);
    setSelectedRole(roles[3].profile);
    showToast("Mock 状态已重置", "success");
  }

  function openView(nextView: LabView) {
    setAssistantOpen(false);
    setDirectoriesOpen(true);
    setView(nextView);
  }

  function openAssistant() {
    setDirectoriesOpen(false);
    setAssistantOpen(true);
  }

  function closeAssistant() {
    setAssistantOpen(false);
    setDirectoriesOpen(true);
  }

  function changeNoteFilter(nextFilter: NoteFilter) {
    setNoteFilter(nextFilter);
    const nextNote = nextFilter === "all" ? notes[0] : notes.find((note) => note.type === nextFilter);
    if (nextNote) setSelectedNoteId(nextNote.id);
  }

  function sendAssistantMessage() {
    const value = assistantDraft.trim();
    if (!value) return;
    setAssistantMessages((current) => [...current, { role: "user", text: value }, { role: "assistant", text: "这是一条 Mock 回答：先定位当前段落的核心关系，再用图像的步骤 1 → 2 → 3 验证结论。" }]);
    setAssistantDraft("");
  }

  function actOnReview(action: "return" | "hold" | "publish") {
    const labels = { return: "已退回返修", hold: "已批准，暂不发布", publish: "已批准并发布" };
    setReviewStatus(labels[action]);
    showToast(labels[action], action === "return" ? "info" : "success");
  }

  function actOnMessage(id: string, status: MessageStatus, message: string) {
    setMessageState((current) => ({ ...current, [id]: status }));
    showToast(message, status === "cancelled" ? "info" : "success");
  }

  function actOnMemory(id: string, state: string) {
    setMemoryState((current) => ({ ...current, [id]: state }));
    showToast(state === "已启用" ? "记忆候选已启用" : "记忆候选已拒绝", state === "已启用" ? "success" : "info");
  }

  function toggleGraphPlayback() {
    if (graphStep >= 2) {
      setGraphStep(0);
      setGraphPlaying(true);
      return;
    }
    setGraphPlaying((value) => !value);
  }

  const renderNotes = () => (
    <div className="ui-lab-notes-layout">
      <aside className="ui-lab-note-list" aria-label="笔记目录" aria-hidden={assistantOpen || undefined}>
        <div className="ui-lab-list-head"><div><strong>笔记目录</strong><span>AI 内容与我的文章分开</span></div><button type="button" className="ui-lab-icon-button" aria-label="搜索笔记"><Search size={16} /></button></div>
        <div className="ui-lab-filter-row" role="tablist" aria-label="笔记类型筛选">
          {(["all", "讲义", "文章"] as NoteFilter[]).map((filter) => (
            <button key={filter} type="button" role="tab" aria-selected={noteFilter === filter} className={noteFilter === filter ? "is-active" : ""} onClick={() => changeNoteFilter(filter)}>{filter === "all" ? "全部" : filter}</button>
          ))}
        </div>
        <div className="ui-lab-note-items">
          {visibleNotes.length === 0 ? <div className="ui-lab-empty-state compact"><strong>没有匹配笔记</strong><span>换一个类型筛选。</span></div> : visibleNotes.map((note) => <button key={note.id} type="button" className={`ui-lab-note-item ${note.id === selectedNoteId ? "is-active" : ""}`} onClick={() => setSelectedNoteId(note.id)}><span className={`ui-lab-avatar tone-${note.subject}`}>{note.avatar}</span><span className="ui-lab-note-item-copy"><strong>{note.title}</strong><small>{note.subject} · {note.type} · {note.updated}</small></span><ChevronRight size={15} /></button>)}
        </div>
      </aside>
      <article className="ui-lab-note-reader">
        <div className="ui-lab-reader-topline"><span className="ui-lab-breadcrumb">笔记 / {selectedNote.collection}</span><div className="ui-lab-reader-actions">{directoriesOpen && <button type="button" className="ui-lab-subtle-button" onClick={() => setDirectoriesOpen(false)}><PanelLeftClose size={16} />隐藏目录</button>}<button type="button" className="ui-lab-subtle-button"><MoreHorizontal size={16} />更多</button><button type="button" className="ui-lab-primary-button" onClick={openAssistant}><MessageCircle size={16} />问助手</button></div></div>
        <div className="ui-lab-article-header"><div className="ui-lab-article-kicker"><span className="ui-lab-status-dot" />{selectedNote.type} · {selectedNote.subject}</div><h2>{selectedNote.title}</h2><p>{selectedNote.excerpt}</p><div className="ui-lab-author-line"><span className={`ui-lab-avatar tone-${selectedNote.subject}`}>{selectedNote.avatar}</span><span><strong>{selectedNote.author}</strong><small> · 最后更新 {selectedNote.updated}</small></span><span className="ui-lab-collection-chip"><Layers size={13} />{selectedNote.collection}</span></div></div>
        {(() => {
          const article = noteReadingContent[selectedNote.id] ?? noteReadingContent[notes[0].id];
          return <>
            <div className="ui-lab-article-copy"><p>{article.paragraphs[0]}</p><h3>{article.heading}</h3><p>{article.paragraphs[1]}</p><div className="ui-lab-article-insight"><Sparkles size={15} /><span>{article.detail}</span></div></div>
            {article.hasGraph && <KnowledgeGraphCard favorite={favorite} step={graphStep} playing={graphPlaying && graphStep < 2} onFavorite={() => setFavorite((value) => !value)} onStep={(value) => { setGraphStep(value); setGraphPlaying(false); }} onPlay={toggleGraphPlayback} onReset={() => { setGraphStep(0); setGraphPlaying(false); }} onToast={showToast} />}
          </>;
        })()}
        <div className="ui-lab-article-footer"><span><Check size={15} />Markdown 自检通过</span><span><CircleCheck size={15} />网页视觉检查通过</span><button type="button" onClick={() => showToast("已复制为我的文章（Mock）", "info")}><FileText size={15} />复制为我的文章</button></div>
      </article>
    </div>
  );

  const renderReview = () => {
    const selectedReview = reviewItems.find((item) => item.id === selectedReviewId) ?? reviewItems[0];

    return (
      <div className="ui-lab-review-layout">
        <aside className="ui-lab-review-list">
          <div className="ui-lab-list-head">
            <div><strong>待审核提案</strong><span>每个文章版本独立处理</span></div>
            <span className="ui-lab-count-badge">{reviewItems.length}</span>
          </div>
          {reviewItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`ui-lab-review-item ${item.id === selectedReviewId ? "is-active" : ""}`}
              onClick={() => setSelectedReviewId(item.id)}
              aria-current={item.id === selectedReviewId ? "true" : undefined}
            >
              <span className={`ui-lab-review-marker ${item.tone}`} />
              <span><strong>{item.title}</strong><small>{item.meta} · {item.detail}</small></span>
              <ChevronRight size={15} />
            </button>
          ))}
        </aside>
        <section className="ui-lab-review-detail">
          <div className="ui-lab-detail-toolbar">
            <div><span className="ui-lab-kicker-pill">文章审核</span><h2>{selectedReview.title}</h2><p>{selectedReview.meta.replace(" · ", " · ")} · handout · 版本 2</p></div>
            <span className={`ui-lab-review-state ${reviewStatus.includes("发布") ? "success" : reviewStatus.includes("返修") ? "warning" : ""}`}>{reviewStatus}</span>
          </div>
          <div className="ui-lab-tabs" role="tablist" aria-label="文章审核内容">
            <button type="button" role="tab" aria-selected={reviewTab === "preview"} className={reviewTab === "preview" ? "is-active" : ""} onClick={() => setReviewTab("preview")}>真实预览</button>
            <button type="button" role="tab" aria-selected={reviewTab === "diff"} className={reviewTab === "diff" ? "is-active" : ""} onClick={() => setReviewTab("diff")}>块级 Diff <span>2</span></button>
            <button type="button" role="tab" aria-selected={reviewTab === "comments"} className={reviewTab === "comments" ? "is-active" : ""} onClick={() => setReviewTab("comments")}>批注 <span>1</span></button>
          </div>
          {reviewTab === "preview" && (
            <div className="ui-lab-review-preview">
              <div className="ui-lab-preview-paper">
                <div className="ui-lab-preview-meta">第一章 · 本讲要点</div>
                <h3>需求、供给与均衡</h3>
                <p>价格变化与曲线移动是两种不同的变化。审核时需要确认定义、条件与图像说明一致。</p>
                <div className="ui-lab-check-row"><span className="pass"><Check size={14} />H2–H4 层级</span><span className="pass"><Check size={14} />KaTeX</span><span className="pass"><Check size={14} />图像视觉</span></div>
                <div className="ui-lab-annotation"><span>你的批注</span><strong>这里需要补充“其他条件不变”的条件边界。</strong><button type="button" onClick={() => showToast("批注已标记为待复核", "info")}><Check size={14} />标记已处理</button></div>
              </div>
              <div className="ui-lab-review-side"><div className="ui-lab-side-label">自检摘要</div><div className="ui-lab-side-check"><CircleCheck size={18} /><div><strong>格式检查通过</strong><span>Markdown · 公式 · 标题层级</span></div></div><div className="ui-lab-side-check"><CircleCheck size={18} /><div><strong>网页检查通过</strong><span>2 个视口 · 浅色/深色</span></div></div><div className="ui-lab-side-callout"><Sparkles size={16} /><span>AI 原稿已冻结。你可以在当前审核草稿中继续编辑。</span></div></div>
            </div>
          )}
          {reviewTab === "diff" && <div className="ui-lab-diff-panel"><div className="diff-old"><span>v1 · 原稿</span><p>价格变化通常表现为沿着同一条曲线移动。</p></div><div className="diff-new"><span>v2 · 当前</span><p>价格变化通常表现为沿着同一条曲线移动，非价格因素变化才会让整条曲线移动。</p></div></div>}
          {reviewTab === "comments" && <div className="ui-lab-comments-panel">{reviewComments.map((comment) => <article key={comment.label} className="ui-lab-comment-card"><div><span>{comment.label} · {comment.author}</span><strong>{comment.state}</strong></div><p>{comment.text}</p><button type="button" className="ui-lab-outline-button" onClick={() => showToast(`${comment.label} 已加入当前审核草稿`, "info")}><Check size={14} />处理批注</button></article>)}</div>}
          <div className="ui-lab-review-actions"><button type="button" className="ui-lab-text-button" onClick={() => actOnReview("return")}>退回返修</button><button type="button" className="ui-lab-outline-button" onClick={() => actOnReview("hold")}>批准但暂不发布</button><button type="button" className="ui-lab-primary-button" onClick={() => actOnReview("publish")}><Check size={16} />批准并发布</button></div>
        </section>
      </div>
    );
  };

  const renderMessages = () => {
    const visible = messageItems.filter((item) => {
      const status = messageState[item.id];
      return messageTab === "completed" ? status === "completed" || status === "cancelled" : status === messageTab;
    });
    return <div className="ui-lab-messages-layout"><div className="ui-lab-message-summary"><div><div className="ui-lab-section-overline">NOTIFICATION CENTER</div><h2>消息中心</h2><p>需要你决策或编辑的事项集中在这里。</p></div><div className="ui-lab-message-ring"><strong>{pendingCount}</strong><span>待处理</span></div></div><div className="ui-lab-message-tabs">{(["pending", "running", "completed"] as MessageBucket[]).map((tab) => <button type="button" key={tab} className={messageTab === tab ? "is-active" : ""} onClick={() => setMessageTab(tab)}>{tab === "pending" ? "待处理" : tab === "running" ? "进行中" : "已完成"}<span>{messageCounts[tab]}</span></button>)}</div><div className="ui-lab-message-list">{visible.length === 0 ? <div className="ui-lab-empty-state"><CircleCheck size={26} /><strong>这里暂时没有事项</strong><span>完成后的消息保留 3 天。</span></div> : visible.map((item) => { const status = messageState[item.id]; return <article key={item.id} className="ui-lab-message-card"><div className={`ui-lab-message-icon ${status}`}><Bell size={17} /></div><div className="ui-lab-message-copy"><div className="ui-lab-message-title"><strong>{item.title}</strong><span>{item.time}</span></div><p>{status === "cancelled" ? "你已取消这项任务，记录会保留在消息中心。" : item.description}</p><div className="ui-lab-message-actions">{status === "pending" && <button type="button" onClick={() => { openView(item.target); showToast("已打开对应处理页", "info"); }}>打开处理 <ArrowUpRight size={14} /></button>}{status === "running" && <button type="button" onClick={() => actOnMessage(item.id, "cancelled", "任务已取消并保留记录")}>取消任务</button>}{status === "completed" && <button type="button" onClick={() => showToast("已忽略提醒，关联实体不变", "info")}>忽略提醒</button>}{status === "cancelled" && <span className="ui-lab-message-status-label">已取消</span>}<span className={`ui-lab-priority ${item.priority === "高" ? "high" : ""}`}>{item.priority}优先级</span></div></div></article>; })}</div></div>;
  };

  const renderMemory = () => {
    const visibleMemory = memoryCandidates.filter((item) => {
      const state = memoryState[item.id];
      if (memoryTab === "pending") return state === "待审核";
      if (memoryTab === "enabled") return state === "已启用";
      return state === "已拒绝" || state === "已停用";
    });

    return <div className="ui-lab-memory-view"><SectionHeading title="助手记忆" description="候选记忆先进入这里，由你逐条审核、编辑和停用。" action={<button type="button" className="ui-lab-primary-button" onClick={() => showToast("已生成 1 条 Mock 候选", "success")}><Sparkles size={16} />手动生成候选</button>} /><div className="ui-lab-memory-grid"><div className="ui-lab-memory-nav"><button type="button" className={memoryTab === "pending" ? "is-active" : ""} onClick={() => setMemoryTab("pending")}>待审核 <span>{memoryCounts.pending}</span></button><button type="button" className={memoryTab === "enabled" ? "is-active" : ""} onClick={() => setMemoryTab("enabled")}>已启用 <span>{memoryCounts.enabled}</span></button><button type="button" className={memoryTab === "disabled" ? "is-active" : ""} onClick={() => setMemoryTab("disabled")}>已停用 <span>{memoryCounts.disabled}</span></button><div className="ui-lab-memory-tip"><Clock size={15} /><span>学习进度类记忆默认 90 天复核。</span></div></div><div className="ui-lab-memory-list">{visibleMemory.length === 0 ? <div className="ui-lab-empty-state compact"><CircleCheck size={22} /><strong>这里暂时没有候选</strong><span>完成审核后，状态会移动到对应分组。</span></div> : visibleMemory.map((item) => { const state = memoryState[item.id]; return <article key={item.id} className="ui-lab-memory-card"><div className="ui-lab-memory-card-top"><span className="ui-lab-memory-kind">{item.kind}</span><span className={`ui-lab-memory-state ${state === "已启用" ? "enabled" : ""}`}>{state}</span></div><h3>{item.title}</h3><div className="ui-lab-memory-meta"><span>{item.scope}</span><span>可信度 {item.confidence}</span><span>来源：当前会话</span></div>{state === "待审核" && <div className="ui-lab-memory-actions"><button type="button" onClick={() => actOnMemory(item.id, "已拒绝")}>拒绝</button><button type="button" className="ui-lab-primary-button" onClick={() => actOnMemory(item.id, "已启用")}><Check size={14} />启用</button></div>}</article>; })}</div></div></div>;
  };

  const renderRoles = () => <div className="ui-lab-roles-view"><SectionHeading title="角色资料" description="头像、角色名和简介独立审核；文章只引用当前已批准资料。" action={<button type="button" className="ui-lab-outline-button" onClick={() => setRoleplayVisible((value) => !value)}>{roleplayVisible ? "隐藏角色显示" : "显示角色显示"}</button>} /><div className="ui-lab-roles-layout"><div className="ui-lab-role-grid">{roles.map((role) => <button type="button" key={role.profile} className={`ui-lab-role-card ${selectedRole === role.profile ? "is-active" : ""}`} onClick={() => setSelectedRole(role.profile)}><span className={`ui-lab-role-avatar tone-${role.tone}`}>{role.avatar}</span><span><strong>{role.name}</strong><small>{role.subject} · @{role.profile}</small></span><ChevronRight size={15} /></button>)}</div><section className="ui-lab-role-detail"><div className="ui-lab-role-detail-top"><span className={`ui-lab-role-avatar large tone-${currentRole.tone}`}>{currentRole.avatar}</span><div><span className="ui-lab-kicker-pill">已批准资料</span><h2>{currentRole.name}</h2><p>{currentRole.subject} · {currentRole.profile}</p></div><button type="button" className="ui-lab-icon-button" aria-label="角色资料更多操作" onClick={() => showToast("角色资料菜单已打开（Mock）", "info")}><MoreHorizontal size={18} /></button></div><p className="ui-lab-role-bio">{currentRole.bio}</p><div className="ui-lab-role-tags">{currentRole.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="ui-lab-profile-proposal"><div><strong>角色资料提案</strong><span>修改角色名、头像、简介或擅长标签会进入独立审核。</span></div><button type="button" className="ui-lab-outline-button" onClick={() => showToast("已创建角色资料提案（Mock）", "info")}>编辑资料</button></div><div className="ui-lab-role-note"><CircleCheck size={16} /><span>当前角色显示：{roleplayVisible ? "开启" : "关闭"}。关闭后文章仍作为普通内容显示。</span></div></section></div></div>;

  const renderGraphs = () => <div className="ui-lab-graphs-view"><SectionHeading title="知识图像" description="收藏、复用和检查图像版本；点击卡片可回到原文位置。" action={<button type="button" className="ui-lab-outline-button" onClick={() => showToast("已打开图像视觉检查报告（Mock）", "info")}><EyeIcon />视觉报告</button>} /><div className="ui-lab-graph-library"><div className="ui-lab-library-head"><div><strong>我的收藏</strong><span>1 张图像 · 自动跟随最新已发布版本</span></div><button type="button" className="ui-lab-subtle-button" onClick={() => showToast("筛选器已打开（Mock）", "info")}><SlidersHorizontal size={15} />筛选</button></div><div className="ui-lab-graph-library-grid"><div><KnowledgeGraphCard favorite={favorite} step={graphStep} playing={graphPlaying && graphStep < 2} onFavorite={() => setFavorite((value) => !value)} onStep={(value) => { setGraphStep(value); setGraphPlaying(false); }} onPlay={toggleGraphPlayback} onReset={() => { setGraphStep(0); setGraphPlaying(false); }} onToast={showToast} /><button type="button" className="ui-lab-source-link" onClick={() => { setView("notes"); setSelectedNoteId(notes[0].id); showToast("已跳转到原文图像位置（Mock）", "info"); }}><ArrowUpRight size={15} />查看原文 · 需求、供给与均衡</button></div><div className="ui-lab-graph-side-card"><div className="ui-lab-card-kicker">VERSION STATUS</div><h3>图像版本链</h3><div className="ui-lab-version-line"><span className="is-current" /><div><strong>v2 · 当前公开</strong><small>视觉检查通过 · 2026/07/30</small></div></div><div className="ui-lab-version-line"><span /><div><strong>v1 · 收藏时版本</strong><small>保留用于对照</small></div></div><div className="ui-lab-side-callout compact"><Orbit size={16} /><span>图像语义变化会触发完整复审，纯样式变化进入精简审核。</span></div></div></div></div></div>;

  const renderView = () => {
    if (view === "notes") return renderNotes();
    if (view === "review") return <div className="ui-lab-view-padding"><SectionHeading title="文章审核" description="真实预览、批注和发布决策集中在这里。" /><div className="ui-lab-section-gap">{renderReview()}</div></div>;
    if (view === "messages") return <div className="ui-lab-view-padding">{renderMessages()}</div>;
    if (view === "memory") return <div className="ui-lab-view-padding">{renderMemory()}</div>;
    if (view === "roles") return <div className="ui-lab-view-padding">{renderRoles()}</div>;
    return <div className="ui-lab-view-padding">{renderGraphs()}</div>;
  };

  return (
    <main id="ui-lab-main" className={`ui-lab-page ${view === "notes" && assistantOpen ? "is-assistant-open" : ""} ${view === "notes" && !directoriesOpen ? "is-directories-hidden" : ""}`}>
      <div className="ui-lab-frame">
        <header className="ui-lab-topbar">
          <div className="ui-lab-lab-heading">
            <div className="ui-lab-section-overline">LOCAL MOCK WORKSPACE · AI UPGRADE</div>
            <h1>AI 升级工作台</h1>
            <p>文章审核、笔记助手、角色资料与知识图像的本地交互演示。</p>
          </div>
          <div className="ui-lab-topbar-actions">
            <span className="ui-lab-screen-chip">纯 Mock · 不写数据库</span>
            <button type="button" className="ui-lab-reset-button" onClick={resetMock}><RotateCcw size={14} />重置演示</button>
          </div>
        </header>
        <div className="ui-lab-layout">
            <aside className="ui-lab-sidebar" aria-hidden={view === "notes" && assistantOpen ? true : undefined}>
            <div className="ui-lab-profile-mini"><span className="ui-lab-profile-avatar">我</span><div><strong>我的学习空间</strong><span>审核者 · 管理员</span></div><MoreHorizontal size={16} /></div>
            <nav className="ui-lab-nav" aria-label="演示模块">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isAssistant = item.id === "notes" && assistantOpen;
                return <button type="button" key={item.id} className={`ui-lab-nav-item ${view === item.id || isAssistant ? "is-active" : ""}`} onClick={() => openView(item.id)}><Icon size={17} /><span>{item.label}</span>{item.count && <b>{item.id === "messages" ? pendingCount : item.count}</b>}</button>;
              })}
              <button type="button" className={`ui-lab-nav-item ${assistantOpen ? "is-active" : ""}`} onClick={() => { setView("notes"); openAssistant(); }}><MessageCircle size={17} /><span>笔记助手</span><span className="ui-lab-nav-live" /></button>
            </nav>
            <div className="ui-lab-sidebar-foot"><div className="ui-lab-local-dot" /><span>本地演示状态正常</span></div>
          </aside>
          <section className="ui-lab-workspace">
            <div className={`ui-lab-content-row ${view === "notes" && assistantOpen ? "has-assistant" : ""}`}>
              {view === "notes" && !directoriesOpen && !assistantOpen && <button type="button" className="ui-lab-directory-reveal" onClick={() => setDirectoriesOpen(true)} aria-label="显示目录栏" title="显示目录栏"><PanelLeftOpen size={16} /><span>目录</span></button>}
              <div className="ui-lab-content">{renderView()}</div>
              {view === "notes" && assistantOpen && (
                <aside className="ui-lab-assistant" aria-label="笔记助手抽屉">
                  <div className="ui-lab-assistant-head"><div><span className="ui-lab-kicker-pill">当前笔记</span><h2>问助手</h2><p>{selectedNote.title}</p></div><button type="button" className="ui-lab-icon-button" onClick={closeAssistant} aria-label="关闭笔记助手"><X size={17} /></button></div>
                  <div className="ui-lab-assistant-messages">{assistantMessages.map((message, index) => <div key={`${message.role}-${index}`} className={`ui-lab-chat-bubble ${message.role}`}><span>{message.role === "assistant" ? "AI" : "你"}</span><p>{message.text}</p></div>)}</div>
                  <div className="ui-lab-assistant-quote"><Quote size={14} /><span>可选中文字后，引用会先进入输入框。</span></div>
                  <div className="ui-lab-assistant-input"><textarea value={assistantDraft} onChange={(event) => setAssistantDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendAssistantMessage(); } }} placeholder="围绕当前笔记提问…" aria-label="向笔记助手提问" /><button type="button" onClick={sendAssistantMessage} disabled={!assistantDraft.trim()} aria-label="发送问题"><Send size={16} /></button><small>Enter 发送 · Shift+Enter 换行</small></div>
                </aside>
              )}
            </div>
          </section>
        </div>
      </div>
      {toast && <div className={`ui-lab-toast ${toast.tone}`} role="status" aria-live="polite"><span>{toast.tone === "danger" ? <AlertCircle size={16} /> : <CircleCheck size={16} />}</span>{toast.message}</div>}
    </main>
  );
}

function EyeIcon() {
  return <span className="ui-lab-eye-icon" aria-hidden="true"><span /></span>;
}
