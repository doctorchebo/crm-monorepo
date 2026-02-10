"use client";

import {
  componentsFromLegacy,
  componentsToDto,
  componentsToLegacy,
  createEmptyComponents,
  dtoToComponents,
  EnhancedTemplateEditor,
  EnhancedTemplatePreview,
  hasAdvancedFeatures,
  TemplateComponents,
} from "@/components/templates/enhanced";
import { RequestApprovalModal } from "@/components/templates/request-approval-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNotification } from "@/hooks/use-notification";
import { ApiError } from "@/lib/api/client";
import {
  backendApi,
  LANGUAGE_DISPLAY_NAMES,
  SUPPORTED_LANGUAGES,
} from "@/lib/api/endpoints";
import { toMetaTemplateName } from "@/lib/utils/template-name";
import { AlertCircle, Globe, Loader, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";

// Map SUPPORTED_LANGUAGES to locale format used in template UI
const SUPPORTED_LOCALES = SUPPORTED_LANGUAGES.map((code) => ({
  code,
  name: LANGUAGE_DISPLAY_NAMES[code],
}));

const PLATFORMS = ["whatsapp", "messenger", "instagram"];

const TEMPLATE_CATEGORIES = [
  { code: "utility", name: "Utility" },
  { code: "marketing", name: "Marketing" },
  { code: "authentication", name: "Authentication" },
];

interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface Template {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  isVisible: boolean;
  isActive: boolean;
  locales?: Array<{
    id: string;
    locale: string;
    body: string;
    header?: string;
    footer?: string;
    category?: string;
    exampleVars?: Record<string, any>;
    variables?: Array<{
      varName: string;
      varType: string;
    }>;
  }>;
  platforms?: Array<{
    platformName: string;
    isEnabled: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  displayName: string;
  description: string;
  selectedLocale: string;
  category: string;
  header: string;
  body: string;
  footer: string;
  exampleVars: Record<string, string>;
  enabledPlatforms: string[];
  isVisible: boolean;
  /** Enhanced template components (for advanced mode) */
  components?: TemplateComponents;
}

/** Version content data from the versioning system */
interface VersionData {
  id: string;
  versionNumber: number;
  content: {
    header?: string | null;
    body: string;
    footer?: string | null;
    exampleVars?: Record<string, string>;
    category?: string;
    /** Enhanced template components (full Meta API support) */
    components?: Record<string, unknown>;
  };
  status: string;
  canEdit: boolean;
}

interface TemplateFormProps {
  templateId?: string;
  readOnly?: boolean;
  /** Selected locale code, controlled by parent */
  selectedLocale?: string;
  /** Callback when locale changes */
  onLocaleChange?: (locale: string) => void;
  /** Available locales for this template */
  availableLocales?: string[];
  /** Callback when save is successful (for edit mode to stay on page) */
  onSaveSuccess?: () => void;
  /** Whether we're in edit mode (shows different section organization) */
  isEditMode?: boolean;
  /** Version data when editing in version mode */
  versionData?: VersionData | null;
  /** Callback when a new template is created (passes new templateId) */
  onTemplateCreated?: (templateId: string) => void;
}

export function TemplateForm({
  templateId,
  readOnly = false,
  selectedLocale: controlledLocale,
  onLocaleChange,
  availableLocales,
  onSaveSuccess,
  isEditMode = false,
  versionData,
  onTemplateCreated,
}: TemplateFormProps) {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations("templates");
  const tCommon = useTranslations("common");
  const { addNotification } = useNotification();

  // Track the saved template ID (for new templates that were just created)
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null);
  // The effective template ID (either passed in or saved after creation)
  const effectiveTemplateId = templateId || savedTemplateId;

  // Track if template has been saved (for showing Request Approval button)
  const [hasSavedDraft, setHasSavedDraft] = useState(!!templateId);

  // Request Approval modal state
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    displayName: "",
    description: "",
    selectedLocale: controlledLocale || "en",
    category: "utility",
    header: "",
    body: "",
    footer: "",
    exampleVars: {},
    enabledPlatforms: ["whatsapp"],
    isVisible: true,
    components: createEmptyComponents(),
  });

  // @ts-ignore - SWR conditional fetcher type mismatch
  const { data: existingTemplate }: { data: Template | null | undefined } =
    useSWR(
      effectiveTemplateId ? `template-${effectiveTemplateId}` : null,
      !effectiveTemplateId
        ? null
        : async () => await backendApi.templates.get(effectiveTemplateId),
    );

  // Get locale ID for media uploads
  const currentLocaleId = useMemo(() => {
    if (!effectiveTemplateId) return undefined;
    // Find the locale ID from existing template data
    const localeData = existingTemplate?.locales?.find(
      (l) => l.locale === formData.selectedLocale,
    );
    return localeData?.id;
  }, [effectiveTemplateId, existingTemplate, formData.selectedLocale]);

  // Handle enhanced components change
  const handleComponentsChange = useCallback(
    (components: TemplateComponents) => {
      console.log("[TemplateForm] handleComponentsChange called:", {
        bodyText: components.body?.text?.substring(0, 50),
      });
      setFormData((prev) => ({
        ...prev,
        components,
      }));
    },
    [],
  );

  // Handle legacy data change from enhanced editor (for backward compatibility)
  const handleLegacyChange = useCallback(
    (legacy: { header?: string; body: string; footer?: string }) => {
      setFormData((prev) => ({
        ...prev,
        header: legacy.header || "",
        body: legacy.body,
        footer: legacy.footer || "",
      }));
    },
    [],
  );

  // Sync with controlled locale from parent
  useEffect(() => {
    if (controlledLocale && controlledLocale !== formData.selectedLocale) {
      setFormData((prev) => ({ ...prev, selectedLocale: controlledLocale }));
    }
  }, [controlledLocale]);

  // Auto-generated Meta-compliant template name
  const generatedName = useMemo(
    () => toMetaTemplateName(formData.displayName),
    [formData.displayName],
  );

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    [],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load existing template data (global fields like name, description)
  useEffect(() => {
    if (existingTemplate) {
      setFormData((prev) => ({
        ...prev,
        // Use displayName if available, otherwise fall back to name
        displayName: existingTemplate.displayName || existingTemplate.name,
        description: existingTemplate.description || "",
        enabledPlatforms: existingTemplate.platforms
          ?.filter((p: any) => p.isEnabled)
          .map((p: any) => p.platformName) || ["whatsapp"],
        isVisible: existingTemplate.isVisible,
      }));

      // Only load locale data if NOT using version data
      // When version data is provided, content comes from the version
      if (!versionData) {
        // Set locale data based on controlled locale or first available
        const targetLocale =
          controlledLocale || existingTemplate.locales?.[0]?.locale || "en";
        const localeData = existingTemplate.locales?.find(
          (l) => l.locale === targetLocale,
        );

        if (localeData) {
          // Convert components from DTO format if available, otherwise create from legacy format
          const components = (localeData as any).components
            ? dtoToComponents(
                (localeData as any).components as Record<string, unknown>,
              )
            : componentsFromLegacy(
                localeData.header,
                localeData.body,
                localeData.footer,
              );

          setFormData((prev) => ({
            ...prev,
            selectedLocale: localeData.locale,
            category: localeData.category || "utility",
            header: localeData.header || "",
            body: localeData.body || "",
            footer: localeData.footer || "",
            exampleVars: localeData.exampleVars || {},
            components,
          }));
        } else {
          // New locale - reset content fields but keep selected locale
          setFormData((prev) => ({
            ...prev,
            selectedLocale: targetLocale,
            category: "utility",
            header: "",
            body: "",
            footer: "",
            exampleVars: {},
            components: createEmptyComponents(),
          }));
        }
      }
    }
  }, [existingTemplate, versionData, controlledLocale]);

  // Load version data when provided (takes precedence over locale data)
  useEffect(() => {
    if (versionData) {
      try {
        // Convert components from DTO format if available, otherwise create from legacy format
        const components = versionData.content.components
          ? dtoToComponents(
              versionData.content.components as Record<string, unknown>,
            )
          : componentsFromLegacy(
              versionData.content.header || undefined,
              versionData.content.body,
              versionData.content.footer || undefined,
            );

        setFormData((prev) => ({
          ...prev,
          selectedLocale: controlledLocale || prev.selectedLocale,
          category: versionData.content.category || "utility",
          header: versionData.content.header || "",
          body: versionData.content.body || "",
          footer: versionData.content.footer || "",
          exampleVars: versionData.content.exampleVars || {},
          components,
        }));
      } catch (error) {
        console.error("Error loading version data:", error);
        // Still try to set the basic fields even if component conversion fails
        setFormData((prev) => ({
          ...prev,
          selectedLocale: controlledLocale || prev.selectedLocale,
          category: versionData.content.category || "utility",
          header: versionData.content.header || "",
          body: versionData.content.body || "",
          footer: versionData.content.footer || "",
          exampleVars: versionData.content.exampleVars || {},
        }));
      }
    }
  }, [versionData, controlledLocale]);

  // Extract variables from body (check components first, then legacy formData.body)
  const extractedVariables = useMemo(() => {
    // Get the body text from the components (primary source) or legacy formData
    const bodyText = formData.components?.body?.text || formData.body || "";

    const regex = /\{\{([^}]+)\}\}/g;
    const vars: string[] = [];
    let match;

    while ((match = regex.exec(bodyText)) !== null) {
      const varName = match[1].trim();
      if (!vars.includes(varName)) {
        vars.push(varName);
      }
    }

    return vars;
  }, [formData.components?.body?.text, formData.body]);

  // Update example vars structure when variables change
  useEffect(() => {
    setFormData((prev) => {
      const newExampleVars = { ...prev.exampleVars };

      // Remove vars that no longer exist
      Object.keys(newExampleVars).forEach((key) => {
        if (!extractedVariables.includes(key)) {
          delete newExampleVars[key];
        }
      });

      // Add missing vars
      extractedVariables.forEach((varName) => {
        if (!(varName in newExampleVars)) {
          newExampleVars[varName] = `Sample ${varName}`;
        }
      });

      return { ...prev, exampleVars: newExampleVars };
    });
  }, [extractedVariables]);

  // Validate template
  const validate = async () => {
    // Clear previous validation errors before validating
    setValidationErrors([]);

    try {
      if (!formData.displayName.trim()) {
        setValidationErrors([
          {
            field: "displayName",
            message:
              t("validation.displayNameRequired") || "Display name is required",
            severity: "error",
          },
        ]);
        return false;
      }

      if (!formData.body.trim()) {
        setValidationErrors([
          {
            field: "body",
            message: "Template body is required",
            severity: "error",
          },
        ]);
        return false;
      }

      // For existing template, validate on backend only if the locale already exists
      if (effectiveTemplateId) {
        // Check if the selected locale already exists for this template
        const localeExists = existingTemplate?.locales?.some(
          (loc) => loc.locale === formData.selectedLocale,
        );

        if (localeExists) {
          const result = (await backendApi.templates.validate(
            effectiveTemplateId,
            {
              locale: formData.selectedLocale,
            },
          )) as { errors?: ValidationError[]; hasCriticalErrors?: boolean };
          setValidationErrors(result.errors || []);
          return !(result.hasCriticalErrors || false);
        }
        // If locale doesn't exist yet, skip backend validation (it will be created on save)
      }

      return true;
    } catch (error: unknown) {
      // Handle API validation errors
      if (error instanceof ApiError && error.errors) {
        const backendErrors: ValidationError[] = error.errors.map((e) => ({
          field: e.field || "body",
          message: e.message,
          severity: (e.severity as "error" | "warning") || "error",
        }));
        setValidationErrors(backendErrors);
      } else {
        // Fallback for unexpected errors
        setValidationErrors([
          {
            field: "body",
            message:
              error instanceof Error ? error.message : "Validation failed",
            severity: "error",
          },
        ]);
      }
      return false;
    }
  };

  // Submit template
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isValid = await validate();
    if (!isValid) {
      addNotification(
        t("pleaseFixErrors") || "Please fix the errors below",
        "error",
        3000,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // Determine if we're using enhanced mode (has components with advanced features)
      const useEnhancedMode =
        formData.components && hasAdvancedFeatures(formData.components);

      // Build the content payload
      const buildContentPayload = () => {
        // Get legacy values from components for backward compatibility
        const legacy = componentsToLegacy(
          formData.components || createEmptyComponents(),
        );

        console.log("[TemplateForm] Building payload:", {
          "formData.components?.body?.text": formData.components?.body?.text,
          "legacy.body": legacy.body,
          "formData.body": formData.body,
          useEnhancedMode,
        });

        // Base payload with legacy fields
        const payload: Record<string, unknown> = {
          header: legacy.header || formData.header || null,
          body: legacy.body || formData.body,
          footer: legacy.footer || formData.footer || null,
          exampleVars: formData.exampleVars,
          category: formData.category,
        };

        // Include components if using enhanced mode
        if (useEnhancedMode && formData.components) {
          payload.components = componentsToDto(formData.components);
        }

        console.log("[TemplateForm] Final payload:", payload);

        return payload;
      };

      if (effectiveTemplateId) {
        // Update existing template global fields
        await backendApi.templates.update(effectiveTemplateId, {
          displayName: formData.displayName,
          description: formData.description,
          isVisible: formData.isVisible,
        });

        // Determine where to save content based on version state
        let contentSaved = false;

        if (versionData) {
          if (versionData.canEdit) {
            // Save content to the version
            const payload = buildContentPayload();
            console.log("[TemplateForm] Saving to version:", {
              templateId: effectiveTemplateId,
              versionId: versionData.id,
              versionStatus: versionData.status,
              payloadBody: (payload.body as string)?.substring(0, 100),
            });

            const result = await backendApi.templates.updateVersionContent(
              effectiveTemplateId,
              versionData.id,
              payload,
            );

            console.log("[TemplateForm] Save result:", {
              resultBody: result?.content?.body?.substring(0, 100),
              resultId: result?.id,
            });

            contentSaved = true;
          } else {
            // Version exists but cannot be edited - this should not happen
            // as the form should be read-only, but handle gracefully
            throw new Error(
              t("cannotEditVersion") ||
                "This version cannot be edited. Please create a new draft to make changes.",
            );
          }
        } else {
          // No version data - save directly to locale (for new locales or legacy mode)
          await backendApi.templates.addLocale(effectiveTemplateId, {
            locale: formData.selectedLocale,
            ...buildContentPayload(),
          });
          contentSaved = true;
        }

        // Only show success if content was actually saved
        if (contentSaved) {
          addNotification(
            t("templateUpdated") || "Template updated successfully",
            "success",
            3000,
          );
          setHasSavedDraft(true);
        }

        // Refresh template data
        globalMutate(`template-${effectiveTemplateId}`);

        // Call success callback (stay on edit page) or navigate back
        if (onSaveSuccess) {
          onSaveSuccess();
        }
        // In create mode (no original templateId), stay on the page
        // In edit mode with no callback, stay on page as well
      } else {
        // Create new template
        const templateRes = (await backendApi.templates.create({
          displayName: formData.displayName,
          description: formData.description,
          platforms: formData.enabledPlatforms,
        })) as Template;

        // Add locale with content
        await backendApi.templates.addLocale(templateRes.id, {
          locale: formData.selectedLocale,
          ...buildContentPayload(),
        });

        addNotification(
          t("templateCreated") ||
            "Template created successfully. You can now request approval.",
          "success",
          4000,
        );

        // Store the new template ID to enable Request Approval
        setSavedTemplateId(templateRes.id);
        setHasSavedDraft(true);

        // Notify parent of creation
        onTemplateCreated?.(templateRes.id);

        // Refresh the templates list
        globalMutate(`template-${templateRes.id}`);
      }
    } catch (error: unknown) {
      console.error("Error saving template:", error);

      // Handle API validation errors
      if (
        error instanceof ApiError &&
        error.isValidationError() &&
        error.errors
      ) {
        // Map backend validation errors to frontend format
        const backendErrors: ValidationError[] = error.errors.map((e) => ({
          field: e.field || "body",
          message: e.message,
          severity: (e.severity as "error" | "warning") || "error",
        }));

        // Add backend errors to validation state
        setValidationErrors((prev) => [...prev, ...backendErrors]);

        // Show notification with detailed error message
        addNotification(error.getDetailedMessage(), "error", 5000);
      } else {
        // Generic error handling
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        addNotification(
          errorMessage || t("saveFailed") || "Failed to save template",
          "error",
          3000,
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasErrors = validationErrors.some((e) => e.severity === "error");
  const hasWarnings = validationErrors.some((e) => e.severity === "warning");

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Two-column layout: Configuration on left, Preview on right */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Column - Configuration */}
        <div className="flex-1 space-y-6 min-w-0">
          {/* Basic Info - Global fields */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {t("basicInfo") || "Basic Information"}
              </h2>
              {isEditMode && (
                <Badge variant="outline" className="gap-1">
                  <Globe className="h-3 w-3" />
                  {t("globalField") || "Global"}
                </Badge>
              )}
            </div>

            <div className="space-y-4">
              {/* Display Name - User-friendly name */}
              <div>
                <Label htmlFor="displayName">
                  {t("displayName") || "Display Name"}
                </Label>
                <Input
                  id="displayName"
                  value={formData.displayName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData({ ...formData, displayName: e.target.value })
                  }
                  placeholder={
                    t("displayNamePlaceholder") || "e.g., Order Confirmation"
                  }
                  disabled={readOnly}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("displayNameHint") ||
                    "This is the name shown to users in the template selector"}
                </p>
              </div>

              {/* Generated Meta Name - Read-only preview */}
              {formData.displayName && (
                <div className="p-3 bg-muted rounded-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {t("metaTemplateName") || "Meta Template Name"}
                      </span>
                      <p className="font-mono text-sm">{generatedName}</p>
                    </div>
                    <span className="text-xs text-muted-foreground bg-background px-2 py-1 rounded">
                      {t("autoGenerated") || "Auto-generated"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("metaTemplateNameHint") ||
                      "This name is used by Meta's API and follows their naming rules"}
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="description">
                  {t("description") || "Description"}
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Describe what this template is used for..."
                  rows={3}
                  disabled={readOnly}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="isVisible"
                  checked={formData.isVisible}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isVisible: checked as boolean })
                  }
                  disabled={readOnly}
                />
                <Label htmlFor="isVisible">
                  {t("makeVisible") || "Make this template visible in chats"}
                </Label>
              </div>
            </div>
          </Card>

          {/* Platforms - Global field */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {t("platforms") || "Available Platforms"}
              </h2>
              {isEditMode && (
                <Badge variant="outline" className="gap-1">
                  <Globe className="h-3 w-3" />
                  {t("globalField") || "Global"}
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              {PLATFORMS.map((platform) => (
                <div key={platform} className="flex items-center gap-2">
                  <Checkbox
                    id={`platform-${platform}`}
                    checked={formData.enabledPlatforms.includes(platform)}
                    onCheckedChange={(checked) => {
                      setFormData((prev) => ({
                        ...prev,
                        enabledPlatforms: checked
                          ? [...prev.enabledPlatforms, platform]
                          : prev.enabledPlatforms.filter((p) => p !== platform),
                      }));
                    }}
                    disabled={readOnly}
                  />
                  <Label
                    htmlFor={`platform-${platform}`}
                    className="capitalize"
                  >
                    {platform}
                  </Label>
                </div>
              ))}
            </div>
          </Card>

          {/* Locale-specific content */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {t("content") || "Content"}
              </h2>
              {isEditMode && (
                <Badge variant="secondary" className="gap-1">
                  {t("localeSpecific") || "Locale-specific"}
                </Badge>
              )}
            </div>

            {/* Language selector - only shown for new templates (edit mode uses tabs) */}
            {!isEditMode && (
              <div className="mb-4">
                <Label htmlFor="locale">{t("language") || "Language"}</Label>
                <Select
                  value={formData.selectedLocale}
                  onValueChange={(value: string) => {
                    setFormData({ ...formData, selectedLocale: value });
                    // Notify parent of locale change
                    onLocaleChange?.(value);
                  }}
                  disabled={readOnly}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LOCALES.map((loc) => (
                      <SelectItem key={loc.code} value={loc.code}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Category selector */}
            <div className="mb-4">
              <Label htmlFor="category">{t("category") || "Category"}</Label>
              <Select
                value={formData.category}
                onValueChange={(value: string) => {
                  setFormData({ ...formData, category: value });
                }}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.code} value={cat.code}>
                      {t(`categories.${cat.code}`) || cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {t("categoryHint") ||
                  "Meta requires a category for template approval"}
              </p>
              {/* Category description help text */}
              {formData.category && (
                <div className="mt-2 p-3 rounded-md bg-muted/50 border border-border">
                  <p className="text-sm text-muted-foreground">
                    {t(`categoryDescriptions.${formData.category}`)}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Enhanced Template Editor - handles header, body, footer, buttons, carousel */}
          <EnhancedTemplateEditor
            templateId={templateId}
            localeId={currentLocaleId}
            initialComponents={formData.components}
            legacyData={{
              header: formData.header,
              body: formData.body,
              footer: formData.footer,
            }}
            category={
              formData.category as "utility" | "marketing" | "authentication"
            }
            disabled={readOnly}
            onChange={handleComponentsChange}
            onLegacyChange={handleLegacyChange}
            exampleVars={formData.exampleVars}
          />

          {/* Variables - Locale-specific */}
          {extractedVariables.length > 0 && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  {t("variables") || "Variables"}
                </h2>
                {isEditMode && (
                  <Badge variant="secondary" className="gap-1">
                    {t("localeSpecific") || "Locale-specific"}
                  </Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                {t("variablesHelp") ||
                  "Enter friendly example values for your variables. These help you preview the template and are used as placeholders in the approval request."}
              </p>

              <div className="space-y-3">
                {extractedVariables.map((varName) => (
                  <div key={varName}>
                    <Label htmlFor={`var-${varName}`} className="text-sm">
                      {"{{"}
                      {varName}
                      {"}}"}
                    </Label>
                    <Input
                      id={`var-${varName}`}
                      value={formData.exampleVars[varName] || ""}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setFormData((prev) => ({
                          ...prev,
                          exampleVars: {
                            ...prev.exampleVars,
                            [varName]: e.target.value,
                          },
                        }))
                      }
                      placeholder={
                        t("variableExamplePlaceholder", { varName }) ||
                        `Example value for ${varName}`
                      }
                      disabled={readOnly}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right Column - Live Preview & Actions (Floating) */}
        <div className="hidden lg:block lg:w-[380px] lg:flex-shrink-0">
          <div className="sticky top-6 space-y-4">
            {/* Preview Card */}
            <Card className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                {t("livePreview") || "Live Preview"}
              </h3>
              <EnhancedTemplatePreview
                components={formData.components || createEmptyComponents()}
                exampleVars={formData.exampleVars}
                showPhoneFrame={true}
                templateName={
                  formData.displayName || t("untitled") || "Untitled"
                }
              />
            </Card>

            {/* Floating Action Buttons */}
            <Card className="p-4">
              <div className="flex flex-col gap-3">
                {/* Cancel/Back button */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push(`/${locale}/dashboard/templates`)}
                >
                  {readOnly
                    ? tCommon("back") || "Back"
                    : tCommon("cancel") || "Cancel"}
                </Button>

                {/* Save/Update button */}
                {!readOnly && (
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full"
                  >
                    {isSubmitting && (
                      <Loader className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {hasSavedDraft
                      ? t("update") || "Update"
                      : t("saveDraft") || "Save Draft"}
                  </Button>
                )}

                {/* Request Approval button - shows after draft is saved */}
                {!readOnly && hasSavedDraft && effectiveTemplateId && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full gap-2"
                    onClick={() => setShowApprovalModal(true)}
                  >
                    <Send className="h-4 w-4" />
                    {t("requestApproval") || "Request Approval"}
                  </Button>
                )}
              </div>

              {/* Help text for new templates */}
              {!hasSavedDraft && !readOnly && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  {t("saveDraftHint") ||
                    "Save your template first, then request approval"}
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Mobile Action Buttons (shown only on small screens) */}
      <div className="lg:hidden">
        <Card className="p-4">
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.push(`/${locale}/dashboard/templates`)}
            >
              {readOnly
                ? tCommon("back") || "Back"
                : tCommon("cancel") || "Cancel"}
            </Button>

            {!readOnly && (
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && (
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                )}
                {hasSavedDraft
                  ? t("update") || "Update"
                  : t("saveDraft") || "Save Draft"}
              </Button>
            )}

            {!readOnly && hasSavedDraft && effectiveTemplateId && (
              <Button
                type="button"
                variant="secondary"
                className="w-full gap-2"
                onClick={() => setShowApprovalModal(true)}
              >
                <Send className="h-4 w-4" />
                {t("requestApproval") || "Request Approval"}
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Validation Errors/Warnings */}
      {validationErrors.length > 0 && (
        <Card
          className={`p-4 border-2 ${
            hasErrors
              ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/50"
              : "border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/50"
          }`}
        >
          <div className="space-y-2">
            {validationErrors.map((error, idx) => (
              <div key={idx} className="flex gap-2">
                {error.severity === "error" ? (
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p
                    className={`text-sm font-medium ${
                      error.severity === "error"
                        ? "text-red-900 dark:text-red-200"
                        : "text-yellow-900 dark:text-yellow-200"
                    }`}
                  >
                    {error.field}
                  </p>
                  <p
                    className={`text-sm ${
                      error.severity === "error"
                        ? "text-red-800 dark:text-red-300"
                        : "text-yellow-800 dark:text-yellow-300"
                    }`}
                  >
                    {error.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Request Approval Modal */}
      {effectiveTemplateId && (
        <RequestApprovalModal
          open={showApprovalModal}
          onOpenChange={setShowApprovalModal}
          templateId={effectiveTemplateId}
          locale={formData.selectedLocale}
          templateName={formData.displayName || t("untitled") || "Untitled"}
          onSuccess={() => {
            addNotification(
              t("approvalRequestSubmitted") ||
                "Approval request submitted successfully",
              "success",
              3000,
            );
            // Refresh template data
            globalMutate(`template-${effectiveTemplateId}`);
          }}
        />
      )}
    </form>
  );
}
