"use client";

import { BilibiliPlayer } from "./BilibiliPlayer";
import { YouTubePlayer } from "./YouTubePlayer";
import type { Video } from "@/lib/types";

interface VideoPlayerProps {
  video: Video;
  autoPlay?: boolean;
}

export function VideoPlayer({ video, autoPlay = false }: VideoPlayerProps) {
  if (video.platform === "bilibili" && video.bilibili) {
    return (
      <BilibiliPlayer
        bvid={video.bilibili.bvid}
        cid={video.bilibili.cid}
        p={video.bilibili.p}
        title={video.title}
        autoPlay={autoPlay}
      />
    );
  }

  if (video.platform === "youtube" && video.youtube) {
    return (
      <YouTubePlayer
        videoId={video.youtube.videoId}
        title={video.title}
        autoPlay={autoPlay}
      />
    );
  }

  return null;
}
