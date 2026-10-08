"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, Download, Type, ListTree, Eye, AlignLeft, XCircle, RotateCcw, Columns3, MonitorCog, Sun, Moon, UserRound, LogOut, Loader2, SlidersHorizontal } from "lucide-react";
import type { Profile } from "@/lib/types";
import { DEFAULT_PROFILE } from "@/lib/profile";
import { getSupabase, profileApi } from "@/lib/supabase";
import { useReadingPreferences, TOCPosition, ContentWidth, MotionPreference } from "@/lib/useReadingPreferences";
import { ParsedNote, detectFormat, importFromJSON, importFromMarkdown, importFromObsidian } from "@/lib/import";
import { ImportPreview } from "@/components/export/ImportPreview";
import { ProfileEditor } from "@/components/settings/ProfileEditor";
import { AISettings } from "@/components/settings/AISettings";
import { recheckAdminAuth, useAdminAuth, useLocalReviewMode } from "@/hooks/useAdminAuth";
import { useToast } from "@/components/ui/Toast";
import { collapsibleMotion, overlayMotion, uiMotion } from "@/lib/motion";
import { setThemePreference, useThemePreference } from "@/components/layout/ThemeController";
import type { ThemePreference } from "@/lib/theme-contract";
import { useAiAccountSlot } from "@/hooks/useAiAccountSlot";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
  AI_ACCOUNT_SLOT_CONFIG,
  clearActiveAiAccountSlot,
  getAiAccountSlotPath,
  isExpectedAiAccountEmail,
} from "@/lib/auth-session-slot";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: "all" | "reading";
}

const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

