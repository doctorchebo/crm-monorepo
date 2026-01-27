"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { WorkflowWithDetails } from "@/lib/types/workflow.types";
import {
  ArrowLeft,
  Check,
  Clock,
  Download,
  History,
  Loader2,
  MoreHorizontal,
  Play,
  Redo2,
  Save,
  Settings,
  Undo2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { VersionHistoryDrawer } from "./version-history-drawer";
import { WorkflowIcon } from "./workflow-icon";

interface WorkflowHeaderProps {
  workflow: WorkflowWithDetails;
  saving: boolean;
  hasUnsavedChanges: boolean;
  onSave: () => void;
  onPublish: () => void;
  onUpdate: (updates: Partial<WorkflowWithDetails>) => void;
  /**
   * Called when user clicks the back button.
   * Parent component should handle navigation guard logic.
   */
  onBack: () => void;
  /**
   * Called when a version is restored. Parent should refetch the workflow.
   */
  onVersionRestore?: () => void;
}

/**
 * Status badge configuration for all workflow statuses.
 * Maps to the workflow_status enum in the database schema.
 */
const STATUS_BADGES: Record<string, { color: string; label: string }> = {
  draft: { color: "bg-yellow-500", label: "Draft" },
  published: { color: "bg-green-500", label: "Published" },
  active: { color: "bg-blue-500", label: "Active" },
  paused: { color: "bg-orange-500", label: "Paused" },
  archived: { color: "bg-gray-500", label: "Archived" },
  disabled: { color: "bg-red-500", label: "Disabled" },
};

/**
 * Default status for when workflow.status is undefined or unknown.
 * This provides a fallback that works with both the badge styling and translations.
 */
const DEFAULT_STATUS = "draft";

export function WorkflowHeader({
  workflow,
  saving,
  hasUnsavedChanges,
  onSave,
  onPublish,
  onUpdate,
  onBack,
  onVersionRestore,
}: WorkflowHeaderProps) {
  const t = useTranslations("workflows.editor");
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(workflow.name);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);

  // Sync local name state when workflow.name prop changes (e.g., after version restore)
  useEffect(() => {
    setName(workflow.name);
  }, [workflow.name]);

  const handleNameSubmit = () => {
    if (name.trim() && name !== workflow.name) {
      onUpdate({ name: name.trim() });
    }
    setEditingName(false);
  };

  // Normalize status - use default if undefined or not in STATUS_BADGES
  const normalizedStatus =
    workflow.status && STATUS_BADGES[workflow.status]
      ? workflow.status
      : DEFAULT_STATUS;
  const statusBadge = STATUS_BADGES[normalizedStatus];

  return (
    <header className="h-14 border-b bg-background flex items-center px-4 gap-2 flex-shrink-0">
      {/* Back button */}
      <Button variant="ghost" size="icon" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Workflow icon and name */}
      <div className="flex items-center gap-2">
        <WorkflowIcon icon={workflow.icon} color={workflow.color} size="md" />

        {editingName ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNameSubmit();
              if (e.key === "Escape") {
                setName(workflow.name);
                setEditingName(false);
              }
            }}
            className="h-7 w-48 text-sm font-medium"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="text-sm font-medium hover:text-primary transition-colors"
          >
            {workflow.name}
          </button>
        )}

        {/* Status badge */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${statusBadge.color}`} />
          <span className="text-xs text-muted-foreground">
            {t(`status.${normalizedStatus}`)}
          </span>
        </div>

        {/* Version */}
        <span className="text-xs text-muted-foreground">
          v{workflow.version}
        </span>
      </div>

      <div className="flex-1" />

      {/* Undo/Redo */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" disabled>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" disabled>
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Unsaved changes indicator */}
      {hasUnsavedChanges && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{t("unsavedChanges")}</span>
        </div>
      )}

      {/* Save button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onSave}
        disabled={saving || !hasUnsavedChanges}
      >
        {saving ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        {t("actions.save")}
      </Button>

      {/* Publish button */}
      <Button
        size="sm"
        onClick={onPublish}
        disabled={workflow.status === "published" && !hasUnsavedChanges}
      >
        {workflow.status === "published" ? (
          <>
            <Check className="mr-2 h-4 w-4" />
            {t("actions.published")}
          </>
        ) : (
          <>
            <Play className="mr-2 h-4 w-4" />
            {t("actions.publish")}
          </>
        )}
      </Button>

      {/* More options */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setVersionHistoryOpen(true)}>
            <History className="mr-2 h-4 w-4" />
            {t("actions.versionHistory")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Download className="mr-2 h-4 w-4" />
            {t("actions.export")}
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Upload className="mr-2 h-4 w-4" />
            {t("actions.import")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Settings className="mr-2 h-4 w-4" />
            {t("actions.settings")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Version History Drawer */}
      <VersionHistoryDrawer
        workflowId={workflow.id}
        currentVersion={workflow.version}
        isOpen={versionHistoryOpen}
        onClose={() => setVersionHistoryOpen(false)}
        onRestore={(version) => {
          setVersionHistoryOpen(false);
          onVersionRestore?.();
        }}
      />
    </header>
  );
}
