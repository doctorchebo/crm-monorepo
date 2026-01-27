"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { workflowBuilderApi } from "@/lib/api/workflow-builder";
import type {
  WorkflowTemplate,
  WorkflowTemplateCategory,
} from "@/lib/types/workflow.types";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  GitBranch,
  Layers,
  Loader2,
  Search,
  Sparkles,
  Star,
  Workflow,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkflowIcon } from "./workflow-icon";

interface TemplateLibraryDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Template Library Dialog
 *
 * A modal dialog for browsing and using workflow templates.
 * Features:
 * - Category filtering
 * - Search functionality
 * - Template preview with node/connection counts
 * - One-click template usage
 */
export function TemplateLibraryDialog({
  isOpen,
  onClose,
}: TemplateLibraryDialogProps) {
  const t = useTranslations("workflows.templates");
  const router = useRouter();

  const [categories, setCategories] = useState<WorkflowTemplateCategory[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [usingTemplateId, setUsingTemplateId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    try {
      const [categoriesData, templatesData] = await Promise.all([
        workflowBuilderApi.templates.listCategories(),
        workflowBuilderApi.templates.list(),
      ]);

      setCategories(categoriesData);
      setTemplates(templatesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [isOpen, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter templates based on category and search
  const filteredTemplates = useMemo(() => {
    let result = templates;

    if (selectedCategoryId) {
      result = result.filter((t) => t.categoryId === selectedCategoryId);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description?.toLowerCase().includes(query),
      );
    }

    return result;
  }, [templates, selectedCategoryId, searchQuery]);

  // Group templates: featured first, then by use count
  const { featuredTemplates, regularTemplates } = useMemo(() => {
    const featured = filteredTemplates.filter((t) => t.isFeatured);
    const regular = filteredTemplates.filter((t) => !t.isFeatured);
    return { featuredTemplates: featured, regularTemplates: regular };
  }, [filteredTemplates]);

  const handleUseTemplate = async (templateId: string) => {
    setUsingTemplateId(templateId);

    try {
      const workflow = await workflowBuilderApi.templates.createFromTemplate(
        templateId,
        {},
      );
      onClose();
      router.push(`/dashboard/workflows/${workflow.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.useFailed"));
    } finally {
      setUsingTemplateId(null);
    }
  };

  const handleCategorySelect = (categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - Categories */}
          <div className="w-56 border-r bg-muted/30 p-4 flex flex-col gap-3">
            <CategoryButton
              icon={<Workflow className="h-4 w-4" />}
              label={t("allCategories")}
              isSelected={selectedCategoryId === null}
              onClick={() => handleCategorySelect(null)}
            />

            {loading ? (
              <CategorySkeleton />
            ) : (
              categories.map((category) => (
                <CategoryButton
                  key={category.id}
                  icon={
                    <WorkflowIcon
                      icon={category.icon}
                      size="sm"
                      useLucideDefault={true}
                    />
                  }
                  label={category.name}
                  isSelected={selectedCategoryId === category.id}
                  onClick={() => handleCategorySelect(category.id)}
                />
              ))
            )}
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col">
            {/* Search */}
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Templates grid */}
            <ScrollArea className="flex-1">
              <div className="p-4">
                {loading ? (
                  <TemplateGridSkeleton />
                ) : error ? (
                  <TemplateError error={error} onRetry={fetchData} />
                ) : filteredTemplates.length === 0 ? (
                  <TemplateEmpty hasSearch={!!searchQuery.trim()} />
                ) : (
                  <div className="space-y-6">
                    {/* Featured templates */}
                    {featuredTemplates.length > 0 && (
                      <div>
                        <h3 className="flex items-center gap-2 text-sm font-medium mb-3">
                          <Sparkles className="h-4 w-4 text-yellow-500" />
                          {t("featured")}
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          {featuredTemplates.map((template) => (
                            <TemplateCard
                              key={template.id}
                              template={template}
                              isUsing={usingTemplateId === template.id}
                              onUse={() => handleUseTemplate(template.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Regular templates */}
                    {regularTemplates.length > 0 && (
                      <div>
                        {featuredTemplates.length > 0 && (
                          <h3 className="text-sm font-medium mb-3">
                            All Templates
                          </h3>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                          {regularTemplates.map((template) => (
                            <TemplateCard
                              key={template.id}
                              template={template}
                              isUsing={usingTemplateId === template.id}
                              onUse={() => handleUseTemplate(template.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface CategoryButtonProps {
  icon: React.ReactNode;
  label: string;
  isSelected: boolean;
  onClick: () => void;
}

function CategoryButton({
  icon,
  label,
  isSelected,
  onClick,
}: CategoryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left w-full",
        isSelected
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

interface TemplateCardProps {
  template: WorkflowTemplate;
  isUsing: boolean;
  onUse: () => void;
}

function TemplateCard({ template, isUsing, onUse }: TemplateCardProps) {
  const t = useTranslations("workflows.templates");
  const definition = template.definition as {
    nodes?: unknown[];
    connections?: unknown[];
  };

  const nodeCount = definition?.nodes?.length ?? 0;
  const connectionCount = definition?.connections?.length ?? 0;

  return (
    <div className="rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <WorkflowIcon
            icon={template.icon}
            size="xl"
            useLucideDefault={true}
          />
          <div className="min-w-0">
            <h4 className="font-medium text-sm truncate">{template.name}</h4>
            {template.isFeatured && (
              <Badge variant="secondary" className="mt-0.5 text-xs">
                <Star className="h-3 w-3 mr-1 fill-yellow-500 text-yellow-500" />
                Featured
              </Badge>
            )}
          </div>
        </div>
      </div>

      {template.description && (
        <p className="text-xs text-muted-foreground mt-3 line-clamp-2">
          {template.description}
        </p>
      )}

      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          {nodeCount} nodes
        </span>
        <span className="flex items-center gap-1">
          <ArrowRight className="h-3 w-3" />
          {connectionCount} connections
        </span>
      </div>

      <Button
        size="sm"
        className="w-full mt-4"
        onClick={onUse}
        disabled={isUsing}
      >
        {isUsing ? (
          <>
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            {t("useTemplate")}
            <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </>
        )}
      </Button>
    </div>
  );
}

function CategorySkeleton() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </>
  );
}

function TemplateGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-8 w-full mt-3" />
          <Skeleton className="h-4 w-24 mt-3" />
          <Skeleton className="h-8 w-full mt-4" />
        </div>
      ))}
    </div>
  );
}

function TemplateError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  const t = useTranslations("workflows.templates");

  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <p className="text-sm text-muted-foreground mb-4">{error}</p>
      <Button variant="outline" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}

function TemplateEmpty({ hasSearch }: { hasSearch: boolean }) {
  const t = useTranslations("workflows.templates");

  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <Layers className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <h3 className="font-medium mb-1">
        {hasSearch ? t("noResults") : t("empty.title")}
      </h3>
      <p className="text-sm text-muted-foreground">
        {hasSearch ? t("noResultsDescription") : t("empty.description")}
      </p>
    </div>
  );
}
