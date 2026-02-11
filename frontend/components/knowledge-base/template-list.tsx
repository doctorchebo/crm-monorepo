/**
 * Knowledge Base Template List Component
 *
 * Displays all available templates with options to create, edit, and duplicate.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientFilteredData } from "@/hooks/use-client-filtered-data";
import {
  knowledgeBaseApi,
  type KbObjectTemplate,
} from "@/lib/api/knowledge-base";
import {
  Bed,
  Briefcase,
  Copy,
  Edit,
  FileText,
  HelpCircle,
  Home,
  Layers,
  MoreHorizontal,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { Input } from "../ui/input";

// Icon mapping for template icons
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  "shopping-bag": ShoppingBag,
  briefcase: Briefcase,
  "help-circle": HelpCircle,
  "file-text": FileText,
  bed: Bed,
};

// ==================== Sub-components ====================

interface TemplateCardProps {
  template: KbObjectTemplate;
  isSelected: boolean;
  bulkDeleteMode: boolean;
  onToggleSelect: (id: string) => void;
  onDuplicate: (template: KbObjectTemplate) => void;
  onDelete: (template: KbObjectTemplate) => void;
  t: ReturnType<typeof useTranslations<"knowledgeBase.templates.list">>;
}

function TemplateCard({
  template,
  isSelected,
  bulkDeleteMode,
  onToggleSelect,
  onDuplicate,
  onDelete,
  t,
}: TemplateCardProps) {
  const router = useRouter();
  const Icon = template.icon ? iconMap[template.icon] || Layers : Layers;

  return (
    <Card
      className={`group hover:shadow-md transition-shadow ${isSelected ? "ring-2 ring-primary" : ""}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {bulkDeleteMode && !template.isSystem && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(template.id)}
                aria-label={`Select ${template.displayName}`}
              />
            )}
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${template.color}20` }}
            >
              <Icon
                className="h-5 w-5"
                style={{ color: template.color || "#6366F1" }}
              />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {template.displayName}
                {template.isSystem && (
                  <Badge variant="secondary" className="text-xs">
                    {t("system")}
                  </Badge>
                )}
              </CardTitle>
              {template.category && (
                <Badge variant="outline" className="mt-1 text-xs capitalize">
                  {template.category.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/dashboard/knowledge-base/templates/${template.id}`,
                  )
                }
              >
                <Edit className="h-4 w-4 mr-2" />
                {t("editTemplate")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(template)}>
                <Copy className="h-4 w-4 mr-2" />
                {t("duplicate")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/dashboard/knowledge-base/objects/new?templateId=${template.id}`,
                  )
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("createObjectFromTemplate")}
              </DropdownMenuItem>
              {!template.isSystem && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(template)}
                    className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("deleteTemplate")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        {template.description && (
          <CardDescription className="line-clamp-2 mb-3">
            {template.description}
          </CardDescription>
        )}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t("fields", { count: template.fieldCount || 0 })}</span>
          <span>{t("objects", { count: template.objectCount || 0 })}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1">
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-4" />
        <div className="flex justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

interface DuplicateDialogProps {
  template: KbObjectTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => void;
  isLoading: boolean;
  t: ReturnType<typeof useTranslations<"knowledgeBase.templates.list">>;
}

function DuplicateDialog({
  template,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
  t,
}: DuplicateDialogProps) {
  const [name, setName] = useState("");

  const handleOpenChange = (open: boolean) => {
    if (open && template) {
      setName(`${template.displayName} (Copy)`);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("duplicateDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("duplicateDialog.description", {
              name: template?.displayName || "",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="name">{t("duplicateDialog.nameLabel")}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("duplicateDialog.namePlaceholder")}
            className="mt-2"
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t("duplicateDialog.cancel")}
          </Button>
          <Button
            onClick={() => onConfirm(name)}
            disabled={!name.trim() || isLoading}
          >
            {isLoading
              ? t("duplicateDialog.duplicating")
              : t("duplicateDialog.duplicate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteDialogProps {
  template: KbObjectTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
  t: ReturnType<typeof useTranslations<"knowledgeBase.templates.list">>;
}

function DeleteDialog({
  template,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
  t,
}: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("deleteDialog.description", {
              name: template?.displayName || "",
            })}
            {(template?.objectCount || 0) > 0 && (
              <span className="block mt-2 text-destructive">
                {t("deleteDialog.objectsWarning", {
                  count: template?.objectCount || 0,
                })}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t("deleteDialog.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? t("deleteDialog.deleting") : t("deleteDialog.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Main Component ====================

export function TemplateList() {
  const router = useRouter();
  const t = useTranslations("knowledgeBase.templates.list");
  const tCommon = useTranslations("knowledgeBase.common");
  const tCategories = useTranslations("knowledgeBase.templates.categories");

  const [duplicateTemplate, setDuplicateTemplate] =
    useState<KbObjectTemplate | null>(null);
  const [deleteTemplate, setDeleteTemplate] = useState<KbObjectTemplate | null>(
    null,
  );
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const {
    data: templates,
    isLoading,
    mutate,
  } = useSWR<KbObjectTemplate[]>("knowledge-base-templates", () =>
    knowledgeBaseApi.listTemplates(),
  );

  const templateSearchFn = useCallback(
    (template: KbObjectTemplate, query: string) => {
      const q = query.toLowerCase();
      return (
        template.displayName.toLowerCase().includes(q) ||
        template.name.toLowerCase().includes(q) ||
        template.description?.toLowerCase().includes(q) ||
        template.category?.toLowerCase().includes(q) ||
        false
      );
    },
    [],
  );

  const getTemplateId = useCallback(
    (template: KbObjectTemplate) => template.id,
    [],
  );

  const {
    items: paginatedTemplates,
    searchQuery: search,
    setSearchQuery: setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    selectedIds,
    selectedCount,
    isAllSelected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
  } = useClientFilteredData<KbObjectTemplate>({
    data: templates || [],
    searchFn: templateSearchFn,
    initialPageSize: 12,
    pageSizeOptions: [12, 24, 48],
    getItemId: getTemplateId,
  });

  // Group paginated templates by category
  const groupedTemplates = useMemo(() => {
    return paginatedTemplates.reduce(
      (acc, template) => {
        const category = template.category || "other";
        if (!acc[category]) acc[category] = [];
        acc[category].push(template);
        return acc;
      },
      {} as Record<string, KbObjectTemplate[]>,
    );
  }, [paginatedTemplates]);

  const handleDuplicate = async (name: string) => {
    if (!duplicateTemplate) return;
    setIsProcessing(true);
    try {
      await knowledgeBaseApi.duplicateTemplate(duplicateTemplate.id, name);
      await mutate();
      setDuplicateTemplate(null);
    } catch (error) {
      console.error("Failed to duplicate template:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTemplate) return;
    setIsProcessing(true);
    try {
      await knowledgeBaseApi.deleteTemplate(deleteTemplate.id);
      await mutate();
      setDeleteTemplate(null);
    } catch (error) {
      console.error("Failed to delete template:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCount === 0) return;
    setIsProcessing(true);
    try {
      const ids = Array.from(selectedIds).filter((id) => {
        const template = templates?.find((t) => t.id === id);
        return template && !template.isSystem;
      });
      await Promise.allSettled(
        ids.map((id) => knowledgeBaseApi.deleteTemplate(id)),
      );
      await mutate();
      clearSelection();
      setBulkDeleteMode(false);
      setBulkDeleteDialogOpen(false);
    } catch (error) {
      console.error("Failed to bulk delete templates:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCategoryName = (category: string) => {
    // Try to get translation, fall back to formatted category name
    const knownCategories = [
      "real_estate",
      "services",
      "ecommerce",
      "hospitality",
      "support",
      "other",
    ];
    if (knownCategories.includes(category)) {
      return tCategories(
        category as
          | "real_estate"
          | "services"
          | "ecommerce"
          | "hospitality"
          | "support"
          | "other",
      );
    }
    return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <Button
          onClick={() => router.push("/dashboard/knowledge-base/templates/new")}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("newTemplate")}
        </Button>
      </div>

      {/* Search and Pagination */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="w-full sm:max-w-md">
          <SearchInput
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={setSearch}
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

      {/* Bulk Actions */}
      {bulkDeleteMode && (
        <BulkActionBar
          selectedCount={selectedCount}
          onClearSelection={() => {
            clearSelection();
            setBulkDeleteMode(false);
          }}
          onDelete={() => setBulkDeleteDialogOpen(true)}
        />
      )}

      {/* Templates Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <TemplateCardSkeleton key={i} />
          ))}
        </div>
      ) : !paginatedTemplates.length ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Layers className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">{t("noTemplatesFound")}</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              {search ? t("tryDifferentSearch") : t("noTemplatesHint")}
            </p>
            {!search && (
              <Button
                onClick={() =>
                  router.push("/dashboard/knowledge-base/templates/new")
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("createTemplate")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedTemplates || {}).map(
            ([category, categoryTemplates]) => (
              <div key={category}>
                <h2 className="text-sm font-medium text-muted-foreground mb-4">
                  {formatCategoryName(category)}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categoryTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      isSelected={selectedIds.has(template.id)}
                      bulkDeleteMode={bulkDeleteMode}
                      onToggleSelect={toggleSelect}
                      onDuplicate={setDuplicateTemplate}
                      onDelete={(tmpl) => {
                        setBulkDeleteMode(true);
                        toggleSelect(tmpl.id);
                      }}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {/* Dialogs */}
      <DuplicateDialog
        template={duplicateTemplate}
        open={!!duplicateTemplate}
        onOpenChange={(open) => !open && setDuplicateTemplate(null)}
        onConfirm={handleDuplicate}
        isLoading={isProcessing}
        t={t}
      />
      <DeleteDialog
        template={deleteTemplate}
        open={!!deleteTemplate}
        onOpenChange={(open) => !open && setDeleteTemplate(null)}
        onConfirm={handleDelete}
        isLoading={isProcessing}
        t={t}
      />

      {/* Bulk Delete Dialog */}
      <Dialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bulkDeleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("bulkDeleteDialog.description", { count: selectedCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteDialogOpen(false)}
              disabled={isProcessing}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isProcessing}
            >
              {isProcessing
                ? t("bulkDeleteDialog.deleting")
                : tCommon("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
