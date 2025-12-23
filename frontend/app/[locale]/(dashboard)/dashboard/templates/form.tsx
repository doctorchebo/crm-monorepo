"use client";

import { VariableAutocomplete } from "@/components/templates/variable-autocomplete";
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
import { AlertCircle, Eye, Globe, Loader, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
}: TemplateFormProps) {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations("templates");
  const tCommon = useTranslations("common");
  const { addNotification } = useNotification();

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
  });

  // Sync with controlled locale from parent
  useEffect(() => {
    if (controlledLocale && controlledLocale !== formData.selectedLocale) {
      setFormData((prev) => ({ ...prev, selectedLocale: controlledLocale }));
    }
  }, [controlledLocale]);

  // Auto-generated Meta-compliant template name
  const generatedName = useMemo(
    () => toMetaTemplateName(formData.displayName),
    [formData.displayName]
  );

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);

  // @ts-ignore - SWR conditional fetcher type mismatch
  const { data: existingTemplate }: { data: Template | null | undefined } =
    useSWR(
      templateId ? `template-${templateId}` : null,
      !templateId
        ? null
        : async () => await backendApi.templates.get(templateId)
    );

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
          (l) => l.locale === targetLocale
        );

        if (localeData) {
          setFormData((prev) => ({
            ...prev,
            selectedLocale: localeData.locale,
            category: localeData.category || "utility",
            header: localeData.header || "",
            body: localeData.body || "",
            footer: localeData.footer || "",
            exampleVars: localeData.exampleVars || {},
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
          }));
        }
      }
    }
  }, [existingTemplate, versionData, controlledLocale]);

  // Load version data when provided (takes precedence over locale data)
  useEffect(() => {
    if (versionData) {
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
  }, [versionData, controlledLocale]);

  // Extract variables from body
  const extractedVariables = useMemo(() => {
    const regex = /\{\{([^}]+)\}\}/g;
    const vars: string[] = [];
    let match;

    while ((match = regex.exec(formData.body)) !== null) {
      const varName = match[1].trim();
      if (!vars.includes(varName)) {
        vars.push(varName);
      }
    }

    return vars;
  }, [formData.body]);

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
      if (templateId) {
        // Check if the selected locale already exists for this template
        const localeExists = existingTemplate?.locales?.some(
          (loc) => loc.locale === formData.selectedLocale
        );

        if (localeExists) {
          const result = (await backendApi.templates.validate(templateId, {
            locale: formData.selectedLocale,
          })) as { errors?: ValidationError[]; hasCriticalErrors?: boolean };
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

  // Render template preview
  const renderPreview = () => {
    let rendered = formData.body;

    extractedVariables.forEach((varName) => {
      const value = formData.exampleVars[varName] || `[${varName}]`;
      rendered = rendered.replace(
        new RegExp(`\\{\\{${varName}\\}\\}`, "g"),
        value
      );
    });

    return rendered;
  };

  // Submit template
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isValid = await validate();
    if (!isValid) {
      addNotification(
        t("pleaseFixErrors") || "Please fix the errors below",
        "error",
        3000
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (templateId) {
        // Update existing template global fields
        await backendApi.templates.update(templateId, {
          displayName: formData.displayName,
          description: formData.description,
          isVisible: formData.isVisible,
        });

        // If we have version data, save to the version; otherwise save to locale
        if (versionData && versionData.canEdit) {
          // Save content to the version
          await backendApi.templates.updateVersionContent(
            templateId,
            versionData.id,
            {
              header: formData.header || null,
              body: formData.body,
              footer: formData.footer || null,
              exampleVars: formData.exampleVars,
              category: formData.category,
            }
          );
        } else if (!versionData) {
          // Legacy mode: save directly to locale (for non-versioned templates)
          await backendApi.templates.addLocale(templateId, {
            locale: formData.selectedLocale,
            category: formData.category,
            body: formData.body,
            header: formData.header,
            footer: formData.footer,
            exampleVars: formData.exampleVars,
          });
        }

        addNotification(
          t("templateUpdated") || "Template updated successfully",
          "success",
          3000
        );

        // Refresh template data
        globalMutate(`template-${templateId}`);

        // Call success callback (stay on edit page) or navigate back
        if (onSaveSuccess) {
          onSaveSuccess();
        } else {
          router.push(`/${locale}/dashboard/templates`);
        }
      } else {
        // Create new template
        const templateRes = (await backendApi.templates.create({
          displayName: formData.displayName,
          description: formData.description,
          platforms: formData.enabledPlatforms,
        })) as Template;

        // Add locale
        await backendApi.templates.addLocale(templateRes.id, {
          locale: formData.selectedLocale,
          category: formData.category,
          body: formData.body,
          header: formData.header,
          footer: formData.footer,
          exampleVars: formData.exampleVars,
        });

        addNotification(
          t("templateCreated") || "Template created successfully",
          "success",
          3000
        );

        router.push(`/${locale}/dashboard/templates`);
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
          3000
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasErrors = validationErrors.some((e) => e.severity === "error");
  const hasWarnings = validationErrors.some((e) => e.severity === "warning");

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
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
                <Label htmlFor={`platform-${platform}`} className="capitalize">
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
                <SelectValue />
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

          {/* Template Fields */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="header">
                {t("header") || "Header (Optional)"}
              </Label>
              <Input
                id="header"
                value={formData.header}
                onChange={(e) =>
                  setFormData({ ...formData, header: e.target.value })
                }
                placeholder={
                  t("headerPlaceholder") ||
                  "e.g., 📋 Order Details or a media URL"
                }
                disabled={readOnly}
              />
            </div>

            <div>
              <Label htmlFor="body">
                {t("messageBody") || "Message Body"}
                <span className="text-xs text-gray-500 ml-2">
                  {t("useVariablesHint") || "Type {{ to insert variables"}
                </span>
              </Label>
              <VariableAutocomplete
                id="body"
                value={formData.body}
                onChange={(value) => setFormData({ ...formData, body: value })}
                placeholder={
                  t("bodyPlaceholder") ||
                  "Hello {{customer.first_name}}, your order {{order.order_id}} is ready!"
                }
                rows={6}
                disabled={readOnly}
              />
            </div>

            <div>
              <Label htmlFor="footer">
                {t("footer") || "Footer (Optional)"}
              </Label>
              <Input
                id="footer"
                value={formData.footer}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, footer: e.target.value })
                }
                placeholder={
                  t("footerPlaceholder") || "e.g., Thank you for your business"
                }
                disabled={readOnly}
              />
            </div>
          </div>
        </Card>

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

        {/* Validation Errors/Warnings */}
        {validationErrors.length > 0 && (
          <Card
            className={`p-4 border-2 ${
              hasErrors
                ? "border-red-300 bg-red-50"
                : "border-yellow-300 bg-yellow-50"
            }`}
          >
            <div className="space-y-2">
              {validationErrors.map((error, idx) => (
                <div key={idx} className="flex gap-2">
                  {error.severity === "error" ? (
                    <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        error.severity === "error"
                          ? "text-red-900"
                          : "text-yellow-900"
                      }`}
                    >
                      {error.field}
                    </p>
                    <p
                      className={`text-sm ${
                        error.severity === "error"
                          ? "text-red-800"
                          : "text-yellow-800"
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

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/${locale}/dashboard/templates`)}
          >
            {readOnly
              ? tCommon("back") || "Back"
              : tCommon("cancel") || "Cancel"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setPreviewOpen(!previewOpen)}
          >
            <Eye className="h-4 w-4 mr-2" />
            {t("preview") || "Preview"}
          </Button>

          {!readOnly && (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader className="h-4 w-4 mr-2 animate-spin" />}
              {templateId
                ? t("update") || "Update"
                : tCommon("create") || "Create"}
            </Button>
          )}
        </div>
      </form>

      {/* Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl bg-white dark:bg-gray-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                {t("preview") || "Preview"}
              </h3>
              <button
                onClick={() => setPreviewOpen(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Close preview"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 space-y-3">
                {formData.header && (
                  <div className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                    {formData.header}
                  </div>
                )}

                <div className="text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                  {renderPreview()}
                </div>

                {formData.footer && (
                  <div className="text-xs text-gray-600 dark:text-gray-400 border-t dark:border-gray-700 pt-3">
                    {formData.footer}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
