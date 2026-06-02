"use client";

import Link from "next/link";
import { BookOpen, ChevronRight, Clock } from "lucide-react";

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
      id: "math3-catalog",
      title: "数三知识目录",
      description: "按考纲章节整理数学三知识点，并按小题知识点归属生成刷题队列",
      icon: BookOpen,
      color: "bg-violet-500/10 text-violet-600",
      href: "/tools/math3-catalog",
      comingSoon: false,
      note: "考纲目录 / 刷题",
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
            const isLink = tool.href !== "#";
            const cardContent = (
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
                {isLink && (
                  <ChevronRight className="w-5 h-5 text-on-surface-variant/40 group-hover:text-primary transition-colors" />
                )}
              </div>
            );

            const cardClassName = `group relative block bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 transition-all hover:shadow-ambient ${
              tool.comingSoon ? "opacity-60" : isLink ? "cursor-pointer hover:border-primary/30" : ""
            }`;

            if (isLink) {
              return (
                <Link key={tool.id} href={tool.href} className={cardClassName}>
                  {cardContent}
                </Link>
              );
            }

            return (
              <div
                key={tool.id}
                className={cardClassName}
              >
                {cardContent}
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
