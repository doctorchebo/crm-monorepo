"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    CreateFieldDto,
    FieldType,
    KbTemplateField,
} from "@/lib/api/knowledge-base";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const fieldTypes: { value: FieldType; label: string }[] = [
    { value: "short_text", label: "Short Text" },
    { value: "long_text", label: "Long Text" },
    { value: "rich_text", label: "Rich Text" },
    { value: "number", label: "Number" },
    { value: "price", label: "Price" },
    { value: "date", label: "Date" },
    { value: "date_range", label: "Date Range" },
    { value: "boolean", label: "Boolean" },
    { value: "tags", label: "Tags" },
    { value: "location", label: "Location" },
    { value: "media", label: "Media" },
    { value: "file", label: "File" },
    { value: "select", label: "Select" },
    { value: "multi_select", label: "Multi Select" },
    { value: "url", label: "URL" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "key_value", label: "Key Value" },
];

const formSchema = z.object({
    displayName: z.string().min(1, "Display name is required"),
    name: z
        .string()
        .min(1, "Field name is required")
        .regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers, and underscores"),
    fieldType: z.enum([
        "short_text",
        "long_text",
        "rich_text",
        "number",
        "price",
        "date",
        "date_range",
        "boolean",
        "tags",
        "location",
        "media",
        "file",
        "select",
        "multi_select",
        "url",
        "email",
        "phone",
        "key_value",
    ]),
    description: z.string().optional(),
    placeholder: z.string().optional(),
    isRequired: z.boolean().default(false),
    // isIndexed removed in favor of aiIncludeInEmbedding or fieldConfig if needed, but keeping simplistic match
    aiRelevance: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    aiIncludeInEmbedding: z.boolean().default(true),
    aiFieldHints: z.string().optional(),
});

interface FieldEditorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    field?: KbTemplateField;
    onSave: (field: CreateFieldDto & { id?: string }) => void;
}

export function FieldEditorDialog({
    open,
    onOpenChange,
    field,
    onSave,
}: FieldEditorDialogProps) {
    const t = useTranslations("knowledgeBase.templates.fieldEditor");

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            displayName: "",
            name: "",
            fieldType: "short_text",
            description: "",
            placeholder: "",
            isRequired: false,
            aiRelevance: "medium",
            aiIncludeInEmbedding: true,
            aiFieldHints: "",
        },
    });

    useEffect(() => {
        if (field) {
            form.reset({
                displayName: field.displayName,
                name: field.name,
                fieldType: field.fieldType,
                description: field.description || "",
                placeholder: field.placeholder || "",
                isRequired: field.isRequired,
                aiRelevance: field.aiRelevance,
                aiIncludeInEmbedding: field.aiIncludeInEmbedding,
                aiFieldHints: field.aiFieldHints || "",
            });
        } else {
            form.reset({
                displayName: "",
                name: "",
                fieldType: "short_text",
                description: "",
                placeholder: "",
                isRequired: false,
                aiRelevance: "medium",
                aiIncludeInEmbedding: true,
                aiFieldHints: "",
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [field, open]);

    // Auto-generate field name from display name
    const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        form.setValue("displayName", value);

        if (!field) {
            const slug = value
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "");
            form.setValue("name", slug);
        }
    };

    const onSubmit = (values: z.infer<typeof formSchema>) => {
        onSave({
            ...values,
            slug: values.name, // Usually slug=name for fields
            id: field?.id,
        } as any);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {field ? t("editField") : t("addField")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("description")}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="displayName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t("displayName")}</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="e.g. Property Address"
                                                {...field}
                                                onChange={handleDisplayNameChange}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t("fieldName")}</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. property_address" {...field} />
                                        </FormControl>
                                        <FormDescription>
                                            {t("fieldNameDescription")}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="fieldType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t("fieldType")}</FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a field type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {fieldTypes.map((type) => (
                                                    <SelectItem key={type.value} value={type.value}>
                                                        {type.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("fieldDescription")}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={t("fieldDescriptionPlaceholder")} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="placeholder"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("placeholder")}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={t("placeholderPlaceholder")} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="isRequired"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <FormLabel className="text-base">
                                                {t("required")}
                                            </FormLabel>
                                            <FormDescription>
                                                {t("requiredDescription")}
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="isIndexed"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <FormLabel className="text-base">
                                                {t("indexed")}
                                            </FormLabel>
                                            <FormDescription>
                                                {t("indexedDescription")}
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="space-y-4 border rounded-lg p-4">
                            <h3 className="font-medium">{t("aiSettings")}</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="aiRelevance"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("aiRelevance")}</FormLabel>
                                            <Select
                                                onValueChange={field.onChange}
                                                defaultValue={field.value}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="low">Low</SelectItem>
                                                    <SelectItem value="medium">Medium</SelectItem>
                                                    <SelectItem value="high">High</SelectItem>
                                                    <SelectItem value="critical">Critical</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormDescription>
                                                {t("aiRelevanceDescription")}
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="aiIncludeInEmbedding"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 h-full">
                                            <div className="space-y-0.5">
                                                <FormLabel className="text-base">
                                                    {t("includeInEmbedding")}
                                                </FormLabel>
                                                <FormDescription>
                                                    {t("includeInEmbeddingDescription")}
                                                </FormDescription>
                                            </div>
                                            <FormControl>
                                                <Switch
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="aiFieldHints"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t("aiHints")}</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder={t("aiHintsPlaceholder")}
                                                className="resize-none"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {t("aiHintsDescription")}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                {t("cancel")}
                            </Button>
                            <Button type="submit">
                                {t("save")}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
