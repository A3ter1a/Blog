"use client";

import { useEffect, useRef, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  z: number;
  originalX: number;
  originalY: number;
  originalZ: number;
  size: number;
  brightness: number;
  projX: number;
  projY: number;
  projZ: number;
  scale: number;
}

export function AsteroidParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const rotRef = useRef({ x: 0, y: 0, z: 0 });
  const timeRef = useRef(0);
  const particleCount = 300;
  const rotationSpeed = 0.8;

  const fibonacciSphere = useCallback((samples: number) => {
    const points = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    
    for (let i = 0; i < samples; i++) {
      const y = 1 - (i / (samples - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = goldenAngle * i;
      
      points.push({
        x: Math.cos(theta) * radiusAtY,
        y: y,
        z: Math.sin(theta) * radiusAtY
      });
    }
    
    return points;
  }, []);

  const initParticles = useCallback((sphereRadius: number) => {
    const particles: Particle[] = [];
    const spherePoints = fibonacciSphere(particleCount);
    
    spherePoints.forEach((point) => {
      particles.push({
        x: point.x * sphereRadius,
        y: point.y * sphereRadius,
        z: point.z * sphereRadius,
        originalX: point.x * sphereRadius,
        originalY: point.y * sphereRadius,
        originalZ: point.z * sphereRadius,
        size: Math.random() * 1.2 + 0.8,
        brightness: Math.random() * 0.3 + 0.7,
        projX: 0,
        projY: 0,
        projZ: 0,
        scale: 0
      });
    });
    
    particlesRef.current = particles;
  }, [fibonacciSphere]);

  const rotateX = (p: { x: number; y: number; z: number }, angle: number) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
  };

  const rotateY = (p: { x: number; y: number; z: number }, angle: number) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
  };

  const rotateZ = (p: { x: number; y: number; z: number }, angle: number) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
  };

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const sphereRadius = width * 0.32;

    // Update rotation
    const dt = 0.016;
    timeRef.current += dt;
    rotRef.current.x += dt * 0.25 * rotationSpeed;
    rotRef.current.y += dt * 0.4 * rotationSpeed;
    rotRef.current.z += dt * 0.1 * rotationSpeed;

    // Update particles
    particlesRef.current.forEach(p => {
      let rotated = { x: p.originalX, y: p.originalY, z: p.originalZ };
      rotated = rotateX(rotated, rotRef.current.x);
      rotated = rotateY(rotated, rotRef.current.y);
      rotated = rotateZ(rotated, rotRef.current.z);

      const fov = 500;
      const distance = fov + rotated.z;
      const scale = fov / distance;

      p.projX = centerX + rotated.x * scale;
      p.projY = centerY + rotated.y * scale;
      p.projZ = rotated.z;
      p.scale = scale;
    });

    // Draw
    ctx.clearRect(0, 0, width, height);
    
    particlesRef.current.sort((a, b) => b.projZ - a.projZ);

    particlesRef.current.forEach(p => {
      const depthNorm = (p.projZ + sphereRadius) / (2 * sphereRadius);
      const opacity = p.brightness * (0.25 + depthNorm * 0.75);
      const size = p.size * (0.5 + depthNorm * 0.5) * p.scale;

      ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
      ctx.beginPath();
      ctx.arc(p.projX, p.projY, size, 0, Math.PI * 2);
      ctx.fill();
    });

    animationRef.current = requestAnimationFrame(animate);
  }, [rotationSpeed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      
      const sphereRadius = rect.width * 0.32;
      initParticles(sphereRadius);
    };

    resize();
    window.addEventListener("resize", resize);
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />
    </div>
  );
}
