"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, Type, ListTree, Eye, AlignLeft, XCircle } from "lucide-react";
import { Profile, ProfileLink } from "@/lib/types";
import { useReadingPreferences, TOCPosition } from "@/lib/useReadingPreferences";
import { ParsedNote, detectFormat, importFromJSON, importFromMarkdown, importFromObsidian } from "@/lib/import";
import { ImportPreview } from "@/components/export/ImportPreview";
import { ProfileEditor } from "@/components/settings/ProfileEditor";
import { AISettings } from "@/components/settings/AISettings";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const defaultProfile: Profile = {
  name: "A3ter1a",
  avatar: "",
  tagline: "博观而约取，厚积而薄发。在这场孤独的修行中，我们终将听见远方的回响。",
  badges: ["星月女神 Asteria", "考研人 | 数学 · 英语 · 政治 · 经济学"],
  links: [
    { name: "QQ", icon: "qq", href: "", variant: "default", linkType: "number" },
    { name: "微信", icon: "wechat", href: "", variant: "secondary", linkType: "number" },
    { name: "B站", icon: "bilibili", href: "", variant: "dark", linkType: "number" },
    { name: "Github", icon: "github", href: "", variant: "primary", linkType: "link" },
  ],
  footer: "Asteroid — 知识的沉淀与共鸣",
};

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { preferences, updatePreference } = useReadingPreferences();

  // Profile state
  const [profile, setProfile] = useState(defaultProfile);

  // Import state
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const savedProfile = localStorage.getItem("about-profile");
    if (savedProfile) {
      try { setProfile(JSON.parse(savedProfile)); } catch { setProfile(defaultProfile); }
    }
  }, [isOpen]);

  const handleSaveProfile = (newProfile: Profile) => {
    setProfile(newProfile);
    localStorage.setItem("about-profile", JSON.stringify(newProfile));
  };

  // Import notes from file (JSON or Markdown)
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [parsedNotes, setParsedNotes] = useState<ParsedNote[]>([]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      } catch (err: any) {
        setImportError('解析文件失败: ' + (err.message || '未知错误'));
      }
    };
    reader.readAsText(file);

    // Reset input
    e.target.value = '';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Settings Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-surface-container-lowest shadow-elevated flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10 flex-shrink-0">
              <h2 className="text-xl font-bold text-on-surface font-headline">设置</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-surface-container-high transition-colors"
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
                        className="w-8 h-8 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors flex items-center justify-center"
                      >
                        A-
                      </button>
                      <input
                        type="range"
                        min="14"
                        max="20"
                        step="1"
                        value={preferences.fontSize}
                        onChange={(e) => updatePreference("fontSize", parseInt(e.target.value))}
                        className="flex-1 accent-bg-primary"
                      />
                      <button
                        onClick={() => updatePreference("fontSize", Math.min(20, preferences.fontSize + 1))}
                        className="w-8 h-8 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors flex items-center justify-center"
                      >
                        A+
                      </button>
                    </div>
                  </div>

                  {/* TOC Position */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ListTree className="w-4 h-4 text-on-surface-variant" />
                      <span className="text-sm font-medium text-on-surface">目录位置</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: "right", label: "显示" },
                        { value: "hidden", label: "隐藏" },
                      ] as { value: TOCPosition; label: string }[]).map((option) => (
                        <button
                          key={option.value}
                          onClick={() => updatePreference("tocPosition", option.value)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
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
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 ${
                        preferences.showProgressBar
                          ? "bg-primary/10 text-primary"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      <span className="text-sm font-medium">
                        {preferences.showProgressBar ? "已开启" : "已关闭"}
                      </span>
                      <div
                        className={`w-10 h-6 rounded-full transition-all duration-200 flex items-center ${
                          preferences.showProgressBar ? "bg-primary" : "bg-surface-container-highest"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-on-primary mx-1 transition-all duration-200 ${
                            preferences.showProgressBar ? "ml-5" : "ml-1"
                          }`}
                        />
                      </div>
                    </button>
                  </div>
                </div>
              </section>

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
                  <label className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-all duration-200 cursor-pointer">
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
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
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
          </motion.div>

          {/* Import Preview Panel */}
          <ImportPreview
            isOpen={showImportPreview}
            onClose={() => setShowImportPreview(false)}
            parsedNotes={parsedNotes}
          />
        </>
      )}
    </AnimatePresence>
  );
}
