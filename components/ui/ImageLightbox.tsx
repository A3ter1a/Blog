"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, RotateCcw, X } from "lucide-react";

export type LightboxImage = {
  src: string;
  alt: string;
};

type ImageLightboxProps = {
  image: LightboxImage | null;
  onClose: () => void;
};

type Transform = { scale: number; x: number; y: number };
type PointerPoint = { x: number; y: number };

const MIN_SCALE = 1;
const MAX_SCALE = 4;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function getDistance(points: PointerPoint[]): number {
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

export function ImageLightbox({ image, onClose }: ImageLightboxProps) {
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const gestureRef = useRef({ distance: 0, scale: 1, x: 0, y: 0, point: null as PointerPoint | null });

  useEffect(() => {
    if (!image) return;
    pointersRef.current.clear();
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [image, onClose]);

  if (!image || typeof document === "undefined") return null;

  const setScale = (nextScale: number) => {
    const scale = clampScale(nextScale);
    setTransform((current) => scale === 1 ? { scale: 1, x: 0, y: 0 } : { ...current, scale });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    const points = Array.from(pointersRef.current.values());
    gestureRef.current = {
      distance: getDistance(points),
      scale: transform.scale,
      x: transform.x,
      y: transform.y,
      point,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(pointersRef.current.values());
    if (points.length >= 2 && gestureRef.current.distance > 0) {
      const scale = clampScale(gestureRef.current.scale * (getDistance(points) / gestureRef.current.distance));
      setTransform((current) => scale === 1 ? { scale: 1, x: 0, y: 0 } : { ...current, scale });
      return;
    }

    if (points.length === 1 && transform.scale > 1 && gestureRef.current.point) {
      setTransform({
        scale: transform.scale,
        x: gestureRef.current.x + event.clientX - gestureRef.current.point.x,
        y: gestureRef.current.y + event.clientY - gestureRef.current.point.y,
      });
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    const points = Array.from(pointersRef.current.values());
    const point = points[0] ?? null;
    gestureRef.current = {
      distance: getDistance(points),
      scale: transform.scale,
      x: transform.x,
      y: transform.y,
      point,
    };
  };

  return createPortal(
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={image.alt ? `查看图片：${image.alt}` : "查看文章图片"}>
      <button type="button" className="image-lightbox__backdrop" aria-label="点击背景关闭图片" onClick={onClose} />
      <div className="image-lightbox__toolbar" data-print-hide>
        <button type="button" className="image-lightbox__button" aria-label="缩小图片" onClick={() => setScale(transform.scale - 0.5)} disabled={transform.scale <= MIN_SCALE}>
          <Minus className="h-5 w-5" />
        </button>
        <span className="image-lightbox__scale" aria-live="polite">{Math.round(transform.scale * 100)}%</span>
        <button type="button" className="image-lightbox__button" aria-label="放大图片" onClick={() => setScale(transform.scale + 0.5)} disabled={transform.scale >= MAX_SCALE}>
          <Plus className="h-5 w-5" />
        </button>
        <button type="button" className="image-lightbox__button" aria-label="重置图片" onClick={() => setTransform({ scale: 1, x: 0, y: 0 })}>
          <RotateCcw className="h-4 w-4" />
        </button>
        <button ref={closeButtonRef} type="button" className="image-lightbox__button" aria-label="关闭图片" onClick={onClose}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <div
        className="image-lightbox__stage"
        onDoubleClick={() => setTransform((current) => current.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 })}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={(event) => {
          event.preventDefault();
          setScale(transform.scale + (event.deltaY < 0 ? 0.25 : -0.25));
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- article images can be arbitrary remote URLs and need natural dimensions. */}
        <img
          src={image.src}
          alt={image.alt}
          draggable={false}
          className="image-lightbox__image"
          style={{ transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})` }}
        />
      </div>
      {image.alt && <p className="image-lightbox__caption">{image.alt}</p>}
    </div>,
    document.body,
  );
}
