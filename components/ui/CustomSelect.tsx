"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useClickOutside } from "@/hooks/useClickOutside";

interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function CustomSelect({ options, value, onChange, placeholder = "请选择", className = "" }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useClickOutside<HTMLDivElement>(() => setIsOpen(false), isOpen);
  const selectedOption = options.find((opt) => opt.value === value);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
        setFocusedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          onChange(options[focusedIndex].value);
        }
        setIsOpen(false);
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
        break;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="w-full px-3 py-2 bg-surface-container-highest rounded-lg text-on-surface text-sm text-left flex items-center justify-between hover:bg-surface-container-highest/80 transition-colors duration-200"
      >
        <span className={selectedOption ? "text-on-surface" : "text-on-surface-variant/40"}>
          {selectedOption?.label || placeholder}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-on-surface-variant" />
        </motion.div>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            className="absolute top-full left-0 right-0 mt-1 bg-surface-container-low rounded-lg shadow-elevated border border-outline-variant/10 overflow-hidden z-50"
          >
            <div className="py-1 max-h-48 overflow-y-auto">
              {options.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={value === option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors duration-150 ${
                    index === focusedIndex
                      ? "bg-surface-container-high"
                      : ""
                  } ${
                    value === option.value
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-on-surface hover:bg-surface-container-high"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
