"use client";

import { VariableAutocomplete } from "@/components/templates/variable-autocomplete";
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
import { backendApi } from "@/lib/api/endpoints";
import { toMetaTemplateName } from "@/lib/utils/template-name";
import { AlertCircle, Eye, Loader, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

const SUPPORTED_LOCALES = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "pt", name: "Português" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
];

const PLATFORMS = ["whatsapp", "messenger", "instagram"];

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
  header: string;
  body: string;
  footer: string;
  exampleVars: Record<string, string>;
  enabledPlatforms: string[];
  isVisible: boolean;
}

export function TemplateForm({ templateId }: { templateId?: string }) {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations("templates");
  const tCommon = useTranslations("common");
  const { addNotification } = useNotification();

  const [formData, setFormData] = useState<FormData>({
    displayName: "",
    description: "",
    selectedLocale: "en",
    header: "",
    body: "",
    footer: "",
    exampleVars: {},
    enabledPlatforms: ["whatsapp"],
    isVisible: true,
  });

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

  // Load existing template data
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

      // Set first locale data
      if (existingTemplate.locales && existingTemplate.locales.length > 0) {
        const firstLocale = existingTemplate.locales[0];
        setFormData((prev) => ({
          ...prev,
          selectedLocale: firstLocale.locale,
          header: firstLocale.header || "",
          body: firstLocale.body || "",
          footer: firstLocale.footer || "",
          exampleVars: firstLocale.exampleVars || {},
        }));
      }
    }
  }, [existingTemplate]);

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

      // For new template, validate on backend
      if (templateId) {
        const result = (await backendApi.templates.validate(templateId, {
          locale: formData.selectedLocale,
        })) as { errors?: ValidationError[]; hasCriticalErrors?: boolean };
        setValidationErrors(result.errors || []);
        return !(result.hasCriticalErrors || false);
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
      let response;

      if (templateId) {
        // Update existing template
        await backendApi.templates.update(templateId, {
          displayName: formData.displayName,
          description: formData.description,
          isVisible: formData.isVisible,
        });

        // Update locale
        await backendApi.templates.addLocale(templateId, {
          locale: formData.selectedLocale,
          body: formData.body,
          header: formData.header,
          footer: formData.footer,
          exampleVars: formData.exampleVars,
        });

        addNotification(
          t("templateUpdated") || "Template updated successfully",
          "success",
          3000
        );

        router.push(`/${locale}/dashboard/templates`);
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
        {/* Basic Info */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            {t("basicInfo") || "Basic Information"}
          </h2>

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
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="isVisible"
                checked={formData.isVisible}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isVisible: checked as boolean })
                }
              />
              <Label htmlFor="isVisible">
                {t("makeVisible") || "Make this template visible in chats"}
              </Label>
            </div>
          </div>
        </Card>

        {/* Platforms */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            {t("platforms") || "Available Platforms"}
          </h2>

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
                />
                <Label htmlFor={`platform-${platform}`} className="capitalize">
                  {platform}
                </Label>
              </div>
            ))}
          </div>
        </Card>

        {/* Locale Selection */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            {t("content") || "Content"}
          </h2>

          <div className="mb-4">
            <Label htmlFor="locale">{t("language") || "Language"}</Label>
            <Select
              value={formData.selectedLocale}
              onValueChange={(value: string) =>
                setFormData({ ...formData, selectedLocale: value })
              }
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
                placeholder="e.g., 📋 Order Details or a media URL"
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
                placeholder="Hello {{customer.first_name}}, your order {{order.order_id}} is ready!"
                rows={6}
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
                placeholder="e.g., Thank you for your business"
              />
            </div>
          </div>
        </Card>

        {/* Variables */}
        {extractedVariables.length > 0 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">
              {t("variables") || "Variables"}
            </h2>

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
                    placeholder={`Example value for ${varName}`}
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
            {tCommon("cancel") || "Cancel"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setPreviewOpen(!previewOpen)}
          >
            <Eye className="h-4 w-4 mr-2" />
            {t("preview") || "Preview"}
          </Button>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader className="h-4 w-4 mr-2 animate-spin" />}
            {templateId
              ? t("update") || "Update"
              : tCommon("create") || "Create"}
          </Button>
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
