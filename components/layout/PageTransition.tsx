"use client";

export function PageTransition({ children }: { children: React.ReactNode }) {
  return <div id="main-content" className="flex-1" tabIndex={-1}>{children}</div>;
}
