"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRange, DateRangeFilter } from "@/components/ui/date-range-filter";
import { Pagination } from "@/components/ui/pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivityLogs } from "@/hooks/use-activity-logs";
import type {
  ActivityLogEntry,
  GlobalStageHistoryEntry,
} from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Clock,
  Edit2,
  History,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Trash2,
  User,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

interface GlobalActivityPanelProps {
  /** Maximum number of history entries to load (for legacy mode) */
  limit?: number;
  /** Callback when a chat is clicked */
  onChatClick?: (chatId: string) => void;
  /**
   * Use paginated mode with date filtering.
   * When true, uses the new activity_logs API with pagination.
   * When false (default), uses the legacy getGlobalStageHistory API.
   */
  usePagination?: boolean;
  /** Whether to show date range filter (only in paginated mode) */
  showDateFilter?: boolean;
  /** Initial page size for pagination */
  pageSize?: number;
}

/**
 * Format relative time for display
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Get icon for trigger type
 */
function getTriggerIcon(triggerType: string) {
  switch (triggerType) {
    case "ai":
      return Bot;
    case "human":
      return User;
    case "rule":
      return Zap;
    case "system":
    default:
      return Settings;
  }
}

interface GlobalActivityItemProps {
  entry: GlobalStageHistoryEntry;
  onChatClick?: (chatId: string) => void;
}

/**
 * Single activity item showing a global stage transition
 */
const GlobalActivityItem = memo(function GlobalActivityItem({
  entry,
  onChatClick,
}: GlobalActivityItemProps) {
  const t = useTranslations("pipeline");
  const TriggerIcon = getTriggerIcon(entry.triggerType);

  // Get participant display name
  const participantDisplay =
    entry.participantName || entry.participantPhone || entry.chatId;

  // Get trigger by text
  const getTriggerByText = () => {
    switch (entry.triggerType) {
      case "ai":
        return t("triggeredByAI");
      case "human":
        return entry.triggeredByName
          ? t("triggeredBy", { name: entry.triggeredByName })
          : null;
      case "rule":
        return t("triggeredByRule");
      case "system":
        return t("triggeredBySystem");
      default:
        return null;
    }
  };

  const triggerByText = getTriggerByText();

  return (
    <button
      type="button"
      onClick={() => onChatClick?.(entry.chatId)}
      className="w-full flex gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left"
    >
      {/* Trigger icon */}
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          entry.triggerType === "ai" && "bg-purple-100 text-purple-600",
          entry.triggerType === "human" && "bg-blue-100 text-blue-600",
          entry.triggerType === "rule" && "bg-amber-100 text-amber-600",
          entry.triggerType === "system" && "bg-gray-100 text-gray-600",
        )}
      >
        <TriggerIcon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Participant name */}
        <p className="text-sm font-medium truncate mb-1">
          {participantDisplay}
        </p>

        {/* Stage transition */}
        <div className="flex items-center gap-2 flex-wrap">
          {entry.fromStageName && (
            <Badge
              variant="outline"
              className="text-xs h-5"
              style={{
                borderColor: entry.fromStageColor || undefined,
                color: entry.fromStageColor || undefined,
              }}
            >
              {entry.fromStageName}
            </Badge>
          )}
          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
          {entry.toStageName && (
            <Badge
              variant="secondary"
              className="text-xs h-5"
              style={{
                backgroundColor: `${entry.toStageColor}20`,
                color: entry.toStageColor || undefined,
              }}
            >
              {entry.toStageName}
            </Badge>
          )}
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          {triggerByText && <span>{triggerByText}</span>}
          {entry.createdAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(entry.createdAt)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

/**
 * Get icon for activity type
 */
function getActivityTypeIcon(activityType: string) {
  switch (activityType) {
    case "stage_created":
      return Plus;
    case "stage_updated":
      return Edit2;
    case "stage_deleted":
      return Trash2;
    case "stage_reordered":
      return RotateCcw;
    case "stage_default_changed":
      return Settings;
    case "chat_transitioned":
      return ArrowRight;
    case "handoff_requested":
    case "handoff_resolved":
      return User;
    case "ai_paused":
    case "ai_resumed":
      return Bot;
    default:
      return Clock;
  }
}

/**
 * Get color classes for activity type
 */
function getActivityTypeColors(activityType: string): {
  bg: string;
  text: string;
} {
  switch (activityType) {
    case "stage_created":
      return { bg: "bg-green-100", text: "text-green-600" };
    case "stage_updated":
      return { bg: "bg-blue-100", text: "text-blue-600" };
    case "stage_deleted":
      return { bg: "bg-red-100", text: "text-red-600" };
    case "stage_reordered":
      return { bg: "bg-amber-100", text: "text-amber-600" };
    case "stage_default_changed":
      return { bg: "bg-purple-100", text: "text-purple-600" };
    case "chat_transitioned":
      return { bg: "bg-indigo-100", text: "text-indigo-600" };
    case "handoff_requested":
      return { bg: "bg-orange-100", text: "text-orange-600" };
    case "handoff_resolved":
      return { bg: "bg-emerald-100", text: "text-emerald-600" };
    case "ai_paused":
      return { bg: "bg-gray-100", text: "text-gray-600" };
    case "ai_resumed":
      return { bg: "bg-cyan-100", text: "text-cyan-600" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-600" };
  }
}

interface ActivityLogItemProps {
  entry: ActivityLogEntry;
  onChatClick?: (chatId: string) => void;
}

/**
 * Activity log item for the new paginated activity logs
 */
const ActivityLogItem = memo(function ActivityLogItem({
  entry,
  onChatClick,
}: ActivityLogItemProps) {
  const t = useTranslations("activity");
  const Icon = getActivityTypeIcon(entry.activityType);
  const colors = getActivityTypeColors(entry.activityType);

  const isClickable = entry.chatId && onChatClick;

  const handleClick = useCallback(() => {
    if (isClickable && entry.chatId) {
      onChatClick?.(entry.chatId);
    }
  }, [isClickable, entry.chatId, onChatClick]);

  // Get description based on activity type
  const getDescription = () => {
    if (entry.description) {
      return entry.description;
    }

    const name = entry.entityName || t("unknown");

    switch (entry.activityType) {
      case "stage_created":
        return t("stageCreatedDesc", { name });
      case "stage_updated":
        return t("stageUpdatedDesc", { name });
      case "stage_deleted":
        return t("stageDeletedDesc", { name });
      case "stage_reordered":
        return t("stagesReorderedDesc");
      case "stage_default_changed":
        return t("defaultChangedDesc", { name });
      default:
        return entry.activityType;
    }
  };

  // Get activity type label
  const getActivityLabel = () => {
    switch (entry.activityType) {
      case "stage_created":
        return t("activityStageCreated");
      case "stage_updated":
        return t("activityStageUpdated");
      case "stage_deleted":
        return t("activityStageDeleted");
      case "stage_reordered":
        return t("activityStageReordered");
      case "stage_default_changed":
        return t("activityDefaultChanged");
      case "chat_transitioned":
        return t("activityChatTransitioned");
      default:
        return entry.activityType;
    }
  };

  const Component = isClickable ? "button" : "div";

  return (
    <Component
      type={isClickable ? "button" : undefined}
      onClick={isClickable ? handleClick : undefined}
      className={cn(
        "w-full flex gap-3 p-3 rounded-lg border bg-card text-left",
        isClickable && "hover:bg-accent/50 transition-colors cursor-pointer",
      )}
    >
      {/* Activity type icon */}
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          colors.bg,
          colors.text,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Activity type badge and entity name */}
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Badge variant="outline" className="text-xs h-5">
            {getActivityLabel()}
          </Badge>
          {entry.entityName && (
            <span className="text-sm font-medium truncate">
              {entry.entityName}
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {getDescription()}
        </p>

        {/* Meta info */}
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          {entry.userName && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {entry.userName}
            </span>
          )}
          {entry.createdAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(entry.createdAt)}
            </span>
          )}
        </div>
      </div>
    </Component>
  );
});

