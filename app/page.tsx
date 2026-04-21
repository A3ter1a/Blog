"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { AsteroidParticles } from "@/components/ui/AsteroidParticles";

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
      </section>
    </div>
  );
}
