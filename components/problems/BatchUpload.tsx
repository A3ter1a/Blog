"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Image as ImageIcon, Loader2, CheckCircle2, XCircle, Trash2, Eye } from "lucide-react";
import { extractFromImage } from "@/lib/ai";
import type { Problem, Difficulty } from "@/lib/types";

interface BatchUploadResult {
  file: File;
  preview: string;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
  problem?: Problem;
}

interface BatchUploadProps {
  onProblemsExtracted: (problems: Problem[]) => void;
}

export function BatchUpload({ onProblemsExtracted }: BatchUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<BatchUploadResult[]>([]);
  const [showPreview, setShowPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(file => 
      file.type.startsWith("image/")
    );

    if (imageFiles.length === 0) return;

    // Initialize results
    const newResults: BatchUploadResult[] = imageFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      status: "pending" as const,
    }));

    setResults(prev => [...prev, ...newResults]);
    setIsProcessing(true);

    // Process each image
    for (let i = 0; i < newResults.length; i++) {
      const result = newResults[i];
      const globalIndex = results.length + i;

      // Update status to processing
      setResults(prev => prev.map((r, idx) => 
        idx === globalIndex ? { ...r, status: "processing" } : r
      ));

      try {
        // Convert to base64
        const base64 = await fileToBase64(result.file);
        
        // OCR extraction - now returns structured data
        const extracted = await extractFromImage(base64.split(",")[1]);
        
        // Convert extracted data to Problem format
        const problem: Problem = {
          id: `${Date.now()}-${globalIndex}`,
          type: extracted.type,
          difficulty: extracted.difficulty,
          question: extracted.question,
          options: extractOptions(extracted.question),
          answer: extracted.answer,
          explanation: extracted.explanation,
          tips: "",
          source: "",
          tags: extracted.tags,
        };

        setResults(prev => prev.map((r, idx) => 
          idx === globalIndex ? { ...r, status: "success", problem } : r
        ));
      } catch (error: any) {
        setResults(prev => prev.map((r, idx) => 
          idx === globalIndex ? { ...r, status: "error", error: error.message } : r
        ));
      }
    }

    setIsProcessing(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const removeResult = (index: number) => {
    setResults(prev => {
      const newResults = [...prev];
      URL.revokeObjectURL(newResults[index].preview);
      return newResults.filter((_, i) => i !== index);
    });
  };

  const clearAll = () => {
    results.forEach(r => URL.revokeObjectURL(r.preview));
    setResults([]);
  };

  const importSuccessProblems = () => {
    const successProblems = results
      .filter(r => r.status === "success" && r.problem)
      .map(r => r.problem!) as Problem[];
    
    if (successProblems.length > 0) {
      onProblemsExtracted(successProblems);
      clearAll();
    }
  };

  const successCount = results.filter(r => r.status === "success").length;
  const errorCount = results.filter(r => r.status === "error").length;

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-outline-variant/30 hover:border-primary/50 hover:bg-surface-container-low"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileInput}
          className="hidden"
        />
        
        <div className="flex flex-col items-center gap-3">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            isDragging ? "bg-primary/10" : "bg-surface-container"
          }`}>
            <Upload className={`w-8 h-8 ${isDragging ? "text-primary" : "text-on-surface-variant"}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-on-surface">
              {isDragging ? "释放以上传图片" : "拖拽题目图片到这里，或点击上传"}
            </p>
            <p className="text-xs text-on-surface-variant/60 mt-1">
              支持 JPG、PNG 格式，可批量上传
            </p>
          </div>
        </div>
      </div>

      {/* Progress & Stats */}
      {results.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low rounded-lg">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-on-surface-variant">
              共 {results.length} 张图片
            </span>
            {successCount > 0 && (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                成功 {successCount}
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <XCircle className="w-4 h-4" />
                失败 {errorCount}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {successCount > 0 && (
              <button
                onClick={importSuccessProblems}
                className="px-4 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
              >
                导入成功的题目 ({successCount})
              </button>
            )}
            <button
              onClick={clearAll}
              className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant text-sm hover:bg-surface-container-highest transition-colors"
            >
              清空
            </button>
          </div>
        </div>
      )}

      {/* Results Grid */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <AnimatePresence>
            {results.map((result, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative bg-surface-container-low rounded-xl overflow-hidden group"
              >
                {/* Image Preview */}
                <div className="aspect-square relative overflow-hidden bg-surface-container">
                  <img
                    src={result.preview}
                    alt={`题目 ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Status Overlay */}
                  <div className={`absolute inset-0 flex items-center justify-center ${
                    result.status === "processing" ? "bg-black/50" : ""
                  }`}>
                    {result.status === "processing" && (
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    )}
                    {result.status === "success" && (
                      <CheckCircle2 className="w-8 h-8 text-green-500" />
                    )}
                    {result.status === "error" && (
                      <XCircle className="w-8 h-8 text-red-500" />
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPreview(result.preview);
                      }}
                      className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                      title="预览"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeResult(index);
                      }}
                      className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-red-500 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-xs text-on-surface-variant truncate">
                    {result.file.name}
                  </p>
                  {result.status === "error" && result.error && (
                    <p className="text-xs text-red-500 mt-1 line-clamp-2">
                      {result.error}
                    </p>
                  )}
                  {result.status === "success" && result.problem && (
                    <p className="text-xs text-green-600 mt-1 truncate">
                      {result.problem.question.slice(0, 30)}...
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Full Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowPreview(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setShowPreview(null)}
              className="absolute -top-10 right-0 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
            <img
              src={showPreview}
              alt="题目预览"
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Utility functions
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function extractOptions(content: string) {
  const options = [];
  const labels = ["A", "B", "C", "D", "E", "F"];
  
  for (const label of labels) {
    const regex = new RegExp(`${label}[\\.、]\\s*([^\\n]+)`, "i");
    const match = content.match(regex);
    if (match) {
      options.push({ label, content: match[1].trim() });
    }
  }
  
  return options.length > 0 ? options : undefined;
}