/**
 * Empty state when no history exists
 */
const EmptyState = memo(function EmptyState({
  hasFilters = false,
}: {
  hasFilters?: boolean;
}) {
  const t = useTranslations("pipeline");
  const tActivity = useTranslations("activity");

  return (
    <div className="flex flex-col items-center justify-center h-[200px] text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <History className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium text-sm mb-1">
        {hasFilters ? tActivity("noMatchingActivity") : t("noHistory")}
      </h3>
      <p className="text-xs text-muted-foreground max-w-[200px]">
        {hasFilters
          ? tActivity("noMatchingActivityDesc")
          : t("noHistoryDescription")}
      </p>
    </div>
  );
});

/**
 * Error state
 */
const ErrorState = memo(function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const t = useTranslations("pipeline");

  return (
    <div className="flex flex-col items-center justify-center h-[200px] text-center">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="h-4 w-4 mr-2" />
        {t("retry")}
      </Button>
    </div>
  );
});

/**
 * Loading skeleton
 */
const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
});

/**
 * Global Activity Panel - Shows stage transition history across all team chats
 * Used in the Kanban page to show recent pipeline activity
 *
 * Supports two modes:
 * - Legacy mode (usePagination=false): Uses getGlobalStageHistory API, simple list
 * - Paginated mode (usePagination=true): Uses activity_logs API with pagination and date filtering
 */
