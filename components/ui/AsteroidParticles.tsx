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
  trail: { x: number; y: number }[];
  isTrail?: boolean;
  opacity: number;
  speed: number;
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

  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = [];
    const centerX = width / 2;
    const centerY = height / 2;
    const asteroidRadius = Math.min(width, height) * 0.15;

    // 1. 绘制黑色球体轮廓（白色边框）
    const sphereParticle: Particle = {
      x: centerX,
      y: centerY,
      originX: centerX,
      originY: centerY,
      size: asteroidRadius,
      color: "rgba(0, 0, 0, 0.8)",
      vx: 0,
      vy: 0,
      trail: [],
      opacity: 1,
      speed: 0,
    };
    particles.push(sphereParticle);

    // 2. 星座线条连接点（在球体表面和周围）
    const constellationPoints: { x: number; y: number }[] = [];
    const numConstellationPoints = 25;

    for (let i = 0; i < numConstellationPoints; i++) {
      const angle = (Math.PI * 2 * i) / numConstellationPoints + (Math.random() - 0.5) * 0.5;
      const radius = asteroidRadius * (0.8 + Math.random() * 0.4);
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      
      constellationPoints.push({ x, y });

      particles.push({
        x,
        y,
        originX: x,
        originY: y,
        size: 1.5 + Math.random() * 2,
        color: "rgba(255, 255, 255, 0.8)",
        vx: 0,
        vy: 0,
        trail: [],
        opacity: 0.8,
        speed: 0.001 + Math.random() * 0.003,
      });
    }

    // 3. 流星尾迹小点（围绕球体旋转）
    const numTrailParticles = 40;
    for (let i = 0; i < numTrailParticles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const orbitRadius = asteroidRadius * (1.2 + Math.random() * 1.5);
      const x = centerX + Math.cos(angle) * orbitRadius;
      const y = centerY + Math.sin(angle) * orbitRadius;

      const trail: { x: number; y: number }[] = [];
      for (let j = 0; j < 8; j++) {
        trail.push({ x, y });
      }

      particles.push({
        x,
        y,
        originX: centerX,
        originY: centerY,
        size: 1 + Math.random() * 2,
        color: `rgba(255, 255, 255, ${0.3 + Math.random() * 0.5})`,
        vx: 0,
        vy: 0,
        trail,
        opacity: 0.3 + Math.random() * 0.5,
        speed: 0.005 + Math.random() * 0.015,
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

    particlesRef.current.forEach((particle, index) => {
      // 第一个粒子是黑色球体
      if (index === 0) {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        return;
      }

      // 流星尾迹粒子沿轨道运动
      if (particle.trail.length > 0 && particle.speed > 0.01) {
        const angle = Math.atan2(particle.y - centerY, particle.x - centerX);
        const newAngle = angle + particle.speed;
        const orbitRadius = Math.sqrt(
          Math.pow(particle.x - centerX, 2) + Math.pow(particle.y - centerY, 2)
        );
        const targetX = centerX + Math.cos(newAngle) * orbitRadius;
        const targetY = centerY + Math.sin(newAngle) * orbitRadius;

        // 更新尾迹
        particle.trail.unshift({ x: particle.x, y: particle.y });
        if (particle.trail.length > 8) {
          particle.trail.pop();
        }

        particle.x += (targetX - particle.x) * 0.1;
        particle.y += (targetY - particle.y) * 0.1;

        // 绘制尾迹线
        if (particle.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(particle.trail[0].x, particle.trail[0].y);
          for (let i = 1; i < particle.trail.length; i++) {
            ctx.lineTo(particle.trail[i].x, particle.trail[i].y);
          }
          ctx.strokeStyle = `rgba(255, 255, 255, ${particle.opacity * 0.3})`;
          ctx.lineWidth = particle.size * 0.5;
          ctx.stroke();
        }
      } else {
        // 星座点微微浮动
        particle.x = particle.originX + Math.sin(Date.now() * particle.speed) * 3;
        particle.y = particle.originY + Math.cos(Date.now() * particle.speed) * 3;
      }

      // 鼠标交互 - 排斥
      let repulsionX = 0;
      let repulsionY = 0;

      if (mouse.active) {
        const dx = particle.x - mouse.x;
        const dy = particle.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 150;

        if (dist < maxDist && dist > 0) {
          const force = (1 - dist / maxDist) * 50;
          repulsionX = (dx / dist) * force;
          repulsionY = (dy / dist) * force;
        }
      }

      particle.x += repulsionX * 0.05;
      particle.y += repulsionY * 0.05;

      // 绘制粒子
      if (particle.size > 0) {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();

        // 发光效果
        if (particle.size > 2) {
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size * 2, 0, Math.PI * 2);
          const gradient = ctx.createRadialGradient(
            particle.x, particle.y, 0,
            particle.x, particle.y, particle.size * 2
          );
          gradient.addColorStop(0, particle.color);
          gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = gradient;
          ctx.fill();
        }
      }
    });

    // 绘制星座线条（连接附近的点）
    const constellationParticles = particlesRef.current.filter((p, i) => i > 0 && p.speed < 0.01);
    const maxConnectionDist = 120;
    
    for (let i = 0; i < constellationParticles.length; i++) {
      for (let j = i + 1; j < constellationParticles.length; j++) {
        const p1 = constellationParticles[i];
        const p2 = constellationParticles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < maxConnectionDist) {
          const opacity = (1 - dist / maxConnectionDist) * 0.4;
          ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx.lineWidth = 0.8;
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

    // 鼠标事件
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

    // 触摸事件
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
