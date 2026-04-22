"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, CheckCircle2, XCircle, Loader2, Key, Upload, Type, ListTree, Eye, AlignLeft, User, Camera, Edit3, Save, Mail, GitFork, Globe, MessageCircle, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { APIConfig, aiProviders, aiModelsByProvider } from "@/lib/types";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useReadingPreferences, TOCPosition } from "@/lib/useReadingPreferences";
import { ParsedNote } from "@/lib/import";
import { ImportPreview } from "@/components/export/ImportPreview";
import { fileToDataUrl } from "@/lib/utils";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type LinkVariant = "default" | "secondary" | "dark" | "primary";

interface ProfileLink {
  name: string;
  icon: string;
  href: string;
  variant: LinkVariant;
  linkType?: "link" | "number";
}

interface Profile {
  name: string;
  avatar: string;
  tagline: string;
  badges: string[];
  links: ProfileLink[];
  footer: string;
}

const defaultProfile: Profile = {
  name: "A3ter1a",
  avatar: "",
  tagline: "博观而约取，厚积而薄发。在这场孤独的修行中，我们终将听见远方的回响。",
  badges: ["星月女神 Asteria", "考研人 | 数学 · 英语 · 政治 · 经济学"],
  links: [
    { name: "QQ", icon: "qq", href: "", variant: "default" as LinkVariant, linkType: "number" },
    { name: "微信", icon: "wechat", href: "", variant: "secondary" as LinkVariant, linkType: "number" },
    { name: "B站", icon: "bilibili", href: "", variant: "dark" as LinkVariant, linkType: "number" },
    { name: "Github", icon: "github", href: "", variant: "primary" as LinkVariant, linkType: "link" },
  ],
  footer: "Asteroid — 知识的沉淀与共鸣",
};

const iconMap: Record<string, string> = {
  mail: "/icons/email.svg",
  github: "/icons/github.svg",
  weibo: "/icons/weibo.svg",
  zhihu: "/icons/zhihu.svg",
  qq: "/icons/qq.svg",
  wechat: "/icons/wechat.svg",
  bilibili: "/icons/bilibili.svg",
  tiktok: "/icons/tiktok.svg",
};

