"use client";

import { RequestApprovalModal } from "@/components/templates/request-approval-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  TemplateVersionDetail,
  TemplateVersionInfo,
  TemplateVersionStatus,
} from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  FileEdit,
  Lock,
  Plus,
  Send,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import DeleteVersionDialog from "./delete-version-dialog";

/**
 * Props for the VersionTimelineDrawer component
 */
interface VersionTimelineDrawerProps {
  /** Whether the drawer is open */
  open: boolean;
  /** Callback when drawer open state changes */
  onOpenChange: (open: boolean) => void;
  /** Template version info (null while loading) */
  versionInfo: TemplateVersionInfo | null;
  /** Whether data is loading */
  isLoading: boolean;
  /** Template ID for approval requests */
  templateId: string;
  /** Template display name for the header */
  templateName: string;
  /** Locale code for display */
  locale: string;
  /** Callback when user wants to view a version */
  onViewVersion?: (version: TemplateVersionDetail) => void;
  /** Callback when user wants to edit a draft version */
  onEditVersion?: (version: TemplateVersionDetail) => void;
  /** Callback when user wants to create a new draft */
  onCreateDraft?: () => void;
  /** Callback when approval request succeeds */
  onApprovalSuccess?: (version: TemplateVersionDetail) => void;
  /** Callback when user wants to delete a draft version */
  onDeleteDraft?: (version: TemplateVersionDetail) => void;
  /** Callback when user wants to set an approved version as active */
  onSetActiveVersion?: (version: TemplateVersionDetail) => void;
}

/**
 * Configuration for version status display
 */
const VERSION_STATUS_CONFIG: Record<
  TemplateVersionStatus,
  {
    icon: React.ElementType;
    className: string;
    bgClassName: string;
    labelKey: string;
    isImmutable: boolean;
  }
> = {
  draft: {
    icon: FileEdit,
    className: "text-slate-600 dark:text-slate-400",
    bgClassName:
      "bg-slate-100 border-slate-200 dark:bg-slate-800 dark:border-slate-700",
    labelKey: "versionStatus.draft",
    isImmutable: false,
  },
  pending_approval: {
    icon: Clock,
    className: "text-amber-600 dark:text-amber-400",
    bgClassName:
      "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800",
    labelKey: "versionStatus.pending",
    isImmutable: true,
  },
  approved: {
    icon: CheckCircle2,
    className: "text-emerald-600 dark:text-emerald-400",
    bgClassName:
      "bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800",
    labelKey: "versionStatus.approved",
    isImmutable: true,
  },
  rejected: {
    icon: XCircle,
    className: "text-red-600 dark:text-red-400",
    bgClassName: "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
    labelKey: "versionStatus.rejected",
    isImmutable: false,
  },
  disabled: {
    icon: AlertCircle,
    className: "text-slate-500 dark:text-slate-400",
    bgClassName:
      "bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700",
    labelKey: "versionStatus.disabled",
    isImmutable: true,
  },
};

/**
 * Format a date string for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Format relative time from now
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

/**
 * Single version item in the timeline
 */
