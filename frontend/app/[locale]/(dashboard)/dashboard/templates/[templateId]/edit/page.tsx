"use client";

import { EntityAuditHistoryPanel } from "@/components/audit";
import { VersionTimelineDrawer } from "@/components/templates/version-timeline-drawer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNotification } from "@/hooks/use-notification";
import { useTabState } from "@/hooks/use-tab-state";
import {
  backendApi,
  LANGUAGE_DISPLAY_NAMES,
  LANGUAGE_FLAGS,
  SUPPORTED_LANGUAGES,
  TemplateVersionInfo,
  TemplateVersionStatus,
} from "@/lib/api/endpoints";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  GitBranch,
  Globe,
  History,
  Plus,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { TemplateForm } from "../../form";

// ============================================================================
// LOADING SKELETON COMPONENT
// ============================================================================

/**
 * Skeleton component that mirrors the actual template edit page layout.
 * Provides a better loading experience by matching the visual structure.
 */
function TemplateEditSkeleton() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto space-y-6 p-6">
        {/* Header with Back Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Back button skeleton */}
            <Skeleton className="h-9 w-20" />
            <div>
              {/* Title and version badge */}
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-48" />
                <Skeleton className="h-6 w-32 rounded-full" />
              </div>
              {/* Description */}
              <Skeleton className="h-4 w-64 mt-2" />
            </div>
          </div>
          {/* Manage Versions button */}
          <Skeleton className="h-9 w-36" />
        </div>

        {/* Locale Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit">
              <Skeleton className="h-8 w-24 rounded-md" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </div>
          {/* Add Language button */}
          <Skeleton className="h-9 w-32" />
        </div>

        {/* Template Form Skeleton */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column - Form Fields */}
          <div className="flex-1 space-y-6 min-w-0">
            {/* Template Name Section */}
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>

            {/* Header Section */}
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-5 w-16 rounded" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-20" />
              </div>
              <Skeleton className="h-10 w-full" />
            </div>

            {/* Body Section */}
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-4 w-48" />
            </div>

            {/* Footer Section */}
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-5 w-16 rounded" />
              </div>
              <Skeleton className="h-10 w-full" />
            </div>

            {/* Buttons Section */}
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-5 w-16 rounded" />
              </div>
              <Skeleton className="h-9 w-32" />
            </div>
          </div>

          {/* Right Column - Preview */}
          <div className="hidden lg:block lg:w-[380px] lg:flex-shrink-0">
            <div className="sticky top-6">
              <div className="rounded-lg border bg-card p-4">
                <Skeleton className="h-5 w-24 mb-4" />
                {/* Phone Preview Frame */}
                <div className="mx-auto w-[280px]">
                  <div className="rounded-[2rem] border-4 border-gray-800 dark:border-gray-600 bg-gray-100 dark:bg-gray-900 p-2">
                    {/* Phone Screen */}
                    <div className="rounded-[1.5rem] bg-white dark:bg-gray-800 overflow-hidden">
                      {/* Status Bar */}
                      <div className="h-6 bg-gray-200 dark:bg-gray-700" />
                      {/* Chat Header */}
                      <div className="p-3 border-b flex items-center gap-2">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      {/* Message Area */}
                      <div className="p-3 min-h-[300px] space-y-3">
                        <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-3 max-w-[85%] ml-auto space-y-2">
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-4/5" />
                          <Skeleton className="h-3 w-3/5" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CONSTANTS
// ============================================================================
const IMMUTABLE_STATUSES: TemplateVersionStatus[] = [
  "pending_approval",
  "approved",
  "disabled",
];

// Map SUPPORTED_LANGUAGES to locale format with flags
const SUPPORTED_LOCALES = SUPPORTED_LANGUAGES.map((code) => ({
  code,
  name: LANGUAGE_DISPLAY_NAMES[code],
  flag: LANGUAGE_FLAGS[code],
}));

interface Template {
  id: string;
  name: string;
  displayName?: string;
  locales?: Array<{
    id: string;
    locale: string;
    body: string;
    header?: string;
    footer?: string;
  }>;
}

