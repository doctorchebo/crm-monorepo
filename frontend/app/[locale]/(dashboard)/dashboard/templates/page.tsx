"use client";

import { DeleteConfirmationDialog } from "@/components/dialogs/delete-confirmation-dialog";
import {
  TemplateCard,
  type TemplateCardData,
  type TemplateLocaleData,
} from "@/components/templates/template-card";
import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/ui/page-layout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuthProtection } from "@/hooks/use-auth";
import { useNotification } from "@/hooks/use-notification";
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
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

/**
 * Template interface matching the API response
 */
interface Template extends TemplateCardData {
  createdAt: string;
  updatedAt: string;
}

export default function TemplatesPage() {
  const router = useRouter();
  const t = useTranslations("templates");
  const tCommon = useTranslations("common");
  const { addNotification } = useNotification();

  // Protect this route - redirect to login if token is missing or expired
  useAuthProtection();

  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync-related state
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingTemplateId, setSyncingTemplateId] = useState<string | null>(
    null
  );

  const {
    data: templates = [],
    isLoading,
    mutate,
  } = useSWR("templates", async () => {
    try {
      return await backendApi.templates.list();
    } catch (error) {
      console.error("Failed to fetch templates:", error);
      return [];
    }
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
        5000
      );

      // Refresh the templates list to show updated status
      mutate();
    },
    [t, addNotification, mutate]
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

  // Filter and sort templates
  const filteredTemplates = useMemo(() => {
    return (templates as Template[])
      .filter((template) => {
        const searchLower = searchQuery.toLowerCase();
        const nameToSearch = (
          template.displayName || template.name
        ).toLowerCase();
        return (
          nameToSearch.includes(searchLower) ||
          template.description?.toLowerCase().includes(searchLower) ||
          template.locales?.some((locale) =>
            locale.body.toLowerCase().includes(searchLower)
          )
        );
      })
      .sort((a, b) => {
        const dateA = new Date(a.updatedAt).getTime();
        const dateB = new Date(b.updatedAt).getTime();
        return dateB - dateA;
      });
  }, [templates, searchQuery]);

  // Delete template handler
  const handleDelete = async () => {
    if (!templateToDelete) return;

    setIsDeleting(true);
    try {
      await backendApi.templates.delete(templateToDelete.id);
      addNotification(
        t("templateDeleted") || "Template deleted successfully",
        "success",
        3000
      );
      mutate();
    } catch (error) {
      console.error("Failed to delete template:", error);
      addNotification(
        t("templateDeleteFailed") || "Failed to delete template",
        "error",
        3000
      );
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
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

  const handleDeleteClick = (template: Template) => {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
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
          3000
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
          5000
        );
        mutate();
      } else {
        addNotification(
          t("syncCompleteNoChanges", { total: result.totalProcessed }) ||
            `Synced ${result.totalProcessed} templates. No status changes detected.`,
          "info",
          3000
        );
      }
    } catch (error) {
      console.error("Failed to sync templates:", error);
      addNotification(
        t("syncFailed") || "Failed to sync template statuses",
        "error",
        3000
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
    locale: TemplateLocaleData
  ) => {
    if (syncingTemplateId === template.id) return;

    setSyncingTemplateId(template.id);
    try {
      const result: TemplateSyncResult = await backendApi.templates.syncStatus(
        template.id,
        { locale: locale.locale }
      );

      if (result.error) {
        addNotification(
          t("syncSingleFailed", {
            name: template.displayName || template.name,
          }) || `Failed to sync "${template.displayName || template.name}"`,
          "error",
          3000
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
          4000
        );
        mutate();
      } else {
        addNotification(
          t("syncSingleNoChange", {
            name: template.displayName || template.name,
          }) || `"${template.displayName || template.name}" is up to date`,
          "info",
          3000
        );
      }
    } catch (error) {
      console.error("Failed to sync template:", error);
      addNotification(
        t("syncSingleFailed", {
          name: template.displayName || template.name,
        }) || `Failed to sync "${template.displayName || template.name}"`,
        "error",
        3000
      );
    } finally {
      setSyncingTemplateId(null);
    }
  };

  /**
   * Count of templates that have pending status (across any locale)
   */
  const pendingTemplatesCount = useMemo(() => {
    return (templates as Template[]).filter((template) => {
      return template.locales?.some(
        (locale) => locale.approvalStatus === "pending" && locale.metaTemplateId
      );
    }).length;
  }, [templates]);

  return (
    <PageLayout
      title={t("title") || "Templates"}
      description={t("subtitle") || "Create and manage message templates for all your platforms"}
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
      {/* Search */}
      <Input
        placeholder={t("searchPlaceholder") || "Search templates..."}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Templates Grid */}
      <div>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-64 w-full rounded-lg" />
            ))}
          </div>
        ) : filteredTemplates.length === 0 ? (
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
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
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setTemplateToDelete(null);
        }}
        title={t("deleteTitle") || "Delete Template"}
        description={
          t("deleteDescription") ||
          `Are you sure you want to delete "${templateToDelete?.name}"? This action cannot be undone.`
        }
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </PageLayout>
  );
}
