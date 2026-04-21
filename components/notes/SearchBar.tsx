"use client";

import { Search } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant/40" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜索笔记标题或内容..."
        className="w-full pl-12 pr-6 py-4 bg-surface-container-low rounded-xl input-soft text-on-surface placeholder:text-on-surface-variant/40 focus:bg-surface-container-lowest transition-all duration-300"
      />
    </div>
  );
}
