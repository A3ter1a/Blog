"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

interface AITriggerProps {
  onClick: () => void;
  isActive: boolean;
}

export function AITrigger({ onClick, isActive }: AITriggerProps) {
  // Hidden when active (panel shows close button)
  if (isActive) return null;
  
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="w-12 h-12 editorial-gradient rounded-xl flex items-center justify-center shadow-elevated shadow-primary/20"
    >
      <Sparkles className="w-6 h-6 text-on-primary" />
    </motion.button>
  );
}