export function SettingsPanel({ isOpen, onClose, mode = "all" }: SettingsPanelProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { preferences, updatePreference, resetPreferences, importPreferences } = useReadingPreferences();
  const themePreference = useThemePreference();
  const { loading: authLoading, user, isAdmin, retryable: authRetryable } = useAdminAuth();
  const isReviewMode = useLocalReviewMode();
  const accountSlot = useAiAccountSlot();
  const toast = useToast();
  const [portalRoot] = useState<HTMLElement | null>(() => (
    typeof document === "undefined" ? null : document.body
  ));

  // Profile state
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);

  // Import state
  const [importError, setImportError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const readingPreferencesInputRef = useRef<HTMLInputElement>(null);

  useDialogFocus({
    isOpen,
    onClose,
    containerRef: panelRef,
    initialFocusRef: closeButtonRef,
  });

  useEffect(() => {
    if (!isOpen || !isAdmin || mode === "reading") return;
    let mounted = true;

    void (async () => {
      const remoteProfile = await profileApi.get();
      if (!mounted) return;
      setProfile(remoteProfile);
    })();

    return () => {
      mounted = false;
    };
  }, [isOpen, isAdmin, mode]);

  const handleSaveProfile = async (newProfile: Profile) => {
    try {
      const savedProfile = await profileApi.update(newProfile);
      setProfile(savedProfile);
      toast.success("个人资料已同步到线上");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`保存个人资料失败：${message}`);
      throw error;
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      const { error } = await getSupabase().auth.signOut({ scope: "local" });
      if (error) throw error;

      clearActiveAiAccountSlot();
      onClose();
      // A full reload clears note/admin client state and re-evaluates the session boundary.
      window.location.href = "/";
    } catch (error: unknown) {
      setIsSigningOut(false);
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`退出登录失败：${message}`);
    }
  };

  // Import notes from file (JSON or Markdown)
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [parsedNotes, setParsedNotes] = useState<ParsedNote[]>([]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setImportError('导入文件不能超过 10 MB，请拆分后再导入。');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;

        const format = detectFormat(content);
        let notes: ParsedNote[];

        switch (format) {
          case 'json':
            notes = importFromJSON(content);
            break;
          case 'obsidian':
            notes = [importFromObsidian(content)];
            break;
          case 'markdown':
          default:
            notes = [importFromMarkdown(content)];
            break;
        }

        setParsedNotes(notes);
        setShowImportPreview(true);
        setImportError(null);
      } catch (err: unknown) {
        setImportError('解析文件失败: ' + (err instanceof Error ? err.message : '未知错误'));
      }
    };
    reader.readAsText(file);

    // Reset input
    e.target.value = '';
  };

  const handleResetReadingPreferences = () => {
    resetPreferences();
    toast.success("阅读设置已恢复默认值");
  };

  const handleExportReadingPreferences = () => {
    const blob = new Blob([JSON.stringify(preferences, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "asteroid-reading-preferences.json";
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("阅读设置已导出到本机");
  };

  const handleImportReadingPreferences = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 128 * 1024) {
      toast.error("设置文件过大，请选择有效的阅读设置 JSON");
      return;
    }

    try {
      const imported = JSON.parse(await file.text());
      importPreferences(imported);
      toast.success("阅读设置已导入并立即生效");
    } catch {
      toast.error("设置文件无法解析，请选择导出的 JSON 文件");
    }
  };

  const panel = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            variants={overlayMotion}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: uiMotion.duration.fast, ease: uiMotion.ease.standard }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Settings Panel */}
          <motion.div
            initial={reducedMotion ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: reducedMotion ? 0 : "100%" }}
            transition={reducedMotion ? { duration: 0 } : uiMotion.spring.panel}
            className="fixed inset-y-0 right-0 z-[110] flex h-dvh w-full max-w-md flex-col bg-surface-container-lowest shadow-elevated"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-panel-title"
            tabIndex={-1}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10 flex-shrink-0">
              <h2 id="settings-panel-title" className="text-xl font-bold text-on-surface font-headline">{mode === "reading" ? "阅读设置" : "设置"}</h2>
              <button
                onClick={onClose}
                ref={closeButtonRef}
                className="motion-ui motion-interactive flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-container-high"
                aria-label="关闭设置"
              >
                <X className="w-5 h-5 text-on-surface-variant" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 pb-8 sm:p-6 sm:pb-10">
              {mode === "all" && <section id="settings-account-section" aria-labelledby="settings-account-title" className="mb-9 scroll-mt-4">
                <h3 id="settings-account-title" className="mb-5 flex items-center gap-2 text-sm font-medium text-on-surface-variant">
                  <UserRound className="h-4 w-4" />
                  账号
                </h3>

                {isReviewMode ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-on-surface-variant">
                    <p className="font-medium text-on-surface">本地审查模式</p>
                    <p className="mt-1 leading-6">页面交互和本机草稿可以直接审查；保存、上传等服务器操作会在正式 Supabase 会话中启用。</p>
                  </div>
                ) : authLoading ? (
                  <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant" aria-live="polite">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    正在检查登录状态...
                  </div>
                ) : user ? (
                  <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-on-surface-variant">当前账号</p>
                        <p className="mt-1 truncate text-sm font-medium text-on-surface" title={user.email ?? undefined}>
                          {user.email ?? "已登录账号"}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-on-surface-variant/75">
                          {accountSlot
                            ? (isExpectedAiAccountEmail(accountSlot, user.email)
                              ? `${AI_ACCOUNT_SLOT_CONFIG[accountSlot].label}专属会话，只能编辑自己的内容并提交审核。`
                              : "当前账号与本窗口的学科会话槽不一致，请退出后从正确入口登录。")
                            : (isAdmin ? "管理员账号，可维护博客内容与设置。" : authRetryable ? "已登录，管理员权限服务暂时不可用，可稍后重新检查。" : "当前默认会话不是管理员账号。")}
                        </p>
                        {authRetryable && !accountSlot && (
                          <button
                            type="button"
                            onClick={recheckAdminAuth}
                            className="control-button motion-ui motion-interactive mt-3 min-h-10 px-3 text-xs"
                          >
                            重新检查管理员权限
                          </button>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={isSigningOut}
                      className="control-button control-button-danger motion-ui motion-interactive mt-4 flex min-h-11 w-full items-center justify-center gap-2 px-4 text-sm"
                    >
                      {isSigningOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                      {isSigningOut ? "正在退出..." : "退出登录"}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl bg-surface-container-low p-4">
                    <p className="text-sm text-on-surface">当前未登录</p>
                    <p className="mt-1 text-xs leading-5 text-on-surface-variant/75">
                      {accountSlot
                        ? `${AI_ACCOUNT_SLOT_CONFIG[accountSlot].label}账号将从当前专属入口登录。`
                        : "默认入口只用于管理员账号。"}
                    </p>
                    <Link
                      href={getAiAccountSlotPath("/login", accountSlot)}
                      onClick={onClose}
                      className="control-button control-button-primary mt-4 inline-flex min-h-11 items-center justify-center px-4 text-sm"
                    >
                      前往账号登录
                    </Link>
                  </div>
                )}
              </section>}

              {/* Reading Preferences */}
              <section id="settings-reading-section" className="mt-2 scroll-mt-4">
                <h3 className="mb-5 flex items-center gap-2 text-sm font-medium text-on-surface-variant">
                  <Eye className="w-4 h-4" />
                  阅读体验
                </h3>

                <div className="space-y-5">
                  {/* Font Size */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Type className="w-4 h-4 text-on-surface-variant" />
                        <span className="text-sm font-medium text-on-surface">字体大小</span>
                      </div>
                      <span className="text-sm text-primary font-medium">{preferences.fontSize}px</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => updatePreference("fontSize", Math.max(14, preferences.fontSize - 1))}
                        className="motion-ui motion-interactive flex h-11 w-11 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-primary/10 hover:text-primary"
                        aria-label="减小字体"
                      >
                        A-
                      </button>
                      <input
                        type="range"
                        min="14"
                        max="22"
                        step="1"
                        value={preferences.fontSize}
                        onChange={(e) => updatePreference("fontSize", parseInt(e.target.value))}
                        className="flex-1 accent-primary"
                        aria-label="字体大小"
                      />
                      <button
                        onClick={() => updatePreference("fontSize", Math.min(22, preferences.fontSize + 1))}
                        className="motion-ui motion-interactive flex h-11 w-11 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-primary/10 hover:text-primary"
                        aria-label="增大字体"
                      >
                        A+
                      </button>
                    </div>
                  </div>

                  {/* Line Height */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlignLeft className="h-4 w-4 text-on-surface-variant" />
                        <span className="text-sm font-medium text-on-surface">正文行距</span>
                      </div>
                      <span className="text-sm font-medium text-primary">{preferences.lineHeight.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="1.5"
                      max="2"
                      step="0.05"
                      value={preferences.lineHeight}
                      onChange={(e) => updatePreference("lineHeight", parseFloat(e.target.value))}
                      className="w-full accent-primary"
                      aria-label="正文行距"
                    />
                  </div>

                  {/* Content Width */}
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <Columns3 className="h-4 w-4 text-on-surface-variant" />
                      <span className="text-sm font-medium text-on-surface">正文宽度</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: "narrow", label: "紧凑" },
                        { value: "comfortable", label: "舒适" },
                        { value: "wide", label: "宽松" },
                      ] as { value: ContentWidth; label: string }[]).map((option) => (
                        <button
                          key={option.value}
                          onClick={() => updatePreference("contentWidth", option.value)}
                          aria-pressed={preferences.contentWidth === option.value}
                          className={`motion-ui motion-interactive min-h-11 rounded-lg px-3 py-2 text-sm font-medium ${
                            preferences.contentWidth === option.value
                              ? "bg-primary text-on-primary"
                              : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* TOC Position */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ListTree className="w-4 h-4 text-on-surface-variant" />
                      <span className="text-sm font-medium text-on-surface">目录位置</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: "left", label: "左侧" },
                        { value: "right", label: "右侧" },
                        { value: "hidden", label: "隐藏" },
                      ] as { value: TOCPosition; label: string }[]).map((option) => (
                        <button
                          key={option.value}
                          onClick={() => updatePreference("tocPosition", option.value)}
                          aria-pressed={preferences.tocPosition === option.value}
                          className={`motion-ui motion-interactive min-h-11 rounded-lg px-3 py-2 text-sm font-medium ${
                            preferences.tocPosition === option.value
                              ? "bg-primary text-on-primary"
                              : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Progress Bar Toggle */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlignLeft className="w-4 h-4 text-on-surface-variant" />
                      <span className="text-sm font-medium text-on-surface">阅读进度条</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="阅读进度条"
                      aria-checked={preferences.showProgressBar}
                      onClick={() => updatePreference("showProgressBar", !preferences.showProgressBar)}
                      className={`motion-ui motion-interactive w-full flex items-center justify-between px-4 py-3 rounded-xl ${
                        preferences.showProgressBar
                          ? "bg-primary/10 text-primary"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      <span className="text-sm font-medium">
                        {preferences.showProgressBar ? "已开启" : "已关闭"}
                      </span>
                      <div
                        aria-hidden="true"
                        data-switch-checked={preferences.showProgressBar}
                        data-switch-size="compact"
                        className={`motion-ui w-10 h-6 rounded-full flex items-center ${
                          preferences.showProgressBar ? "bg-primary" : "bg-surface-container-highest"
                        }`}
                      >
                        <div
                          className="motion-switch-thumb ml-1 h-4 w-4 rounded-full bg-on-primary"
                        />
                      </div>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetReadingPreferences}
                    className="motion-ui motion-interactive flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm font-medium text-on-surface-variant hover:border-primary/20 hover:bg-primary/5 hover:text-primary"
                  >
                    <RotateCcw className="h-4 w-4" />
                    恢复阅读默认值
                  </button>

                  <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-4">
                    <div className="flex items-start gap-3">
                      <SlidersHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-on-surface">迁移阅读设置</p>
                        <p className="mt-1 text-xs leading-5 text-on-surface-variant/75">在不同设备之间带走字号、行距、正文宽度和目录位置。文件只在你选择后读入本机。</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button type="button" onClick={handleExportReadingPreferences} className="motion-ui motion-interactive inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-surface-container-high px-3 text-sm font-medium text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface">
                            <Download className="h-4 w-4" />导出设置
                          </button>
                          <button type="button" onClick={() => readingPreferencesInputRef.current?.click()} className="motion-ui motion-interactive inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-on-primary hover:bg-primary/90">
                            <Upload className="h-4 w-4" />导入设置
                          </button>
                        </div>
                        <input ref={readingPreferencesInputRef} type="file" accept="application/json,.json" onChange={handleImportReadingPreferences} className="hidden" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-4">
                    <div className="flex items-start gap-3">
                      <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <span className="text-sm font-medium text-on-surface">角色扮演相关显示</span>
                            <p className="mt-1 text-xs leading-5 text-on-surface-variant/75">控制文章中的角色头像、角色名和资料入口。</p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={preferences.showRoleplay}
                            aria-label="切换角色扮演相关显示"
                            onClick={() => updatePreference("showRoleplay", !preferences.showRoleplay)}
                            className="motion-ui motion-interactive relative flex h-11 w-12 shrink-0 items-center justify-center rounded-full"
                          >
                            <span aria-hidden="true" data-switch-checked={preferences.showRoleplay} className={`motion-ui flex h-6 w-11 items-center rounded-full ${preferences.showRoleplay ? "bg-primary" : "bg-surface-container-highest"}`}>
                              <span className="motion-switch-thumb ml-1 h-4 w-4 rounded-full bg-on-primary" />
                            </span>
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-on-surface-variant/70">{preferences.showRoleplay ? "已开启" : "已关闭，文章按普通内容显示"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {mode === "all" && <section id="settings-display-section" className="mt-10 scroll-mt-4">
                <h3 className="mb-5 flex items-center gap-2 text-sm font-medium text-on-surface-variant">
                  <MonitorCog className="h-4 w-4" />
                  显示主题
                </h3>
                <div className="grid grid-cols-3 border-y border-outline-variant/20">
                  {([
                    { value: "follow", label: "跟随日光", icon: <MonitorCog className="h-4 w-4" /> },
                    { value: "light", label: "恒亮", icon: <Sun className="h-4 w-4" /> },
                    { value: "dark", label: "恒暗", icon: <Moon className="h-4 w-4" /> },
                  ] as { value: ThemePreference; label: string; icon: React.ReactNode }[]).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setThemePreference(option.value)}
                      aria-pressed={themePreference === option.value}
                      className={`motion-ui motion-interactive flex min-h-16 flex-col items-center justify-center gap-1 border-r border-outline-variant/20 px-2 text-xs last:border-r-0 ${
                        themePreference === option.value ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low"
                      }`}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-on-surface-variant/70">
                  跟随日光会按北京当天的日出与日落时间自动切换，不读取定位权限。
                </p>

                <div className="mt-10 border-t border-outline-variant/15 pt-7">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium text-on-surface">界面动效</h4>
                    <span className="text-xs text-on-surface-variant/70">
                      {preferences.motionPreference === "system" ? "跟随系统" : preferences.motionPreference === "reduced" ? "减少动效" : "完整动效"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-label="界面动效">
                    {([
                      { value: "system", label: "跟随系统" },
                      { value: "reduced", label: "减少动效" },
                      { value: "full", label: "完整动效" },
                    ] as { value: MotionPreference; label: string }[]).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updatePreference("motionPreference", option.value)}
                        aria-pressed={preferences.motionPreference === option.value}
                        className={`motion-ui motion-interactive min-h-11 rounded-lg px-2 py-2 text-xs font-medium ${
                          preferences.motionPreference === option.value
                            ? "bg-primary text-on-primary"
                            : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>}

              {mode === "all" && isAdmin && (
                <div id="settings-manage-section" className="mt-10 scroll-mt-4 space-y-10">
                  {/* Profile */}
                  <section>
                    <ProfileEditor profile={profile} onSave={handleSaveProfile} />
                  </section>

                  {/* AI Settings */}
                  <section>
                    <AISettings />
                  </section>

                  {/* Import */}
                  <section>
                <h3 className="text-sm font-medium text-on-surface-variant mb-4 flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  导入笔记
                </h3>

                <div className="space-y-3">
                  {/* Import */}
                  <label className="motion-ui motion-interactive w-full flex items-center justify-between px-4 py-3 rounded-xl bg-surface-container-low text-on-surface hover:bg-surface-container-high cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Upload className="w-5 h-5 text-primary" />
                      <div className="text-left">
                        <div className="text-sm font-medium">导入笔记</div>
                        <div className="text-xs text-on-surface-variant/60">JSON / Markdown 格式</div>
                      </div>
                    </div>
                    <input
                      type="file"
                      accept=".json,.md"
                      onChange={handleImport}
                      className="hidden"
                    />
                  </label>

                  {/* Error Messages */}
                  <AnimatePresence>
                    {importError && (
                      <motion.div
                        variants={collapsibleMotion}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: uiMotion.duration.reveal, ease: uiMotion.ease.emphasized }}
                        className="flex items-center gap-2 text-sm text-red-600 px-4 py-2 rounded-xl bg-red-50"
                      >
                        <XCircle className="w-4 h-4" />
                        {importError}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                  </section>
                </div>
              )}
            </div>
          </motion.div>

          {/* Import Preview Panel */}
          <ImportPreview
            isOpen={showImportPreview}
            onClose={() => setShowImportPreview(false)}
            parsedNotes={parsedNotes}
            onImported={() => {
              setParsedNotes([]);
              setShowImportPreview(false);
              onClose();
            }}
          />
        </>
      )}
    </AnimatePresence>
  );

  return portalRoot ? createPortal(panel, portalRoot) : null;
}
