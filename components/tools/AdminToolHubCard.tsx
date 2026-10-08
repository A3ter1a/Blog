"use client";

import { Brain, FileDown, GraduationCap, RotateCcw, ScanText } from "lucide-react";
import { ToolHubCard, type ToolHubCardItem } from "@/components/tools/ToolHubCard";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type AdminToolIcon = "brain" | "file" | "graduation" | "review" | "scan";

const adminToolIcons = {
  brain: Brain,
  file: FileDown,
  graduation: GraduationCap,
  review: RotateCcw,
  scan: ScanText,
} as const;

type AdminToolHubCardProps = Omit<ToolHubCardItem, "icon" | "id"> & {
  icon: AdminToolIcon;
};

export function AdminToolHubCard({ icon, ...item }: AdminToolHubCardProps) {
  const { loading, isAdmin } = useAdminAuth();

  if (loading || !isAdmin) return null;

  const resolvedItem: ToolHubCardItem = {
    ...item,
    icon: adminToolIcons[icon],
  };

  return <ToolHubCard item={resolvedItem} />;
}
