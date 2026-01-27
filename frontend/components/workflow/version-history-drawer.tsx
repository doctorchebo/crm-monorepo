"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { workflowBuilderApi } from "@/lib/api/workflow-builder";
import type { WorkflowVersion } from "@/lib/types/workflow.types";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, Clock, GitBranch, RotateCcw, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

interface VersionHistoryDrawerProps {
  workflowId: string;
  currentVersion: number;
  isOpen: boolean;
  onClose: () => void;
  onRestore: (version: WorkflowVersion) => void;
}

/**
 * Version History Drawer Component
 *
 * Displays the version history of a workflow, allowing users to view
 * previous versions and restore them if needed.
 *
 * Features:
 * - Lists all versions with timestamps and change notes
 * - Highlights current version
 * - Allows restoring to any previous version
 * - Shows loading and error states
 */
export function VersionHistoryDrawer({
  workflowId,
  currentVersion,
  isOpen,
  onClose,
  onRestore,
}: VersionHistoryDrawerProps) {
  const t = useTranslations("workflows.versionHistory");
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  const fetchVersions = useCallback(async () => {
    if (!workflowId || !isOpen) return;

    setLoading(true);
    setError(null);

    try {
      const data = await workflowBuilderApi.versions.list(workflowId);
      // Sort by version descending (newest first)
      setVersions(data.sort((a, b) => b.version - a.version));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workflowId, isOpen, t]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleRestore = async (version: WorkflowVersion) => {
    if (version.version === currentVersion) return;

    setRestoringVersion(version.version);

    try {
      await workflowBuilderApi.versions.restore(workflowId, version.version);
      onRestore(version);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.restoreFailed"));
    } finally {
      setRestoringVersion(null);
    }
  };

  const formatVersionDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return dateString;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:w-[540px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            {t("title")}
          </SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-hidden mt-6">
          {loading ? (
            <VersionHistoryLoading />
          ) : error ? (
            <VersionHistoryError error={error} onRetry={fetchVersions} />
          ) : versions.length === 0 ? (
            <VersionHistoryEmpty />
          ) : (
            <ScrollArea className="h-full pr-4">
              <div className="space-y-3">
                {versions.map((version) => (
                  <VersionCard
                    key={version.id}
                    version={version}
                    isCurrent={version.version === currentVersion}
                    isRestoring={restoringVersion === version.version}
                    formatDate={formatVersionDate}
                    onRestore={() => handleRestore(version)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface VersionCardProps {
  version: WorkflowVersion;
  isCurrent: boolean;
  isRestoring: boolean;
  formatDate: (date: string) => string;
  onRestore: () => void;
}

function VersionCard({
  version,
  isCurrent,
  isRestoring,
  formatDate,
  onRestore,
}: VersionCardProps) {
  const t = useTranslations("workflows.versionHistory");

  return (
    <div
      className={`
        rounded-lg border p-4 transition-colors
        ${isCurrent ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"}
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">
              {t("versionLabel", { version: version.version })}
            </span>
            {isCurrent && (
              <Badge variant="default" className="text-xs">
                {t("current")}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(version.createdAt)}
            </span>
            {version.createdBy && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {t("publishedBy", { userId: version.createdBy })}
              </span>
            )}
          </div>

          {version.changeSummary && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {version.changeSummary}
            </p>
          )}

          {/* Version stats */}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>
              {t("nodesCount", { count: version.snapshot.nodes?.length ?? 0 })}
            </span>
            <span>
              {t("connectionsCount", {
                count: version.snapshot.connections?.length ?? 0,
              })}
            </span>
          </div>
        </div>

        {!isCurrent && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRestore}
            disabled={isRestoring}
          >
            <RotateCcw
              className={`mr-1.5 h-3.5 w-3.5 ${isRestoring ? "animate-spin" : ""}`}
            />
            {isRestoring ? t("restoring") : t("restore")}
          </Button>
        )}
      </div>
    </div>
  );
}

function VersionHistoryLoading() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function VersionHistoryError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  const t = useTranslations("workflows.versionHistory");

  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <p className="text-sm text-muted-foreground mb-4">{error}</p>
      <Button variant="outline" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}

function VersionHistoryEmpty() {
  const t = useTranslations("workflows.versionHistory");

  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <GitBranch className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <h3 className="font-medium mb-1">{t("empty.title")}</h3>
      <p className="text-sm text-muted-foreground">{t("empty.description")}</p>
    </div>
  );
}