export default function EditTemplatePage() {
  const t = useTranslations("templates");
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = params.locale as string;
  const templateId = params.templateId as string;
  const { addNotification } = useNotification();

  // Check if viewOnly mode is requested via URL query parameter
  const viewOnlyFromUrl = searchParams.get("viewOnly") === "true";
  // Check if we're adding a new locale (bypasses guardrail)
  const addingNewLocale = searchParams.get("newLocale") === "true";
  // Check if a specific locale was requested via URL query parameter
  const localeFromUrl = searchParams.get("locale");

  // Selected locale for editing (controls which locale's version history is shown)
  // Initialize from URL param if provided, otherwise default to "en"
  const [selectedLocale, setSelectedLocale] = useTabState({
    defaultValue: localeFromUrl || "en",
    paramName: "locale",
  });

  // Version management state
  const [versionInfo, setVersionInfo] = useState<TemplateVersionInfo | null>(
    null,
  );
  const [isLoadingVersion, setIsLoadingVersion] = useState(true);
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false);
  const [viewOnlyMode, setViewOnlyMode] = useState(viewOnlyFromUrl);
  // Track the specific version being viewed (when viewing from version history drawer)
  const [viewedVersion, setViewedVersion] = useState<{
    versionNumber: number;
    status: TemplateVersionStatus;
  } | null>(null);
  const [showAddLocale, setShowAddLocale] = useState(addingNewLocale);
  const [showHistory, setShowHistory] = useState(false);
  const addLocaleRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        addLocaleRef.current &&
        !addLocaleRef.current.contains(event.target as Node)
      ) {
        setShowAddLocale(false);
      }
    }

    if (showAddLocale) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showAddLocale]);

  // Fetch template data
  const { data: templateData, isLoading: isLoadingTemplate } = useSWR<Template>(
    templateId ? `template-${templateId}` : null,
    templateId
      ? () => backendApi.templates.get(templateId) as Promise<Template>
      : null,
  );

  // Get existing locales from template (memoized to prevent infinite loops)
  const existingLocales = useMemo(
    () => templateData?.locales?.map((l) => l.locale) || [],
    [templateData?.locales],
  );

  // Get available locales (not yet added)
  const availableLocales = useMemo(
    () => SUPPORTED_LOCALES.filter((l) => !existingLocales.includes(l.code)),
    [existingLocales],
  );

  // Set initial selected locale when template loads
  // Only override if the current selected locale doesn't exist in the template
  // AND there was no URL param specifying a locale
  useEffect(() => {
    if (
      templateData?.locales?.length &&
      !existingLocales.includes(selectedLocale) &&
      !localeFromUrl // Don't override if user explicitly requested a locale via URL
    ) {
      setSelectedLocale(templateData.locales[0].locale);
    }
  }, [templateData, localeFromUrl]);

  // Fetch template version info for the selected locale
  const fetchVersionInfo = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!templateId || !selectedLocale) return;

      // Check if the locale exists for this template
      const localeExists = existingLocales.includes(selectedLocale);

      if (!localeExists) {
        // Locale doesn't exist yet - show empty state for versions
        setVersionInfo(null);
        setIsLoadingVersion(false);
        setViewOnlyMode(false);
        setViewedVersion(null);
        return;
      }

      // Only show loading state if not silent and we don't have data yet
      if (!options?.silent && !versionInfo) {
        setIsLoadingVersion(true);
      }

      try {
        const info = await backendApi.templates.getVersionInfo(
          templateId,
          selectedLocale,
        );
        console.log("[EditPage] fetchVersionInfo result:", {
          hasDraft: !!info.draftVersion,
          hasActive: !!info.activeVersion,
          draftId: info.draftVersion?.id,
          draftBody: info.draftVersion?.content?.body?.substring(0, 50),
          draftStatus: info.draftVersion?.status,
        });
        setVersionInfo(info);

        // Only update view mode when NOT doing a silent fetch
        // Silent fetches are used to refresh data for the drawer without affecting the current view state
        if (!options?.silent) {
          // Determine editability based on version status
          // Priority: Draft > Active > None
          if (info.draftVersion) {
            // Check the actual status of the draft version
            const draftStatus = info.draftVersion
              .status as TemplateVersionStatus;
            if (IMMUTABLE_STATUSES.includes(draftStatus)) {
              // Draft is pending/approved - read only
              setViewOnlyMode(true);
            } else {
              // Draft is editable
              setViewOnlyMode(false);
              setViewedVersion(null);
            }
          } else if (info.activeVersion) {
            // No draft, check if active version is immutable
            const status = info.activeVersion.status as TemplateVersionStatus;
            if (IMMUTABLE_STATUSES.includes(status)) {
              // Active version is immutable (approved/pending) - show in read-only mode
              setViewOnlyMode(true);
            } else {
              // Active version is editable (unlikely but handle it)
              setViewOnlyMode(false);
              setViewedVersion(null);
            }
          } else {
            // No versions at all - this shouldn't happen with auto v1 creation
            // but allow editing just in case
            setViewOnlyMode(false);
            setViewedVersion(null);
          }
        }
      } catch (error) {
        console.error("Error fetching version info:", error);
        // Fall back to allowing edit if version system fails
        if (!options?.silent) {
          setVersionInfo(null);
          setViewOnlyMode(false);
          setViewedVersion(null);
        }
      } finally {
        setIsLoadingVersion(false);
      }
    },
    [templateId, selectedLocale, existingLocales, versionInfo],
  );

  // Initial fetch on mount and locale change
  useEffect(() => {
    fetchVersionInfo();
  }, [templateId, selectedLocale, existingLocales]);

  // Handle locale change
  const handleLocaleChange = (newLocale: string) => {
    setSelectedLocale(newLocale);
    // Reset state when changing locales
    setVersionInfo(null);
    setViewOnlyMode(false);
    setViewedVersion(null);
  };

  // Handle opening version drawer - fetch fresh data silently
  const handleOpenVersionDrawer = useCallback(() => {
    setVersionDrawerOpen(true);
    // Fetch fresh version info in background (backend auto-syncs status)
    fetchVersionInfo({ silent: true });
  }, [fetchVersionInfo]);

  // Get the version status for display
  const getVersionStatusInfo = () => {
    // If viewing a specific historical version, show that version's info
    if (viewedVersion) {
      const status = viewedVersion.status;
      switch (status) {
        case "approved":
          return {
            status,
            version: viewedVersion.versionNumber,
            label: t("versions.viewingApproved") || "Viewing Approved Version",
            color: "green",
            icon: CheckCircle2,
          };
        case "pending_approval":
          return {
            status,
            version: viewedVersion.versionNumber,
            label: t("versions.pendingApproval") || "Pending Approval",
            color: "yellow",
            icon: Clock,
          };
        case "rejected":
          return {
            status,
            version: viewedVersion.versionNumber,
            label: t("versions.rejected") || "Rejected",
            color: "red",
            icon: XCircle,
          };
        default:
          return {
            status,
            version: viewedVersion.versionNumber,
            label: t("versions.viewingVersion") || "Viewing Version",
            color: "blue",
            icon: Clock,
          };
      }
    }

    if (!versionInfo) return null;

    const activeVersion = versionInfo.activeVersion;
    const draftVersion = versionInfo.draftVersion;

    // Check draft version first (which might also be pending)
    if (draftVersion) {
      const status = draftVersion.status as TemplateVersionStatus;
      switch (status) {
        case "pending_approval":
          return {
            status,
            version: draftVersion.versionNumber,
            label: t("versions.pendingApproval") || "Pending Approval",
            color: "yellow",
            icon: Clock,
          };
        case "rejected":
          return {
            status,
            version: draftVersion.versionNumber,
            label: t("versions.rejected") || "Rejected",
            color: "red",
            icon: XCircle,
          };
        default:
          // draft status
          return {
            status,
            version: draftVersion.versionNumber,
            label: t("versions.editingDraft") || "Editing Draft",
            color: "blue",
            icon: Clock,
          };
      }
    }

    if (activeVersion) {
      const status = activeVersion.status as TemplateVersionStatus;
      switch (status) {
        case "approved":
          return {
            status,
            version: activeVersion.versionNumber,
            label: t("versions.viewingApproved") || "Viewing Approved Version",
            color: "green",
            icon: CheckCircle2,
          };
        case "pending_approval":
          return {
            status,
            version: activeVersion.versionNumber,
            label: t("versions.pendingApproval") || "Pending Approval",
            color: "yellow",
            icon: Clock,
          };
        case "rejected":
          return {
            status,
            version: activeVersion.versionNumber,
            label: t("versions.rejected") || "Rejected",
            color: "red",
            icon: XCircle,
          };
        default:
          return {
            status,
            version: activeVersion.versionNumber,
            label: t("versions.editingDraft") || "Editing Draft",
            color: "blue",
            icon: Clock,
          };
      }
    }

    return null;
  };

  const handleCreateDraft = async () => {
    try {
      await backendApi.templates.createVersion(templateId, {
        locale: selectedLocale,
      });
      addNotification(
        t("versions.toast.draftCreated") || "New draft version created",
        "success",
      );
      setVersionDrawerOpen(false);
      setViewOnlyMode(false);
      setViewedVersion(null);
      fetchVersionInfo();
    } catch (error) {
      console.error("Error creating draft:", error);
      addNotification(
        t("versions.toast.createFailed") || "Failed to create draft version",
        "error",
      );
    }
  };

  const handleDeleteDraft = async (versionId: string) => {
    try {
      await backendApi.templates.deleteVersion(templateId, versionId);
      addNotification(
        t("versions.toast.draftDeleted") || "Draft deleted",
        "success",
      );
      fetchVersionInfo();
    } catch (error) {
      console.error("Error deleting draft:", error);
      addNotification(
        t("versions.toast.deleteFailed") || "Failed to delete draft",
        "error",
      );
    }
  };

  const handleSetActiveVersion = async (versionId: string) => {
    try {
      await backendApi.templates.setActiveVersion(templateId, versionId);
      addNotification(
        t("versions.toast.setActive") || "Version set as active",
        "success",
      );
      fetchVersionInfo();
    } catch (error) {
      console.error("Error setting active version:", error);
      addNotification(
        t("versions.toast.setActiveFailed") || "Failed to set active version",
        "error",
      );
    }
  };

  const versionStatusInfo = getVersionStatusInfo();

  // Check if the currently selected locale exists
  const isNewLocale = !existingLocales.includes(selectedLocale);

  // Handle adding a new locale
  const handleAddLocale = (newLocale: string) => {
    setSelectedLocale(newLocale);
    setShowAddLocale(false);
    // No need to fetch version info - it will return null for non-existent locales
    setVersionInfo(null);
    setViewOnlyMode(false);
    setViewedVersion(null);
    // Clear the newLocale URL parameter if present
    if (addingNewLocale) {
      router.replace(`/dashboard/templates/${templateId}/edit`, {
        scroll: false,
      });
    }
  };

  // Combined loading state: wait for both template data AND version info
  // This prevents flash of incorrect UI states (e.g., "creating new locale" banner)
  const isInitialLoading =
    isLoadingTemplate || (isLoadingVersion && !templateData);

  if (isInitialLoading) {
    return <TemplateEditSkeleton />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto space-y-6 p-6">
        {/* Header with Back Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/${locale}/dashboard/templates`)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-black dark:text-white">
                  {viewOnlyMode
                    ? t("viewTemplate") || "View Template"
                    : t("edit") || "Edit Template"}
                </h1>
                {versionStatusInfo && (
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      versionStatusInfo.color === "green"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : versionStatusInfo.color === "yellow"
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          : versionStatusInfo.color === "red"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    }`}
                  >
                    <versionStatusInfo.icon className="h-3.5 w-3.5" />
                    <span>
                      v{versionStatusInfo.version} • {versionStatusInfo.label}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                {viewOnlyMode
                  ? t("viewOnlyDescription") ||
                    "This version is locked. Create a new draft to make changes."
                  : t("editDescription") || "Update your message template"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(true)}
              className="gap-2"
            >
              <History className="h-4 w-4" />
              {t("history") || "History"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenVersionDrawer}
              className="gap-2"
            >
              <GitBranch className="h-4 w-4" />
              {t("versions.manageVersions") || "Manage Versions"}
            </Button>
          </div>
        </div>

        {/* View-only alert - shown when viewing historical versions or immutable versions */}
        {viewOnlyMode && !isNewLocale && (
          <Alert
            variant="default"
            className="border-amber-300 bg-amber-50 dark:bg-amber-900/20"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200 flex items-center justify-between">
              <span>
                {viewedVersion
                  ? t("versions.viewingHistoricalVersion") ||
                    "You are viewing a historical version"
                  : versionInfo?.draftVersion?.status === "pending_approval"
                    ? t("versions.pendingVersionReadOnly") ||
                      "This version is pending approval and cannot be edited"
                    : t("versions.approvedVersionReadOnly") ||
                      "This version has been approved and cannot be edited"}
              </span>
            </AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300 mt-2">
              {viewedVersion ? (
                <p>
                  {t("versions.viewingHistoricalVersionDescription") ||
                    "This is a read-only view of a previous version. Use the version history to switch to an editable version."}
                </p>
              ) : (
                <>
                  <p className={versionInfo?.canCreateNewVersion ? "mb-3" : ""}>
                    {versionInfo?.draftVersion?.status === "pending_approval"
                      ? t("versions.pendingVersionDescription") ||
                        "Templates pending approval cannot be modified. Wait for the approval process to complete."
                      : versionInfo?.canCreateNewVersion
                        ? t("versions.approvedVersionDescription") ||
                          "Approved templates are locked to ensure consistency with WhatsApp. To make changes, create a new draft version that copies the current content."
                        : t("versions.approvedVersionWithDraftDescription") ||
                          "This version is locked. A draft version already exists - use the version history to edit it."}
                  </p>
                  {/* Only show Create New Draft button if canCreateNewVersion is true */}
                  {versionInfo?.canCreateNewVersion && (
                    <Button
                      size="sm"
                      onClick={handleCreateDraft}
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t("versions.createNewDraft") || "Create New Draft"}
                    </Button>
                  )}
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Draft available alert - only show for actual drafts (not pending_approval) */}
        {/* Also hide when in view-only mode (e.g., viewing a specific version from history) */}
        {!viewOnlyMode &&
          versionInfo?.draftVersion &&
          versionInfo.draftVersion.status === "draft" &&
          versionInfo.activeVersion?.status === "approved" && (
            <Alert
              variant="default"
              className="border-blue-300 bg-blue-50 dark:bg-blue-900/20"
            >
              <Clock className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800 dark:text-blue-200">
                {t("versions.draftInProgress") || "Draft in progress"}
              </AlertTitle>
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                {t("versions.draftInProgressDescription") ||
                  "You are editing a draft version. The approved version is still active and being used."}
              </AlertDescription>
            </Alert>
          )}

        {/* New locale alert */}
        {isNewLocale && (
          <Alert
            variant="default"
            className="border-green-300 bg-green-50 dark:bg-green-900/20"
          >
            <Globe className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800 dark:text-green-200">
              {t("versions.newLocale") || "Creating new locale"}
            </AlertTitle>
            <AlertDescription className="text-green-700 dark:text-green-300">
              {t("versions.newLocaleDescription") ||
                `You are creating a new ${
                  SUPPORTED_LOCALES.find((l) => l.code === selectedLocale)
                    ?.name || selectedLocale
                } version of this template. Save the form to create the first version.`}
            </AlertDescription>
          </Alert>
        )}

        {/* Locale Tabs */}
        <div className="flex items-center gap-2">
          <Tabs
            value={selectedLocale}
            onValueChange={handleLocaleChange}
            className="flex-1"
          >
            <TabsList className="h-auto p-1 bg-muted/50">
              {existingLocales.map((localeCode) => {
                const localeInfo = SUPPORTED_LOCALES.find(
                  (l) => l.code === localeCode,
                );
                return (
                  <TabsTrigger
                    key={localeCode}
                    value={localeCode}
                    className="gap-2 data-[state=active]:bg-background"
                  >
                    <span>{localeInfo?.flag || "🌐"}</span>
                    <span>{localeInfo?.name || localeCode}</span>
                  </TabsTrigger>
                );
              })}
              {isNewLocale && (
                <TabsTrigger
                  value={selectedLocale}
                  className="gap-2 data-[state=active]:bg-background border-dashed border"
                >
                  <span>
                    {SUPPORTED_LOCALES.find((l) => l.code === selectedLocale)
                      ?.flag || "🌐"}
                  </span>
                  <span>
                    {SUPPORTED_LOCALES.find((l) => l.code === selectedLocale)
                      ?.name || selectedLocale}
                  </span>
                  <span className="text-xs text-muted-foreground">(new)</span>
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>

          {availableLocales.length > 0 && (
            <div className="relative" ref={addLocaleRef}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddLocale(!showAddLocale)}
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                {t("versions.addLanguage") || "Add Language"}
              </Button>
              {showAddLocale && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-md p-1 min-w-[160px]">
                  {availableLocales.map((localeItem) => (
                    <button
                      key={localeItem.code}
                      onClick={() => handleAddLocale(localeItem.code)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent rounded-sm text-left"
                    >
                      <span>{localeItem.flag}</span>
                      <span>{localeItem.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <TemplateForm
          templateId={templateId}
          readOnly={viewOnlyMode}
          selectedLocale={selectedLocale}
          onLocaleChange={handleLocaleChange}
          availableLocales={existingLocales}
          onSaveSuccess={() => {
            console.log("[EditPage] onSaveSuccess - fetching version info");
            // Refresh version info after save
            fetchVersionInfo();
          }}
          isEditMode={true}
          versionData={(() => {
            const data = versionInfo?.draftVersion
              ? {
                  id: versionInfo.draftVersion.id,
                  versionNumber: versionInfo.draftVersion.versionNumber,
                  content: versionInfo.draftVersion.content,
                  status: versionInfo.draftVersion.status,
                  canEdit: versionInfo.draftVersion.canEdit,
                }
              : versionInfo?.activeVersion
                ? {
                    id: versionInfo.activeVersion.id,
                    versionNumber: versionInfo.activeVersion.versionNumber,
                    content: versionInfo.activeVersion.content,
                    status: versionInfo.activeVersion.status,
                    canEdit: versionInfo.activeVersion.canEdit,
                  }
                : null;
            console.log("[EditPage] versionData passed to form:", {
              id: data?.id,
              status: data?.status,
              canEdit: data?.canEdit,
              bodyPreview: data?.content?.body?.substring(0, 50),
            });
            return data;
          })()}
        />
      </div>

      {/* Version Timeline Drawer - only show when locale exists */}
      {!isNewLocale && (
        <VersionTimelineDrawer
          open={versionDrawerOpen}
          onOpenChange={setVersionDrawerOpen}
          templateId={templateId}
          templateName={templateData?.displayName || templateData?.name || ""}
          locale={selectedLocale}
          versionInfo={versionInfo}
          isLoading={isLoadingVersion}
          onCreateDraft={handleCreateDraft}
          onApprovalSuccess={() => {
            // Refresh version info after successful approval request
            fetchVersionInfo();
          }}
          onDeleteDraft={(version) => handleDeleteDraft(version.id)}
          onSetActiveVersion={(version) => handleSetActiveVersion(version.id)}
          onEditVersion={(version) => {
            setVersionDrawerOpen(false);
            // Reload the page to edit this version
            fetchVersionInfo();
          }}
          onViewVersion={(version) => {
            setVersionDrawerOpen(false);
            setViewOnlyMode(true);
            // Track which version is being viewed to display correct version number
            setViewedVersion({
              versionNumber: version.versionNumber,
              status: version.status as TemplateVersionStatus,
            });
          }}
        />
      )}

      <EntityAuditHistoryPanel
        open={showHistory}
        onOpenChange={setShowHistory}
        entityType="template"
        entityId={templateId}
        entityName={
          templateData?.displayName || templateData?.name || undefined
        }
      />
    </div>
  );
}
