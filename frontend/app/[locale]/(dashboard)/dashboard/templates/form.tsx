"use client";

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
import { backendApi } from "@/lib/api/endpoints";
import { AlertCircle, Eye, Loader } from "lucide-react";
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
  name: string;
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
    name: "",
    description: "",
    selectedLocale: "en",
    header: "",
    body: "",
    footer: "",
    exampleVars: {},
    enabledPlatforms: ["whatsapp"],
    isVisible: true,
  });

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
        name: existingTemplate.name,
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
      if (!formData.name.trim()) {
        setValidationErrors([
          {
            field: "name",
            message: "Template name is required",
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
        })) as any;
        setValidationErrors(result.errors || []);
        return !(result.hasCriticalErrors || false);
      }

      return true;
    } catch (error: any) {
      const errors = error.response?.data?.errors || [];
      setValidationErrors(errors);
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
          name: formData.name,
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
          name: formData.name,
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
    } catch (error: any) {
      console.error("Error saving template:", error);
      addNotification(
        error.message || t("saveFailed") || "Failed to save template",
        "error",
        3000
      );
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
            <div>
              <Label htmlFor="name">
                {t("templateName") || "Template Name"}
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Order Confirmation"
              />
            </div>

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
                  {t("useVariables") ||
                    "Use {{variable_name}} for placeholders"}
                </span>
              </Label>
              <Textarea
                id="body"
                value={formData.body}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setFormData({ ...formData, body: e.target.value })
                }
                placeholder="Hello {{customer_name}}, your order {{order_id}} is ready!"
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

      {/* Preview Section */}
      {previewOpen && (
        <Card className="p-6 bg-blue-50 border-2 border-blue-200">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Eye className="h-4 w-4" />
            {t("preview") || "Preview"}
          </h3>

          <div className="bg-white rounded-lg p-4 border border-blue-200 space-y-3">
            {formData.header && (
              <div className="text-sm font-semibold text-blue-900">
                {formData.header}
              </div>
            )}

            <div className="text-sm whitespace-pre-wrap text-gray-900">
              {renderPreview()}
            </div>

            {formData.footer && (
              <div className="text-xs text-gray-600 border-t pt-3">
                {formData.footer}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
