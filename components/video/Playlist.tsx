"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Play, Video as VideoIcon } from "lucide-react";
import { VideoPlayer } from "./VideoPlayer";
import type { Video, VideoPlatform } from "@/lib/types";
import { platformMap } from "@/lib/types";

interface PlaylistProps {
  videos: Video[];
  onChange?: (videos: Video[]) => void;
  editable?: boolean;
}

export function Playlist({ videos, onChange, editable = false }: PlaylistProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [newVideoInput, setNewVideoInput] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newPlatform, setNewPlatform] = useState<VideoPlatform>("bilibili");

  const currentVideo = videos[currentIndex];

  const parseVideoInput = (input: string, platform: VideoPlatform) => {
    input = input.trim();
    
    if (platform === "bilibili") {
      // Support full URL with P, BV号, or raw BV
      const bvMatch = input.match(/(BV[\w]+)/);
      const pMatch = input.match(/[?&]p=(\d+)/);
      return {
        bvid: bvMatch ? bvMatch[1] : input,
        p: pMatch ? parseInt(pMatch[1]) : 1,
      };
    }
    
    if (platform === "youtube") {
      // Support various YouTube URL formats
      const patterns = [
        /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/,  // Direct video ID
      ];
      
      for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) return { videoId: match[1] };
      }
      return { videoId: input };
    }
    
    return platform === "bilibili" ? { bvid: input, p: 1 } : { videoId: input };
  };

  const handleAddVideo = () => {
    if (!newVideoInput.trim()) return;

    const parsed = parseVideoInput(newVideoInput, newPlatform);
    const videoId = newPlatform === "bilibili" ? (parsed as any).bvid : (parsed as any).videoId;
    const newVideo: Video = {
      id: `${newPlatform}-${videoId}-${Date.now()}`,
      platform: newPlatform,
      title: newTitle.trim() || `视频 ${videos.length + 1}`,
      bilibili: newPlatform === "bilibili" ? {
        bvid: (parsed as any).bvid,
        p: (parsed as any).p || 1,
        title: newTitle.trim() || `视频 ${videos.length + 1}`,
      } : undefined,
      youtube: newPlatform === "youtube" ? {
        videoId: (parsed as any).videoId,
        title: newTitle.trim() || `视频 ${videos.length + 1}`,
      } : undefined,
    };

    const updated = [...videos, newVideo];
    onChange?.(updated);
    setNewVideoInput("");
    setNewTitle("");
  };

  const handleRemoveVideo = (index: number) => {
    const updated = videos.filter((_, i) => i !== index);
    onChange?.(updated);
    if (currentIndex >= updated.length) {
      setCurrentIndex(Math.max(0, updated.length - 1));
    }
  };

  return (
    <div className="space-y-4 overscroll-contain">
      {/* Player */}
      {currentVideo && (
        <VideoPlayer video={currentVideo} />
      )}

      {/* Playlist Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-on-surface font-headline">
          播放列表
        </h3>
        <span className="text-sm text-on-surface-variant">
          {videos.length} 个视频
        </span>
      </div>

      {/* Video List */}
      <div className="space-y-2 max-h-64 overflow-y-auto overscroll-contain">
        <AnimatePresence>
          {videos.map((video, index) => (
            <motion.div
              key={video.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                index === currentIndex
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-low hover:bg-surface-container-high text-on-surface"
              }`}
              onClick={() => setCurrentIndex(index)}
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                {index === currentIndex ? (
                  <Play className="w-4 h-4" />
                ) : (
                  <span className="text-sm font-bold">{index + 1}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{video.title}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs opacity-60">{platformMap[video.platform]}</span>
                  {video.platform === "bilibili" && video.bilibili && (
                    <span className="text-xs opacity-40">{video.bilibili.bvid}</span>
                  )}
                  {video.platform === "youtube" && video.youtube && (
                    <span className="text-xs opacity-40">{video.youtube.videoId}</span>
                  )}
                </div>
              </div>
              {editable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveVideo(index);
                  }}
                  className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors duration-200"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {videos.length === 0 && (
          <div className="text-center py-8 text-on-surface-variant/40 text-sm">
            暂无视频，{editable ? "请添加" : "请关联"}视频
          </div>
        )}
      </div>

      {/* Add Video Form (Editable Mode) */}
      {editable && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-surface-container-low rounded-xl space-y-3"
        >
          <h4 className="text-sm font-medium text-on-surface-variant">添加视频</h4>
          
          {/* Platform Selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setNewPlatform("bilibili")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                newPlatform === "bilibili"
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              Bilibili
            </button>
            <button
              onClick={() => setNewPlatform("youtube")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                newPlatform === "youtube"
                  ? "bg-red-600 text-white"
                  : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              <span className="flex items-center justify-center gap-1">
                <VideoIcon className="w-4 h-4" />
                YouTube
              </span>
            </button>
          </div>

          {/* Video Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newVideoInput}
              onChange={(e) => setNewVideoInput(e.target.value)}
              placeholder={newPlatform === "bilibili" ? "输入BV号或链接 (如 BV1xx?p=3)..." : "输入YouTube链接或视频ID..."}
              className="flex-1 px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface placeholder:text-on-surface-variant/40 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAddVideo()}
            />
            <button
              onClick={handleAddVideo}
              disabled={!newVideoInput.trim()}
              className="px-4 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              添加
            </button>
          </div>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="视频标题（可选）..."
            className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface placeholder:text-on-surface-variant/40 text-sm"
          />
        </motion.div>
      )}
    </div>
  );
}
