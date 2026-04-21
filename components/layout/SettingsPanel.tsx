"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sun, Moon, Monitor, Palette, Plus, Trash2, CheckCircle2, XCircle, Loader2, Key } from "lucide-react";
import { APIConfig, aiProviders, aiModelsByProvider } from "@/lib/types";
import { setTheme, syncTheme, type ThemeMode } from "@/lib/theme";
import { CustomSelect } from "@/components/ui/CustomSelect";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}


export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [themeMode, setThemeMode] = useState<string>("light");
  const [apiConfigs, setApiConfigs] = useState<APIConfig[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // Form state
  const [formProvider, setFormProvider] = useState("deepseek");
  const [formApiKey, setFormApiKey] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formModel, setFormModel] = useState("");

  useEffect(() => {
    setThemeMode(localStorage.getItem("theme") || "light");
    const saved = localStorage.getItem("apiConfigs");
    if (saved) {
      try {
        setApiConfigs(JSON.parse(saved));
      } catch {
        setApiConfigs([]);
      }
    }
  }, []);

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
    }
  }, [isOpen]);

  const saveApiConfigs = (configs: APIConfig[]) => {
    setApiConfigs(configs);
    localStorage.setItem("apiConfigs", JSON.stringify(configs));
  };

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    setThemeMode(newTheme);
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

  const themeOptions = [
    { value: "light", label: "浅色", icon: Sun },
    { value: "dark", label: "深色", icon: Moon },
    { value: "system", label: "跟随系统", icon: Monitor },
  ];

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
              {/* Appearance */}
              <section>
                <h3 className="text-sm font-medium text-on-surface-variant mb-4 flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  外观
                </h3>
                <div className="space-y-3">
                  {themeOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        onClick={() => handleThemeChange(option.value as ThemeMode)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 ${
                          themeMode === option.value
                            ? "bg-primary/10 text-primary"
                            : "bg-surface-container-low text-on-surface hover:bg-surface-container-high"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="w-5 h-5" />
                          <span className="text-sm font-medium">{option.label}</span>
                        </div>
                        {themeMode === option.value && (
                          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-on-primary" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
