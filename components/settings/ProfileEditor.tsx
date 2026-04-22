"use client";

import { useState, useRef } from "react";
import { Plus, Trash2, Camera, Edit3, Save, X, ChevronUp, ChevronDown } from "lucide-react";
import { fileToDataUrl } from "@/lib/utils";
import { CustomSelect } from "@/components/ui/CustomSelect";

type LinkVariant = "default" | "secondary" | "dark" | "primary";

interface ProfileLink {
  name: string;
  icon: string;
  href: string;
  variant: LinkVariant;
  linkType?: "link" | "number";
}

interface Profile {
  name: string;
  avatar: string;
  tagline: string;
  badges: string[];
  links: ProfileLink[];
  footer: string;
}

const iconMap: Record<string, string> = {
  mail: "/icons/email.svg",
  github: "/icons/github.svg",
  weibo: "/icons/weibo.svg",
  zhihu: "/icons/zhihu.svg",
  qq: "/icons/qq.svg",
  wechat: "/icons/wechat.svg",
  bilibili: "/icons/bilibili.svg",
  tiktok: "/icons/tiktok.svg",
};

const iconOptions = [
  { value: "qq", label: "QQ", linkType: "number" as const, displayName: "QQ" },
  { value: "wechat", label: "微信", linkType: "number" as const, displayName: "微信" },
  { value: "bilibili", label: "B站", linkType: "link" as const, displayName: "B站" },
  { value: "github", label: "Github", linkType: "link" as const, displayName: "Github" },
  { value: "weibo", label: "微博", linkType: "link" as const, displayName: "微博" },
  { value: "zhihu", label: "知乎", linkType: "link" as const, displayName: "知乎" },
  { value: "tiktok", label: "抖音", linkType: "link" as const, displayName: "抖音" },
  { value: "mail", label: "邮箱", linkType: "link" as const, displayName: "邮箱" },
];

interface ProfileEditorProps {
  profile: Profile;
  onSave: (profile: Profile) => void;
}

export function ProfileEditor({ profile, onSave }: ProfileEditorProps) {
  const [editForm, setEditForm] = useState(profile);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    onSave(editForm);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditForm(profile);
    setIsEditing(false);
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
      links: [...editForm.links, { name: "QQ", icon: "qq", href: "", variant: "default" as LinkVariant, linkType: "number" }],
    });
  };

  const removeLink = (index: number) => {
    setEditForm({ ...editForm, links: editForm.links.filter((_, i) => i !== index) });
  };

  const updateLink = (index: number, field: keyof ProfileLink, value: string) => {
    const newLinks = [...editForm.links];
    newLinks[index] = { ...newLinks[index], [field]: value };

    if (field === "icon") {
      const iconOption = iconOptions.find(opt => opt.value === value);
      if (iconOption) {
        newLinks[index].name = iconOption.displayName;
        newLinks[index].linkType = iconOption.linkType;
      }
    }

    setEditForm({ ...editForm, links: newLinks });
  };

  const moveLink = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= editForm.links.length) return;
    const newLinks = [...editForm.links];
    [newLinks[index], newLinks[newIndex]] = [newLinks[newIndex], newLinks[index]];
    setEditForm({ ...editForm, links: newLinks });
  };

  if (!isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
            Profile
          </h3>
          <button
            onClick={() => {
              setEditForm(profile);
              setIsEditing(true);
            }}
            className="text-sm text-primary hover:text-primary-container transition-colors flex items-center gap-1"
          >
            <Edit3 className="w-4 h-4" />
            编辑
          </button>
        </div>

        <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-surface-container-lowest overflow-hidden flex-shrink-0">
              {profile.avatar ? (
                <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full editorial-gradient flex items-center justify-center text-on-primary text-lg font-bold">
                  {profile.name.slice(0, 2)}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-on-surface">{profile.name}</p>
              <p className="text-xs text-on-surface-variant/60 line-clamp-1">{profile.tagline}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {profile.badges.slice(0, 2).map((badge, i) => (
              <span key={i} className="px-2 py-1 rounded-full bg-surface-container-highest text-xs text-on-surface-variant">
                {badge}
              </span>
            ))}
            {profile.badges.length > 2 && (
              <span className="px-2 py-1 rounded-full bg-surface-container-highest text-xs text-on-surface-variant">
                +{profile.badges.length - 2}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
          Profile
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            className="text-sm text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            取消
          </button>
          <button
            onClick={handleSave}
            className="text-sm text-primary hover:text-primary-container transition-colors flex items-center gap-1 font-medium"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-surface-container-low overflow-hidden">
            {editForm.avatar ? (
              <img src={editForm.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full editorial-gradient flex items-center justify-center text-on-primary text-xl font-bold">
                {editForm.name.slice(0, 2)}
              </div>
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 w-6 h-6 rounded-full editorial-gradient flex items-center justify-center text-on-primary shadow-ambient"
          >
            <Camera className="w-3 h-3" />
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
          className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm"
        />
      </div>

      {/* Tagline */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant mb-2">个性签名</label>
        <textarea
          value={editForm.tagline}
          onChange={(e) => setEditForm({ ...editForm, tagline: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm resize-none"
        />
      </div>

      {/* Badges */}
      <div>
        <div className="flex items-center justify-between mb-2">
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
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-on-surface-variant">社交链接</label>
          <button onClick={addLink} className="text-xs text-primary flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> 添加
          </button>
        </div>
        <div className="space-y-2">
          {editForm.links.map((link, i) => (
            <div key={i} className="bg-surface-container rounded-lg p-2 space-y-2">
              <div className="flex items-center gap-1">
                <div className="flex flex-col gap-0.5 text-on-surface-variant/40">
                  <button
                    onClick={() => moveLink(i, "up")}
                    disabled={i === 0}
                    className="p-0.5 rounded hover:bg-surface-container-high disabled:opacity-30 transition-colors"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => moveLink(i, "down")}
                    disabled={i === editForm.links.length - 1}
                    className="p-0.5 rounded hover:bg-surface-container-high disabled:opacity-30 transition-colors"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                    <img src={iconMap[link.icon] || "/icons/email.svg"} alt={link.name} className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-medium text-on-surface truncate">{link.name}</span>
                </div>
                <button
                  onClick={() => updateLink(i, "linkType", link.linkType === "link" ? "number" : "link")}
                  className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 transition-colors ${
                    link.linkType === "link"
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-highest text-on-surface-variant"
                  }`}
                >
                  {link.linkType === "link" ? "跳转" : "号码"}
                </button>
                <CustomSelect
                  options={iconOptions}
                  value={link.icon}
                  onChange={(value) => updateLink(i, "icon", value)}
                  className="w-20 flex-shrink-0"
                />
                <button
                  onClick={() => removeLink(i)}
                  className="p-1.5 rounded-md hover:bg-red-100 text-on-surface-variant hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="text"
                value={link.href}
                onChange={(e) => updateLink(i, "href", e.target.value)}
                placeholder={link.linkType === "link" ? "链接地址 (https://...)" : "号码/ID"}
                className="w-full px-2 py-1.5 bg-surface-container-highest rounded-md input-soft text-on-surface text-xs"
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
          className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface text-sm"
        />
      </div>
    </div>
  );
}
