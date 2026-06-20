"use client";

import { useEffect, useRef } from "react";

type Spark = {
  x: number;
  y: number;
  size: number;
  alpha: number;
  speed: number;
  phase: number;
  lane: number;
};

const SPARK_COUNT = 46;

const STREAKS = [
  { x: -0.42, y: 0.2, length: 0.34, alpha: 0.14 },
  { x: -0.3, y: 0.31, length: 0.45, alpha: 0.1 },
  { x: -0.18, y: 0.42, length: 0.4, alpha: 0.09 },
  { x: 0.08, y: 0.14, length: 0.28, alpha: 0.08 },
];

function seededRandom(seed: number) {
  let value = seed;

  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function createSparks() {
  const random = seededRandom(0xA57E801D);
  const sparks: Spark[] = [];

  for (let index = 0; index < SPARK_COUNT; index += 1) {
    sparks.push({
      x: -0.58 + random() * 1.16,
      y: -0.42 + random() * 0.88,
      size: 0.65 + random() * 1.25,
      alpha: 0.08 + random() * 0.17,
      speed: 0.025 + random() * 0.055,
      phase: random() * Math.PI * 2,
      lane: random(),
    });
  }

  return sparks;
}

export function AsteroidParticles({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !container || !context) return;

    const sparks = createSparks();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationFrame = 0;
    let timeout = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (timestamp: number) => {
      context.clearRect(0, 0, width, height);

      const time = timestamp * 0.001;
      const scale = Math.min(width, height);
      const centerX = width * 0.5;
      const centerY = height * 0.5;
      const angle = -0.78;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      context.save();
      context.globalCompositeOperation = "source-over";

      for (const streak of STREAKS) {
        const startX = centerX + streak.x * scale;
        const startY = centerY + streak.y * scale;
        const endX = startX + streak.length * scale * cos;
        const endY = startY + streak.length * scale * sin;
        const gradient = context.createLinearGradient(startX, startY, endX, endY);

        gradient.addColorStop(0, "rgba(20, 49, 75, 0)");
        gradient.addColorStop(0.38, `rgba(20, 49, 75, ${streak.alpha})`);
        gradient.addColorStop(1, "rgba(20, 49, 75, 0)");

        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.lineCap = "round";
        context.lineWidth = Math.max(1, scale * 0.003);
        context.strokeStyle = gradient;
        context.stroke();
      }

      for (const spark of sparks) {
        const travel = reducedMotion ? spark.lane : (spark.lane + time * spark.speed) % 1;
        const shimmer = reducedMotion ? 0.72 : 0.62 + Math.sin(time * 1.1 + spark.phase) * 0.24;
        const x = centerX + (spark.x + (travel - 0.5) * 0.1) * scale;
        const y = centerY + (spark.y - (travel - 0.5) * 0.08) * scale;
        const radius = spark.size * (0.92 + travel * 0.18);
        const alpha = spark.alpha * shimmer * (0.72 + travel * 0.28);

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(20, 49, 75, ${alpha})`;
        context.fill();
      }

      context.restore();

      if (!reducedMotion) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    resize();

    const observer = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    observer.observe(container);

    timeout = window.setTimeout(() => {
      draw(performance.now());
    }, 80);

    return () => {
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`pointer-events-none ${className}`}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
