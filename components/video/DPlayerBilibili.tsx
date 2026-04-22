"use client";

import { useEffect, useRef, useState } from "react";
import DPlayer from "dplayer";
import { Maximize2, Minimize2, ExternalLink } from "lucide-react";

interface DPlayerBilibiliProps {
  bvid: string;
  p?: number;
  title?: string;
  inlineMode?: boolean;
  onExitInline?: () => void;
}

export function DPlayerBilibili({ 
  bvid, 
  p = 1, 
  title, 
  inlineMode = false, 
  onExitInline 
}: DPlayerBilibiliProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const initPlayer = async () => {
      try {
        setLoading(true);
        setError(null);

        // Dynamically import DPlayer (client-side only)
        const DPlayer = (await import("dplayer")).default;

        // Step 1: Get CID from BVID
        const cidRes = await fetch(
          `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
        );
        const cidData = await cidRes.json();
        
        if (cidData.code !== 0) {
          throw new Error("获取视频信息失败");
        }

        const pages = cidData.data.pages;
        const currentPage = pages[p - 1] || pages[0];
        const cid = currentPage.cid;

        // Step 2: Get video play URL
        const playRes = await fetch(
          `https://api.bilibili.com/x/player/wbi/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnver=0&fnval=4048`
        );
        const playData = await playRes.json();

        if (playData.code !== 0) {
          throw new Error("获取播放地址失败");
        }

        // Try to get dash or durl format
        let videoUrl = "";
        if (playData.data.dash) {
          // DASH format - use video stream
          videoUrl = playData.data.dash.video[0]?.baseUrl || "";
        } else if (playData.data.durl) {
          // DURL format
          videoUrl = playData.data.durl[0]?.url || "";
        }

        if (!videoUrl) {
          throw new Error("无法获取视频地址");
        }

        // Step 3: Initialize DPlayer
        const dp = new DPlayer({
          container: containerRef.current!,
          live: false,
          autoplay: true,
          theme: "#00a1d6",
          loop: false,
          lang: "zh-cn",
          screenshot: false,
          hotkey: true,
          preload: "auto",
          volume: 0.7,
          mutex: true,
          video: {
            url: videoUrl,
            type: "auto",
            customType: {
              customHls: function (video: HTMLVideoElement, player: DPlayer) {
                const hls = new (window as any).Hls();
                hls.loadSource(video.src);
                hls.attachMedia(video);
              }
            }
          }
        });

        playerRef.current = dp;

        dp.on("loadeddata", () => {
          setLoading(false);
        });

        dp.on("error", () => {
          setError("视频加载失败，可能需要B站大会员");
          setLoading(false);
        });

      } catch (err: any) {
        console.error("Failed to load video:", err);
        setError(err.message || "视频加载失败");
        setLoading(false);
      }
    };

    initPlayer();

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [bvid, p]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  if (loading) {
    return (
      <div className="relative w-full bg-black rounded-xl overflow-hidden shadow-elevated" style={{ paddingBottom: "56.25%" }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white text-sm">加载视频中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative w-full bg-surface-container rounded-xl overflow-hidden shadow-elevated p-6">
        <div className="text-on-surface-variant text-sm text-center">
          <p className="mb-2">{error}</p>
          <a
            href={`https://www.bilibili.com/video/${bvid}${p > 1 ? `?p=${p}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            在B站打开观看
          </a>
        </div>
      </div>
    );
  }

  // Inline mode with exit button
  if (inlineMode) {
    return (
      <div className="relative w-full bg-black rounded-xl overflow-hidden shadow-elevated">
        {title && (
          <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent px-4 py-3 flex items-center justify-between pointer-events-none">
            <h4 className="text-white text-sm font-medium truncate flex-1 mr-4">{title}</h4>
            <button
              onClick={onExitInline}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors duration-200 flex-shrink-0 pointer-events-auto"
              title="退出播放"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        )}

        <div ref={containerRef} className="w-full" style={{ paddingBottom: "56.25%" }} />

        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 flex items-center justify-end gap-2 pointer-events-none">
          <a
            href={`https://www.bilibili.com/video/${bvid}${p > 1 ? `?p=${p}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors duration-200 pointer-events-auto"
            title="在B站打开"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors duration-200 pointer-events-auto"
            title={isFullscreen ? "退出全屏" : "全屏"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  }

  // Normal mode
  return (
    <div className="relative w-full bg-black rounded-xl overflow-hidden shadow-elevated">
      {title && (
        <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/60 to-transparent px-4 py-3 pointer-events-none">
          <h4 className="text-white text-sm font-medium truncate">{title}</h4>
        </div>
      )}

      <div ref={containerRef} className="w-full" style={{ paddingBottom: "56.25%" }} />

      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 flex items-center justify-end gap-2 pointer-events-none">
        <a
          href={`https://www.bilibili.com/video/${bvid}${p > 1 ? `?p=${p}` : ""}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors duration-200 pointer-events-auto"
          title="在B站打开"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors duration-200 pointer-events-auto"
          title={isFullscreen ? "退出全屏" : "全屏"}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
