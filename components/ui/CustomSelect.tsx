"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useClickOutside } from "@/lib/hooks";

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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const selectedOption = options.find((opt) => opt.value === value);

  const closeDropdown = () => setIsOpen(false);
  useClickOutside(closeDropdown, isOpen);

  // 计算下拉菜单位置
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const dropdownWidth = Math.min(rect.width, 200);
      const left = Math.min(rect.left, viewportWidth - dropdownWidth - 8);
      
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: left,
        width: dropdownWidth,
        zIndex: 100,
      });
    }
  }, [isOpen]);

  // 滚动时关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => closeDropdown();
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 bg-surface-container-highest rounded-lg text-on-surface text-sm text-left flex items-center justify-between hover:bg-surface-container-highest/80 transition-colors duration-200 ${className}`}
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
            style={dropdownStyle}
            className="bg-surface-container-low rounded-lg shadow-elevated border border-outline-variant/10 overflow-hidden"
          >
            <div className="py-1 max-h-48 overflow-y-auto">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    closeDropdown();
                  }}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors duration-150 ${
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
    </>
  );
}