export const GlobalActivityPanel = memo(function GlobalActivityPanel({
  limit = 20,
  onChatClick,
  usePagination = false,
  showDateFilter = true,
  pageSize = 20,
}: GlobalActivityPanelProps) {
  const t = useTranslations("pipeline");
  const tActivity = useTranslations("activity");
  const router = useRouter();

  // Legacy mode state
  const [history, setHistory] = useState<GlobalStageHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Paginated mode hook
  const activityHook = useActivityLogs({
    initialPageSize: pageSize,
    autoRefresh: false,
  });

  // Check if filters are active (paginated mode)
  const hasFilters = useMemo(() => {
    if (!usePagination) return false;
    return !!(
      activityHook.filters.dateRange?.startDate ||
      activityHook.filters.dateRange?.endDate
    );
  }, [usePagination, activityHook.filters]);

  // Load history data (legacy mode)
  const loadData = useCallback(async () => {
    if (usePagination) return;

    try {
      setLoading(true);
      setError(null);

      const historyData = await backendApi.stages.getGlobalStageHistory(limit);
      setHistory(historyData);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("errorLoadingHistory");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [limit, t, usePagination]);

  useEffect(() => {
    if (!usePagination) {
      loadData();
    }
  }, [loadData, usePagination]);

  // Handle chat click - navigate to chats page with that chat selected
  const handleChatClick = useCallback(
    (chatId: string) => {
      if (onChatClick) {
        onChatClick(chatId);
      } else {
        router.push(`/dashboard/chats?chat=${chatId}`);
      }
    },
    [onChatClick, router],
  );

  // Handle date range change (paginated mode)
  const handleDateRangeChange = useCallback(
    (range: DateRange) => {
      activityHook.setDateRange(range);
    },
    [activityHook],
  );

  // Current date range value
  const dateRangeValue: DateRange = useMemo(
    () => ({
      startDate: activityHook.filters.dateRange?.startDate ?? null,
      endDate: activityHook.filters.dateRange?.endDate ?? null,
    }),
    [activityHook.filters.dateRange],
  );

  // Pagination translations
  const paginationTranslations = useMemo(
    () => ({
      page: tActivity("pageOf", { current: "{current}", total: "{total}" }),
      previous: tActivity("previous"),
      next: tActivity("next"),
      first: tActivity("first"),
      last: tActivity("last"),
      rowsPerPage: tActivity("rowsPerPage"),
    }),
    [tActivity],
  );

  // Determine loading state
  const isLoading = usePagination ? activityHook.isLoading : loading;
  const hasError = usePagination ? !!activityHook.error : !!error;
  const errorMessage = usePagination
    ? activityHook.error?.message || t("errorLoadingHistory")
    : error || "";

  // Determine refresh action
  const handleRefresh = useCallback(() => {
    if (usePagination) {
      activityHook.refresh();
    } else {
      loadData();
    }
  }, [usePagination, activityHook, loadData]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="py-3 px-4 flex-row items-center justify-between space-y-0 flex-wrap gap-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <History className="h-4 w-4" />
          {t("globalActivity")}
          {usePagination && activityHook.total > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activityHook.total}
            </Badge>
          )}
        </CardTitle>

        <div className="flex items-center gap-2">
          {/* Date filter (paginated mode only) */}
          {usePagination && showDateFilter && (
            <DateRangeFilter
              value={dateRangeValue}
              onChange={handleDateRangeChange}
              compact
              showPresets
            />
          )}

          {/* Refresh button */}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
            />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
        {/* Loading state */}
        {isLoading &&
          (usePagination
            ? activityHook.items.length === 0
            : history.length === 0) && <LoadingSkeleton />}

        {/* Error state */}
        {hasError && !isLoading && (
          <ErrorState message={errorMessage} onRetry={handleRefresh} />
        )}

        {/* Empty state */}
        {!isLoading &&
          !hasError &&
          (usePagination
            ? activityHook.items.length === 0
            : history.length === 0) && <EmptyState hasFilters={hasFilters} />}

        {/* History list - Legacy mode */}
        {!usePagination && !isLoading && !hasError && history.length > 0 && (
          <ScrollArea className="h-full flex-1">
            <div className="p-3 space-y-2">
              {history.map((entry) => (
                <GlobalActivityItem
                  key={entry.id}
                  entry={entry}
                  onChatClick={handleChatClick}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Activity list - Paginated mode */}
        {usePagination && !hasError && activityHook.items.length > 0 && (
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {activityHook.items.map((entry) => (
                <ActivityLogItem
                  key={entry.id}
                  entry={entry}
                  onChatClick={handleChatClick}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Pagination controls (paginated mode only) */}
        {usePagination && activityHook.totalPages > 1 && (
          <div className="border-t p-3">
            <Pagination
              page={activityHook.page}
              totalPages={activityHook.totalPages}
              onPageChange={activityHook.setPage}
              pageSize={activityHook.pageSize}
              onPageSizeChange={activityHook.setPageSize}
              pageSizeOptions={activityHook.pageSizeOptions}
              translations={paginationTranslations}
              compact
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
});
