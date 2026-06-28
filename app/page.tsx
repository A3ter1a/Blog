import { ArrowDown } from "lucide-react";
import Image from "next/image";
import { StudyTimelineDeferred } from "@/components/home/StudyTimelineDeferred";
import { AsteroidParticles } from "@/components/ui/AsteroidParticles";

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

        <a
          href="#study-timeline"
          aria-label="进入导学时间轴"
          className="absolute bottom-7 left-1/2 z-10 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-primary/15 bg-surface-container-lowest/62 text-primary shadow-ambient backdrop-blur-md transition-colors hover:bg-surface-container-lowest focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <ArrowDown className="h-5 w-5" />
        </a>
      </section>

      <section
        id="study-timeline"
        className="border-t border-outline-variant/20 bg-surface-container-low/58 py-14 [contain-intrinsic-size:760px] [content-visibility:auto] sm:py-20"
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <StudyTimelineDeferred />
        </div>
      </section>
    </main>
  );
}
