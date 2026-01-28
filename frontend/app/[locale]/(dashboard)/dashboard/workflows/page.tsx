"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateLibraryDialog, WorkflowIcon } from "@/components/workflow";
import { useNotification } from "@/hooks/use-notification";
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
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
  onEdit,
  onDuplicate,
  onDelete,
  onArchive,
}: {
  workflow: Workflow;
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
      target.closest("[data-radix-collection-item]")
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
      className="hover:shadow-md transition-shadow cursor-pointer group"
      onClick={handleCardClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
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
                className="text-destructive focus:text-destructive"
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

export default function WorkflowsPage() {
  const t = useTranslations("workflows");
  const router = useRouter();
  const { addNotification } = useNotification();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | "all">(
    "all",
  );
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const response = await workflowBuilderApi.list({
        status: statusFilter === "all" ? undefined : statusFilter,
        search: search || undefined,
      });
      setWorkflows(response.workflows);
    } catch (error) {
      addNotification(
        `${t("errors.loadFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, addNotification, t]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

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
      fetchWorkflows();
    } catch (error) {
      addNotification(
        `${t("errors.duplicateFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    try {
      await workflowBuilderApi.delete(id);
      addNotification(
        `${t("notifications.deleted")}: ${t("notifications.deletedMessage")}`,
        "success",
      );
      fetchWorkflows();
    } catch (error) {
      addNotification(
        `${t("errors.deleteFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
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
      fetchWorkflows();
    } catch (error) {
      addNotification(
        `${t("errors.archiveFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
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

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
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
            <TabsTrigger value="archived">{t("filters.archived")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Workflow Grid */}
      {loading ? (
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
              onEdit={handleEditWorkflow}
              onDuplicate={handleDuplicateWorkflow}
              onDelete={handleDeleteWorkflow}
              onArchive={handleArchiveWorkflow}
            />
          ))}
        </div>
      )}

      {/* Template Library Dialog */}
      <TemplateLibraryDialog
        isOpen={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
      />
    </div>
  );
}
