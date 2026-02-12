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
 * - Loading states with skeletons
 * - Empty and error states
 * - Expandable details (via AuditTimelineItem)
 * - Responsive design
 *
 * Reuses AuditTimelineItem from the centralized audit system so that icons,
 * descriptions, and "see details" rendering stay in one place.
 */

"use client";

import { AuditTimelineItem } from "@/components/audit/audit-timeline";
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
import type { AuditEntry } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { AlertCircle, History, RefreshCw } from "lucide-react";
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
 *
 * Renders audit entries using AuditTimelineItem from the centralized audit
 * system. This avoids duplicating icon, description, and details rendering.
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

  // Build onClick handler for an entry (only if it has a chatId)
  const makeClickHandler = useCallback(
    (entry: AuditEntry) => {
      if (!onChatClick || !entry.chatId) return undefined;
      return () => onChatClick(entry.chatId!);
    },
    [onChatClick],
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

        {/* Activity list — renders AuditTimelineItem for each entry */}
        {!error && items.length > 0 && (
          <ScrollArea className="flex-1" style={{ maxHeight }}>
            <div className="p-3 space-y-2">
              {items.map((entry) => (
                <AuditTimelineItem
                  key={entry.id}
                  entry={entry}
                  showCategory={false}
                  showEntityName={showEntityNames}
                  onClick={makeClickHandler(entry)}
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
