"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, Loader2, CheckCircle2, Eye } from "lucide-react";
import { sketchToImage } from "@/lib/ai-drawing";
import { fileToBase64 } from "@/lib/utils";

interface SketchUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (imageUrl: string) => void;
}

export function SketchUploader({ isOpen, onClose, onInsert }: SketchUploaderProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件");
      return;
    }

    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    setPreview(dataUrl);
    setError(null);
    setSuccess(false);
  };

  const handleProcess = async () => {
    if (!preview) return;
    setIsProcessing(true);
    setError(null);

    try {
      const base64 = await fileToBase64(await fetch(preview).then(r => r.blob()).then(b => new File([b], "sketch.png")));
      const imageUrl = await sketchToImage(base64);
      onInsert(imageUrl);
      setSuccess(true);
      
      setTimeout(() => {
        setPreview(null);
        setSuccess(false);
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || "识别失败");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-container-lowest rounded-xl shadow-elevated p-6 max-w-lg w-full"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-on-surface">AI 草图识别</h3>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container-high">
                <X className="w-5 h-5 text-on-surface-variant" />
              </button>
            </div>

            {/* Upload Area */}
            {!preview ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-outline-variant/30 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-surface-container-low transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />
                <Upload className="w-12 h-12 text-on-surface-variant/40 mx-auto mb-3" />
                <p className="text-sm font-medium text-on-surface">拖拽草图到此处，或点击上传</p>
                <p className="text-xs text-on-surface-variant/60 mt-1">支持 JPG、PNG 格式</p>
              </div>
            ) : (
              <div className="mb-4">
                <div className="relative rounded-lg overflow-hidden bg-white">
                  <img src={preview} alt="草图预览" className="w-full max-h-[200px] object-contain" />
                  {isProcessing && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                  )}
                  {success && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-green-500" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500 mb-4">{error}</p>
            )}

            {/* Tips */}
            <div className="mb-4 p-3 bg-surface-container rounded-lg text-xs text-on-surface-variant">
              <p className="font-medium mb-1">支持识别：</p>
              <p>函数图像、几何图形（三角形、圆形等）、坐标系</p>
              <p className="mt-1 text-on-surface-variant/60">手绘越清晰，识别效果越好</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setPreview(null); setError(null); setSuccess(false); }}
                className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors text-sm"
              >
                {preview ? "重新上传" : "取消"}
              </button>
              {preview && (
                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="px-6 py-2 rounded-lg editorial-gradient text-on-primary font-medium hover:opacity-90 transition-opacity text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      AI 识别中...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      识别并插入
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
