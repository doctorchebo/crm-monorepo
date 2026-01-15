/**
 * Knowledge Base Object Editor Component
 *
 * Dynamic form for creating and editing knowledge objects based on template fields.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  knowledgeBaseApi,
  type CreateObjectDto,
  type KbObject,
  type KbObjectTemplate,
  type KbTemplateField,
  type UpdateObjectDto,
} from "@/lib/api/knowledge-base";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  BookOpen,
  HelpCircle,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { ObjectMediaList } from "./object-media-list";

interface ObjectEditorProps {
  objectId?: string;
  templateId?: string;
}

interface FieldValue {
  [fieldName: string]: unknown;
}

// Field renderer based on field type
interface FieldRendererProps {
  field: KbTemplateField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}

function FieldRenderer({ field, value, onChange, error }: FieldRendererProps) {
  const renderField = () => {
    switch (field.fieldType) {
      case "short_text":
        return (
          <Input
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || ""}
          />
        );

      case "long_text":
        return (
          <Textarea
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || ""}
            rows={4}
          />
        );

      case "rich_text":
        return (
          <Textarea
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || ""}
            rows={8}
            className="font-mono"
          />
        );

      case "number":
        const numConfig = field.fieldConfig as {
          min?: number;
          max?: number;
          step?: number;
          suffix?: string;
        } | null;
        return (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={(value as number) ?? ""}
              onChange={(e) =>
                onChange(e.target.value ? Number(e.target.value) : null)
              }
              min={numConfig?.min}
              max={numConfig?.max}
              step={numConfig?.step || 1}
              placeholder={field.placeholder || ""}
            />
            {numConfig?.suffix && (
              <span className="text-sm text-muted-foreground">
                {numConfig.suffix}
              </span>
            )}
          </div>
        );

      case "price":
        const currConfig = field.fieldConfig as { currency?: string } | null;
        return (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {currConfig?.currency === "USD"
                ? "$"
                : currConfig?.currency || "$"}
            </span>
            <Input
              type="number"
              value={(value as number) ?? ""}
              onChange={(e) =>
                onChange(e.target.value ? Number(e.target.value) : null)
              }
              placeholder="0.00"
              step="0.01"
              className="pl-8"
            />
          </div>
        );

      case "boolean":
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={(value as boolean) ?? false}
              onCheckedChange={onChange}
            />
            <span className="text-sm text-muted-foreground">
              {value ? "Yes" : "No"}
            </span>
          </div>
        );

      case "date":
        return (
          <Input
            type="date"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case "date_range": {
        const dateRangeValue =
          (value as { start?: string; end?: string }) || {};
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                type="date"
                placeholder="Start date"
                value={dateRangeValue.start || ""}
                onChange={(e) =>
                  onChange({ ...dateRangeValue, start: e.target.value })
                }
              />
            </div>
            <span className="text-muted-foreground">to</span>
            <div className="flex-1">
              <Input
                type="date"
                placeholder="End date"
                value={dateRangeValue.end || ""}
                onChange={(e) =>
                  onChange({ ...dateRangeValue, end: e.target.value })
                }
              />
            </div>
          </div>
        );
      }

      case "select":
        const selectConfig = field.fieldConfig as {
          options?: Array<{ value: string; label: string }>;
        } | null;
        return (
          <Select value={(value as string) || ""} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select an option..." />
            </SelectTrigger>
            <SelectContent>
              {selectConfig?.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "multi_select":
        const multiConfig = field.fieldConfig as {
          options?: Array<{ value: string; label: string }>;
        } | null;
        const selectedValues = (value as string[]) || [];
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {selectedValues.map((v) => {
                const option = multiConfig?.options?.find((o) => o.value === v);
                return (
                  <Badge key={v} variant="secondary" className="gap-1">
                    {option?.label || v}
                    <button
                      type="button"
                      onClick={() =>
                        onChange(selectedValues.filter((sv) => sv !== v))
                      }
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
            <Select
              value=""
              onValueChange={(v) => {
                if (v && !selectedValues.includes(v)) {
                  onChange([...selectedValues, v]);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Add option..." />
              </SelectTrigger>
              <SelectContent>
                {multiConfig?.options
                  ?.filter((o) => !selectedValues.includes(o.value))
                  .map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        );

      case "tags":
        const tags = (value as string[]) || [];
        const [tagInput, setTagInput] = useState("");
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, index) => (
                <Badge key={index} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => onChange(tags.filter((_, i) => i !== index))}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    if (!tags.includes(tagInput.trim())) {
                      onChange([...tags, tagInput.trim()]);
                    }
                    setTagInput("");
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (tagInput.trim() && !tags.includes(tagInput.trim())) {
                    onChange([...tags, tagInput.trim()]);
                  }
                  setTagInput("");
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case "url":
        return (
          <Input
            type="url"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || "https://..."}
          />
        );

      case "email":
        return (
          <Input
            type="email"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || "email@example.com"}
          />
        );

      case "phone":
        return (
          <Input
            type="tel"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || "+1 234 567 8900"}
          />
        );

      case "location":
        const locValue = (value as { lat?: number; lng?: number }) || {};
        return (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Latitude</Label>
              <Input
                type="number"
                value={locValue.lat ?? ""}
                onChange={(e) =>
                  onChange({
                    ...locValue,
                    lat: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="0.000000"
                step="0.000001"
              />
            </div>
            <div>
              <Label className="text-xs">Longitude</Label>
              <Input
                type="number"
                value={locValue.lng ?? ""}
                onChange={(e) =>
                  onChange({
                    ...locValue,
                    lng: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="0.000000"
                step="0.000001"
              />
            </div>
          </div>
        );

      case "key_value": {
        const kvValue = (value as Record<string, string>) || {};
        const kvEntries = Object.entries(kvValue);
        return (
          <div className="space-y-2">
            {kvEntries.map(([key, val], index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder="Key"
                  value={key}
                  onChange={(e) => {
                    const newEntries = [...kvEntries];
                    newEntries[index] = [e.target.value, val];
                    onChange(Object.fromEntries(newEntries));
                  }}
                  className="flex-1"
                />
                <Input
                  placeholder="Value"
                  value={val}
                  onChange={(e) => {
                    onChange({ ...kvValue, [key]: e.target.value });
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { [key]: _, ...rest } = kvValue;
                    onChange(rest);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onChange({ ...kvValue, "": "" });
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Entry
            </Button>
          </div>
        );
      }

      case "media":
      case "file":
        return (
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Media upload coming soon. Use the media panel after saving.
            </p>
          </div>
        );

      default:
        return (
          <Input
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || ""}
          />
        );
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          {field.displayName}
          {field.isRequired && <span className="text-destructive">*</span>}
          {(field.description || field.aiFieldHints) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    {field.description || field.aiFieldHints}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </Label>
        {field.aiIncludeInEmbedding && (
          <Badge variant="outline" className="text-xs">
            AI Indexed
          </Badge>
        )}
      </div>
      {renderField()}
      {error && (
        <p className="text-sm text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

export function ObjectEditor({
  objectId,
  templateId: initialTemplateId,
}: ObjectEditorProps) {
  const router = useRouter();
  const t = useTranslations("knowledgeBase.editor");
  const tCommon = useTranslations("knowledgeBase.common");
  const isNew = !objectId;

  // Form state
  const [name, setName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    initialTemplateId || ""
  );
  const [fieldValues, setFieldValues] = useState<FieldValue>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null
  );
  const [draftId, setDraftId] = useState<string | null>(null);

  // Fetch templates list for dropdown (summary only, no fields)
  const { data: templates, isLoading: isLoadingTemplates } = useSWR<
    KbObjectTemplate[]
  >("knowledge-base-templates", () => knowledgeBaseApi.listTemplates());

  // Fetch full template details when a template is selected (includes fields)
  const { data: selectedTemplateDetails, isLoading: isLoadingTemplateDetails } =
    useSWR<KbObjectTemplate>(
      selectedTemplateId
        ? ["knowledge-base-template-detail", selectedTemplateId]
        : null,
      () => knowledgeBaseApi.getTemplate(selectedTemplateId)
    );

  // Fetch existing object if editing
  const { data: object, isLoading: isLoadingObject } = useSWR<KbObject>(
    objectId ? ["knowledge-base-object", objectId] : null,
    () => knowledgeBaseApi.getObject(objectId!)
  );

  // Use the full template details (with fields) for rendering
  const selectedTemplate = selectedTemplateDetails;

  // Initialize form from existing object
  useEffect(() => {
    if (object) {
      setName(object.name);
      setSelectedTemplateId(object.templateId);

      // Build field values from object's field values
      const values: FieldValue = {};
      object.fieldValues?.forEach((fv) => {
        // fieldValues come with fieldSlug from backend's ObjectDetail
        if (fv.fieldSlug) {
          values[fv.fieldSlug] = fv.value;
        }
      });
      setFieldValues(values);
    }
  }, [object]);

  // Initialize field values with defaults when template changes (only for new objects)
  // This resets field values when switching templates
  useEffect(() => {
    if (isNew && selectedTemplateDetails?.fields) {
      // Start fresh with default values from the new template
      const initialValues: FieldValue = {};
      selectedTemplateDetails.fields.forEach((field) => {
        if (field.defaultValue !== undefined && field.defaultValue !== null) {
          initialValues[field.slug] = field.defaultValue;
        }
      });
      setFieldValues(initialValues);
    }
  }, [isNew, selectedTemplateDetails]);

  // Track changes
  useEffect(() => {
    setHasChanges(true);
  }, [name, fieldValues]);

  // Validate form
  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = t("objectNameRequired");
    }

    if (!selectedTemplateId) {
      newErrors.template = t("templateRequired");
    }

    // Validate required fields
    selectedTemplate?.fields?.forEach((field) => {
      if (field.isRequired) {
        const value = fieldValues[field.slug];
        if (
          value === undefined ||
          value === null ||
          value === "" ||
          (Array.isArray(value) && value.length === 0)
        ) {
          newErrors[field.slug] = t("fieldRequired", {
            field: field.displayName,
          });
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, selectedTemplateId, selectedTemplate, fieldValues, t]);

  // Convert frontend fieldValues (Record<slug, value>) to backend format (FieldValueDto[])
  const convertFieldValues = useCallback(() => {
    if (!selectedTemplate?.fields) return [];

    return selectedTemplate.fields
      .filter((field) => fieldValues[field.slug] !== undefined)
      .map((field) => ({
        fieldId: field.id,
        value: fieldValues[field.slug],
      }));
  }, [selectedTemplate?.fields, fieldValues]);

  // Create a draft object if it doesn't exist (for media uploads)
  const handleEnsureObject = async () => {
    if (objectId) return objectId;
    if (draftId) return draftId;

    try {
      // Create a transient draft
      const data: CreateObjectDto = {
        templateId: selectedTemplateId,
        name: name.trim() || t("draftObject"), // Use placeholder if empty
        fieldValues: [], // No fields yet
        publishImmediately: false,
        isTransient: true,
      };

      const newObject = await knowledgeBaseApi.createObject(data);
      setDraftId(newObject.id);
      setHasChanges(true); // Ensure we warn before leaving
      return newObject.id;
    } catch (error) {
      console.error("Failed to create draft object:", error);
      throw error;
    }
  };

  // Save handler
  const handleSave = async (publish = false) => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      const convertedFieldValues = convertFieldValues();

      if (isNew && !draftId) {
        const data: CreateObjectDto = {
          templateId: selectedTemplateId,
          name: name.trim(),
          fieldValues: convertedFieldValues,
          publishImmediately: publish,
          isTransient: false,
        };
        const newObject = await knowledgeBaseApi.createObject(data);
        setHasChanges(false);
        router.push(`/dashboard/knowledge-base/objects/${newObject.id}`);
      } else {
        // Update existing object or finalize draft
        const targetId = objectId || draftId;

        const data: UpdateObjectDto = {
          name: name.trim(),
          fieldValues: convertedFieldValues,
          isTransient: false, // Ensure it's no longer transient
        };

        if (targetId) {
          await knowledgeBaseApi.updateObject(targetId, data);
          if (publish) {
            await knowledgeBaseApi.publishObject(targetId);
          }

          if (draftId) {
            // If we just saved a draft, redirect to the permanent URL to avoid confusion
            router.push(`/dashboard/knowledge-base/objects/${targetId}`);
          }
        }
        setHasChanges(false);
      }
    } catch (error) {
      console.error("Failed to save object:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Navigation with unsaved changes check
  const handleNavigation = async (path: string) => {
    if (hasChanges) {
      setPendingNavigation(path);
      setShowUnsavedDialog(true);
    } else {
      // If we have a draft and we are leaving without changes (e.g. just uploaded media but didn't change form?), 
      // actually if hasChanges is false, we assume it's safe. 
      // But for draftId, we should cleanup if we are navigating away and NOT saving.
      // However, hasChanges is set to true when draft is created.
      router.push(path);
    }
  };

  const cleanupDraft = async () => {
    if (draftId) {
      try {
        await knowledgeBaseApi.deleteObject(draftId);
      } catch (e) {
        console.error("Failed to cleanup draft:", e);
      }
    }
  };

  // Show loading state while fetching initial data (templates list or existing object)
  const isLoading = isLoadingTemplates || isLoadingObject;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              handleNavigation("/dashboard/knowledge-base/objects")
            }
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("back")}
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">
              {isNew ? t("newObject") : t("editObject")}
            </h1>
            {object && (
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant={
                    object.status === "indexed"
                      ? "default"
                      : object.status === "archived"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {object.status}
                </Badge>
                {hasChanges && (
                  <Badge variant="outline" className="text-yellow-600">
                    {t("unsavedChanges")}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && object?.status !== "indexed" && (
            <Button
              variant="outline"
              onClick={() => handleSave(true)}
              disabled={isSaving}
            >
              <BookOpen className="h-4 w-4 mr-2" />
              {t("saveAndPublish")}
            </Button>
          )}
          <Button onClick={() => handleSave(false)} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t("save")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>{t("basicInfo")}</CardTitle>
              <CardDescription>{t("basicInfoDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  {t("objectName")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("objectNamePlaceholder")}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>
                  {t("selectTemplate")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={selectedTemplateId}
                  onValueChange={setSelectedTemplateId}
                  disabled={!isNew}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectTemplatePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.displayName || template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.template && (
                  <p className="text-sm text-destructive">{errors.template}</p>
                )}
                {selectedTemplate?.description && (
                  <p className="text-sm text-muted-foreground">
                    {selectedTemplate.description}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Media Section */}
          {selectedTemplate?.hasMedia && (
            <ObjectMediaList
              objectId={objectId || draftId}
              fieldId="media" // Optional context
              editable={true}
              onEnsureObject={handleEnsureObject}
            />
          )}

          {/* Fields */}

          {/* Dynamic Fields - Loading State */}
          {selectedTemplateId && isLoadingTemplateDetails && (
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent className="space-y-6">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Dynamic Fields - Loaded */}
          {selectedTemplate &&
            selectedTemplate.fields &&
            selectedTemplate.fields.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("contentFields")}</CardTitle>
                  <CardDescription>
                    {t("contentFieldsDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {selectedTemplate.fields
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((field) => (
                      <FieldRenderer
                        key={field.id}
                        field={field}
                        value={fieldValues[field.slug]}
                        onChange={(value) =>
                          setFieldValues((prev) => ({
                            ...prev,
                            [field.slug]: value,
                          }))
                        }
                        error={errors[field.slug]}
                      />
                    ))}
                </CardContent>
              </Card>
            )}


        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status & Actions */}
          {!isNew && object && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("actions")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {object.status === "draft" && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleSave(true)}
                    disabled={isSaving}
                  >
                    <BookOpen className="h-4 w-4 mr-2" />
                    {t("publishObject")}
                  </Button>
                )}
                {object.status === "indexed" && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={async () => {
                      await knowledgeBaseApi.archiveObject(objectId!);
                      router.refresh();
                    }}
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    {t("archiveObject")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={async () => {
                    await knowledgeBaseApi.reindexObject(objectId!);
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t("reindexContent")}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Template Info */}
          {selectedTemplate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("templateInfo")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("templateName")}
                  </span>
                  <span>
                    {selectedTemplate.displayName || selectedTemplate.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("templateCategory")}
                  </span>
                  <span className="capitalize">
                    {selectedTemplate.category?.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("templateFields")}
                  </span>
                  <span>{selectedTemplate.fields?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("aiIndexedFields")}
                  </span>
                  <span>
                    {selectedTemplate.fields?.filter(
                      (f) => f.aiIncludeInEmbedding
                    ).length || 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Object Metadata */}
          {object && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("metadata")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("createdAt")}
                  </span>
                  <span>{new Date(object.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("updatedAt")}
                  </span>
                  <span>{new Date(object.updatedAt).toLocaleDateString()}</span>
                </div>
                {object.lastIndexedAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("lastIndexed")}
                    </span>
                    <span>
                      {new Date(object.lastIndexedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("indexingStatus")}
                  </span>
                  <Badge
                    variant={
                      object.status === "indexed" ? "default" : "outline"
                    }
                  >
                    {object.status || "draft"}
                  </Badge>
                </div>
                {object.chunkCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("chunks")}</span>
                    <span>{object.chunkCount}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Unsaved Changes Dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("unsavedDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("unsavedDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={async () => {
                await cleanupDraft();
                setShowUnsavedDialog(false);
                if (pendingNavigation) {
                  router.push(pendingNavigation);
                }
              }}
            >
              {t("unsavedDialog.discard")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowUnsavedDialog(false);
                setPendingNavigation(null);
              }}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={async () => {
                await handleSave(false);
                setShowUnsavedDialog(false);
                if (pendingNavigation) {
                  router.push(pendingNavigation);
                }
              }}
            >
              {t("unsavedDialog.saveAndContinue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
