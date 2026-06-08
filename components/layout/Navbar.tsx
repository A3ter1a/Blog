"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BookOpen, Home, Menu, PenLine, Search, Settings, UserRound, Wrench, X } from "lucide-react";
import { SearchOverlay } from "./SearchOverlay";
import { SettingsPanel } from "./SettingsPanel";
import { useAdminAuth } from "@/hooks/useAdminAuth";

const navItems = [
  { name: "首页", href: "/", icon: Home },
  { name: "笔记", href: "/notes", icon: BookOpen },
  { name: "创建", href: "/create", icon: PenLine, adminOnly: true },
  { name: "工具", href: "/tools", icon: Wrench },
  { name: "关于", href: "/about", icon: UserRound },
];

export function Navbar() {
  const pathname = usePathname();
  const { isAdmin } = useAdminAuth();
  const [scrolled, setScrolled] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const visibleNavItems = navItems.filter((item) => isAdmin || !item.adminOnly);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowMobileMenu(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!showMobileMenu) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowMobileMenu(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showMobileMenu]);

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? "bg-surface/70 backdrop-blur-xl shadow-ambient"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto grid h-20 max-w-7xl grid-cols-[minmax(8rem,1fr)_auto_minmax(8rem,1fr)] items-center gap-3 px-4 sm:px-6 md:px-8 lg:grid-cols-[minmax(11rem,1fr)_auto_minmax(11rem,1fr)] lg:px-10">
        {/* Logo */}
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 justify-self-start transition-opacity duration-300 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <Image
            src="/logo.png"
            alt="Asteroid Logo"
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 object-contain"
            priority
          />
          <span className="hidden truncate whitespace-nowrap font-headline text-2xl font-bold text-primary-container sm:block">
            Asteroid
          </span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden min-w-0 items-center justify-center gap-6 justify-self-center md:flex lg:gap-10">
          {visibleNavItems.map((item) => {
            const isActive = item.href === "/" 
              ? pathname === "/" 
              : pathname === item.href || pathname.startsWith(item.href + "/");
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative whitespace-nowrap px-1 py-2 font-headline text-base font-medium transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 lg:text-lg ${
                  isActive
                    ? "text-primary-container"
                    : "text-on-surface/60 hover:text-primary-container"
                }`}
              >
                {item.name}
                {isActive && (
                  <span className="absolute -bottom-1 left-0 w-full h-0.5 bg-primary-container" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Utility Icons */}
        <div className="flex items-center justify-end gap-1.5 justify-self-end sm:gap-2">
          {/* Search */}
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className="rounded-full p-2 text-primary-container transition-all duration-300 hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="搜索"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="rounded-full p-2 text-primary-container transition-all duration-300 hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="设置"
          >
            <Settings className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowMobileMenu(true)}
            className="rounded-full p-2 text-primary-container transition-all duration-300 hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 md:hidden"
            aria-label="打开导航"
            aria-expanded={showMobileMenu}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {showMobileMenu && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            aria-label="关闭导航"
            onClick={() => setShowMobileMenu(false)}
          />
          <div
            className="absolute right-3 top-3 w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3 shadow-elevated"
            role="dialog"
            aria-modal="true"
            aria-label="移动端导航"
          >
            <div className="mb-2 flex items-center justify-between gap-3 px-2 py-1">
              <div className="flex items-center gap-2">
                <Image
                  src="/logo.png"
                  alt="Asteroid Logo"
                  width={32}
                  height={32}
                  className="h-8 w-8 object-contain"
                />
                <span className="font-headline text-lg font-bold text-primary-container">Asteroid</span>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileMenu(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
                aria-label="关闭导航"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(item.href + "/");

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Overlays */}
      <SearchOverlay isOpen={showSearch} onClose={() => setShowSearch(false)} />
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </nav>
  );
}
