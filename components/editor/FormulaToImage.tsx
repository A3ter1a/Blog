"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import katex from "katex";
import { uploadImage, generateFileName } from "@/lib/supabase-storage";

interface FormulaToImageProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (imageUrl: string) => void;
}

export function FormulaToImage({ isOpen, onClose, onInsert }: FormulaToImageProps) {
  const [formula, setFormula] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 实时预览
  const handleFormulaChange = (value: string) => {
    setFormula(value);
    setError(null);
    
    try {
      const html = katex.renderToString(value, {
        throwOnError: false,
        displayMode: true,
      });
      setPreview(html);
    } catch {
      setPreview(null);
      setError("公式语法错误");
    }
  };

  // 转换为图片并上传
  const handleConvert = async () => {
    if (!formula.trim()) return;
    setIsProcessing(true);
    setError(null);

    try {
      // 渲染为 SVG
      const svg = katex.renderToString(formula, {
        throwOnError: false,
        displayMode: true,
      });

      // 创建 Canvas 并绘制
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("无法创建 Canvas");

      // 设置画布大小
      canvas.width = 600;
      canvas.height = 200;

      // 白色背景
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 将 SVG 转为图片
      const svgBlob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("图片加载失败"));
        img.src = url;
      });

      // 居中绘制
      const scale = Math.min(
        (canvas.width - 40) / img.width,
        (canvas.height - 40) / img.height,
        1
      );
      const x = (canvas.width - img.width * scale) / 2;
      const y = (canvas.height - img.height * scale) / 2;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

      URL.revokeObjectURL(url);

      // 转为 PNG 并上传
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), "image/png");
      });

      const file = new File([blob], "formula.png", { type: "image/png" });
      const path = generateFileName("formula", "png");
      const imageUrl = await uploadImage(file, path);

      onInsert(imageUrl);
      setFormula("");
      setPreview(null);
      onClose();
    } catch (err: any) {
      setError(err.message || "转换失败");
    } finally {
      setIsProcessing(false);
    }
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
              <h3 className="text-lg font-bold text-on-surface">公式转图片</h3>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container-high">
                <X className="w-5 h-5 text-on-surface-variant" />
              </button>
            </div>

            {/* Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-on-surface-variant mb-2">
                输入 LaTeX 公式
              </label>
              <textarea
                value={formula}
                onChange={(e) => handleFormulaChange(e.target.value)}
                placeholder="例如：E = mc^2 或 \\int_0^\\infty e^{-x^2} dx"
                className="w-full px-4 py-3 bg-surface-container-low rounded-lg input-soft text-on-surface placeholder:text-on-surface-variant/40 font-mono text-sm min-h-[80px]"
                rows={3}
              />
            </div>

            {/* Preview */}
            {preview && (
              <div className="mb-4 p-4 bg-white rounded-lg min-h-[60px] flex items-center justify-center">
                <div dangerouslySetInnerHTML={{ __html: preview }} />
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500 mb-4">{error}</p>
            )}

            {/* Tips */}
            <div className="mb-4 p-3 bg-surface-container rounded-lg text-xs text-on-surface-variant">
              <p className="font-medium mb-1">常用语法：</p>
              <p>分数：{"\\frac{a}{b}"} | 上标：{"x^2"} | 下标：{"x_i"}</p>
              <p>积分：{"\\int_a^b"} | 求和：{"\\sum"} | 根号：{"\\sqrt{x}"}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors text-sm"
              >
                取消
              </button>
              <button
                onClick={handleConvert}
                disabled={!formula.trim() || isProcessing}
                className="px-6 py-2 rounded-lg editorial-gradient text-on-primary font-medium hover:opacity-90 transition-opacity text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    转换中...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    转换并插入
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
