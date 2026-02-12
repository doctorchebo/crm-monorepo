"use client";

import {
  AuditTimelineItem,
  formatRelativeTime,
} from "@/components/audit/audit-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRange, DateRangeFilter } from "@/components/ui/date-range-filter";
import { Pagination } from "@/components/ui/pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivityLogs } from "@/hooks/use-activity-logs";
import type { GlobalStageHistoryEntry } from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Clock,
  History,
  RefreshCw,
  Settings,
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

        {/* Activity list - Paginated mode (uses AuditTimelineItem directly) */}
        {usePagination && !hasError && activityHook.items.length > 0 && (
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {activityHook.items.map((entry) => (
                <AuditTimelineItem
                  key={entry.id}
                  entry={entry}
                  showCategory={false}
                  showEntityName
                  onClick={
                    entry.chatId
                      ? () => handleChatClick(entry.chatId!)
                      : undefined
                  }
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
