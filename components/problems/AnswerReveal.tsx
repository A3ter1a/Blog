"use client";

import type { ReactNode } from "react";
import { AnimatedDisclosure } from "@/components/ui/AnimatedDisclosure";

export function AnswerReveal({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return <AnimatedDisclosure open={open}>{children}</AnimatedDisclosure>;
}
