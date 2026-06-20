import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Bot,
  ClipboardCheck,
  FileDown,
  RotateCcw,
  Search,
  Target,
} from "lucide-react";
import Image from "next/image";
import { AsteroidParticles } from "@/components/ui/AsteroidParticles";

const focusEntries = [
  {
    title: "继续阅读",
    description: "回到已经沉淀好的笔记和题集。",
    href: "/notes",
    icon: BookOpen,
    tone: "border-sky-500/20 bg-sky-500/10 text-sky-700",
  },
  {
    title: "笔记问答",
    description: "从笔记和题集中查答案、找位置。",
    href: "/tools/note-qa",
    icon: Search,
    tone: "border-violet-500/20 bg-violet-500/10 text-violet-700",
  },
  {
    title: "错题复盘",
    description: "优先处理答错、跳过和未掌握的题。",
    href: "/tools/review",
    icon: RotateCcw,
    tone: "border-rose-500/20 bg-rose-500/10 text-rose-700",
  },
  {
    title: "数学三自测",
    description: "进入计时训练，保留可复盘记录。",
    href: "/tools/math3-self-test",
    icon: ClipboardCheck,
    tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
  },
];

const workflowLinks = [
  { label: "知识目录", href: "/tools/math3-catalog", icon: BookOpen },
  { label: "笔记问答", href: "/tools/note-qa", icon: Bot },
  { label: "PDF 做题本", href: "/tools/problem-booklet", icon: FileDown },
  { label: "全部工具", href: "/tools", icon: Target },
];

const studyRhythm = [
  "先用目录定位薄弱章节",
  "再进入错题复盘或自测",
  "最后导出题册线下重做",
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-surface">
      <section className="relative flex min-h-[100svh] items-center justify-center px-6 pt-20">
        <div className="absolute left-1/2 top-1/2 h-[min(76vw,34rem)] w-[min(94vw,51rem)] -translate-x-1/2 -translate-y-[56%]">
          <Image
            src="/logo-hero.webp"
            alt=""
            fill
            sizes="(max-width: 768px) 94vw, 51rem"
            className="object-contain opacity-[0.13] blur-[0.2px]"
            priority
          />
          <AsteroidParticles className="absolute inset-0 opacity-80" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <h1 className="font-headline text-5xl font-bold leading-tight text-primary [text-shadow:0_1px_18px_rgba(251,250,247,0.86)] sm:text-6xl md:text-7xl lg:text-8xl">
            知识的小行星
          </h1>
          <p className="mt-6 font-headline text-xl italic text-on-surface-variant [text-shadow:0_1px_14px_rgba(251,250,247,0.9)] md:text-2xl">
            知识的沉淀与共鸣
          </p>
          <p className="mt-3 font-body text-sm font-semibold text-on-surface-variant/55 [text-shadow:0_1px_12px_rgba(251,250,247,0.92)] sm:text-base">
            Deposits and resonance of knowledge
          </p>
        </div>

        <Link
          href="#study-workspace"
          aria-label="进入学习工作台"
          className="absolute bottom-7 left-1/2 z-10 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-primary/15 bg-surface-container-lowest/62 text-primary shadow-ambient backdrop-blur-md transition-colors hover:bg-surface-container-lowest focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <ArrowDown className="h-5 w-5" />
        </Link>
      </section>

      <section
        id="study-workspace"
        className="border-t border-outline-variant/20 bg-surface-container-low/58 py-14 [contain-intrinsic-size:760px] [content-visibility:auto] sm:py-20"
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="tag-chip tag-chip-primary px-3 py-1 text-xs font-bold">
                学习工作台
              </span>
              <h2 className="mt-3 font-headline text-2xl font-bold leading-tight text-on-surface sm:text-3xl">
                今天从这里进入
              </h2>
            </div>
            <Link
              href="/tools"
              className="control-button h-10 w-fit px-4 text-sm"
            >
              <span>全部工具</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {focusEntries.map((entry) => {
              const Icon = entry.icon;

              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="surface-card group flex min-h-40 flex-col justify-between p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${entry.tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-headline text-lg font-bold leading-tight text-on-surface group-hover:text-primary">
                        {entry.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-on-surface-variant">
                        {entry.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-end text-sm font-semibold text-primary">
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1.08fr_0.92fr]">
            <section className="surface-panel p-5">
              <h3 className="font-headline text-xl font-bold text-on-surface">
                推荐节奏
              </h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {studyRhythm.map((item, index) => (
                  <div
                    key={item}
                    className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest/70 p-4"
                  >
                    <div className="text-xs font-bold text-primary/70">
                      0{index + 1}
                    </div>
                    <div className="mt-2 text-sm font-semibold leading-6 text-on-surface">
                      {item}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="surface-panel p-5">
              <h3 className="font-headline text-xl font-bold text-on-surface">
                快速入口
              </h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {workflowLinks.map((link) => {
                  const Icon = link.icon;

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex min-h-12 items-center gap-3 rounded-lg border border-outline-variant/28 bg-surface-container-lowest/72 px-3 text-sm font-semibold text-on-surface-variant transition-colors hover:border-primary/30 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
