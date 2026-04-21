"use client";

import { useState } from "react";
import { Send, Image as ImageIcon } from "lucide-react";

interface InputAreaProps {
  onSend: (message: string) => void;
  onImageUpload?: (file: File) => void;
  isLoading?: boolean;
}

export function InputArea({ onSend, onImageUpload, isLoading }: InputAreaProps) {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (message.trim() && !isLoading) {
      onSend(message.trim());
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-outline-variant/15 p-4">
      {/* Text Input */}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="说出你想要的... (Enter 发送, Shift+Enter 换行)"
        rows={3}
        className="w-full px-4 py-3 bg-surface-container-highest rounded-lg resize-none text-on-surface placeholder:text-on-surface-variant/40 focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all duration-300 text-sm"
      />

      {/* Bottom Bar */}
      <div className="flex items-center justify-end mt-3 gap-2">
        {onImageUpload && (
          <label className="p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant/60 hover:text-on-surface-variant transition-colors duration-300 cursor-pointer" title="上传图片进行 OCR 识别">
            <ImageIcon className="w-4 h-4" />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImageUpload(file);
              }}
              className="hidden"
            />
          </label>
        )}
        <button
          onClick={handleSend}
          disabled={!message.trim() || isLoading}
          className="p-2 rounded-lg editorial-gradient text-on-primary disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all duration-300"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
