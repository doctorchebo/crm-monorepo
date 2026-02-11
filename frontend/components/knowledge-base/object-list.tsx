/**
 * Knowledge Base Object List Component
 *
 * Displays all knowledge objects with filtering, search, and bulk actions.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  knowledgeBaseApi,
  type KbObject,
  type KbObjectTemplate,
  type ObjectStatus,
} from "@/lib/api/knowledge-base";
import {
  AlertTriangle,
  Archive,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  Edit,
  FileText,
  Filter,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import useSWR from "swr";

// ==================== Sub-components ====================

interface StatusBadgeProps {
  status: ObjectStatus;
  translations: Record<ObjectStatus, string>;
}

function StatusBadge({ status, translations }: StatusBadgeProps) {
  const variants: Record<
    ObjectStatus,
    { className: string; icon: React.ReactNode }
  > = {
    draft: {
      className: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
      icon: <Edit className="h-3 w-3 mr-1" />,
    },
    pending: {
      className: "bg-blue-500/10 text-blue-700 border-blue-500/20",
      icon: <Clock className="h-3 w-3 mr-1" />,
    },
    indexing: {
      className: "bg-purple-500/10 text-purple-700 border-purple-500/20",
      icon: <Loader2 className="h-3 w-3 mr-1 animate-spin" />,
    },
    indexed: {
      className: "bg-green-500/10 text-green-700 border-green-500/20",
      icon: <BookOpen className="h-3 w-3 mr-1" />,
    },
    error: {
      className: "bg-red-500/10 text-red-700 border-red-500/20",
      icon: <AlertTriangle className="h-3 w-3 mr-1" />,
    },
    archived: {
      className: "bg-gray-500/10 text-gray-700 border-gray-500/20",
      icon: <Archive className="h-3 w-3 mr-1" />,
    },
  };
  const variant = variants[status];
  return (
    <Badge variant="outline" className={variant.className}>
      {variant.icon}
      {translations[status]}
    </Badge>
  );
}

interface DeleteDialogProps {
  object: KbObject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
  t: ReturnType<typeof useTranslations<"knowledgeBase.objects">>;
  tCommon: ReturnType<typeof useTranslations<"knowledgeBase.common">>;
}

function DeleteDialog({
  object,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
  t,
  tCommon,
}: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("deleteDialog.description", { name: object?.name || "" })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? t("deleteDialog.deleting") : tCommon("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BulkActionDialogProps {
  action: string;
  open: boolean;
  selectedCount: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
  t: ReturnType<typeof useTranslations<"knowledgeBase.objects">>;
  tCommon: ReturnType<typeof useTranslations<"knowledgeBase.common">>;
}

function BulkActionDialog({
  action,
  open,
  selectedCount,
  onOpenChange,
  onConfirm,
  isLoading,
  t,
  tCommon,
}: BulkActionDialogProps) {
  const getTitle = () => {
    switch (action) {
      case "publish":
        return t("bulkDialog.publishTitle");
      case "archive":
        return t("bulkDialog.archiveTitle");
      case "draft":
        return t("bulkDialog.draftTitle");
      case "delete":
        return t("bulkDialog.deleteTitle");
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>
            {t("bulkDialog.description", { action, count: selectedCount })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            variant={action === "delete" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? t("bulkDialog.processing") : t("bulkDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Main Component ====================

interface ObjectListProps {
  templateId?: string;
}

export function ObjectList({ templateId: initialTemplateId }: ObjectListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("knowledgeBase.objects");
  const tCommon = useTranslations("knowledgeBase.common");

  // Filter state
  const {
    value: search,
    debouncedValue: debouncedSearch,
    setValue: setSearch,
  } = useDebouncedValue(searchParams.get("search") || "", { delay: 300 });

  const [status, setStatus] = useState<ObjectStatus | "all">(
    (searchParams.get("status") as ObjectStatus) || "all",
  );
  const [templateId, setTemplateId] = useState<string | "all">(
    initialTemplateId || searchParams.get("templateId") || "all",
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const pageSizeOptions = [10, 20, 50];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Dialog state
  const [deleteObject, setDeleteObject] = useState<KbObject | null>(null);
  const [bulkAction, setBulkAction] = useState<{
    action: string;
    open: boolean;
  }>({ action: "", open: false });
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch templates for filter dropdown
  const { data: templates } = useSWR<KbObjectTemplate[]>(
    "knowledge-base-templates",
    () => knowledgeBaseApi.listTemplates(),
  );

  // Fetch objects with filters
  const { data, isLoading, mutate } = useSWR(
    [
      "knowledge-base-objects",
      debouncedSearch,
      status,
      templateId,
      page,
      pageSize,
    ],
    () =>
      knowledgeBaseApi.listObjects({
        search: debouncedSearch || undefined,
        status: status !== "all" ? status : undefined,
        templateId: templateId !== "all" ? templateId : undefined,
        page,
        limit: pageSize,
      }),
  );

  const objects = data?.data || [];
  const totalPages = data?.pagination?.totalPages || 1;

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  // Selection handlers
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === objects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(objects.map((o) => o.id)));
    }
  }, [objects, selectedIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Action handlers
  const handlePublish = async (object: KbObject) => {
    try {
      await knowledgeBaseApi.publishObject(object.id);
      await mutate();
    } catch (error) {
      console.error("Failed to publish object:", error);
    }
  };

  const handleArchive = async (object: KbObject) => {
    try {
      await knowledgeBaseApi.archiveObject(object.id);
      await mutate();
    } catch (error) {
      console.error("Failed to archive object:", error);
    }
  };

  const handleReindex = async (object: KbObject) => {
    try {
      await knowledgeBaseApi.reindexObject(object.id);
      await mutate();
    } catch (error) {
      console.error("Failed to reindex object:", error);
    }
  };

  const handleDuplicate = async (object: KbObject) => {
    try {
      const newObject = await knowledgeBaseApi.duplicateObject(object.id);
      await mutate();
      router.push(`/dashboard/knowledge-base/objects/${newObject.id}`);
    } catch (error) {
      console.error("Failed to duplicate object:", error);
    }
  };

  const handleDelete = async () => {
    if (!deleteObject) return;
    setIsProcessing(true);
    try {
      await knowledgeBaseApi.deleteObject(deleteObject.id);
      await mutate();
      setDeleteObject(null);
    } catch (error) {
      console.error("Failed to delete object:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map((id) => knowledgeBaseApi.deleteObject(id)),
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      await mutate();
      setSelectedIds(new Set());
      setBulkDeleteDialogOpen(false);
    } catch (error) {
      console.error("Failed to bulk delete objects:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkAction = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      switch (bulkAction.action) {
        case "publish":
          await Promise.all(
            ids.map((id) => knowledgeBaseApi.publishObject(id)),
          );
          break;
        case "archive":
          await knowledgeBaseApi.bulkUpdateStatus({
            objectIds: ids,
            status: "archived",
          });
          break;
        case "draft":
          await knowledgeBaseApi.bulkUpdateStatus({
            objectIds: ids,
            status: "draft",
          });
          break;
      }
      await mutate();
      setSelectedIds(new Set());
      setBulkAction({ action: "", open: false });
    } catch (error) {
      console.error("Failed to perform bulk action:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Status translations for StatusBadge component
  const statusTranslations: Record<ObjectStatus, string> = {
    draft: t("status.draft"),
    pending: t("status.pending"),
    indexing: t("status.indexing"),
    indexed: t("status.indexed"),
    error: t("status.error"),
    archived: t("status.archived"),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("totalObjects", { count: data?.pagination?.totalItems || 0 })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {tCommon("refresh")}
          </Button>
          <Button
            size="sm"
            onClick={() => router.push("/dashboard/knowledge-base/objects/new")}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("newObject")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <>
          {/* Filter Skeleton */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-[180px]" />
                <Skeleton className="h-10 w-[140px]" />
              </div>
            </CardContent>
          </Card>

          {/* Table Skeleton */}
          <Card>
            <CardContent className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1">
                  <SearchInput
                    placeholder={t("searchPlaceholder")}
                    value={search}
                    onChange={(value) => {
                      setSearch(value);
                      setPage(1);
                    }}
                  />
                </div>

                {/* Template Filter */}
                <Select
                  value={templateId}
                  onValueChange={(value) => {
                    setTemplateId(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder={t("allTemplates")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allTemplates")}</SelectItem>
                    {templates?.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.displayName || template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Status Filter */}
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value as ObjectStatus | "all");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder={t("allStatus")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allStatus")}</SelectItem>
                    <SelectItem value="draft">{t("status.draft")}</SelectItem>
                    <SelectItem value="pending">
                      {t("status.pending")}
                    </SelectItem>
                    <SelectItem value="indexing">
                      {t("status.indexing")}
                    </SelectItem>
                    <SelectItem value="indexed">
                      {t("status.indexed")}
                    </SelectItem>
                    <SelectItem value="error">{t("status.error")}</SelectItem>
                    <SelectItem value="archived">
                      {t("status.archived")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bulk Actions */}
              <BulkActionBar
                selectedCount={selectedIds.size}
                onClearSelection={() => setSelectedIds(new Set())}
                onDelete={() => setBulkDeleteDialogOpen(true)}
                extraActions={
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setBulkAction({ action: "publish", open: true })
                      }
                    >
                      <BookOpen className="h-4 w-4 mr-2" />
                      {t("actions.publish")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setBulkAction({ action: "archive", open: true })
                      }
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      {t("actions.archive")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setBulkAction({ action: "draft", open: true })
                      }
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      {t("actions.setDraft")}
                    </Button>
                  </>
                }
              />
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {objects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">{t("noObjectsFound")}</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    {search || status !== "all" || templateId !== "all"
                      ? t("tryAdjustingFilters")
                      : t("noObjectsHint")}
                  </p>
                  {!search && status === "all" && templateId === "all" && (
                    <Button
                      onClick={() =>
                        router.push("/dashboard/knowledge-base/objects/new")
                      }
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t("createObject")}
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={
                              selectedIds.size === objects.length &&
                              objects.length > 0
                            }
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead>{t("table.name")}</TableHead>
                        <TableHead>{t("table.template")}</TableHead>
                        <TableHead>{t("table.status")}</TableHead>
                        <TableHead>{t("table.updated")}</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {objects.map((object) => (
                        <TableRow
                          key={object.id}
                          className="cursor-pointer"
                          onClick={() =>
                            router.push(
                              `/dashboard/knowledge-base/objects/${object.id}`,
                            )
                          }
                        >
                          <TableCell
                            onClick={(e: React.MouseEvent) =>
                              e.stopPropagation()
                            }
                          >
                            <Checkbox
                              checked={selectedIds.has(object.id)}
                              onCheckedChange={() => toggleSelect(object.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {object.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {object.templateName || t("unknownTemplate")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              status={object.status}
                              translations={statusTranslations}
                            />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(object.updatedAt)}
                          </TableCell>
                          <TableCell
                            onClick={(e: React.MouseEvent) =>
                              e.stopPropagation()
                            }
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedIds(new Set([object.id]));
                                  }}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                  {tCommon("select")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    router.push(
                                      `/dashboard/knowledge-base/objects/${object.id}`,
                                    )
                                  }
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  {tCommon("edit")}
                                </DropdownMenuItem>
                                {object.status === "draft" && (
                                  <DropdownMenuItem
                                    onClick={() => handlePublish(object)}
                                  >
                                    <BookOpen className="h-4 w-4 mr-2" />
                                    {t("actions.publish")}
                                  </DropdownMenuItem>
                                )}
                                {object.status === "indexed" && (
                                  <DropdownMenuItem
                                    onClick={() => handleArchive(object)}
                                  >
                                    <Archive className="h-4 w-4 mr-2" />
                                    {t("actions.archive")}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => handleReindex(object)}
                                >
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  {t("actions.reindex")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDuplicate(object)}
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  {t("actions.duplicate")}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setDeleteObject(object)}
                                  className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  {tCommon("delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  <div className="px-6 py-4 border-t">
                    <Pagination
                      page={page}
                      totalPages={totalPages}
                      onPageChange={setPage}
                      pageSize={pageSize}
                      onPageSizeChange={handlePageSizeChange}
                      pageSizeOptions={pageSizeOptions}
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
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Delete Dialog */}
      <DeleteDialog
        object={deleteObject}
        open={!!deleteObject}
        onOpenChange={(open) => !open && setDeleteObject(null)}
        onConfirm={handleDelete}
        isLoading={isProcessing}
        t={t}
        tCommon={tCommon}
      />

      {/* Bulk Delete Dialog */}
      <BulkActionDialog
        action="delete"
        open={bulkDeleteDialogOpen}
        selectedCount={selectedIds.size}
        onOpenChange={(open) => !open && setBulkDeleteDialogOpen(false)}
        onConfirm={handleBulkDelete}
        isLoading={isProcessing}
        t={t}
        tCommon={tCommon}
      />

      {/* Bulk Action Dialog */}
      <BulkActionDialog
        action={bulkAction.action}
        open={bulkAction.open}
        selectedCount={selectedIds.size}
        onOpenChange={(open) => setBulkAction({ ...bulkAction, open })}
        onConfirm={handleBulkAction}
        isLoading={isProcessing}
        t={t}
        tCommon={tCommon}
      />
    </div>
  );
}
