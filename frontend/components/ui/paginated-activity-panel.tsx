/**
 * PaginatedActivityPanel Component
 *
 * A reusable, paginated activity/history panel that can be used across
 * different parts of the application:
 * - Global activity (Kanban page)
 * - Chat-specific activity (Chat sidebar)
 * - Stage history
 * - Audit logs
 *
 * Features:
 * - Server-side pagination for performance
 * - Date range filtering
 * - Activity type filtering
 * - Loading states with skeletons
 * - Empty and error states
 * - Responsive design
 * - Keyboard accessible
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRange, DateRangeFilter } from "@/components/ui/date-range-filter";
import { Pagination } from "@/components/ui/pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useActivityLogs,
  type UseActivityLogsOptions,
  type UseActivityLogsReturn,
} from "@/hooks/use-activity-logs";
import type { ActivityLogEntry, ActivityType } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";
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
import { memo, useCallback, useMemo } from "react";

// Re-export hook for convenience
export {
  useActivityLogs,
  type UseActivityLogsOptions,
  type UseActivityLogsReturn,
};
export type { DateRange };

/**
 * Activity type configuration - icon and color
 */
interface ActivityTypeConfig {
  icon: LucideIcon;
  bgColor: string;
  textColor: string;
  label: string;
}

/**
 * Get configuration for activity type
 */
function getActivityTypeConfig(
  type: ActivityType,
  t: ReturnType<typeof useTranslations>,
): ActivityTypeConfig {
  switch (type) {
    case "stage_created":
      return {
        icon: Plus,
        bgColor: "bg-green-100",
        textColor: "text-green-600",
        label: t("activityStageCreated"),
      };
    case "stage_updated":
      return {
        icon: Edit2,
        bgColor: "bg-blue-100",
        textColor: "text-blue-600",
        label: t("activityStageUpdated"),
      };
    case "stage_deleted":
      return {
        icon: Trash2,
        bgColor: "bg-red-100",
        textColor: "text-red-600",
        label: t("activityStageDeleted"),
      };
    case "stage_reordered":
      return {
        icon: RotateCcw,
        bgColor: "bg-amber-100",
        textColor: "text-amber-600",
        label: t("activityStageReordered"),
      };
    case "stage_default_changed":
      return {
        icon: Settings,
        bgColor: "bg-purple-100",
        textColor: "text-purple-600",
        label: t("activityDefaultChanged"),
      };
    case "chat_transitioned":
      return {
        icon: ArrowRight,
        bgColor: "bg-indigo-100",
        textColor: "text-indigo-600",
        label: t("activityChatTransitioned"),
      };
    case "handoff_requested":
      return {
        icon: User,
        bgColor: "bg-orange-100",
        textColor: "text-orange-600",
        label: t("activityHandoffRequested"),
      };
    case "handoff_resolved":
      return {
        icon: Zap,
        bgColor: "bg-emerald-100",
        textColor: "text-emerald-600",
        label: t("activityHandoffResolved"),
      };
    case "ai_paused":
      return {
        icon: Bot,
        bgColor: "bg-gray-100",
        textColor: "text-gray-600",
        label: t("activityAiPaused"),
      };
    case "ai_resumed":
      return {
        icon: Bot,
        bgColor: "bg-cyan-100",
        textColor: "text-cyan-600",
        label: t("activityAiResumed"),
      };
    default:
      return {
        icon: Clock,
        bgColor: "bg-gray-100",
        textColor: "text-gray-600",
        label: type,
      };
  }
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

  return format(date, "MMM d, yyyy");
}

/**
 * Props for a single activity item
 */
interface ActivityItemProps {
  entry: ActivityLogEntry;
  onChatClick?: (chatId: string) => void;
  showEntityName?: boolean;
}

/**
 * Single activity item component
 */
