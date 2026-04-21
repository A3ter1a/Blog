"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Settings, Sun, Moon } from "lucide-react";
import { SearchOverlay } from "./SearchOverlay";
import { SettingsPanel } from "./SettingsPanel";
import { syncTheme, toggleTheme } from "@/lib/theme";

const navItems = [
  { name: "首页", href: "/" },
  { name: "笔记", href: "/notes" },
  { name: "创建", href: "/create" },
  { name: "关于", href: "/about" },
];

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Sync theme state from localStorage
  useEffect(() => {
    const dark = syncTheme();
    setIsDark(dark);
    // Listen for theme changes from other components
    const handler = () => {
      const dark = syncTheme();
      setIsDark(dark);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const handleToggleTheme = () => {
    const newTheme = toggleTheme();
    setIsDark(newTheme === "dark");
  };

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? "bg-surface/70 dark:bg-inverse-surface/70 backdrop-blur-xl shadow-ambient"
          : "bg-transparent"
      }`}
    >
      <div className="flex justify-between items-center h-20 px-6 md:px-12 max-w-7xl mx-auto">
        {/* Logo */}
        <Link
          href="/"
          className="text-2xl font-bold font-headline text-primary-container dark:text-blue-400 hover:text-primary dark:hover:text-blue-300 transition-colors duration-300"
        >
          Asteroid
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex gap-12 items-center">
          {navItems.map((item) => {
            // Check if current path matches the nav item
            // For /notes, also match /notes/[id] etc.
            const isActive = item.href === "/" 
              ? pathname === "/" 
              : pathname === item.href || pathname.startsWith(item.href + "/");
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`font-headline font-medium text-lg tracking-wide transition-all duration-300 relative ${
                  isActive
                    ? "text-primary-container dark:text-blue-400"
                    : "text-on-surface/60 dark:text-inverse-on-surface/60 hover:text-primary-container dark:hover:text-blue-400"
                }`}
              >
                {item.name}
                {isActive && (
                  <span className="absolute -bottom-1 left-0 w-full h-0.5 bg-primary-container dark:bg-blue-400" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Utility Icons */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <button
            onClick={() => setShowSearch(true)}
            className="p-2 rounded-full hover:bg-surface-container-high dark:hover:bg-inverse-surface transition-all duration-300 text-primary-container dark:text-blue-400"
            aria-label="搜索"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={handleToggleTheme}
            className="p-2 rounded-full hover:bg-surface-container-high dark:hover:bg-inverse-surface transition-all duration-300 text-primary-container dark:text-blue-400"
            aria-label={isDark ? "切换到亮色主题" : "切换到暗色主题"}
          >
            {isDark ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-full hover:bg-surface-container-high dark:hover:bg-inverse-surface transition-all duration-300 text-primary-container dark:text-blue-400"
            aria-label="设置"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Overlays */}
      <SearchOverlay isOpen={showSearch} onClose={() => setShowSearch(false)} />
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </nav>
  );
}
