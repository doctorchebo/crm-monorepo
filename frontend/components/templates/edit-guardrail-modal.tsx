"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TemplateVersionStatus } from "@/lib/api/endpoints";
import { AlertCircle, Clock, Eye, Lock, Plus, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Props for the EditGuardrailModal component
 */
interface EditGuardrailModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal open state changes */
  onOpenChange: (open: boolean) => void;
  /** The status that's preventing editing */
  status: TemplateVersionStatus;
  /** Template name for display */
  templateName: string;
  /** Callback when user wants to create a new draft */
  onCreateDraft?: () => void;
  /** Callback when user wants to view only */
  onViewOnly?: () => void;
}

/**
 * Configuration for different blocked states
 */
const GUARDRAIL_CONFIG: Record<
  TemplateVersionStatus,
  {
    icon: React.ElementType;
    titleKey: string;
    descriptionKey: string;
    suggestionKey?: string;
    showCreateDraft: boolean;
    iconClassName: string;
  }
> = {
  approved: {
    icon: Lock,
    titleKey: "editGuardrail.title",
    descriptionKey: "editGuardrail.description",
    suggestionKey: "editGuardrail.suggestion",
    showCreateDraft: true,
    iconClassName: "text-emerald-600",
  },
  pending_approval: {
    icon: Clock,
    titleKey: "pendingGuardrail.title",
    descriptionKey: "pendingGuardrail.description",
    suggestionKey: "pendingGuardrail.waitMessage",
    showCreateDraft: false,
    iconClassName: "text-amber-600",
  },
  disabled: {
    icon: ShieldAlert,
    titleKey: "editGuardrail.title",
    descriptionKey: "editGuardrail.description",
    suggestionKey: "editGuardrail.suggestion",
    showCreateDraft: true,
    iconClassName: "text-slate-500",
  },
  // These statuses allow editing, so the modal shouldn't appear for them
  draft: {
    icon: AlertCircle,
    titleKey: "editGuardrail.title",
    descriptionKey: "editGuardrail.description",
    showCreateDraft: false,
    iconClassName: "text-slate-600",
  },
  rejected: {
    icon: AlertCircle,
    titleKey: "editGuardrail.title",
    descriptionKey: "editGuardrail.description",
    showCreateDraft: false,
    iconClassName: "text-red-600",
  },
};

/**
 * Edit Guardrail Modal
 *
 * Displays a warning when a user attempts to edit a version that cannot be edited
 * (e.g., approved, pending approval, or disabled versions).
 *
 * Offers options to:
 * - Create a new draft based on the current version
 * - View the version in read-only mode
 */
export function EditGuardrailModal({
  open,
  onOpenChange,
  status,
  templateName,
  onCreateDraft,
  onViewOnly,
}: EditGuardrailModalProps) {
  const t = useTranslations("templates.versions");

  const config = GUARDRAIL_CONFIG[status];
  const StatusIcon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div
              className={`rounded-full p-2 bg-muted ${config.iconClassName}`}
            >
              <StatusIcon className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg">{t(config.titleKey)}</DialogTitle>
          </div>
          <DialogDescription className="text-left space-y-3">
            <p>{t(config.descriptionKey)}</p>
            {config.suggestionKey && (
              <p className="text-sm text-muted-foreground">
                {t(config.suggestionKey)}
              </p>
            )}
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <span className="font-medium">Template:</span> {templateName}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {onViewOnly && (
            <Button variant="outline" onClick={onViewOnly}>
              <Eye className="h-4 w-4 mr-2" />
              {t("editGuardrail.viewOnly")}
            </Button>
          )}
          {config.showCreateDraft && onCreateDraft && (
            <Button onClick={onCreateDraft}>
              <Plus className="h-4 w-4 mr-2" />
              {t("editGuardrail.createDraft")}
            </Button>
          )}
          {!config.showCreateDraft && !onViewOnly && (
            <Button variant="default" onClick={() => onOpenChange(false)}>
              {t("editGuardrail.viewOnly")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditGuardrailModal;