const iconOptions = [
  { value: "qq", label: "QQ", linkType: "number" as const, displayName: "QQ" },
  { value: "wechat", label: "微信", linkType: "number" as const, displayName: "微信" },
  { value: "bilibili", label: "B站", linkType: "link" as const, displayName: "B站" },
  { value: "github", label: "Github", linkType: "link" as const, displayName: "Github" },
  { value: "weibo", label: "微博", linkType: "link" as const, displayName: "微博" },
  { value: "zhihu", label: "知乎", linkType: "link" as const, displayName: "知乎" },
  { value: "tiktok", label: "抖音", linkType: "link" as const, displayName: "抖音" },
  { value: "mail", label: "邮箱", linkType: "link" as const, displayName: "邮箱" },
];

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { preferences, updatePreference } = useReadingPreferences();
  const [apiConfigs, setApiConfigs] = useState<APIConfig[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // Profile state
  const [profile, setProfile] = useState(defaultProfile);
  const [editForm, setEditForm] = useState(defaultProfile);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import state
  const [importError, setImportError] = useState<string | null>(null);

  // Form state
  const [formProvider, setFormProvider] = useState("deepseek");
  const [formApiKey, setFormApiKey] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formModel, setFormModel] = useState("");

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem("apiConfigs");
      if (saved) {
        try {
          setApiConfigs(JSON.parse(saved));
        } catch {
          setApiConfigs([]);
        }
      }

      // Load profile from localStorage
      const savedProfile = localStorage.getItem("about-profile");
      if (savedProfile) {
        try {
          const parsed = JSON.parse(savedProfile);
          setProfile(parsed);
          setEditForm(parsed);
        } catch {
          setProfile(defaultProfile);
          setEditForm(defaultProfile);
        }
      }
    }
  }, [isOpen]);

  const saveApiConfigs = (configs: APIConfig[]) => {
    setApiConfigs(configs);
    localStorage.setItem("apiConfigs", JSON.stringify(configs));
  };

  const handleProviderChange = (provider: string) => {
    setFormProvider(provider);
    const p = aiProviders.find(p => p.value === provider);
    if (p) {
      setFormBaseUrl(p.defaultUrl);
      setFormModel(p.defaultModel);
    }
  };

  const handleAddApi = () => {
    if (!formApiKey.trim()) return;
    const newConfig: APIConfig = {
      id: Date.now().toString(),
      provider: formProvider,
      apiKey: formApiKey.trim(),
      baseUrl: formBaseUrl.trim() || undefined,
      model: formModel.trim() || undefined,
      isActive: apiConfigs.length === 0, // First one is active by default
    };
    const updated = [...apiConfigs, newConfig];
    saveApiConfigs(updated);
    setFormApiKey("");
    setShowAddForm(false);
  };

  const handleDeleteApi = (id: string) => {
    const updated = apiConfigs.filter(c => c.id !== id);
    // If deleted config was active, activate the first remaining one
    const deleted = apiConfigs.find(c => c.id === id);
    if (deleted?.isActive && updated.length > 0) {
      updated[0].isActive = true;
    }
    saveApiConfigs(updated);
  };

  const handleSetActive = (id: string) => {
    const updated = apiConfigs.map(c => ({
      ...c,
      isActive: c.id === id,
    }));
    saveApiConfigs(updated);
  };

  const testApiConnection = async (config: APIConfig) => {
    setTestingId(config.id);
    setTestResults(prev => ({ ...prev, [config.id]: { success: false, message: "测试中..." } }));

    try {
      let success = false;
      let message = "";

      if (config.provider === "gemini") {
        // Test Gemini API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Hi" }] }] }),
        });
        if (response.ok) {
          success = true;
          message = "连接成功";
        } else {
          const error = await response.json();
          message = error.error?.message || "连接失败";
        }
      } else if (config.provider === "openai" || config.provider === "deepseek" || config.provider === "qwen") {
        // Test OpenAI-compatible APIs
        const baseUrl = config.baseUrl || aiProviders.find(p => p.value === config.provider)?.defaultUrl;
        // Use default chat model for testing, not VL models
        const testModel = config.provider === "deepseek" && config.model?.includes("vl")
          ? "deepseek-chat"
          : config.model || aiProviders.find(p => p.value === config.provider)?.defaultModel;
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: testModel,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 10,
          }),
        });
        if (response.ok) {
          success = true;
          message = "连接成功";
        } else {
          const error = await response.json();
          message = error.error?.message || "连接失败";
        }
      } else if (config.provider === "claude") {
        // Test Claude API
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: config.model || "claude-3-5-sonnet-20241022",
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 10,
          }),
        });
        if (response.ok) {
          success = true;
          message = "连接成功";
        } else {
          const error = await response.json();
          message = error.error?.message || "连接失败";
        }
      }

      setTestResults(prev => ({ ...prev, [config.id]: { success, message } }));
    } catch (error: any) {
      setTestResults(prev => ({ ...prev, [config.id]: { success: false, message: error.message || "网络错误" } }));
    } finally {
      setTestingId(null);
    }
  };

  // Import notes from file (JSON or Markdown)
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [parsedNotes, setParsedNotes] = useState<ParsedNote[]>([]);

  // Profile editing functions
  const handleSaveProfile = () => {
    setProfile(editForm);
    localStorage.setItem("about-profile", JSON.stringify(editForm));
    setIsEditingProfile(false);
  };

  const handleCancelProfile = () => {
    setEditForm(profile);
    setIsEditingProfile(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const dataUrl = await fileToDataUrl(file);
      setEditForm({ ...editForm, avatar: dataUrl });
    }
  };

  const addBadge = () => {
    setEditForm({ ...editForm, badges: [...editForm.badges, "新标签"] });
  };

  const removeBadge = (index: number) => {
    setEditForm({ ...editForm, badges: editForm.badges.filter((_, i) => i !== index) });
  };

  const updateBadge = (index: number, value: string) => {
    const newBadges = [...editForm.badges];
    newBadges[index] = value;
    setEditForm({ ...editForm, badges: newBadges });
  };

  const addLink = () => {
    setEditForm({
      ...editForm,
      links: [...editForm.links, { name: "QQ", icon: "qq", href: "", variant: "default" as LinkVariant, linkType: "number" }],
    });
  };

  const removeLink = (index: number) => {
    setEditForm({ ...editForm, links: editForm.links.filter((_, i) => i !== index) });
  };

  const updateLink = (index: number, field: keyof ProfileLink, value: string) => {
    const newLinks = [...editForm.links];
    newLinks[index] = { ...newLinks[index], [field]: value };
    
    // 当更改图标时，自动更新名称和链接类型
    if (field === "icon") {
      const iconOption = iconOptions.find(opt => opt.value === value);
      if (iconOption) {
        newLinks[index].name = iconOption.displayName;
        newLinks[index].linkType = iconOption.linkType;
      }
    }
    
    setEditForm({ ...editForm, links: newLinks });
  };

  const moveLink = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= editForm.links.length) return;
    const newLinks = [...editForm.links];
    [newLinks[index], newLinks[newIndex]] = [newLinks[newIndex], newLinks[index]];
    setEditForm({ ...editForm, links: newLinks });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const { detectFormat, importFromJSON, importFromMarkdown, importFromObsidian } = require('@/lib/import');
        const { ParsedNote } = require('@/lib/import');
        
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
              {/* AI API Configuration */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    AI API 配置
                  </h3>
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="text-sm text-primary hover:text-primary-container transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    添加
                  </button>
                </div>

                {/* Add Form */}
                <AnimatePresence>
                  {showAddForm && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4 bg-surface-container-low rounded-xl p-4 space-y-3 overflow-hidden"
                    >
                      {/* Provider Select */}
                      <div>
                        <label className="text-xs text-on-surface-variant/60 mb-1 block">厂商</label>
                        <CustomSelect
                          options={aiProviders.map(p => ({ value: p.value, label: p.label }))}
                          value={formProvider}
                          onChange={handleProviderChange}
                        />
                      </div>

                      {/* API Key */}
                      <div>
                        <label className="text-xs text-on-surface-variant/60 mb-1 block">API Key</label>
                        <input
                          type="password"
                          value={formApiKey}
                          onChange={(e) => setFormApiKey(e.target.value)}
                          placeholder="输入 API Key..."
                          className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/40"
                        />
                      </div>

                      {/* Base URL (optional) */}
                      {(formProvider !== "gemini" && formProvider !== "claude") && (
                        <div>
                          <label className="text-xs text-on-surface-variant/60 mb-1 block">Base URL (可选)</label>
                          <input
                            type="text"
                            value={formBaseUrl}
                            onChange={(e) => setFormBaseUrl(e.target.value)}
                            placeholder={aiProviders.find(p => p.value === formProvider)?.defaultUrl}
                            className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/40"
                          />
                        </div>
                      )}

                      {/* Model Select */}
                      <div>
                        <label className="text-xs text-on-surface-variant/60 mb-1 block">模型 (可选)</label>
                        <CustomSelect
                          options={[
                            { value: "", label: "使用默认模型" },
                            ...(aiModelsByProvider[formProvider]?.map(m => ({ value: m.value, label: m.label })) || []),
                          ]}
                          value={formModel}
                          onChange={setFormModel}
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setShowAddForm(false)}
                          className="flex-1 px-3 py-2 rounded-lg bg-surface-container text-on-surface-variant text-sm hover:bg-surface-container-high transition-colors"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleAddApi}
                          disabled={!formApiKey.trim()}
                          className="flex-1 px-3 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium disabled:opacity-40 transition-all"
                        >
                          保存
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* API List */}
                <div className="space-y-2">
                  {apiConfigs.length === 0 && !showAddForm && (
                    <div className="bg-surface-container-low rounded-xl p-6 text-center">
                      <Key className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-2" />
                      <p className="text-sm text-on-surface-variant/60">
                        点击"添加"配置 AI API
                      </p>
                    </div>
                  )}

                  {apiConfigs.map((config) => {
                    const provider = aiProviders.find(p => p.value === config.provider);
                    const testResult = testResults[config.id];

                    return (
                      <div
                        key={config.id}
                        className={`rounded-xl p-4 transition-all duration-200 ${
                          config.isActive
                            ? "bg-primary/5 border border-primary/20"
                            : "bg-surface-container-low"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-on-surface">
                              {provider?.label || config.provider}
                            </span>
                            {config.isActive && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                使用中
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteApi(config.id)}
                            className="p-1 rounded hover:bg-surface-container-high transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-on-surface-variant/40 hover:text-red-500" />
                          </button>
                        </div>

                        <div className="text-xs text-on-surface-variant/60 mb-2 font-mono">
                          {config.apiKey.slice(0, 8)}...{config.apiKey.slice(-4)}
                        </div>

                        {config.model && (
                          <div className="text-xs text-on-surface-variant/40 mb-2">
                            模型: {config.model}
                          </div>
                        )}

                        {/* Test Result */}
                        {testResult && (
                          <div className={`flex items-center gap-1 text-xs mb-2 ${testResult.success ? "text-green-600" : "text-red-500"}`}>
                            {testResult.success ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            <span>{testResult.message}</span>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 mt-2">
                          {!config.isActive && (
                            <button
                              onClick={() => handleSetActive(config.id)}
                              className="text-xs px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                              设为默认
                            </button>
                          )}
                          <button
                            onClick={() => testApiConnection(config)}
                            disabled={testingId === config.id}
                            className="text-xs px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            {testingId === config.id ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                测试中
                              </>
                            ) : (
                              "测试连接"
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

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

              {/* Profile Editing */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
                    <User className="w-4 h-4" />
                    个人资料
                  </h3>
                  {!isEditingProfile ? (
                    <button
                      onClick={() => {
                        setEditForm(profile);
                        setIsEditingProfile(true);
                      }}
                      className="text-sm text-primary hover:text-primary-container transition-colors flex items-center gap-1"
                    >
                      <Edit3 className="w-4 h-4" />
                      编辑
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancelProfile}
                        className="text-sm text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1"
                      >
                        <X className="w-4 h-4" />
                        取消
                      </button>
                      <button
                        onClick={handleSaveProfile}
                        className="text-sm text-primary hover:text-primary-container transition-colors flex items-center gap-1 font-medium"
                      >
                        <Save className="w-4 h-4" />
                        保存
                      </button>
                    </div>
                  )}
                </div>

                {isEditingProfile ? (
                  <div className="space-y-4">
                    {/* Avatar */}
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-surface-container-low overflow-hidden">
                          {editForm.avatar ? (
                            <img src={editForm.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full editorial-gradient flex items-center justify-center text-on-primary text-xl font-bold">
                              {editForm.name.slice(0, 2)}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute bottom-0 right-0 w-6 h-6 rounded-full editorial-gradient flex items-center justify-center text-on-primary shadow-ambient"
                        >
                          <Camera className="w-3 h-3" />
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarUpload}
                          className="hidden"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-on-surface">头像</p>
                        <p className="text-xs text-on-surface-variant/60">点击相机图标更换</p>
                      </div>
                    </div>

                    {/* Name */}
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-2">昵称</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm"
                      />
                    </div>

                    {/* Tagline */}
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-2">个性签名</label>
                      <textarea
                        value={editForm.tagline}
                        onChange={(e) => setEditForm({ ...editForm, tagline: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm resize-none"
                      />
                    </div>

                    {/* Badges */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-medium text-on-surface-variant">身份标签</label>
                        <button onClick={addBadge} className="text-xs text-primary flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" /> 添加
                        </button>
                      </div>
                      <div className="space-y-2">
                        {editForm.badges.map((badge, i) => (
                          <div key={i} className="flex gap-2">
                            <input
                              type="text"
                              value={badge}
                              onChange={(e) => updateBadge(i, e.target.value)}
                              className="flex-1 px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm"
                            />
                            <button
                              onClick={() => removeBadge(i)}
                              className="p-2 rounded-lg hover:bg-red-100 text-on-surface-variant hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Links */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-medium text-on-surface-variant">社交链接</label>
                        <button onClick={addLink} className="text-xs text-primary flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" /> 添加
                        </button>
                      </div>
                      <div className="space-y-2">
                        {editForm.links.map((link, i) => (
                          <div key={i} className="bg-surface-container rounded-lg p-2 space-y-2">
                            <div className="flex items-center gap-1">
                              {/* Drag Handle */}
                              <div className="flex flex-col gap-0.5 text-on-surface-variant/40">
                                <button
                                  onClick={() => moveLink(i, "up")}
                                  disabled={i === 0}
                                  className="p-0.5 rounded hover:bg-surface-container-high disabled:opacity-30 transition-colors"
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => moveLink(i, "down")}
                                  disabled={i === editForm.links.length - 1}
                                  className="p-0.5 rounded hover:bg-surface-container-high disabled:opacity-30 transition-colors"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              </div>
                              {/* Brand Icon & Name */}
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                                  <img src={iconMap[link.icon] || "/icons/email.svg"} alt={link.name} className="w-6 h-6" />
                                </div>
                                <span className="text-sm font-medium text-on-surface truncate">{link.name}</span>
                              </div>
                              {/* Link Type Toggle */}
                              <button
                                onClick={() => updateLink(i, "linkType", link.linkType === "link" ? "number" : "link")}
                                className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 transition-colors ${
                                  link.linkType === "link" 
                                    ? "bg-primary text-on-primary" 
                                    : "bg-surface-container-highest text-on-surface-variant"
                                }`}
                              >
                                {link.linkType === "link" ? "跳转" : "号码"}
                              </button>
                              <CustomSelect
                                options={iconOptions}
                                value={link.icon}
                                onChange={(value) => updateLink(i, "icon", value)}
                                className="w-20 flex-shrink-0"
                              />
                              <button
                                onClick={() => removeLink(i)}
                                className="p-1.5 rounded-md hover:bg-red-100 text-on-surface-variant hover:text-red-500 transition-colors flex-shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <input
                              type="text"
                              value={link.href}
                              onChange={(e) => updateLink(i, "href", e.target.value)}
                              placeholder={link.linkType === "link" ? "链接地址 (https://...)" : "号码/ID"}
                              className="w-full px-2 py-1.5 bg-surface-container-highest rounded-md input-soft text-on-surface text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer Text */}
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-2">页脚文字</label>
                      <input
                        type="text"
                        value={editForm.footer}
                        onChange={(e) => setEditForm({ ...editForm, footer: e.target.value })}
                        className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-surface-container-lowest overflow-hidden flex-shrink-0">
                        {profile.avatar ? (
                          <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full editorial-gradient flex items-center justify-center text-on-primary text-lg font-bold">
                            {profile.name.slice(0, 2)}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-on-surface">{profile.name}</p>
                        <p className="text-xs text-on-surface-variant/60 line-clamp-1">{profile.tagline}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.badges.slice(0, 2).map((badge, i) => (
                        <span key={i} className="px-2 py-1 rounded-full bg-surface-container-highest text-xs text-on-surface-variant">
                          {badge}
                        </span>
                      ))}
                      {profile.badges.length > 2 && (
                        <span className="px-2 py-1 rounded-full bg-surface-container-highest text-xs text-on-surface-variant">
                          +{profile.badges.length - 2}
                        </span>
                      )}
                    </div>
                  </div>
                )}
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
