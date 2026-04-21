"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, GitFork, Globe, MessageCircle,
  Edit3, Save, X, Camera, Plus, Trash2, ChevronUp
} from "lucide-react";
import { fileToDataUrl } from "@/lib/utils";
import { CustomSelect } from "@/components/ui/CustomSelect";

// Default profile data
const defaultProfile = {
  name: "A3ter1a",
  avatar: "",
  tagline: "博观而约取，厚积而薄发。在这场孤独的修行中，我们终将听见远方的回响。",
  badges: ["星月女神 Asteria", "考研人 | 数学 · 英语 · 政治 · 经济学"],
  links: [
    { name: "微博", icon: "globe", href: "#", variant: "default" as const },
    { name: "知乎", icon: "messageCircle", href: "#", variant: "secondary" as const },
    { name: "Github", icon: "gitFork", href: "#", variant: "dark" as const },
    { name: "联系我", icon: "mail", href: "mailto:your@email.com", variant: "primary" as const },
  ],
  footer: "Asteroid — 知识的沉淀与共鸣",
};

type LinkVariant = "default" | "secondary" | "dark" | "primary";

interface ProfileLink {
  name: string;
  icon: string;
  href: string;
  variant: LinkVariant;
}

const iconMap: Record<string, any> = {
  mail: Mail,
  gitFork: GitFork,
  globe: Globe,
  messageCircle: MessageCircle,
};

