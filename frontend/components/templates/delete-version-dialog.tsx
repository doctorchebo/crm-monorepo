"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TemplateVersionDetail } from "@/lib/api/endpoints";
import { AlertTriangle, FileEdit, Trash2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Props for the DeleteVersionDialog component
 */
interface DeleteVersionDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** The version to delete (null when dialog is closed) */
  version: TemplateVersionDetail | null;
  /** Callback when user confirms deletion */
  onConfirm: () => void;
  /** Whether deletion is in progress */
  isDeleting?: boolean;
}

/**
 * Get status badge configuration
 */
function getStatusConfig(status: string) {
  switch (status) {
    case "draft":
      return {
        icon: FileEdit,
        className:
          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        labelKey: "versionStatus.draft",
      };
    case "rejected":
      return {
        icon: XCircle,
        className:
          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        labelKey: "versionStatus.rejected",
      };
    default:
      return {
        icon: FileEdit,
        className:
          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        labelKey: "versionStatus.draft",
      };
  }
}

/**
 * Delete Version Dialog Component
 *
 * A confirmation dialog that displays version details and asks
 * the user to confirm before deleting a template version.
 *
 * Features:
 * - Shows version number and status
 * - Displays content preview if available
 * - Warning about irreversible action
 * - Loading state during deletion
 */
export function DeleteVersionDialog({
  open,
  onOpenChange,
  version,
  onConfirm,
  isDeleting = false,
}: DeleteVersionDialogProps) {
  const t = useTranslations("templates.versions");
  const tCommon = useTranslations("common");

  if (!version) {
    return null;
  }

  const statusConfig = getStatusConfig(version.status);
  const StatusIcon = statusConfig.icon;

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <span>{t("deleteDialog.title")}</span>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4">
              {/* Version info card */}
              <div className="rounded-lg border bg-muted/50 p-4 mt-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-foreground">
                    {t("versionNumber", { number: version.versionNumber })}
                  </span>
                  <Badge variant="secondary" className={statusConfig.className}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {t(statusConfig.labelKey)}
                  </Badge>
                </div>
                {/* Content preview */}
                {version.content?.body && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {version.content.body}
                  </p>
                )}
              </div>

              {/* Warning message */}
              <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="text-sm">{t("deleteDialog.warning")}</p>
              </div>

              <p className="text-sm text-muted-foreground">
                {t("deleteDialog.description")}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isDeleting ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                {t("deleteDialog.deleting")}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                {t("deleteDialog.confirm")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteVersionDialog;
