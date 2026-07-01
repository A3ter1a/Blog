import type { Transition, Variants } from "framer-motion";

const standardEase = [0.2, 0, 0, 1] as [number, number, number, number];
const emphasizedEase = [0.16, 1, 0.3, 1] as [number, number, number, number];

export const uiMotion = {
  duration: {
    micro: 0.14,
    fast: 0.18,
    standard: 0.24,
    page: 0.32,
    reveal: 0.42,
  },
  ease: {
    standard: standardEase,
    emphasized: emphasizedEase,
  },
  spring: {
    gentle: {
      type: "spring",
      stiffness: 360,
      damping: 34,
      mass: 0.8,
    } satisfies Transition,
    panel: {
      type: "spring",
      stiffness: 310,
      damping: 32,
      mass: 0.9,
    } satisfies Transition,
  },
};

export const pageMotion: Variants = {
  initial: { opacity: 0, y: 10, filter: "blur(2px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(1px)" },
};

export const surfaceMotion: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
};

export const subtleSurfaceMotion: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
};

export const overlayMotion: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const dialogMotion: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 10 },
};

export const dropdownMotion: Variants = {
  initial: { opacity: 0, y: -6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.98 },
};

export const collapsibleMotion: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
};

export function getListItemTransition(index: number, maxDelay = 0.18): Transition {
  return {
    duration: uiMotion.duration.standard,
    ease: uiMotion.ease.standard,
    delay: Math.min(index * 0.03, maxDelay),
  };
}
