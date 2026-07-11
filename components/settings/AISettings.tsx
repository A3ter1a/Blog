'use client';

import { useState, useEffect } from 'react';
import { Brain, Plug, RefreshCw, AlertCircle, Check, BarChart3 } from 'lucide-react';
import type { AIConfig, AIUsageStats } from '@/lib/types';
import { getUsageStats, recordDeepSeekUsage } from '@/lib/ai-usage';
import { buildAuthHeaders } from '@/lib/fetch-with-auth';
import {
  AI_CONFIG_STORAGE_KEY,
  ALLOW_CLIENT_AI_KEYS,
  DEEPSEEK_MODEL_OPTIONS,
  DEFAULT_AI_CONFIG,
  DEFAULT_QWEN_ENDPOINT,
  QWEN_OCR_MODEL_OPTIONS,
  normalizeAIConfig,
  sanitizeAIConfig,
} from '@/lib/ai-config';
import { readJsonStorage, writeJsonStorage } from '@/lib/browser-storage';

type ConfigTestBody = {
  provider: 'deepseek' | 'qwen' | 'baidu-ocr';
  apiKey?: string;
  model?: string;
};

type ConfigTestProvider = ConfigTestBody['provider'];

export function AISettings() {
  const [config, setConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [isEditing, setIsEditing] = useState(false);
  const [testing, setTesting] = useState<ConfigTestProvider | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [usage, setUsage] = useState<AIUsageStats>(getUsageStats());
  const [serverConfig, setServerConfig] = useState<{
    deepseekConfigured: boolean;
    qwenConfigured: boolean;
    baiduOcrConfigured: boolean;
    documentOcrStorageConfigured: boolean;
  } | null>(null);

  useEffect(() => {
    const nextConfig = sanitizeAIConfig(
      readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig)
    );

    if (!ALLOW_CLIENT_AI_KEYS) {
      writeJsonStorage(AI_CONFIG_STORAGE_KEY, nextConfig);
    }

    const timer = window.setTimeout(() => setConfig(nextConfig), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const res = await fetch('/api/ai/config', {
          headers: await buildAuthHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) {
          setServerConfig({
            deepseekConfigured: Boolean(data.deepseekConfigured),
            qwenConfigured: Boolean(data.qwenConfigured),
            baiduOcrConfigured: Boolean(data.baiduOcrConfigured),
            documentOcrStorageConfigured: Boolean(data.documentOcrStorageConfigured),
          });
        }
      } catch {
        // Keep the panel usable; the test buttons will surface API errors.
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const saveConfig = () => {
    const safeConfig = sanitizeAIConfig(config);
    writeJsonStorage(AI_CONFIG_STORAGE_KEY, safeConfig);
    setConfig(safeConfig);
    setIsEditing(false);
  };

  const testConnection = async (provider: ConfigTestProvider) => {
    setTesting(provider);
    setTestResult(null);
    try {
      const body: ConfigTestBody = { provider };
      if (provider === 'deepseek') {
        if (ALLOW_CLIENT_AI_KEYS) body.apiKey = config.deepseekApiKey;
        body.model = config.deepseekModel;
      } else if (provider === 'qwen') {
        if (ALLOW_CLIENT_AI_KEYS) body.apiKey = config.qwenApiKey;
        body.model = config.qwenModel;
      }

      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: await buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        const providerName = provider === 'deepseek'
          ? 'DeepSeek'
          : provider === 'qwen'
            ? 'Qwen'
            : '讲义 OCR';
        setTestResult({ success: true, message: `${providerName} 连接成功！` });
        if (provider === 'deepseek' && data.tokensUsed) {
          recordDeepSeekUsage(data.tokensUsed);
          setUsage(getUsageStats());
        }
      } else {
        setTestResult({ success: false, message: data.error || '连接失败' });
      }
    } catch {
      setTestResult({ success: false, message: '网络错误，请检查配置' });
    }
    setTesting(null);
  };

  const deepseekConfigured = ALLOW_CLIENT_AI_KEYS
    ? Boolean(config.deepseekApiKey)
    : Boolean(serverConfig?.deepseekConfigured);
  const qwenConfigured = ALLOW_CLIENT_AI_KEYS
    ? Boolean(config.qwenApiKey)
    : Boolean(serverConfig?.qwenConfigured);
  const baiduOcrConfigured = Boolean(serverConfig?.baiduOcrConfigured);
  const documentOcrStorageConfigured = Boolean(serverConfig?.documentOcrStorageConfigured);
  const documentOcrReady = baiduOcrConfigured && documentOcrStorageConfigured;
  const isPresetQwenOcrModel = QWEN_OCR_MODEL_OPTIONS.some((option) => option.value === config.qwenModel);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
          <Brain className="w-4 h-4" />
          AI 设置
        </h3>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => {
                  setConfig(sanitizeAIConfig(
                    readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig)
                  ));
                  setIsEditing(false);
                }}
                className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveConfig}
                className="text-sm text-primary hover:text-primary-container transition-colors font-medium"
              >
                保存
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="text-sm text-primary hover:text-primary-container transition-colors"
            >
              配置
            </button>
          )}
        </div>
      </div>

      {/* View Mode */}
      {!isEditing && (
        <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${deepseekConfigured ? 'bg-green-500' : 'bg-outline-variant'}`} />
            <span className="text-sm text-on-surface-variant">
              DeepSeek {deepseekConfigured ? `(${config.deepseekModel})` : '— 未配置'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${qwenConfigured ? 'bg-green-500' : 'bg-outline-variant'}`} />
            <span className="text-sm text-on-surface-variant">
              Qwen OCR {qwenConfigured ? `(${config.qwenModel})` : '— 未配置'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${documentOcrReady ? 'bg-green-500' : 'bg-outline-variant'}`} />
            <span className="text-sm text-on-surface-variant">
              百度 Unlimited OCR {documentOcrReady ? '— 就绪' : '— 未就绪'}
            </span>
          </div>

          {/* Usage stats */}
          {(usage.deepseek.totalTokens > 0 || usage.qwen.totalImages > 0) && (
            <div className="pt-2 border-t border-outline-variant/10">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-3.5 h-3.5 text-on-surface-variant/50" />
                <span className="text-xs text-on-surface-variant/60">使用统计</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-on-surface-variant/50">
                <span>DeepSeek: {usage.deepseek.totalTokens.toLocaleString()} tokens</span>
                <span>Qwen: {usage.qwen.totalImages} 张图片</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Mode */}
      {isEditing && (
        <div className="space-y-4">
          {/* DeepSeek Configuration */}
          <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-on-surface">DeepSeek (题目分析)</p>
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">API Key</label>
              <input
                type="password"
                value={config.deepseekApiKey}
                onChange={e => setConfig({ ...config, deepseekApiKey: e.target.value })}
                disabled={!ALLOW_CLIENT_AI_KEYS}
                placeholder={ALLOW_CLIENT_AI_KEYS ? "sk-..." : "Server env only"}
                className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">模型</label>
              <select
                value={config.deepseekModel}
                onChange={e => setConfig({ ...config, deepseekModel: e.target.value })}
                className="w-full px-3 py-2 bg-surface-container-highest rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
              >
                {DEEPSEEK_MODEL_OPTIONS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => testConnection('deepseek')}
              disabled={!deepseekConfigured || testing !== null}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-40"
            >
              {testing === 'deepseek' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plug className="w-3.5 h-3.5" />
              )}
              测试 DeepSeek 连接
            </button>
          </div>

          {/* Qwen Configuration */}
          <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-on-surface">Qwen Vision (OCR 识别)</p>
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">API Key</label>
              <input
                type="password"
                value={config.qwenApiKey}
                onChange={e => setConfig({ ...config, qwenApiKey: e.target.value })}
                disabled={!ALLOW_CLIENT_AI_KEYS}
                placeholder={ALLOW_CLIENT_AI_KEYS ? "sk-..." : "Server env only"}
                className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">OCR 模型</label>
              <select
                value={config.qwenModel}
                onChange={e => setConfig({ ...config, qwenModel: e.target.value })}
                className="w-full px-3 py-2 bg-surface-container-highest rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
              >
                {!isPresetQwenOcrModel && config.qwenModel && (
                  <option value={config.qwenModel}>当前模型：{config.qwenModel}</option>
                )}
                {QWEN_OCR_MODEL_OPTIONS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="rounded-lg bg-surface-container-highest px-3 py-2">
              <p className="text-xs text-on-surface-variant/60">固定官方端点</p>
              <p className="mt-1 break-all text-xs text-on-surface">{DEFAULT_QWEN_ENDPOINT}</p>
            </div>
            <button
              onClick={() => testConnection('qwen')}
              disabled={!qwenConfigured || testing !== null}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-40"
            >
              {testing === 'qwen' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plug className="w-3.5 h-3.5" />
              )}
              测试 Qwen 连接
            </button>
          </div>

          {/* Baidu Unlimited OCR Configuration */}
          <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-on-surface">百度 Unlimited OCR (PDF 讲义解析)</p>
            <div className="rounded-lg bg-surface-container-highest px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${baiduOcrConfigured ? 'bg-green-500' : 'bg-outline-variant'}`} />
                <span className="text-xs text-on-surface-variant">
                  {baiduOcrConfigured ? '服务端密钥已配置' : '服务端密钥未配置'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${documentOcrStorageConfigured ? 'bg-green-500' : 'bg-outline-variant'}`} />
                <span className="text-xs text-on-surface-variant">
                  {documentOcrStorageConfigured ? 'OCR 临时文件桶可用' : 'OCR 临时文件桶未就绪'}
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant/50">
                BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY · ocr-documents
              </p>
            </div>
            <button
              onClick={() => testConnection('baidu-ocr')}
              disabled={!baiduOcrConfigured || testing !== null}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-40"
            >
              {testing === 'baidu-ocr' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plug className="w-3.5 h-3.5" />
              )}
              检测讲义 OCR 配置
            </button>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
              testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {testResult.success ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {testResult.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
