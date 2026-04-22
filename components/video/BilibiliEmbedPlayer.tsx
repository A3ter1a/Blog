"use client";

import { useState, useRef } from "react";
import { Maximize2, Minimize2, ExternalLink } from "lucide-react";
import BilibiliEmbedRenderer from "react-bilibili-embed-renderer";

interface BilibiliEmbedPlayerProps {
  bvid: string;
  cid?: string;
  p?: number;
  title?: string;
  autoPlay?: boolean;
  inlineMode?: boolean;
  onExitInline?: () => void;
}

export function BilibiliEmbedPlayer({ 
  bvid, 
  cid, 
  p = 1, 
  title, 
  autoPlay = false, 
  inlineMode = false, 
  onExitInline 
}: BilibiliEmbedPlayerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // If in inline mode, render with exit button
  if (inlineMode) {
    return (
      <div
        ref={containerRef}
        className="relative w-full bg-black rounded-xl overflow-hidden shadow-elevated"
      >
        {/* Header with title and exit button */}
        {title && (
          <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent px-4 py-3 flex items-center justify-between">
            <h4 className="text-white text-sm font-medium truncate flex-1 mr-4">{title}</h4>
            <button
              onClick={onExitInline}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors duration-200 flex-shrink-0"
              title="退出播放"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Embed Player */}
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <div className="absolute top-0 left-0 w-full h-full">
            <BilibiliEmbedRenderer
              bvid={bvid}
              page={p}
              highQuality={true}
              hasDanmaku={false}
              width="100%"
              height="100%"
            />
          </div>
        </div>

        {/* Control Bar */}
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 flex items-center justify-end gap-2">
          <a
            href={`https://www.bilibili.com/video/${bvid}${p > 1 ? `?p=${p}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors duration-200"
            title="在B站打开"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors duration-200"
            title={isFullscreen ? "退出全屏" : "全屏"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  }

  // Normal mode (for edit page)
  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black rounded-xl overflow-hidden shadow-elevated transition-all duration-300 ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none" : ""
      }`}
    >
      {/* Header Bar */}
      {!isFullscreen && title && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/60 to-transparent px-4 py-3">
          <h4 className="text-white text-sm font-medium truncate">{title}</h4>
        </div>
      )}

      {/* Embed Player */}
      <div className={isFullscreen ? "w-full h-full" : "relative w-full"} style={!isFullscreen ? { paddingBottom: "56.25%" } : {}}>
        <div className={isFullscreen ? "w-full h-full" : "absolute top-0 left-0 w-full h-full"}>
          <BilibiliEmbedRenderer
            bvid={bvid}
            page={p}
            highQuality={true}
            hasDanmaku={false}
            width="100%"
            height="100%"
          />
        </div>
      </div>

      {/* Control Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 flex items-center justify-end gap-2">
        <a
          href={`https://www.bilibili.com/video/${bvid}${p > 1 ? `?p=${p}` : ""}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors duration-200"
          title="在B站打开"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors duration-200"
          title={isFullscreen ? "退出全屏" : "全屏"}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
