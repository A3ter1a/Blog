"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, Type, ListTree, Eye, AlignLeft, XCircle, RotateCcw, Columns3, MonitorCog, Sun, Moon } from "lucide-react";
import type { Profile } from "@/lib/types";
import { DEFAULT_PROFILE } from "@/lib/profile";
import { profileApi } from "@/lib/supabase";
import { useReadingPreferences, TOCPosition, ContentWidth } from "@/lib/useReadingPreferences";
import { ParsedNote, detectFormat, importFromJSON, importFromMarkdown, importFromObsidian } from "@/lib/import";
import { ImportPreview } from "@/components/export/ImportPreview";
import { ProfileEditor } from "@/components/settings/ProfileEditor";
import { AISettings } from "@/components/settings/AISettings";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useToast } from "@/components/ui/Toast";
import { collapsibleMotion, overlayMotion, uiMotion } from "@/lib/motion";
import { setThemePreference, useThemePreference } from "@/components/layout/ThemeController";
import type { ThemePreference } from "@/lib/theme-contract";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { preferences, updatePreference, resetPreferences } = useReadingPreferences();
  const themePreference = useThemePreference();
  const { isAdmin } = useAdminAuth();
  const toast = useToast();
  const [portalRoot] = useState<HTMLElement | null>(() => (
    typeof document === "undefined" ? null : document.body
  ));

  // Profile state
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);

  // Import state
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;

    void (async () => {
      const remoteProfile = await profileApi.get();
      if (!mounted) return;
      setProfile(remoteProfile);
    })();

    return () => {
      mounted = false;
    };
  }, [isOpen]);

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
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={uiMotion.spring.panel}
            className="fixed inset-y-0 right-0 z-[110] flex h-dvh w-full max-w-md flex-col bg-surface-container-lowest shadow-elevated"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10 flex-shrink-0">
              <h2 className="text-xl font-bold text-on-surface font-headline">设置</h2>
              <button
                onClick={onClose}
                className="motion-ui motion-interactive p-2 rounded-full hover:bg-surface-container-high"
                aria-label="关闭设置"
              >
                <X className="w-5 h-5 text-on-surface-variant" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Reading Preferences */}
              <section>
                <h3 className="text-sm font-medium text-on-surface-variant mb-4 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  阅读体验
                </h3>

                <div className="space-y-4">
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
                        className="motion-ui motion-interactive w-8 h-8 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-primary/10 hover:text-primary flex items-center justify-center"
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
                      />
                      <button
                        onClick={() => updatePreference("fontSize", Math.min(22, preferences.fontSize + 1))}
                        className="motion-ui motion-interactive w-8 h-8 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-primary/10 hover:text-primary flex items-center justify-center"
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
                          className={`motion-ui motion-interactive rounded-lg px-3 py-2 text-sm font-medium ${
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
                          className={`motion-ui motion-interactive px-3 py-2 rounded-lg text-sm font-medium ${
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
                        className={`motion-ui w-10 h-6 rounded-full flex items-center ${
                          preferences.showProgressBar ? "bg-primary" : "bg-surface-container-highest"
                        }`}
                      >
                        <div
                          className={`motion-ui w-4 h-4 rounded-full bg-on-primary mx-1 ${
                            preferences.showProgressBar ? "ml-5" : "ml-1"
                          }`}
                        />
                      </div>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={resetPreferences}
                    className="motion-ui motion-interactive flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm font-medium text-on-surface-variant hover:border-primary/20 hover:bg-primary/5 hover:text-primary"
                  >
                    <RotateCcw className="h-4 w-4" />
                    恢复阅读默认值
                  </button>
                </div>
              </section>

              <section>
                <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-on-surface-variant">
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
                      className={`flex min-h-16 flex-col items-center justify-center gap-1 border-r border-outline-variant/20 px-2 text-xs last:border-r-0 ${
                        themePreference === option.value ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low"
                      }`}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-on-surface-variant/70">
                  跟随日光会按北京当天的日出与日落时间自动切换，不读取定位权限。
                </p>
              </section>

              {!isAdmin && (
                <section className="rounded-xl bg-surface-container-low p-4">
                  <h3 className="text-sm font-medium text-on-surface mb-2">管理员功能已保护</h3>
                  <p className="text-xs text-on-surface-variant/70 mb-3">
                    个人资料、AI 配置和导入入口只在管理员登录后显示。
                  </p>
                  <Link
                    href="/login"
                    onClick={onClose}
                    className="inline-flex px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-medium"
                  >
                    管理员登录
                  </Link>
                </section>
              )}

              {isAdmin && (
                <>
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
                </>
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
