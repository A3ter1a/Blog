import { ArrowDown } from "lucide-react";
import Image from "next/image";
import heroLogo from "@/public/logo-hero.webp";
import { StudyTimelineDeferred } from "@/components/home/StudyTimelineDeferred";
import { AsteroidParticles } from "@/components/ui/AsteroidParticles";

export default function Home() {
  return (
    <main className="page-template-home relative min-h-screen overflow-hidden bg-surface" data-page-template="home">
      <section className="page-hero relative flex min-h-[100svh] items-center justify-center px-6 pt-20">
        <div className="absolute left-1/2 top-1/2 h-[min(76vw,34rem)] w-[min(94vw,51rem)] -translate-x-1/2 -translate-y-[56%]">
          <Image
            src={heroLogo}
            alt=""
            fill
            sizes="(max-width: 768px) 94vw, 51rem"
            className="object-contain opacity-[0.13] blur-[0.2px]"
            priority
          />
          <AsteroidParticles className="absolute inset-0 opacity-80" />
        </div>

        <div className="motion-reveal relative z-10 mx-auto max-w-4xl text-center">
          <h1 className="font-headline text-5xl font-bold leading-tight text-primary sm:text-6xl md:text-7xl lg:text-8xl">
            知识的小行星
          </h1>
          <p className="mt-6 font-headline text-xl italic text-on-surface-variant md:text-2xl">
            知识的沉淀与共鸣
          </p>
          <p className="mt-3 font-body text-sm font-semibold text-on-surface-variant/55 sm:text-base">
            Deposits and resonance of knowledge
          </p>
        </div>

        <a
          href="#study-timeline"
          aria-label="向下查看学习规划"
          className="motion-ui motion-interactive absolute bottom-7 left-1/2 z-10 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-primary/15 bg-surface-container-lowest/62 text-primary shadow-ambient backdrop-blur-md hover:bg-surface-container-lowest focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <ArrowDown className="h-5 w-5" />
        </a>
      </section>

      <section
        id="study-timeline"
        aria-labelledby="study-plan-heading"
        className="scroll-mt-20 py-10 sm:py-14"
      >
        <div className="page-frame page-frame--wide">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-primary/10 pb-5">
            <div>
              <p className="font-label text-xs font-bold uppercase tracking-[0.18em] text-primary/70">
                Study planning
              </p>
              <h2 id="study-plan-heading" className="mt-2 font-headline text-3xl font-bold text-primary sm:text-4xl">
                沿着轨道推进
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-on-surface-variant sm:text-base">
                从月度节奏到刷题状态，让下一步始终清晰可见。
              </p>
            </div>
            <span className="rounded-full border border-primary/10 bg-surface-container-lowest/65 px-3 py-1.5 text-xs font-bold text-on-surface-variant shadow-ambient">
              北京时间 · 月度视图
            </span>
          </div>
          <StudyTimelineDeferred />
        </div>
      </section>
    </main>
  );
}
