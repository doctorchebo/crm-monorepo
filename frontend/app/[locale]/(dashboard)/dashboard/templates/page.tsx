"use client";

import { DeleteConfirmationDialog } from "@/components/dialogs/delete-confirmation-dialog";
import {
  TemplateCard,
  type TemplateCardData,
  type TemplateLocaleData,
} from "@/components/templates/template-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PageLayout } from "@/components/ui/page-layout";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuthProtection } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useNotification } from "@/hooks/use-notification";
import { usePaginatedData } from "@/hooks/use-paginated-data";
import {
  mapWebhookStatusToInternal,
  useTemplateStatusSocket,
  type TemplateStatusUpdate,
} from "@/hooks/use-template-status-socket";
import {
  backendApi,
  BulkSyncResult,
  TemplateSyncResult,
} from "@/lib/api/endpoints";
import { Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

/**
 * Template interface matching the API response
 */
interface Template extends TemplateCardData {
  createdAt: string;
  updatedAt: string;
}

interface TemplateFilters {
  search: string;
}

export default function TemplatesPage() {
  const router = useRouter();
  const t = useTranslations("templates");
  const tCommon = useTranslations("common");
  const { addNotification } = useNotification();

  // Protect this route - redirect to login if token is missing or expired
  useAuthProtection();

  // Search with debounce
  const {
    value: searchQuery,
    debouncedValue: debouncedSearch,
    setValue: setSearchQuery,
  } = useDebouncedValue("", { delay: 300 });

  // Memoize filters
  const filters = useMemo<TemplateFilters>(
    () => ({ search: debouncedSearch }),
    [debouncedSearch],
  );

  // Dialog state
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync-related state
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingTemplateId, setSyncingTemplateId] = useState<string | null>(
    null,
  );

  // Use the paginated data hook for robust pagination and selection management
  const {
    items: templates,
    total,
    isLoading,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
    selectedIds,
    selectedCount,
    isAllSelected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    selectOne,
    refreshAfterDelete,
    swrResponse: { mutate },
  } = usePaginatedData<Template, TemplateFilters>({
    cacheKeyPrefix: "templates",
    initialPageSize: 12,
    pageSizeOptions: [12, 24, 48],
    filters,
    fetcher: async ({ page, pageSize, filters }) => {
      const result = await backendApi.templates.listPaginated({
        page,
        limit: pageSize,
        search: filters.search || undefined,
      });
      return {
        items: result.data as Template[],
        total: result.pagination.totalItems,
      };
    },
    getItemId: (template) => template.id,
  });

  // Handle real-time template status updates via WebSocket
  const handleTemplateStatusUpdate = useCallback(
    (update: TemplateStatusUpdate) => {
      // Map webhook status to our internal status
      const newStatus = mapWebhookStatusToInternal(update.status);

      // Show notification to user
      const statusLabels: Record<string, string> = {
        approved: t("approval.status.approved") || "Approved",
        rejected: t("approval.status.rejected") || "Rejected",
        pending: t("approval.status.pending") || "Pending",
        paused: t("approval.status.paused") || "Paused",
        disabled: t("approval.status.disabled") || "Disabled",
      };

      const statusLabel = statusLabels[newStatus] || newStatus;
      const notificationType =
        newStatus === "approved"
          ? "success"
          : newStatus === "rejected"
            ? "error"
            : "info";

      addNotification(
        `${t("templateStatusChanged") || "Template status changed"}: "${
          update.templateName
        }" → ${statusLabel}`,
        notificationType as "success" | "error" | "info",
        5000,
      );

      // Refresh the templates list to show updated status
      mutate();
    },
    [t, addNotification, mutate],
  );

  // Connect to WebSocket for real-time template status updates
  useTemplateStatusSocket({
    onStatusUpdate: handleTemplateStatusUpdate,
    onConnect: () => {
      console.log("📱 Connected to template status WebSocket");
    },
    onDisconnect: () => {
      console.log("📴 Disconnected from template status WebSocket");
    },
  });

  /**
   * Bulk delete handler - deletes all selected templates including their locales from Meta
   */
  const handleBulkDelete = async () => {
    if (selectedCount === 0) return;

    setIsDeleting(true);
    try {
      const result = await backendApi.templates.bulkDelete(
        Array.from(selectedIds),
      );
      addNotification(
        t("bulkDeleteSuccess", { count: result.deletedCount }) ||
          `${result.deletedCount} template(s) deleted successfully`,
        "success",
      );
      setBulkDeleteDialogOpen(false);
      // Use refreshAfterDelete for automatic page adjustment when last page becomes empty
      await refreshAfterDelete(result.deletedCount);
    } catch (error) {
      console.error("Failed to bulk delete templates:", error);
      addNotification(
        t("bulkDeleteFailed") || "Failed to delete templates",
        "error",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  /**
   * Navigate to edit page for a template, optionally with a specific locale selected
   */
  const handleEdit = (templateId: string, selectedLocale?: string) => {
    const url = selectedLocale
      ? `/dashboard/templates/${templateId}/edit?locale=${selectedLocale}`
      : `/dashboard/templates/${templateId}/edit`;
    router.push(url);
  };

  /**
   * Handle delete click - enters selection mode with this template selected
   * (Same pattern as contacts page)
   */
  const handleDeleteClick = (template: Template) => {
    selectOne(template.id);
  };

  /**
   * Check if a locale can be synced (has been submitted to Meta)
   */
  const canSyncStatus = (locale: TemplateLocaleData): boolean => {
    return !!locale.metaTemplateId;
  };

  /**
   * Sync all pending templates with Meta API
   */
  const handleSyncAllPending = async () => {
    if (isSyncingAll) return;

    setIsSyncingAll(true);
    try {
      const result: BulkSyncResult = await backendApi.templates.syncAllPending({
        statuses: ["pending"],
      });

      if (result.totalProcessed === 0) {
        addNotification(
          t("noTemplatesNeedSync") || "No templates need syncing",
          "info",
          3000,
        );
      } else if (result.statusChangedCount > 0) {
        addNotification(
          t("syncCompleteWithChanges", {
            total: result.totalProcessed,
            changed: result.statusChangedCount,
          }) ||
            `Synced ${result.totalProcessed} templates. ${
              result.statusChangedCount
            } status${result.statusChangedCount !== 1 ? "es" : ""} changed.`,
          "success",
          5000,
        );
        mutate();
      } else {
        addNotification(
          t("syncCompleteNoChanges", { total: result.totalProcessed }) ||
            `Synced ${result.totalProcessed} templates. No status changes detected.`,
          "info",
          3000,
        );
      }
    } catch (error) {
      console.error("Failed to sync templates:", error);
      addNotification(
        t("syncFailed") || "Failed to sync template statuses",
        "error",
        3000,
      );
    } finally {
      setIsSyncingAll(false);
    }
  };

  /**
   * Sync a single template's status with Meta API
   */
  const handleSyncSingleTemplate = async (
    template: Template,
    locale: TemplateLocaleData,
  ) => {
    if (syncingTemplateId === template.id) return;

    setSyncingTemplateId(template.id);
    try {
      const result: TemplateSyncResult = await backendApi.templates.syncStatus(
        template.id,
        { locale: locale.locale },
      );

      if (result.error) {
        addNotification(
          t("syncSingleFailed", {
            name: template.displayName || template.name,
          }) || `Failed to sync "${template.displayName || template.name}"`,
          "error",
          3000,
        );
      } else if (result.statusChanged) {
        const statusLabels: Record<string, string> = {
          approved: t("approval.status.approved") || "Approved",
          rejected: t("approval.status.rejected") || "Rejected",
          pending: t("approval.status.pending") || "Pending",
          paused: t("approval.status.paused") || "Paused",
          disabled: t("approval.status.disabled") || "Disabled",
          draft: t("approval.status.draft") || "Draft",
        };
        const newStatusLabel =
          statusLabels[result.newStatus] || result.newStatus;
        addNotification(
          t("syncSingleChanged", {
            name: template.displayName || template.name,
            status: newStatusLabel,
          }) ||
            `"${
              template.displayName || template.name
            }" status updated to ${newStatusLabel}`,
          result.newStatus === "approved" ? "success" : "info",
          4000,
        );
        mutate();
      } else {
        addNotification(
          t("syncSingleNoChange", {
            name: template.displayName || template.name,
          }) || `"${template.displayName || template.name}" is up to date`,
          "info",
          3000,
        );
      }
    } catch (error) {
      console.error("Failed to sync template:", error);
      addNotification(
        t("syncSingleFailed", {
          name: template.displayName || template.name,
        }) || `Failed to sync "${template.displayName || template.name}"`,
        "error",
        3000,
      );
    } finally {
      setSyncingTemplateId(null);
    }
  };

  /**
   * Count of templates that have pending status (across any locale) - from current page
   */
  const pendingTemplatesCount = useMemo(() => {
    return templates.filter((template) => {
      return template.locales?.some(
        (locale) =>
          locale.approvalStatus === "pending" && locale.metaTemplateId,
      );
    }).length;
  }, [templates]);

  return (
    <PageLayout
      title={t("title") || "Templates"}
      description={
        t("totalTemplates", { count: total }) ||
        `${total} template${total !== 1 ? "s" : ""}`
      }
      headerActions={
        <div className="flex items-center gap-2">
          {/* Sync All Pending Button */}
          {pendingTemplatesCount > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={handleSyncAllPending}
                    disabled={isSyncingAll}
                    className="gap-2"
                  >
                    {isSyncingAll ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {t("syncStatus") || "Sync Status"}
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                      {pendingTemplatesCount}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {t("syncStatusTooltip") ||
                      "Refresh approval status from Meta for all pending templates"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button
            onClick={() => router.push(`/dashboard/templates/new`)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            {tCommon("create")}
          </Button>
        </div>
      }
      className="space-y-6"
    >
      {/* Search and Pagination Controls */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-end sm:items-center">
        <div className="relative w-full sm:w-auto sm:min-w-[300px]">
          <SearchInput
            placeholder={t("searchPlaceholder") || "Search templates..."}
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48]}
          translations={{
            page: t("pagination.page", {
              current: page,
              total: totalPages,
            }),
            previous: t("pagination.previous"),
            next: t("pagination.next"),
            first: t("pagination.first"),
            last: t("pagination.last"),
            rowsPerPage: t("pagination.rowsPerPage"),
          }}
          compact
        />
      </div>

      {/* Bulk Actions Bar */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg border animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-4 px-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={clearSelection}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">
              {t("selectedCount", { count: selectedCount }) ||
                `${selectedCount} selected`}
            </span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkDeleteDialogOpen(true)}
            className="h-8"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {tCommon("delete")}
          </Button>
        </div>
      )}

      {/* Templates Grid */}
      <div>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-64 w-full rounded-lg" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-gray-600 mb-4">
              {searchQuery
                ? t("noResults") || "No templates found"
                : t("noTemplates") || "No templates yet"}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => router.push(`/dashboard/templates/new`)}
                variant="outline"
              >
                {t("createFirst") || "Create your first template"}
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Select All Header - visible in selection mode */}
            {selectedCount > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 border-b mb-4">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label={t("selectAll") || "Select all templates"}
                />
                <span className="text-sm text-muted-foreground">
                  {t("selectAll") || "Select all"}
                </span>
              </div>
            )}

            {/* Templates Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <div key={template.id} className="relative group">
                  {/* Selection Checkbox - visible in selection mode */}
                  {selectedCount > 0 && (
                    <div
                      className="absolute top-2 left-2 z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedIds.has(template.id)}
                        onCheckedChange={() => toggleSelect(template.id)}
                        aria-label={`Select ${template.displayName || template.name}`}
                        className="bg-background"
                      />
                    </div>
                  )}
                  <TemplateCard
                    template={template}
                    onClick={() => handleEdit(template.id)}
                    onLocaleClick={(locale) =>
                      handleEdit(template.id, locale.locale)
                    }
                    onDelete={() => handleDeleteClick(template)}
                    onSyncStatus={(locale) =>
                      handleSyncSingleTemplate(template, locale)
                    }
                    isSyncing={syncingTemplateId === template.id}
                    canSyncStatus={canSyncStatus}
                    isSelectable={selectedCount > 0}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bulk Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={bulkDeleteDialogOpen}
        title={t("bulkDeleteTitle") || "Delete Templates"}
        description={
          t("bulkDeleteDescription", { count: selectedCount }) ||
          `Are you sure you want to delete ${selectedCount} template${
            selectedCount !== 1 ? "s" : ""
          }? This action cannot be undone.`
        }
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteDialogOpen(false)}
        isLoading={isDeleting}
      />
    </PageLayout>
  );
}
