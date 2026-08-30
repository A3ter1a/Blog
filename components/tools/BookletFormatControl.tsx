"use client";

import { RectangleHorizontal, RectangleVertical } from "lucide-react";
import type { BookletOrientation } from "@/hooks/useBookletPrint";

export type BookletPaperStyle = "grid" | "lined" | "blank";

const orientationOptions: Array<{
  value: BookletOrientation;
  label: string;
  description: string;
  icon: typeof RectangleHorizontal;
}> = [
  { value: "landscape", label: "横版", description: "iPad 横屏 4:3", icon: RectangleHorizontal },
  { value: "portrait", label: "竖版", description: "iPad 竖屏 3:4", icon: RectangleVertical },
];

const paperStyleOptions: Array<{ value: BookletPaperStyle; label: string }> = [
  { value: "grid", label: "方格" },
  { value: "lined", label: "横线" },
  { value: "blank", label: "空白" },
];

export function BookletFormatControl({
  orientation,
  paperStyle,
  onOrientationChange,
  onPaperStyleChange,
  showPaperStyle = true,
  className = "",
}: {
  orientation: BookletOrientation;
  paperStyle?: BookletPaperStyle;
  onOrientationChange: (orientation: BookletOrientation) => void;
  onPaperStyleChange?: (paperStyle: BookletPaperStyle) => void;
  showPaperStyle?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid gap-3 ${showPaperStyle ? "sm:grid-cols-[minmax(17rem,1fr)_minmax(12rem,0.7fr)]" : "sm:grid-cols-1"} ${className}`}>
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-xs font-semibold text-on-surface-variant">页面方向</legend>
        <div className="grid grid-cols-2 gap-2">
          {orientationOptions.map((option) => {
            const Icon = option.icon;
            const active = orientation === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onOrientationChange(option.value)}
                className={`flex min-h-12 items-center gap-2 rounded-lg border px-3 text-left transition-colors ${
                  active
                    ? "border-primary/35 bg-primary/[0.08] text-primary ring-1 ring-primary/10"
                    : "border-outline-variant/25 bg-surface-container-low text-on-surface-variant hover:border-primary/25"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="block truncate text-[11px] opacity-75">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {showPaperStyle && paperStyle && onPaperStyleChange && <fieldset className="min-w-0">
        <legend className="mb-1.5 text-xs font-semibold text-on-surface-variant">答题纸</legend>
        <div className="grid grid-cols-3 gap-2">
          {paperStyleOptions.map((option) => {
            const active = paperStyle === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onPaperStyleChange(option.value)}
                className={`min-h-12 rounded-lg border px-2 text-xs font-semibold transition-colors ${
                  active
                    ? "border-primary/35 bg-primary/[0.08] text-primary ring-1 ring-primary/10"
                    : "border-outline-variant/25 bg-surface-container-low text-on-surface-variant hover:border-primary/25"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>}
    </div>
  );
}