function VersionTimelineItem({
  version,
  isActive,
  isDraft,
  isOnlyVersion,
  onView,
  onEdit,
  onRequestApproval,
  onDelete,
  onSetActive,
  t,
}: {
  version: TemplateVersionDetail;
  isActive: boolean;
  isDraft: boolean;
  isOnlyVersion: boolean;
  onView?: () => void;
  onEdit?: () => void;
  onRequestApproval?: () => void;
  onDelete?: () => void;
  onSetActive?: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const config = VERSION_STATUS_CONFIG[version.status];
  const StatusIcon = config.icon;

  return (
    <div
      className={cn(
        "relative pl-8 pb-6",
        // Timeline line
        "before:absolute before:left-3 before:top-7 before:h-full before:w-0.5 before:bg-border",
        // Hide line for last item (handled by parent)
        "last:before:hidden last:pb-0"
      )}
    >
      {/* Timeline dot */}
      <div
        className={cn(
          "absolute left-0 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background",
          isActive && "ring-2 ring-emerald-500 ring-offset-2",
          isDraft && "ring-2 ring-blue-500 ring-offset-2",
          config.className
        )}
      >
        <StatusIcon className="h-3.5 w-3.5" />
      </div>

      {/* Version card */}
      <div
        className={cn(
          "rounded-lg border p-4 transition-colors",
          config.bgClassName,
          "hover:shadow-sm"
        )}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">
                {t("versionNumber", { number: version.versionNumber })}
              </span>
              {/* Show status badge only if not a draft (draft shows Current Draft instead) */}
              {!isDraft && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-xs",
                    config.className,
                    config.bgClassName
                  )}
                >
                  {t(config.labelKey)}
                </Badge>
              )}
              {isActive && (
                <Badge
                  variant="default"
                  className="bg-emerald-600 text-white text-xs"
                >
                  {t("activeVersion")}
                </Badge>
              )}
              {isDraft && (
                <Badge
                  variant="default"
                  className="bg-blue-600 text-white text-xs"
                >
                  {t("currentDraft")}
                </Badge>
              )}
              {config.isImmutable && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t("versionImmutable")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatRelativeTime(version.createdAt)} ·{" "}
              {formatDate(version.createdAt)}
            </p>
          </div>
        </div>

        {/* Content preview */}
        {version.content && (
          <div className="mt-3 text-sm text-muted-foreground line-clamp-2">
            {version.content.body}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {/* View button - always available */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={onView}
                >
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  {t("viewVersion")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("viewVersionTooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Edit button - only for draft/rejected */}
          {version.canEdit && onEdit && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={onEdit}
                  >
                    <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                    {t("editVersion")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("editVersionTooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Request Approval button - only for draft versions that can be submitted */}
          {version.canSubmit && onRequestApproval && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={onRequestApproval}
                  >
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    {t("requestApproval")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("requestApprovalTooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Set as Active button - only for approved versions that aren't already active */}
          {version.status === "approved" && !isActive && onSetActive && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={onSetActive}
                  >
                    <Star className="h-3.5 w-3.5 mr-1.5" />
                    {t("setAsActive")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("setAsActiveTooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Delete button - only for draft/rejected and NOT the only version */}
          {version.canDelete && onDelete && !isOnlyVersion && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/50"
                    onClick={onDelete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("deleteVersionTooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* Show tooltip explaining why delete is disabled for last version */}
          {version.canDelete && isOnlyVersion && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-muted-foreground cursor-not-allowed opacity-50"
                    disabled
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {t("cannotDeleteOnlyVersion") ||
                      "Cannot delete the only version"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for the version timeline
 */
function VersionTimelineSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-6 w-6 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state when no versions exist
 */
function EmptyVersionState({
  onCreateDraft,
  t,
}: {
  onCreateDraft?: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <FileEdit className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-medium text-lg mb-2">{t("noVersionsYet")}</h3>
      <p className="text-muted-foreground text-sm mb-4 max-w-sm">
        {t("noVersionsDescription")}
      </p>
      {onCreateDraft && (
        <Button onClick={onCreateDraft}>
          <Plus className="h-4 w-4 mr-2" />
          {t("createFirstVersion")}
        </Button>
      )}
    </div>
  );
}

/**
 * Version Timeline Drawer Component
 *
 * Displays a timeline of all versions for a template locale with actions
 * to view, edit, request approval, delete versions, or set as active.
 */
export function VersionTimelineDrawer({
  open,
  onOpenChange,
  versionInfo,
  isLoading,
  templateId,
  templateName,
  locale,
  onViewVersion,
  onEditVersion,
  onCreateDraft,
  onApprovalSuccess,
  onDeleteDraft,
  onSetActiveVersion,
}: VersionTimelineDrawerProps) {
  const t = useTranslations("templates.versions");
  const tTemplates = useTranslations("templates");

  // State for approval modal
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [versionForApproval, setVersionForApproval] =
    useState<TemplateVersionDetail | null>(null);

  // State for delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [versionToDelete, setVersionToDelete] =
    useState<TemplateVersionDetail | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Handle opening approval modal for a specific version
  const handleRequestApproval = (version: TemplateVersionDetail) => {
    setVersionForApproval(version);
    setApprovalModalOpen(true);
  };

  // Handle opening delete confirmation dialog
  const handleDeleteClick = (version: TemplateVersionDetail) => {
    setVersionToDelete(version);
    setDeleteDialogOpen(true);
  };

  // Handle confirmed deletion
  const handleConfirmDelete = async () => {
    if (!versionToDelete || !onDeleteDraft) return;

    setIsDeleting(true);
    try {
      await onDeleteDraft(versionToDelete);
      setDeleteDialogOpen(false);
      setVersionToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // Combine draft (if exists) with version history, sorted by version number descending
  const allVersions = useMemo(() => {
    if (!versionInfo) return [];

    const versions: TemplateVersionDetail[] = [];

    // Add draft first if it exists
    if (versionInfo.draftVersion) {
      versions.push(versionInfo.draftVersion);
    }

    // Add history (already sorted by backend) - safely handle undefined
    if (
      versionInfo.versionHistory &&
      Array.isArray(versionInfo.versionHistory)
    ) {
      versions.push(...versionInfo.versionHistory);
    }

    // Deduplicate in case draft is also in history
    const seen = new Set<string>();
    return versions.filter((v) => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    });
  }, [versionInfo]);

  const hasVersions = allVersions.length > 0;

  // Backend now correctly returns canCreateNewVersion based only on whether a draft exists
  // (pending versions no longer block creation)
  const canCreateNew = versionInfo?.canCreateNewVersion ?? false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <FileEdit className="h-5 w-5" />
            {t("versionHistory")}
          </SheetTitle>
          <SheetDescription>
            <span className="font-medium">{templateName}</span>
            <span className="mx-2">·</span>
            <span className="uppercase">{locale}</span>
          </SheetDescription>
        </SheetHeader>

        {/* Summary section */}
        {versionInfo && (
          <div className="flex items-center gap-4 py-4 px-4 border-b text-sm">
            {versionInfo.hasActiveVersion && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{t("hasActiveVersion")}</span>
              </div>
            )}
            {versionInfo.hasDraftVersion && versionInfo.draftVersion && (
              <div className="flex items-center gap-1.5">
                {versionInfo.draftVersion.status === "pending_approval" ? (
                  <>
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <span>{t("hasPendingApproval")}</span>
                  </>
                ) : versionInfo.draftVersion.status === "rejected" ? (
                  <>
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span>{t("hasRejectedVersion")}</span>
                  </>
                ) : (
                  <>
                    <FileEdit className="h-4 w-4 text-blue-600" />
                    <span>{t("hasDraftVersion")}</span>
                  </>
                )}
              </div>
            )}
            {!versionInfo.hasActiveVersion && !versionInfo.hasDraftVersion && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span>{t("noActiveOrDraft")}</span>
              </div>
            )}
          </div>
        )}

        {/* Action bar */}
        {canCreateNew && onCreateDraft && (
          <div className="py-3 px-4 border-b">
            <Button onClick={onCreateDraft} className="w-full" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t("createNewDraft")}
            </Button>
          </div>
        )}

        {/* Version timeline */}
        <div className="flex-1 overflow-y-auto h-[calc(100vh-280px)]">
          {isLoading ? (
            <VersionTimelineSkeleton />
          ) : hasVersions ? (
            <div className="p-4">
              {allVersions.map((version) => (
                <VersionTimelineItem
                  key={version.id}
                  version={version}
                  isActive={versionInfo?.activeVersion?.id === version.id}
                  isDraft={
                    versionInfo?.draftVersion?.id === version.id &&
                    version.status === "draft"
                  }
                  isOnlyVersion={allVersions.length === 1}
                  onView={
                    onViewVersion ? () => onViewVersion(version) : undefined
                  }
                  onEdit={
                    version.canEdit && onEditVersion
                      ? () => onEditVersion(version)
                      : undefined
                  }
                  onRequestApproval={
                    version.canSubmit
                      ? () => handleRequestApproval(version)
                      : undefined
                  }
                  onDelete={
                    version.canDelete && onDeleteDraft
                      ? () => handleDeleteClick(version)
                      : undefined
                  }
                  onSetActive={
                    onSetActiveVersion
                      ? () => onSetActiveVersion(version)
                      : undefined
                  }
                  t={t}
                />
              ))}
            </div>
          ) : (
            <EmptyVersionState onCreateDraft={onCreateDraft} t={t} />
          )}
        </div>

        {/* Request Approval Modal */}
        {versionForApproval && (
          <RequestApprovalModal
            open={approvalModalOpen}
            onOpenChange={(open) => {
              setApprovalModalOpen(open);
              if (!open) {
                setVersionForApproval(null);
              }
            }}
            templateId={templateId}
            locale={locale}
            templateName={`${templateName} (${locale.toUpperCase()}) - v${
              versionForApproval.versionNumber
            }`}
            versionNumber={versionForApproval.versionNumber}
            onSuccess={() => {
              setApprovalModalOpen(false);
              setVersionForApproval(null);
              onApprovalSuccess?.(versionForApproval);
            }}
          />
        )}

        {/* Delete Version Confirmation Dialog */}
        <DeleteVersionDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open);
            if (!open) {
              setVersionToDelete(null);
            }
          }}
          version={versionToDelete}
          onConfirm={handleConfirmDelete}
          isDeleting={isDeleting}
        />
      </SheetContent>
    </Sheet>
  );
}

export default VersionTimelineDrawer;
