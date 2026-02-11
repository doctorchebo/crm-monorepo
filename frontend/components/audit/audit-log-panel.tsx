/**
 * Audit Log Panel
 *
 * A complete, self-contained audit log viewer combining:
 * - AuditFilters (search, categories, team member, date range)
 * - AuditTimeline (chronological entry list)
 * - Pagination controls
 *
 * Can operate in two modes:
 * 1. **Internal hook** — pass `hookOptions` and the component manages its own state
 * 2. **External hook** — pass `auditHook` from a parent that owns the state
 *
 * Usage:
 * ```tsx
 * // Simple — uses internal state
 * <AuditLogPanel />
 *
 * // With pre-set category filter
 * <AuditLogPanel hookOptions={{ initialFilters: { categories: ["contacts"] } }} />
 *
 * // External hook for full control
 * const audit = useAuditHistory({ ... });
 * <AuditLogPanel auditHook={audit} />
 * ```
 */

"use client";

import { AuditFilters } from "@/components/audit/audit-filters";
import { AuditTimeline } from "@/components/audit/audit-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import {
  useAuditHistory,
  useAuditTeamMembers,
  type UseAuditHistoryOptions,
  type UseAuditHistoryReturn,
} from "@/hooks/use-audit-history";
import { backendApi, type AuditHistoryParams } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { Download, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useMemo, useState } from "react";

// ==================== Props ====================

export interface AuditLogPanelProps {
  /** Title override (defaults to i18n "audit.title") */
  title?: string;
  /** External hook return value — if provided, component does NOT create its own hook */
  auditHook?: UseAuditHistoryReturn;
  /** Options for the internal hook (ignored when auditHook is provided) */
  hookOptions?: UseAuditHistoryOptions;
  /** Whether to show the filter toolbar */
  showFilters?: boolean;
  /** Whether to show pagination controls */
  showPagination?: boolean;
  /** Whether to show the card header */
  showHeader?: boolean;
  /** Whether to show category badges on each item */
  showCategory?: boolean;
  /** Whether to show entity names on each item */
  showEntityName?: boolean;
  /** Whether to show the export button */
  showExport?: boolean;
  /** Callback when an entity reference in the timeline is clicked */
  onEntityClick?: (entityType: string, entityId: string) => void;
  /** Render as a shadcn Card with header. Set false for embedding in existing layouts */
  asCard?: boolean;
  /** Additional class names */
  className?: string;
}

// ==================== Component ====================

export const AuditLogPanel = memo(function AuditLogPanel({
  title,
  auditHook: externalHook,
  hookOptions,
  showFilters = true,
  showPagination = true,
  showHeader = true,
  showCategory = true,
  showEntityName = true,
  showExport = true,
  onEntityClick,
  asCard = true,
  className,
}: AuditLogPanelProps) {
  const t = useTranslations("audit");

  // Internal or external hook
  const internalHook = useAuditHistory(hookOptions ?? {});
  const hook = externalHook ?? internalHook;

  const {
    items,
    total,
    isLoading,
    error,
    page,
    pageSize,
    totalPages,
    pageSizeOptions,
    setPage,
    setPageSize,
    filters,
    setCategories,
    setUserId,
    setDateRange,
    setSearch,
    clearFilters,
    refresh,
  } = hook;

  // Team members for filter dropdown (admin/owner only)
  const { members: teamMembers, isLoading: teamMembersLoading } =
    useAuditTeamMembers();

  // Check if any filters are active
  const hasFilters = useMemo(
    () =>
      !!(
        filters.categories?.length ||
        filters.userId !== undefined ||
        filters.dateRange?.startDate ||
        filters.dateRange?.endDate ||
        filters.search
      ),
    [filters],
  );

  // Pagination translations
  const paginationTranslations = useMemo(
    () => ({
      page: t("pagination.page", { page: "{current}", totalPages: "{total}" }),
      previous: t("pagination.previousPage"),
      next: t("pagination.nextPage"),
      first: t("pagination.firstPage"),
      last: t("pagination.lastPage"),
      rowsPerPage: t("pagination.rowsPerPage"),
    }),
    [t],
  );

  // ==================== Export Handler ====================

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const params: AuditHistoryParams = {};
      if (filters.categories?.length) params.categories = filters.categories;
      if (filters.actions?.length) params.actions = filters.actions;
      if (filters.entityType) params.entityType = filters.entityType;
      if (filters.entityId) params.entityId = filters.entityId;
      if (filters.userId !== undefined) params.userId = filters.userId;
      if (filters.chatId) params.chatId = filters.chatId;
      if (filters.dateRange?.startDate)
        params.startDate = filters.dateRange.startDate.toISOString();
      if (filters.dateRange?.endDate)
        params.endDate = filters.dateRange.endDate.toISOString();
      if (filters.search) params.search = filters.search;
      await backendApi.audit.exportCsv(params);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  }, [filters]);

  // ==================== Render Helpers ====================

  const headerContent = showHeader && (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm">{title ?? t("title")}</span>
        {total > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {total}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        {showExport && total > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleExport}
            disabled={isExporting}
            title={t("export.csv")}
          >
            <Download
              className={cn("h-4 w-4", isExporting && "animate-pulse")}
            />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => refresh()}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </Button>
      </div>
    </div>
  );

  const filtersContent = showFilters && (
    <AuditFilters
      filters={filters}
      onCategoriesChange={setCategories}
      onUserIdChange={setUserId}
      onDateRangeChange={setDateRange}
      onSearchChange={setSearch}
      onClearAll={clearFilters}
      teamMembers={teamMembers}
      teamMembersLoading={teamMembersLoading}
      disabled={isLoading && items.length === 0}
    />
  );

  const timelineContent = (
    <AuditTimeline
      items={items}
      isLoading={isLoading}
      error={error}
      hasFilters={hasFilters}
      showCategory={showCategory}
      showEntityName={showEntityName}
      onRetry={refresh}
      onEntityClick={onEntityClick}
    />
  );

  const paginationContent = showPagination && total > 0 && (
    <div className="border-t p-3 shrink-0">
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
  );

  // ==================== Card Layout ====================

  if (asCard) {
    return (
      <Card className={cn("flex flex-col h-full overflow-hidden", className)}>
        {showHeader && (
          <CardHeader className="py-3 px-4 space-y-3 shrink-0">
            {headerContent}
            {filtersContent}
          </CardHeader>
        )}
        <CardContent className="flex-1 p-0 overflow-hidden flex flex-col min-h-0">
          {!showHeader && filtersContent && (
            <div className="px-4 pt-3 pb-2 shrink-0">{filtersContent}</div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            {timelineContent}
          </div>
          {paginationContent}
        </CardContent>
      </Card>
    );
  }

  // ==================== Flat Layout ====================

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {headerContent && (
        <div className="px-4 pb-2 shrink-0">{headerContent}</div>
      )}
      {filtersContent && (
        <div className="px-4 pb-3 shrink-0">{filtersContent}</div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">{timelineContent}</div>
      {paginationContent}
    </div>
  );
});

export default AuditLogPanel;
