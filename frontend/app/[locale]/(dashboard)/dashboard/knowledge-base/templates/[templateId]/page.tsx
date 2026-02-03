"use client";

import { FieldsManager } from "@/components/knowledge-base/template-editor/fields-manager";
import { TemplateForm } from "@/components/knowledge-base/template-editor/template-form";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Form, FormField } from "@/components/ui/form";
import { useNotification } from "@/hooks/use-notification";
import {
  CreateTemplateDto,
  KbObjectTemplate,
  KbTemplateField,
  knowledgeBaseApi,
  UpdateTemplateDto,
} from "@/lib/api/knowledge-base";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft, Save, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation"; // useParams is correct for app router
import { use, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Schema
const templateSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(
      /^[a-z0-9_-]+$/,
      "Only lowercase letters, numbers, underscores, and hyphens",
    ),
  description: z.string().default(""),
  category: z.string().default("custom"),
  icon: z.string().default("file-text"),
  color: z.string().default("#3b82f6"),
  hasMedia: z.boolean().default(false),
  aiUsageHints: z.string().default(""),
  aiRetrievalContext: z.string().default(""),
  fields: z.array(z.any()).default([]), // validation inside FieldsManager mostly
});

type TemplateFormValues = z.infer<typeof templateSchema>;

export default function TemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = use(params);
  const router = useRouter();
  const t = useTranslations("knowledgeBase.templates.editor");
  const { addNotification } = useNotification();

  const isNew = templateId === "new";
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [template, setTemplate] = useState<KbObjectTemplate | null>(null);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema) as any,
    defaultValues: {
      displayName: "",
      slug: "",
      description: "",
      category: "custom",
      icon: "file-text",
      color: "#3b82f6",
      hasMedia: false,
      aiUsageHints: "",
      aiRetrievalContext: "",
      fields: [],
    },
  });

  useEffect(() => {
    if (!isNew) {
      const loadTemplate = async () => {
        try {
          const data = await knowledgeBaseApi.getTemplate(templateId);
          setTemplate(data);

          // Populate form
          form.reset({
            displayName: data.displayName,
            slug: data.slug,
            description: data.description || "",
            category: data.category || "custom",
            icon: data.icon || "file-text",
            color: data.color || "#3b82f6",
            hasMedia: data.hasMedia || false,
            aiUsageHints: data.aiUsageHints || "",
            aiRetrievalContext: data.aiRetrievalContext || "",
            fields: data.fields || [],
          });
        } catch (error) {
          console.error("Failed to load template", error);
          addNotification(t("errors.loadFailed"), "error");
        } finally {
          setIsLoading(false);
        }
      };
      loadTemplate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, templateId]);

  const onSubmit = async (values: TemplateFormValues) => {
    setIsSaving(true);
    try {
      if (isNew) {
        // Create new template
        const createDto: CreateTemplateDto = {
          name: values.slug,
          slug: values.slug,
          displayName: values.displayName,
          description: values.description,
          category: values.category,
          icon: values.icon,
          color: values.color,
          hasMedia: values.hasMedia,
          aiUsageHints: values.aiUsageHints,
          aiRetrievalContext: values.aiRetrievalContext,
          fields: values.fields.map((f: any) => ({
            name: f.name || f.fieldName,
            slug: f.slug || f.name || f.fieldName,
            displayName: f.displayName,
            fieldType: f.fieldType,
            description: f.description,
            placeholder: f.placeholder,
            isRequired: f.isRequired,
            aiRelevance: f.aiRelevance,
            aiIncludeInEmbedding: f.aiIncludeInEmbedding,
            aiFieldHints: f.aiFieldHints,
            sortOrder: f.sortOrder ?? 0,
          })),
        };

        await knowledgeBaseApi.createTemplate(createDto);
        addNotification(t("success.created"), "success");
        router.push("/dashboard/knowledge-base/templates");
      } else {
        // Update existing template
        // 1. Update metadata
        const updateDto: UpdateTemplateDto = {
          displayName: values.displayName,
          description: values.description,
          category: values.category,
          icon: values.icon,
          color: values.color,
          hasMedia: values.hasMedia,
          aiUsageHints: values.aiUsageHints,
          aiRetrievalContext: values.aiRetrievalContext,
        };

        await knowledgeBaseApi.updateTemplate(templateId, updateDto);

        // 2. Handle Fields
        const currentFields = values.fields as KbTemplateField[];
        const originalFields = template?.fields || [];

        // Identify new, updated, deleted
        const activeIds = new Set<string>();
        const updates: Promise<any>[] = [];

        // Process current fields (New & Updates)
        for (let i = 0; i < currentFields.length; i++) {
          const field = currentFields[i];
          // Normalize field data for API
          const fieldData = {
            name: field.name || (field as any).fieldName,
            slug: field.slug || field.name || (field as any).fieldName,
            displayName: field.displayName,
            fieldType: field.fieldType,
            description: field.description,
            placeholder: field.placeholder,
            isRequired: field.isRequired,
            aiRelevance: field.aiRelevance,
            aiIncludeInEmbedding: field.aiIncludeInEmbedding,
            aiFieldHints: field.aiFieldHints,
            sortOrder: i, // Explicit sort order based on array position
            // ... other props
          } as any;

          if (field.id) {
            // Update
            activeIds.add(field.id);
            // Check if changed? optimize later. for now update.
            updates.push(
              knowledgeBaseApi.updateField(templateId, field.id, fieldData),
            );
          } else {
            // Create
            updates.push(
              knowledgeBaseApi.addField(templateId, {
                fieldName: fieldData.name,
                ...fieldData,
              }),
            );
          }
        }

        // Process deletions - handle each separately to collect errors
        const deleteOperations: {
          fieldId: string;
          fieldName: string;
          promise: Promise<void>;
        }[] = [];
        for (const orgField of originalFields) {
          if (!activeIds.has(orgField.id)) {
            deleteOperations.push({
              fieldId: orgField.id,
              fieldName: orgField.displayName || orgField.name,
              promise: knowledgeBaseApi.deleteField(templateId, orgField.id),
            });
          }
        }

        // Execute all updates and additions
        await Promise.all(updates);

        // Execute deletions with error collection
        const errors: string[] = [];
        if (deleteOperations.length > 0) {
          const deleteResults = await Promise.allSettled(
            deleteOperations.map((op) => op.promise),
          );

          deleteResults.forEach((result, index) => {
            if (result.status === "rejected") {
              const fieldName = deleteOperations[index].fieldName;
              const errorMessage =
                result.reason?.message || t("errors.deleteFieldUnknown");

              // Check if it's the "field has data" error
              if (errorMessage.includes("Cannot delete field that has data")) {
                errors.push(t("errors.fieldHasData", { field: fieldName }));
              } else {
                errors.push(
                  t("errors.deleteFieldFailed", {
                    field: fieldName,
                    error: errorMessage,
                  }),
                );
              }
            }
          });
        }

        if (errors.length > 0) {
          setSaveErrors(errors);
          // Still show partial success if template was updated
          addNotification(
            `${t("success.partialUpdate")}: ${t("errors.someFieldsNotDeleted", { count: errors.length })}`,
            "warning",
          );
        } else {
          setSaveErrors([]);
          addNotification(t("success.updated"), "success");
        }

        // 3. Reorder if necessary (if backend updateField didn't handle sortOrder correctly?)
        // backend updateField DOES handle sortOrder if passed.
        // But let's call reorderFields to be safe/clean if we have ids?
        // Actually, if we updated sortOrder in updateField/addField loops, it might be enough.
        // But `addField` usually appends to end?
        // My `addTemplateField` in backend takes `sortOrder`.
        // So explicit reorder might not be strictly needed if we pass sortOrder.
        // However, `reorderFields` is atomic for order.

        // Let's just rely on the loop updates for now.

        router.refresh();
      }
    } catch (error) {
      console.error("Failed to save template", error);
      addNotification(
        `${t("errors.saveFailed")}: ${(error as Error).message}`,
        "error",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-8">{t("loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard/knowledge-base/templates">
                {t("breadcrumbs.templates")}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                {isNew
                  ? t("breadcrumbs.new")
                  : template?.displayName || t("breadcrumbs.edit")}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.back()}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">
              {isNew
                ? t("title.new")
                : t("title.edit", { name: template?.displayName ?? "" })}
            </h1>
          </div>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? t("saving") : t("save")}
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {saveErrors.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-destructive mb-2">
                {t("errors.couldNotDeleteFields")}
              </h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-destructive/90">
                {saveErrors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                {t("errors.fieldInUseHint")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setSaveErrors([])}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Form {...form}>
        <form className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Fields Manager - Main Content Area */}
              <FormField
                control={form.control}
                name="fields"
                render={({ field }) => (
                  <FieldsManager
                    fields={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>

            <div className="space-y-6">
              {/* Metadata - Sidebar Area */}
              <TemplateForm
                isEditMode={!isNew}
                template={template || undefined}
              />
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