const ActivityItem = memo(function ActivityItem({
  entry,
  onChatClick,
  showEntityName = true,
}: ActivityItemProps) {
  const t = useTranslations("activity");
  const config = getActivityTypeConfig(entry.activityType, t);
  const Icon = config.icon;

  // Determine if this item is clickable (has a chat association)
  const isClickable = entry.chatId && onChatClick;

  // Get the description text
  const getDescription = () => {
    if (entry.description) {
      return entry.description;
    }

    // Build description from metadata
    switch (entry.activityType) {
      case "stage_created":
        return t("stageCreatedDesc", { name: entry.entityName || "Stage" });
      case "stage_updated":
        return t("stageUpdatedDesc", { name: entry.entityName || "Stage" });
      case "stage_deleted":
        return t("stageDeletedDesc", { name: entry.entityName || "Stage" });
      case "stage_reordered":
        return t("stagesReorderedDesc");
      case "stage_default_changed":
        return t("defaultChangedDesc", { name: entry.entityName || "Stage" });
      case "chat_transitioned":
        return t("chatTransitionedDesc");
      default:
        return config.label;
    }
  };

  const handleClick = useCallback(() => {
    if (isClickable && entry.chatId) {
      onChatClick?.(entry.chatId);
    }
  }, [isClickable, entry.chatId, onChatClick]);

  // Render stage transition badges for chat_transitioned activities
  const renderStageTransition = () => {
    // Use direct fields first (new unified format)
    if (entry.fromStageName || entry.toStageName) {
      return (
        <div className="flex items-center gap-2 flex-wrap mt-1">
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
          {entry.fromStageName && entry.toStageName && (
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          {entry.toStageName && (
            <Badge
              variant="secondary"
              className="text-xs h-5"
              style={{
                backgroundColor: entry.toStageColor
                  ? `${entry.toStageColor}20`
                  : undefined,
                color: entry.toStageColor || undefined,
              }}
            >
              {entry.toStageName}
            </Badge>
          )}
        </div>
      );
    }

    // Fallback to previousState/newState for backwards compatibility
    if (
      entry.activityType === "chat_transitioned" &&
      (entry.previousState || entry.newState)
    ) {
      const fromName = (entry.previousState as { stageName?: string })
        ?.stageName;
      const toName = (entry.newState as { stageName?: string })?.stageName;

      if (fromName || toName) {
        return (
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {fromName && (
              <Badge variant="outline" className="text-xs h-5">
                {fromName}
              </Badge>
            )}
            {fromName && toName && (
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            {toName && (
              <Badge variant="secondary" className="text-xs h-5">
                {toName}
              </Badge>
            )}
          </div>
        );
      }
    }

    return null;
  };

  // Get trigger type display for chat transitions
  const getTriggerDisplay = () => {
    if (!entry.triggerType || entry.activityType !== "chat_transitioned") {
      return null;
    }

    switch (entry.triggerType) {
      case "ai":
        return t("triggeredByAI");
      case "human":
        return entry.userName
          ? t("triggeredBy", { name: entry.userName })
          : null;
      case "rule":
        return t("triggeredByRule");
      case "system":
        return t("triggeredBySystem");
      default:
        return null;
    }
  };

  // Get the display name - participant name/phone for chat transitions, entity name otherwise
  const displayName =
    entry.activityType === "chat_transitioned"
      ? entry.participantName || entry.participantPhone || entry.chatId
      : entry.entityName;

  const Component = isClickable ? "button" : "div";

  const triggerDisplay = getTriggerDisplay();

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
          config.bgColor,
          config.textColor,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* For chat transitions, show participant name prominently */}
        {entry.activityType === "chat_transitioned" && displayName && (
          <p className="text-sm font-medium truncate mb-1">{displayName}</p>
        )}

        {/* For stage CRUD, show activity type badge and entity name */}
        {entry.activityType !== "chat_transitioned" && (
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="outline" className="text-xs h-5">
              {config.label}
            </Badge>
            {showEntityName && entry.entityName && (
              <span className="text-sm font-medium truncate">
                {entry.entityName}
              </span>
            )}
          </div>
        )}

        {/* Stage transition badges for chat_transitioned */}
        {entry.activityType === "chat_transitioned" && renderStageTransition()}

        {/* Description for non-transition activities */}
        {entry.activityType !== "chat_transitioned" && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {getDescription()}
          </p>
        )}

        {/* Reason if provided (for chat transitions) */}
        {entry.reason && entry.activityType === "chat_transitioned" && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {entry.reason}
          </p>
        )}

        {/* Meta info */}
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          {/* Show trigger display for chat transitions */}
          {triggerDisplay && <span>{triggerDisplay}</span>}
          {/* Show user name for stage CRUD operations */}
          {!triggerDisplay && entry.userName && (
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
 * Empty state component
 */
const EmptyState = memo(function EmptyState({
  hasFilters,
}: {
  hasFilters: boolean;
}) {
  const t = useTranslations("activity");

  return (
    <div className="flex flex-col items-center justify-center h-[200px] text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <History className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium text-sm mb-1">
        {hasFilters ? t("noMatchingActivity") : t("noActivity")}
      </h3>
      <p className="text-xs text-muted-foreground max-w-[200px]">
        {hasFilters ? t("noMatchingActivityDesc") : t("noActivityDesc")}
      </p>
    </div>
  );
});

/**
 * Error state component
 */
const ErrorState = memo(function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const t = useTranslations("activity");

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
 * Loading skeleton component
 */
const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
});

/**
 * Props for PaginatedActivityPanel
 */
export interface PaginatedActivityPanelProps {
  /** Title for the panel */
  title?: string;
  /** Hook return value (if using external hook instance) */
  activityHook?: UseActivityLogsReturn;
  /** Options for internal hook (if not providing activityHook) */
  hookOptions?: UseActivityLogsOptions;
  /** Whether to show date range filter */
  showDateFilter?: boolean;
  /** Whether to show the pagination controls */
  showPagination?: boolean;
  /** Whether to show the header */
  showHeader?: boolean;
  /** Callback when a chat is clicked */
  onChatClick?: (chatId: string) => void;
  /** Whether to show entity names in items */
  showEntityNames?: boolean;
  /** Maximum height for the scroll area */
  maxHeight?: string;
  /** Optional class name */
  className?: string;
  /** Whether to render as a card */
  asCard?: boolean;
}

/**
 * PaginatedActivityPanel - Reusable paginated activity/history panel
 */
export const PaginatedActivityPanel = memo(function PaginatedActivityPanel({
  title,
  activityHook: externalHook,
  hookOptions,
  showDateFilter = true,
  showPagination = true,
  showHeader = true,
  onChatClick,
  showEntityNames = true,
  maxHeight = "400px",
  className,
  asCard = true,
}: PaginatedActivityPanelProps) {
  const t = useTranslations("activity");

  // Use external hook if provided, otherwise create internal one
  const internalHook = useActivityLogs(hookOptions || {});
  const hook = externalHook || internalHook;

  const {
    items,
    total,
    isLoading,
    error,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
    pageSizeOptions,
    filters,
    setDateRange,
    refresh,
  } = hook;

  // Check if any filters are active
  const hasFilters = useMemo(() => {
    return !!(
      filters.dateRange?.startDate ||
      filters.dateRange?.endDate ||
      (filters.activityTypes && filters.activityTypes.length > 0) ||
      filters.entityType ||
      filters.chatId
    );
  }, [filters]);

  // Handle date range change
  const handleDateRangeChange = useCallback(
    (range: DateRange) => {
      setDateRange(range);
    },
    [setDateRange],
  );

  // Current date range value
  const dateRangeValue: DateRange = useMemo(
    () => ({
      startDate: filters.dateRange?.startDate ?? null,
      endDate: filters.dateRange?.endDate ?? null,
    }),
    [filters.dateRange],
  );

  // Pagination translations
  const paginationTranslations = useMemo(
    () => ({
      page: t("pageOf", { current: "{current}", total: "{total}" }),
      previous: t("previous"),
      next: t("next"),
      first: t("first"),
      last: t("last"),
      rowsPerPage: t("rowsPerPage"),
    }),
    [t],
  );

  // Content to render
  const content = (
    <>
      {/* Header with filters */}
      {showHeader && (
        <CardHeader className="py-3 px-4 flex-row items-center justify-between space-y-0 flex-wrap gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <History className="h-4 w-4" />
            {title || t("title")}
            {total > 0 && (
              <Badge variant="secondary" className="text-xs">
                {total}
              </Badge>
            )}
          </CardTitle>

          <div className="flex items-center gap-2">
            {/* Date filter */}
            {showDateFilter && (
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
              onClick={refresh}
              disabled={isLoading}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
              />
            </Button>
          </div>
        </CardHeader>
      )}

      <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
        {/* Loading state */}
        {isLoading && items.length === 0 && <LoadingSkeleton />}

        {/* Error state */}
        {error && !isLoading && (
          <ErrorState message={error.message} onRetry={refresh} />
        )}

        {/* Empty state */}
        {!isLoading && !error && items.length === 0 && (
          <EmptyState hasFilters={hasFilters} />
        )}

        {/* Activity list */}
        {!error && items.length > 0 && (
          <ScrollArea className="flex-1" style={{ maxHeight }}>
            <div className="p-3 space-y-2">
              {items.map((entry) => (
                <ActivityItem
                  key={entry.id}
                  entry={entry}
                  onChatClick={onChatClick}
                  showEntityName={showEntityNames}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Pagination */}
        {showPagination && totalPages > 1 && (
          <div className="border-t p-3">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              pageSizeOptions={pageSizeOptions}
              translations={paginationTranslations}
              compact
            />
          </div>
        )}
      </CardContent>
    </>
  );

  // Render as card or div
  if (asCard) {
    return (
      <Card className={cn("h-full flex flex-col", className)}>{content}</Card>
    );
  }

  return <div className={cn("h-full flex flex-col", className)}>{content}</div>;
});

export default PaginatedActivityPanel;
