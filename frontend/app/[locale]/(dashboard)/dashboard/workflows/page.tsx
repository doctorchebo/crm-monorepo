"use client";

import { DeleteConfirmationDialog } from "@/components/dialogs/delete-confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateLibraryDialog, WorkflowIcon } from "@/components/workflow";
import { useNotification } from "@/hooks/use-notification";
import { usePaginatedData } from "@/hooks/use-paginated-data";
import { workflowBuilderApi } from "@/lib/api/workflow-builder";
import type { Workflow, WorkflowStatus } from "@/lib/types/workflow.types";
import {
  Archive,
  Copy,
  Download,
  GitBranch,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";



const STATUS_COLORS: Record<WorkflowStatus, string> = {
  draft:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  published:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  archived: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  disabled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function WorkflowCard({
  workflow,
  isSelected,
  showCheckbox,
  onToggleSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onArchive,
}: {
  workflow: Workflow;
  isSelected: boolean;
  showCheckbox: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const t = useTranslations("workflows");

  /**
   * Handle card click to edit workflow.
   * Only triggers if the click wasn't on an interactive element.
   */
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest('[role="menuitem"]') ||
      target.closest("[data-radix-collection-item]") ||
      target.closest('[role="checkbox"]')
    ) {
      return;
    }
    onEdit(workflow.id);
  };

  /**
   * Stop event propagation for menu actions.
   * This prevents the card click handler from firing.
   */
  const handleMenuAction = (
    e: React.MouseEvent,
    action: (id: string) => void,
  ) => {
    e.stopPropagation();
    action(workflow.id);
  };

  return (
    <Card
      className={`hover:shadow-md transition-shadow cursor-pointer group ${
        isSelected ? "ring-2 ring-primary" : ""
      }`}
      onClick={handleCardClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {showCheckbox && (
              <div onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelect(workflow.id)}
                  aria-label={`Select ${workflow.name}`}
                />
              </div>
            )}
            <WorkflowIcon
              icon={workflow.icon}
              color={workflow.color}
              size="lg"
            />
            <div>
              <CardTitle className="text-base font-medium">
                {workflow.name}
              </CardTitle>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  STATUS_COLORS[workflow.status]
                }`}
              >
                {t(`status.${workflow.status}`)}
              </span>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => handleMenuAction(e, onEdit)}>
                <Pencil className="mr-2 h-4 w-4" />
                {t("actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => handleMenuAction(e, onDuplicate)}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t("actions.duplicate")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => handleMenuAction(e, onArchive)}>
                <Archive className="mr-2 h-4 w-4" />
                {workflow.status === "archived"
                  ? t("actions.unarchive")
                  : t("actions.archive")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => handleMenuAction(e, onDelete)}
                className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {workflow.description || t("noDescription")}
        </p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>v{workflow.version}</span>
          <span>
            {t("updatedAt", {
              date: new Date(workflow.updatedAt).toLocaleDateString(),
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkflowListSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-full mb-3" />
            <div className="flex justify-between">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Workflow filters interface */
interface WorkflowFilters {
  status: WorkflowStatus | "all";
  search: string;
}

export default function WorkflowsPage() {
  const t = useTranslations("workflows");
  const router = useRouter();
  const { addNotification } = useNotification();

  // Filter state (managed separately for controlled inputs)
  const {
    value: search,
    debouncedValue: debouncedSearch,
    setValue: setSearch,
  } = useDebouncedValue("", { delay: 300 });

  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | "all">(
    "all",
  );

  // Dialog state
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Memoize filters to prevent unnecessary re-renders
  const filters = useMemo<WorkflowFilters>(
    () => ({
      status: statusFilter,
      search: debouncedSearch,
    }),
    [statusFilter, debouncedSearch],
  );

  // Use the paginated data hook for robust pagination and selection management
  const {
    items: workflows,
    total,
    isLoading,
    page,
    pageSize,
    totalPages,
    pageSizeOptions,
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
  } = usePaginatedData<Workflow, WorkflowFilters>({
    cacheKeyPrefix: "workflows",
    initialPageSize: 12,
    pageSizeOptions: [12, 24, 48],
    filters,
    fetcher: async ({ page, pageSize, filters }) => {
      const result = await workflowBuilderApi.list({
        status: filters.status === "all" ? undefined : filters.status,
        search: filters.search || undefined,
        page,
        limit: pageSize,
      });
      return { items: result.workflows, total: result.total };
    },
    getItemId: (workflow) => workflow.id,
  });

  const handleCreateWorkflow = async () => {
    try {
      const workflow = await workflowBuilderApi.create({
        name: t("newWorkflowName"),
        description: "",
      });
      router.push(`/dashboard/workflows/${workflow.id}`);
    } catch (error) {
      addNotification(
        `${t("errors.createFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  };

  const handleEditWorkflow = (id: string) => {
    router.push(`/dashboard/workflows/${id}`);
  };

  const handleDuplicateWorkflow = async (id: string) => {
    try {
      const workflow = await workflowBuilderApi.duplicate(id, {});
      addNotification(
        `${t("notifications.duplicated")}: ${t("notifications.duplicatedMessage", { name: workflow.name })}`,
        "success",
      );
      mutate();
    } catch (error) {
      addNotification(
        `${t("errors.duplicateFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    // Enable selection mode with this workflow selected
    selectOne(id);
  };

  const handleArchiveWorkflow = async (id: string) => {
    try {
      const workflow = workflows.find((w) => w.id === id);
      const newStatus = workflow?.status === "archived" ? "draft" : "archived";
      await workflowBuilderApi.update(id, { status: newStatus } as any);
      addNotification(
        newStatus === "archived"
          ? t("notifications.archived")
          : t("notifications.unarchived"),
        "success",
      );
      mutate();
    } catch (error) {
      addNotification(
        `${t("errors.archiveFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (selectedCount === 0) return;

    setIsDeleting(true);
    try {
      const result = await workflowBuilderApi.bulkDelete(
        Array.from(selectedIds),
      );
      addNotification(
        t("bulkDeleteSuccess", { count: result.deletedCount }),
        "success",
      );
      setBulkDeleteDialogOpen(false);
      // Use refreshAfterDelete for automatic page adjustment when last page becomes empty
      await refreshAfterDelete(result.deletedCount);
    } catch (error) {
      console.error("Failed to bulk delete workflows:", error);
      addNotification(
        `${t("errors.deleteFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("totalWorkflows", { count: total })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTemplateDialogOpen(true)}>
            <Layers className="mr-2 h-4 w-4" />
            Templates
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            {t("actions.import")}
          </Button>
          <Button onClick={handleCreateWorkflow}>
            <Plus className="mr-2 h-4 w-4" />
            {t("actions.create")}
          </Button>
        </div>
      </div>

      {/* Filters and Pagination */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 justify-between">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative flex-1 min-w-[250px]">
            <SearchInput
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={setSearch}
            />
          </div>
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as WorkflowStatus | "all")}
          >
            <TabsList>
              <TabsTrigger value="all">{t("filters.all")}</TabsTrigger>
              <TabsTrigger value="draft">{t("filters.draft")}</TabsTrigger>
              <TabsTrigger value="published">
                {t("filters.published")}
              </TabsTrigger>
              <TabsTrigger value="archived">
                {t("filters.archived")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48]}
          translations={{
            page: t("pagination.page", { current: page, total: totalPages }),
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
              {t("selectedCount", { count: selectedCount })}
            </span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkDeleteDialogOpen(true)}
            className="h-8"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Select All Header (shown when in selection mode) */}
      {selectedCount > 0 && workflows.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 border-b">
          <Checkbox
            checked={isAllSelected}
            onCheckedChange={toggleSelectAll}
            aria-label="Select all workflows"
          />
          <span className="text-sm text-muted-foreground">
            {t("selectAll")}
          </span>
        </div>
      )}

      {/* Workflow Grid */}
      {isLoading ? (
        <WorkflowListSkeleton />
      ) : workflows.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {t("emptyState.title")}
            </h3>
            <p className="text-muted-foreground mb-4">
              {t("emptyState.description")}
            </p>
            <Button onClick={handleCreateWorkflow}>
              <Plus className="mr-2 h-4 w-4" />
              {t("actions.create")}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              isSelected={selectedIds.has(workflow.id)}
              showCheckbox={selectedCount > 0}
              onToggleSelect={toggleSelect}
              onEdit={handleEditWorkflow}
              onDuplicate={handleDuplicateWorkflow}
              onDelete={handleDeleteWorkflow}
              onArchive={handleArchiveWorkflow}
            />
          ))}
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={bulkDeleteDialogOpen}
        title={t("bulkDeleteTitle")}
        description={t("bulkDeleteDescription", { count: selectedCount })}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteDialogOpen(false)}
        isLoading={isDeleting}
      />

      {/* Template Library Dialog */}
      <TemplateLibraryDialog
        isOpen={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
      />
    </div>
  );
}
