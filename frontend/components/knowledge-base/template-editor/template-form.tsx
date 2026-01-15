"use client";

import {
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
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { KbObjectTemplate } from "@/lib/api/knowledge-base";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle } from "lucide-react";

const icons = [
    { value: "file-text", label: "Document" },
    { value: "home", label: "Real Estate" },
    { value: "shopping-bag", label: "E-commerce" },
    { value: "briefcase", label: "Business" },
    { value: "help-circle", label: "Support" },
    { value: "bed", label: "Hospitality" },
    { value: "layers", label: "General" },
];

const colors = [
    { value: "#3b82f6", label: "Blue" },
    { value: "#ef4444", label: "Red" },
    { value: "#10b981", label: "Green" },
    { value: "#f59e0b", label: "Yellow" },
    { value: "#8b5cf6", label: "Purple" },
    { value: "#ec4899", label: "Pink" },
    { value: "#6366f1", label: "Indigo" },
    { value: "#14b8a6", label: "Teal" },
];

const categories = [
    "custom",
    "real_estate",
    "ecommerce",
    "hospitality",
    "services",
    "support",
    "other"
];

export function TemplateForm({ isEditMode = false, template }: { isEditMode?: boolean; template?: KbObjectTemplate }) {
    const t = useTranslations("knowledgeBase.templates.form");
    const { control, setValue } = useFormContext();

    const slugify = (text: string) => {
        return text
            .toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "_")     // Replace spaces with _
            .replace(/[^\w\-]+/g, "") // Remove all non-word chars
            .replace(/\_\_+/g, "_");  // Replace multiple _ with single _
    };

    const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Auto-generate slug from display name (only in create mode)
        if (!isEditMode) {
            const generatedSlug = slugify(e.target.value);
            setValue("slug", generatedSlug, { shouldValidate: true });
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{t("basicInfo")}</CardTitle>
                    <CardDescription>{t("basicInfoDescription")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={control}
                            name="displayName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("displayName")}</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. Project Proposal" {...field} onChange={(e) => {
                                            field.onChange(e);
                                            handleDisplayNameChange(e);
                                        }} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={control}
                            name="slug"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("slug")}</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="e.g. project_proposal"
                                            {...field}
                                            disabled={isEditMode}
                                        />
                                    </FormControl>
                                    <FormDescription>{t("slugDescription")}</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={control}
                            name="category"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("category")}</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a category" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {categories.map((category) => (
                                                <SelectItem key={category} value={category}>
                                                    {
                                                        category === "custom" ? "Custom" :
                                                            category.charAt(0).toUpperCase() + category.slice(1).replace("_", " ")
                                                    }
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
                        control={control}
                        name="description"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t("description")}</FormLabel>
                                <FormControl>
                                    <Textarea placeholder={t("descriptionPlaceholder")} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={control}
                        name="hasMedia"
                        render={({ field }) => {
                            const hasMediaInUse = (template?.objectsWithMediaCount || 0) > 0;
                            const isLocked = hasMediaInUse && field.value === true;

                            return (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <FormLabel className="text-base">{t("hasMedia")}</FormLabel>
                                            {isLocked && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <AlertCircle className="h-4 w-4 text-amber-500 cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="max-w-xs">{t("hasMediaLockedDescription")}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                        </div>
                                        <FormDescription>
                                            {t("hasMediaDescription")}
                                        </FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            disabled={isLocked}
                                        />
                                    </FormControl>
                                </FormItem>
                            );
                        }}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={control}
                            name="icon"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("icon")}</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select an icon" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {icons.map((icon) => (
                                                <SelectItem key={icon.value} value={icon.value}>
                                                    <div className="flex items-center gap-2">
                                                        <span>{icon.label}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={control}
                            name="color"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("color")}</FormLabel>
                                    <div className="flex gap-2 flex-wrap mt-2">
                                        {colors.map((color) => (
                                            <div
                                                key={color.value}
                                                className={`w-8 h-8 rounded-full cursor-pointer transition-all ${field.value === color.value
                                                    ? "ring-2 ring-offset-2 ring-black dark:ring-white scale-110"
                                                    : "hover:scale-110"
                                                    }`}
                                                style={{ backgroundColor: color.value }}
                                                onClick={() => field.onChange(color.value)}
                                                title={color.label}
                                            />
                                        ))}
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t("aiConfiguration")}</CardTitle>
                    <CardDescription>{t("aiConfigurationDescription")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <FormField
                        control={control}
                        name="aiUsageHints"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t("aiUsageHints")}</FormLabel>
                                <FormControl>
                                    <Textarea placeholder={t("aiUsageHintsPlaceholder")} {...field} />
                                </FormControl>
                                <FormDescription>{t("aiUsageHintsDescription")}</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={control}
                        name="aiRetrievalContext"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t("aiRetrievalContext")}</FormLabel>
                                <FormControl>
                                    <Textarea placeholder={t("aiRetrievalContextPlaceholder")} {...field} />
                                </FormControl>
                                <FormDescription>{t("aiRetrievalContextDescription")}</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
