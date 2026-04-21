"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown, Undo2 } from "lucide-react";
import { InputArea } from "./InputArea";
import { MarkdownMessage } from "./MarkdownMessage";
import { chatWithAI, getActiveConfig } from "@/lib/ai";
import { APIConfig, aiProviders, aiModelShortLabels } from "@/lib/types";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AIPanelProps {
  onImageUpload?: (file: File) => void;
  context?: string;
  onOpenChange?: (open: boolean) => void; // Notify parent when panel opens/closes
}
export function AIPanel({ onImageUpload, context, onOpenChange }: AIPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [activeConfig, setActiveConfig] = useState<APIConfig | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    const newOpen = !isOpen;
    setIsOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  const handleClose = () => {
    setIsOpen(false);
    setShowModelSelector(false);
    onOpenChange?.(false);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      loadActiveConfig();
    }
  }, [isOpen]);

  const loadActiveConfig = () => {
    setActiveConfig(getActiveConfig());
  };

  const handleModelChange = (model: string) => {
    if (!activeConfig) return;
    try {
      const saved = localStorage.getItem("apiConfigs");
      if (!saved) return;
      const configs: APIConfig[] = JSON.parse(saved);
      const updated = configs.map(c =>
        c.id === activeConfig.id ? { ...c, model } : c
      );
      localStorage.setItem("apiConfigs", JSON.stringify(updated));
      setActiveConfig({ ...activeConfig, model });
      setShowModelSelector(false);
    } catch (error) {
      // Silently fail - model selector will reset on next render
    }
  };

  const handleSend = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const reply = await chatWithAI(content, context);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `出错了：${error.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUndo = () => {
    // Remove last user message and its assistant response
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const lastMsg = prev[prev.length - 1];
      if (lastMsg.role === "assistant") {
        // Remove assistant response and the user message before it
        return prev.slice(0, -2);
      }
      // Only user message left (no response yet)
      return prev.slice(0, -1);
    });
  };

  const handleImageUpload = (file: File) => {
    if (onImageUpload) {
      onImageUpload(file);
    }
  };

  // Close model selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showModelSelector) {
        setShowModelSelector(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showModelSelector]);

  return (
    <div className="relative w-full h-full bg-surface-container-lowest rounded-2xl shadow-elevated flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/15 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full editorial-gradient flex items-center justify-center">
                  <span className="text-on-primary text-xs font-bold">AI</span>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-bold text-on-surface">
                    Scholar's Ink AI
                  </h3>
                  {activeConfig && (
                    <div className="relative">
                      <button
                        onClick={() => setShowModelSelector(!showModelSelector)}
                        className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors"
                      >
                        <span className="text-on-surface-variant/60">
                          {aiProviders.find(p => p.value === activeConfig.provider)?.shortLabel || activeConfig.provider}
                        </span>
                        <span className="text-on-surface-variant/40">·</span>
                        <span className="text-on-surface-variant/80">
                          {aiModelShortLabels[activeConfig.provider]?.find(m => m.value === activeConfig.model)?.label || activeConfig.model || "默认"}
                        </span>
                        <ChevronDown className="w-3 h-3" />
                      </button>

                      {/* Model Selector Dropdown */}
                      <AnimatePresence>
                        {showModelSelector && (
                          <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="absolute top-full left-0 mt-2 w-48 bg-surface-container-low rounded-lg shadow-elevated border border-outline-variant/10 overflow-hidden z-50"
                          >
                            <div className="py-1">
                              {aiModelShortLabels[activeConfig.provider]?.map((model) => (
                                <button
                                  key={model.value}
                                  onClick={() => handleModelChange(model.value)}
                                  className={`w-full px-3 py-2 text-left text-xs hover:bg-surface-container-high transition-colors ${
                                    activeConfig.model === model.value
                                      ? "text-primary bg-primary/5"
                                      : "text-on-surface-variant"
                                  }`}
                                >
                                  {model.label}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-surface-container-high rounded-lg transition-colors duration-300"
              >
                <X className="w-4 h-4 text-on-surface-variant" />
              </button>
            </div>

            {/* Messages */}
            <div className="ai-messages-container flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-12 text-on-surface-variant/40">
                  <p className="text-sm">开始与 AI 对话...</p>
                </div>
              )}
              {messages.map((msg, index) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="relative group">
                    <div
                      className={`max-w-[95%] px-4 py-3 rounded-xl text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "editorial-gradient text-on-primary"
                          : "bg-surface-container-low text-on-surface"
                      }`}
                    >
                      <MarkdownMessage
                        content={msg.content}
                        isUser={msg.role === "user"}
                      />
                    </div>
                    {/* Undo button for last user message */}
                    {msg.role === "user" && index === messages.length - 1 && (
                      <button
                        onClick={handleUndo}
                        className="absolute -left-8 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-surface-container-high text-on-surface-variant/40 hover:text-primary transition-all duration-200"
                        title="撤回"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-surface-container-low px-4 py-3 rounded-xl text-sm text-on-surface-variant">
                    思考中...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex-shrink-0 border-t border-outline-variant/10">
              <InputArea
                onSend={handleSend}
                onImageUpload={handleImageUpload}
                isLoading={isLoading}
              />
            </div>
          </div>
  );
}
