"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, Brain, Sparkles, ChevronRight } from "lucide-react";

export default function ToolsPage() {
  const tools = [
    {
      id: "reading-time",
      title: "预计阅读时间",
      description: "根据笔记内容智能估算阅读所需时间",
      icon: Clock,
      color: "bg-blue-500/10 text-blue-600",
      href: "#",
      comingSoon: false,
      note: "已在笔记页面自动显示",
    },
    {
      id: "ai-quiz",
      title: "AI 出题练习",
      description: "基于笔记内容自动生成练习题，巩固知识点",
      icon: Brain,
      color: "bg-purple-500/10 text-purple-600",
      href: "#",
      comingSoon: false,
      note: "在笔记详情页点击「AI 出题」按钮",
    },
    {
      id: "flashcard",
      title: "抽卡复习",
      description: "间隔重复算法，智能安排复习计划",
      icon: Sparkles,
      color: "bg-amber-500/10 text-amber-600",
      href: "/flashcard",
      comingSoon: false,
    },
  ];

  return (
    <div className="min-h-screen bg-surface pt-24">
      {/* Header */}
      <div className="bg-surface-container-low border-b border-outline-variant/20">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold font-headline text-on-surface">
            工具
          </h1>
          <p className="mt-2 text-on-surface-variant">
            辅助学习的高效工具集
          </p>
        </div>
      </div>

      {/* Tools Grid */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-4">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <div
                key={tool.id}
                className={`group relative bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 transition-all hover:shadow-ambient ${
                  tool.comingSoon ? "opacity-60" : "cursor-pointer hover:border-primary/30"
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`flex-shrink-0 w-12 h-12 rounded-lg ${tool.color} flex items-center justify-center`}>
                    <Icon className="w-6 h-6" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-on-surface">
                        {tool.title}
                      </h3>
                      {!tool.comingSoon && tool.note && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/10 text-green-600">
                          已上线
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      {tool.description}
                    </p>
                    {tool.note && (
                      <p className="mt-2 text-xs text-on-surface-variant/60">
                        {tool.note}
                      </p>
                    )}
                  </div>

                  {/* Arrow */}
                  {tool.href !== "#" && (
                    <Link href={tool.href}>
                      <ChevronRight className="w-5 h-5 text-on-surface-variant/40 group-hover:text-primary transition-colors" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Note */}
        <div className="mt-12 text-center text-sm text-on-surface-variant/60">
          更多实用工具正在开发中，敬请期待...
        </div>
      </div>
    </div>
  );
}
