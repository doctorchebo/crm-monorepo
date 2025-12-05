"use client";

import { DeleteConfirmationDialog } from "@/components/dialogs/delete-confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthProtection } from "@/hooks/use-auth";
import { useNotification } from "@/hooks/use-notification";
import { backendApi } from "@/lib/api/endpoints";
import { MoreVertical, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";

interface Template {
  id: string;
  name: string;
  description?: string;
  isVisible: boolean;
  isActive: boolean;
  locales?: Array<{
    id: string;
    locale: string;
    body: string;
    header?: string;
    footer?: string;
  }>;
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

  const filteredTemplates = useMemo(() => {
    return (templates as Template[])
      .filter((template: Template) => {
        const searchLower = searchQuery.toLowerCase();
        return (
          template.name.toLowerCase().includes(searchLower) ||
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
            {filteredTemplates.map((template) => (
              <Card
                key={template.id}
                className="p-4 hover:shadow-lg transition-shadow cursor-pointer group relative"
              >
                {/* Template Content */}
                <div className="mb-3" onClick={() => handleEdit(template.id)}>
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-lg truncate">
                      {template.name}
                    </h3>
                    <div className="flex gap-1">
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
                  {template.locales && template.locales.length > 0 && (
                    <div className="bg-blue-50 p-3 rounded-md mb-3 border border-blue-100">
                      <p className="text-xs font-semibold text-blue-900 mb-1">
                        {template.locales[0].locale.toUpperCase()}
                      </p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {truncateText(template.locales[0].body, 80)}
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
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(template.id)}>
                        {tCommon("edit")}
                      </DropdownMenuItem>
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
    </div>
  );
}
