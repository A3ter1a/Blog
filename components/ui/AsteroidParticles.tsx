"use client";

import { useEffect, useRef, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  size: number;
  color: string;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  orbitRadius: number;
}

interface MousePosition {
  x: number;
  y: number;
  active: boolean;
}

export function AsteroidParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef<MousePosition>({ x: 0, y: 0, active: false });
  const animationRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const colors = [
    "rgba(147, 130, 220, 0.8)",   // primary
    "rgba(179, 162, 242, 0.6)",   // primary-container
    "rgba(200, 190, 255, 0.5)",   // light accent
    "rgba(120, 100, 200, 0.7)",   // dark accent
    "rgba(255, 255, 255, 0.4)",   // white sparkle
  ];

  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = [];
    const centerX = width / 2;
    const centerY = height / 2;
    const count = Math.min(120, Math.floor((width * height) / 8000));

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const orbitRadius = 80 + Math.random() * Math.min(width, height) * 0.35;
      const speed = 0.002 + Math.random() * 0.008;

      particles.push({
        x: centerX + Math.cos(angle) * orbitRadius,
        y: centerY + Math.sin(angle) * orbitRadius,
        originX: centerX + Math.cos(angle) * orbitRadius,
        originY: centerY + Math.sin(angle) * orbitRadius,
        size: 1 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: 0,
        vy: 0,
        angle,
        speed,
        orbitRadius,
      });
    }

    particlesRef.current = particles;
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const mouse = mouseRef.current;

    ctx.clearRect(0, 0, width, height);

    particlesRef.current.forEach((particle) => {
      // Orbital motion
      particle.angle += particle.speed;
      const targetX = centerX + Math.cos(particle.angle) * particle.orbitRadius;
      const targetY = centerY + Math.sin(particle.angle) * particle.orbitRadius;

      // Mouse interaction - repulsion
      let repulsionX = 0;
      let repulsionY = 0;

      if (mouse.active) {
        const dx = particle.x - mouse.x;
        const dy = particle.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 150;

        if (dist < maxDist && dist > 0) {
          const force = (1 - dist / maxDist) * 80;
          repulsionX = (dx / dist) * force;
          repulsionY = (dy / dist) * force;
        }
      }

      // Spring back to orbit
      const springForce = 0.02;
      const dx = targetX - particle.x;
      const dy = targetY - particle.y;

      particle.vx = particle.vx * 0.92 + dx * springForce + repulsionX * 0.1;
      particle.vy = particle.vy * 0.92 + dy * springForce + repulsionY * 0.1;

      particle.x += particle.vx;
      particle.y += particle.vy;

      // Draw particle
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fillStyle = particle.color;
      ctx.fill();

      // Draw glow for larger particles
      if (particle.size > 2) {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 2.5, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(
          particle.x, particle.y, 0,
          particle.x, particle.y, particle.size * 2.5
        );
        gradient.addColorStop(0, particle.color);
        gradient.addColorStop(1, "rgba(147, 130, 220, 0)");
        ctx.fillStyle = gradient;
        ctx.fill();
      }
    });

    // Draw connections between nearby particles
    const maxConnectionDist = 100;
    ctx.strokeStyle = "rgba(147, 130, 220, 0.15)";
    ctx.lineWidth = 0.5;

    for (let i = 0; i < particlesRef.current.length; i++) {
      for (let j = i + 1; j < particlesRef.current.length; j++) {
        const p1 = particlesRef.current[i];
        const p2 = particlesRef.current[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < maxConnectionDist) {
          const opacity = (1 - dist / maxConnectionDist) * 0.3;
          ctx.strokeStyle = `rgba(147, 130, 220, ${opacity})`;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }

    animationRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      initParticles(canvas.width, canvas.height);
    };

    resize();
    window.addEventListener("resize", resize);

    // Mouse events
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    // Touch events
    const handleTouchMove = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      mouseRef.current = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        active: true,
      };
    };

    const handleTouchEnd = () => {
      mouseRef.current.active = false;
    };

    canvas.addEventListener("touchmove", handleTouchMove);
    canvas.addEventListener("touchend", handleTouchEnd);

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      cancelAnimationFrame(animationRef.current);
    };
  }, [initParticles, animate]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />
    </div>
  );
}
