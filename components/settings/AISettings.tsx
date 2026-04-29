'use client';

import { useState, useEffect } from 'react';
import { Brain, Plug, RefreshCw, AlertCircle, Check, BarChart3 } from 'lucide-react';
import type { AIConfig, AIUsageStats } from '@/lib/types';
import { getUsageStats, recordDeepSeekUsage } from '@/lib/ai-usage';

const STORAGE_KEY = 'ai-config';

const defaultConfig: AIConfig = {
  deepseekApiKey: '',
  deepseekModel: 'deepseek-v4-flash',
  qwenApiKey: '',
  qwenModel: 'qwen-vl-max',
  qwenApiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

const DEEPSEEK_MODELS = [
  { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (快速)' },
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (高级)' },
];

interface AISettingsProps {}

export function AISettings(_props: AISettingsProps) {
  const [config, setConfig] = useState<AIConfig>(defaultConfig);
  const [isEditing, setIsEditing] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [usage, setUsage] = useState<AIUsageStats>(getUsageStats());

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setConfig({ ...defaultConfig, ...JSON.parse(saved) }); } catch { /* ignore */ }
    }
  }, []);

  const saveConfig = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setIsEditing(false);
  };

  const testConnection = async (provider: 'deepseek' | 'qwen') => {
    setTesting(provider);
    setTestResult(null);
    try {
      const body: any = { provider };
      if (provider === 'deepseek') {
        body.apiKey = config.deepseekApiKey;
        body.model = config.deepseekModel;
      } else {
        body.apiKey = config.qwenApiKey;
        body.model = config.qwenModel;
        body.endpoint = config.qwenApiEndpoint;
      }

      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: `${provider === 'deepseek' ? 'DeepSeek' : 'Qwen'} 连接成功！` });
        if (provider === 'deepseek' && data.tokensUsed) {
          recordDeepSeekUsage(data.tokensUsed);
          setUsage(getUsageStats());
        }
      } else {
        setTestResult({ success: false, message: data.error || '连接失败' });
      }
    } catch (err) {
      setTestResult({ success: false, message: '网络错误，请检查配置' });
    }
    setTesting(null);
  };

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
                  try {
                    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                    setConfig({ ...defaultConfig, ...saved });
                  } catch {
                    setConfig({ ...defaultConfig });
                  }
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
            <div className={`w-2 h-2 rounded-full ${config.deepseekApiKey ? 'bg-green-500' : 'bg-outline-variant'}`} />
            <span className="text-sm text-on-surface-variant">
              DeepSeek {config.deepseekApiKey ? `(${config.deepseekModel})` : '— 未配置'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${config.qwenApiKey ? 'bg-green-500' : 'bg-outline-variant'}`} />
            <span className="text-sm text-on-surface-variant">
              Qwen OCR {config.qwenApiKey ? `(${config.qwenModel})` : '— 未配置'}
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
                placeholder="sk-..."
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
                {DEEPSEEK_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => testConnection('deepseek')}
              disabled={!config.deepseekApiKey || testing !== null}
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
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">模型名称</label>
              <input
                type="text"
                value={config.qwenModel}
                onChange={e => setConfig({ ...config, qwenModel: e.target.value })}
                className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">API 端点</label>
              <input
                type="text"
                value={config.qwenApiEndpoint}
                onChange={e => setConfig({ ...config, qwenApiEndpoint: e.target.value })}
                className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm"
              />
            </div>
            <button
              onClick={() => testConnection('qwen')}
              disabled={!config.qwenApiKey || testing !== null}
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