export default function About() {
  const [profile, setProfile] = useState(defaultProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(defaultProfile);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("about-profile");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProfile(parsed);
        setEditForm(parsed);
      } catch {}
    }
  }, []);

  const handleSave = () => {
    setProfile(editForm);
    localStorage.setItem("about-profile", JSON.stringify(editForm));
    setIsEditing(false);
    setShowEditPanel(false);
  };

  const handleCancel = () => {
    setEditForm(profile);
    setIsEditing(false);
    setShowEditPanel(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const dataUrl = await fileToDataUrl(file);
      setEditForm({ ...editForm, avatar: dataUrl });
    }
  };

  const addBadge = () => {
    setEditForm({ ...editForm, badges: [...editForm.badges, "新标签"] });
  };

  const removeBadge = (index: number) => {
    setEditForm({ ...editForm, badges: editForm.badges.filter((_, i) => i !== index) });
  };

  const updateBadge = (index: number, value: string) => {
    const newBadges = [...editForm.badges];
    newBadges[index] = value;
    setEditForm({ ...editForm, badges: newBadges });
  };

  const addLink = () => {
    setEditForm({
      ...editForm,
      links: [...editForm.links, { name: "新链接", icon: "globe", href: "#", variant: "default" as LinkVariant }],
    });
  };

  const removeLink = (index: number) => {
    setEditForm({ ...editForm, links: editForm.links.filter((_, i) => i !== index) });
  };

  const updateLink = (index: number, field: keyof ProfileLink, value: string) => {
    const newLinks = [...editForm.links];
    newLinks[index] = { ...newLinks[index], [field]: value };
    setEditForm({ ...editForm, links: newLinks });
  };

  return (
    <main className="pt-32 pb-12 px-6 min-h-screen flex flex-col items-center">
      {/* Edit Button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        onClick={() => {
          setEditForm(profile);
          setIsEditing(true);
          setShowEditPanel(true);
        }}
        className="fixed top-24 right-6 z-30 p-3 rounded-full bg-surface-container-low shadow-ambient hover:bg-surface-container-high transition-colors duration-200 text-on-surface-variant"
        aria-label="编辑个人资料"
      >
        <Edit3 className="w-5 h-5" />
      </motion.button>

      {/* Profile Header */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center text-center max-w-2xl w-full mb-16"
      >
        {/* Avatar */}
        <div className="relative mb-8 group">
          <div className="absolute inset-0 editorial-gradient rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
          <div className="relative w-32 h-32 md:w-40 md:h-40 rounded-full bg-surface-container-lowest ring-1 ring-outline-variant/15 overflow-hidden">
            {profile.avatar ? (
              <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full editorial-gradient flex items-center justify-center text-on-primary text-4xl font-bold font-headline">
                {profile.name.slice(0, 2)}
              </div>
            )}
          </div>
        </div>

        {/* Name */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-4xl md:text-5xl font-bold text-primary mb-4 tracking-tight font-headline"
        >
          {profile.name}
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-on-surface-variant font-headline text-lg italic md:text-xl leading-relaxed max-w-md"
        >
          {profile.tagline}
        </motion.p>

        {/* Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-6 flex flex-wrap gap-3 justify-center"
        >
          {profile.badges.map((badge, i) => (
            <span
              key={i}
              className="px-4 py-2 rounded-full bg-surface-container-low text-sm text-on-surface-variant"
            >
              {badge}
            </span>
          ))}
        </motion.div>
      </motion.section>

      {/* Links - Apple Card Style */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="w-full max-w-md"
      >
        <div className="bg-surface-container-lowest rounded-2xl shadow-ambient overflow-hidden divide-y divide-outline-variant/10">
          {profile.links.map((link, index) => {
            const Icon = iconMap[link.icon] || Globe;
            const isPrimary = link.variant === "primary";

            return (
              <motion.a
                key={`${link.name}-${index}`}
                href={link.href}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + index * 0.1, duration: 0.4 }}
                whileHover={{ backgroundColor: isPrimary ? "rgba(0,59,110,0.9)" : "rgba(234,232,231,0.8)" }}
                className={`group flex items-center justify-between p-4 transition-all duration-200 ${
                  isPrimary ? "editorial-gradient text-on-primary" : "text-on-surface"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isPrimary
                        ? "bg-on-primary/10 backdrop-blur-sm text-on-primary"
                        : link.variant === "dark"
                        ? "bg-on-surface text-surface"
                        : "editorial-gradient text-on-primary"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="font-medium">{link.name}</span>
                </div>
                <svg
                  className={`w-5 h-5 transition-transform duration-200 group-hover:translate-x-0.5 ${
                    isPrimary ? "text-on-primary/50" : "text-outline-variant"
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </motion.a>
            );
          })}
        </div>
      </motion.section>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="mt-24 text-center"
      >
        <p className="text-on-surface-variant/60 text-sm tracking-widest font-headline italic">
          {profile.footer}
        </p>
      </motion.footer>

      {/* Edit Panel - Apple Style Bottom Sheet */}
      <AnimatePresence>
        {showEditPanel && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={handleCancel}
            />

            {/* Panel */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-surface-container-lowest rounded-t-3xl shadow-elevated max-h-[90vh] overflow-hidden flex flex-col"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-outline-variant/30" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-outline-variant/10">
                <button onClick={handleCancel} className="text-primary text-sm font-medium">
                  取消
                </button>
                <h2 className="text-lg font-bold text-on-surface">编辑个人资料</h2>
                <button onClick={handleSave} className="text-primary text-sm font-bold">
                  完成
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-surface-container-low overflow-hidden">
                      {editForm.avatar ? (
                        <img src={editForm.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full editorial-gradient flex items-center justify-center text-on-primary text-2xl font-bold">
                          {editForm.name.slice(0, 2)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-0 right-0 w-7 h-7 rounded-full editorial-gradient flex items-center justify-center text-on-primary shadow-ambient"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-on-surface">头像</p>
                    <p className="text-xs text-on-surface-variant/60">点击相机图标更换</p>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-2">昵称</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-4 py-3 bg-surface-container-highest rounded-xl input-soft text-on-surface"
                  />
                </div>

                {/* Tagline */}
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-2">个性签名</label>
                  <textarea
                    value={editForm.tagline}
                    onChange={(e) => setEditForm({ ...editForm, tagline: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 bg-surface-container-highest rounded-xl input-soft text-on-surface resize-none"
                  />
                </div>

                {/* Badges */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-medium text-on-surface-variant">身份标签</label>
                    <button onClick={addBadge} className="text-xs text-primary flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> 添加
                    </button>
                  </div>
                  <div className="space-y-2">
                    {editForm.badges.map((badge, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          value={badge}
                          onChange={(e) => updateBadge(i, e.target.value)}
                          className="flex-1 px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm"
                        />
                        <button
                          onClick={() => removeBadge(i)}
                          className="p-2 rounded-lg hover:bg-red-100 text-on-surface-variant hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Links */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-medium text-on-surface-variant">社交链接</label>
                    <button onClick={addLink} className="text-xs text-primary flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> 添加
                    </button>
                  </div>
                  <div className="space-y-3">
                    {editForm.links.map((link, i) => (
                      <div key={i} className="bg-surface-container rounded-xl p-3 space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={link.name}
                            onChange={(e) => updateLink(i, "name", e.target.value)}
                            placeholder="名称"
                            className="flex-1 px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm"
                          />
                          <CustomSelect
                            options={[
                              { value: "globe", label: "链接" },
                              { value: "mail", label: "邮件" },
                              { value: "gitFork", label: "代码" },
                              { value: "messageCircle", label: "社区" },
                            ]}
                            value={link.icon}
                            onChange={(value) => updateLink(i, "icon", value)}
                            className="w-24"
                          />
                          <button
                            onClick={() => removeLink(i)}
                            className="p-2 rounded-lg hover:bg-red-100 text-on-surface-variant hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={link.href}
                          onChange={(e) => updateLink(i, "href", e.target.value)}
                          placeholder="链接地址"
                          className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Text */}
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-2">页脚文字</label>
                  <input
                    type="text"
                    value={editForm.footer}
                    onChange={(e) => setEditForm({ ...editForm, footer: e.target.value })}
                    className="w-full px-4 py-3 bg-surface-container-highest rounded-xl input-soft text-on-surface"
                  />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
