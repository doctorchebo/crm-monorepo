"use client";

import { DeleteConfirmationDialog } from "@/components/dialogs/delete-confirmation-dialog";
import { RequestApprovalModal } from "@/components/templates/request-approval-modal";
import { TemplateStatusBadge } from "@/components/templates/template-status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { backendApi, TemplateApprovalStatusValue } from "@/lib/api/endpoints";
import { MoreVertical, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

interface TemplateLocale {
  id: string;
  locale: string;
  body: string;
  header?: string;
  footer?: string;
  approvalStatus?: TemplateApprovalStatusValue;
  qualityRating?: "high" | "medium" | "low" | null;
  rejectionReason?: string | null;
}

interface Template {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  isVisible: boolean;
  isActive: boolean;
  locales?: TemplateLocale[];
  platforms?: Array<{
    platformName: string;
    isEnabled: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

function truncateText(text: string, maxLength: number = 100): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

function getPlatformBadges(
  platforms?: Array<{ platformName: string; isEnabled: boolean }>
): string[] {
  if (!platforms) return ["WhatsApp"];
  return platforms.filter((p) => p.isEnabled).map((p) => p.platformName);
}

export default function TemplatesPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
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
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [templateForApproval, setTemplateForApproval] = useState<{
    templateId: string;
    locale: string;
    templateName: string;
  } | null>(null);

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

  const filteredTemplates = useMemo(() => {
    return (templates as Template[])
      .filter((template: Template) => {
        const searchLower = searchQuery.toLowerCase();
        // Search by displayName first, fall back to name
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

  const handleEdit = (templateId: string) => {
    router.push(`/dashboard/templates/${templateId}/edit`);
  };

  const handleDeleteClick = (template: Template) => {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
  };

  const handleRequestApproval = (
    template: Template,
    templateLocale: TemplateLocale
  ) => {
    setTemplateForApproval({
      templateId: template.id,
      locale: templateLocale.locale,
      templateName: `${
        template.displayName || template.name
      } (${templateLocale.locale.toUpperCase()})`,
    });
    setApprovalModalOpen(true);
  };

  const canRequestApproval = (templateLocale?: TemplateLocale): boolean => {
    if (!templateLocale) return false;
    const status = templateLocale.approvalStatus;
    // Can request approval if draft, rejected, or not yet submitted
    return !status || status === "draft" || status === "rejected";
  };

  /**
   * Statuses that prevent template editing.
   * Templates under review or with certain Meta-controlled statuses cannot be edited.
   */
  const NON_EDITABLE_STATUSES: TemplateApprovalStatusValue[] = [
    "pending",
    "approved",
    "paused",
    "disabled",
  ];

  /**
   * Determines if a template can be edited based on its approval status.
   * Templates can only be edited if they are in draft, rejected, or appeal_requested state.
   */
  const canEdit = (templateLocale?: TemplateLocale): boolean => {
    if (!templateLocale) return true; // New templates can be edited
    const status = templateLocale.approvalStatus;
    if (!status) return true; // No status = editable
    return !NON_EDITABLE_STATUSES.includes(status);
  };

  /**
   * Returns the translation key for why editing is disabled for a given status.
   * Returns null if the template can be edited.
   */
  const getEditDisabledReason = (
    templateLocale?: TemplateLocale
  ): string | null => {
    if (!templateLocale) return null;
    const status = templateLocale.approvalStatus;
    if (!status || !NON_EDITABLE_STATUSES.includes(status)) return null;

    // Get the localized reason from translations
    const reasonKey = `editDisabled.${status}` as const;
    return t(`approval.${reasonKey}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h1 className="text-3xl font-bold">{t("title") || "Templates"}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {t("subtitle") ||
              "Create and manage message templates for all your platforms"}
          </p>
        </div>
        <Button
          onClick={() => router.push(`/dashboard/templates/new`)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {tCommon("create")}
        </Button>
      </div>

      {/* Search */}
      <div className="px-6 py-4 border-b">
        <Input
          placeholder={t("searchPlaceholder") || "Search templates..."}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Templates Grid */}
      <div className="flex-1 overflow-y-auto p-6">
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
            {filteredTemplates.map((template) => {
              const templateLocale = template.locales?.[0];
              const isEditable = canEdit(templateLocale);
              const editDisabledReason = getEditDisabledReason(templateLocale);

              return (
                <Card
                  key={template.id}
                  className={`p-4 hover:shadow-lg transition-shadow group relative ${
                    isEditable ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  {/* Template Content */}
                  <div
                    className="mb-3"
                    onClick={
                      isEditable ? () => handleEdit(template.id) : undefined
                    }
                  >
                    <div className="flex items-start justify-between mb-2 pr-8">
                      <h3 className="font-semibold text-lg truncate flex-1 min-w-0">
                        {template.displayName || template.name}
                      </h3>
                      <div className="flex gap-1 items-center flex-shrink-0">
                        {/* Approval Status Badge */}
                        {templateLocale && templateLocale.approvalStatus && (
                          <TemplateStatusBadge
                            status={templateLocale.approvalStatus}
                            qualityRating={
                              templateLocale.qualityRating ?? undefined
                            }
                            showQuality={
                              templateLocale.approvalStatus === "approved"
                            }
                            customTooltip={editDisabledReason ?? undefined}
                            stopPropagation={!isEditable}
                          />
                        )}
                        {template.isVisible ? (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                            {t("visible") || "Visible"}
                          </span>
                        ) : (
                          <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                            {t("hidden") || "Hidden"}
                          </span>
                        )}
                      </div>
                    </div>

                    {template.description && (
                      <p className="text-xs text-gray-600 mb-2">
                        {template.description}
                      </p>
                    )}

                    {/* Template Preview */}
                    {templateLocale && (
                      <div className="bg-blue-50 p-3 rounded-md mb-3 border border-blue-100">
                        <p className="text-xs font-semibold text-blue-900 mb-1">
                          {templateLocale.locale.toUpperCase()}
                        </p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {truncateText(templateLocale.body, 80)}
                        </p>
                      </div>
                    )}

                    {/* Platforms */}
                    <div className="flex gap-1 flex-wrap">
                      {getPlatformBadges(template.platforms).map((platform) => (
                        <span
                          key={platform}
                          className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded"
                        >
                          {platform}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Hover Options */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-muted"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* Edit option - disabled with tooltip when template is under review */}
                        {isEditable ? (
                          <DropdownMenuItem
                            onClick={() => handleEdit(template.id)}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            {tCommon("edit")}
                          </DropdownMenuItem>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <DropdownMenuItem
                                    disabled
                                    className="opacity-50 cursor-not-allowed"
                                  >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    {tCommon("edit")}
                                  </DropdownMenuItem>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-xs">
                                <p>{editDisabledReason}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {templateLocale &&
                          canRequestApproval(templateLocale) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRequestApproval(
                                    template,
                                    templateLocale
                                  )
                                }
                              >
                                <Send className="h-4 w-4 mr-2" />
                                {t("requestApproval") || "Request Approval"}
                              </DropdownMenuItem>
                            </>
                          )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(template)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {tCommon("delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Card>
              );
            })}
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

      {/* Request Approval Modal */}
      {templateForApproval && (
        <RequestApprovalModal
          open={approvalModalOpen}
          onOpenChange={(open) => {
            setApprovalModalOpen(open);
            if (!open) {
              setTemplateForApproval(null);
            }
          }}
          templateId={templateForApproval.templateId}
          locale={templateForApproval.locale}
          templateName={templateForApproval.templateName}
          onSuccess={() => {
            mutate(); // Refresh templates list
            addNotification(
              t("approvalRequestSubmitted") ||
                "Approval request submitted successfully",
              "success",
              3000
            );
          }}
        />
      )}
    </div>
  );
}
