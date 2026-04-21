"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import Link from "next/link";
import { ArrowDown, BookOpen, Sparkles, Brain } from "lucide-react";
import { AsteroidParticles } from "@/components/ui/AsteroidParticles";

const features = [
  {
    icon: BookOpen,
    title: "知识沉淀",
    description: "系统化整理考研笔记，构建完整的知识体系",
  },
  {
    icon: Sparkles,
    title: "智能辅助",
    description: "AI 驱动的 OCR 识别，自动提取题干与解析",
  },
  {
    icon: Brain,
    title: "深度思考",
    description: "在阅读中与 AI 对话，拓展思维边界",
  },
];

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <div ref={containerRef} className="min-h-screen relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        <motion.div
          style={{ y, opacity }}
          className="absolute top-20 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]"
        />
        <motion.div
          style={{ y: useTransform(scrollYProgress, [0, 1], [0, 150]), opacity }}
          className="absolute top-40 right-1/4 w-[400px] h-[400px] rounded-full bg-primary-container/5 blur-[100px]"
        />
      </div>

      {/* Hero Section */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 relative">
        {/* Particle Effect Behind Title */}
        <AsteroidParticles />
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center max-w-4xl relative z-10"
        >
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold text-primary mb-6 tracking-tight font-headline">
            知识的<span className="text-primary-container">小行星</span>
          </h1>
          <p className="text-xl md:text-2xl text-on-surface-variant font-headline italic mb-4">
            知识的沉淀与共鸣
          </p>
          <p className="text-base text-on-surface-variant/60 font-body tracking-wide">
            Deposits and resonance of knowledge
          </p>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="absolute bottom-12"
        >
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <ArrowDown className="w-6 h-6 text-on-surface-variant/40" />
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="py-32 px-6 relative">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-primary mb-4 font-headline">
              在这里，学习成为一种仪式
            </h2>
            <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
              摒弃繁杂，回归本质。让每一次笔记的整理，都成为通向远方的基石。
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: index * 0.15, duration: 0.5 }}
                whileHover={{ y: -8 }}
                className="group p-8 rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-all duration-300 cursor-pointer"
              >
                <div className="w-14 h-14 rounded-full editorial-gradient flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="w-6 h-6 text-on-primary" />
                </div>
                <h3 className="text-2xl font-bold text-on-surface mb-3 font-headline">
                  {feature.title}
                </h3>
                <p className="text-on-surface-variant leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-primary mb-6 font-headline">
            开始你的知识之旅
          </h2>
          <p className="text-lg text-on-surface-variant mb-10 max-w-xl mx-auto">
            博观而约取，厚积而薄发。在这场孤独的修行中，我们终将听见远方的回响。
          </p>
          <Link
            href="/notes"
            className="inline-block editorial-gradient text-on-primary font-medium text-lg px-10 py-4 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all duration-300 shadow-elevated shadow-primary/10"
          >
            探索笔记
          </Link>
        </motion.div>
      </section>
    </div>
  );
}
