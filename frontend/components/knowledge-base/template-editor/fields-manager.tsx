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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    CreateFieldDto,
    FieldType,
    KbTemplateField,
} from "@/lib/api/knowledge-base";
import {
    ArrowDown,
    ArrowUp,
    Edit,
    MoreHorizontal,
    Plus,
    Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FieldEditorDialog } from "./field-editor-dialog";

interface FieldsManagerProps {
    fields: Partial<KbTemplateField>[];
    onChange: (fields: Partial<KbTemplateField>[]) => void;
}

export function FieldsManager({ fields, onChange }: FieldsManagerProps) {
    const t = useTranslations("knowledgeBase.templates.fieldsManager");
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingField, setEditingField] = useState<Partial<KbTemplateField> | undefined>(
        undefined
    );
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    const handleAddField = () => {
        setEditingField(undefined);
        setEditingIndex(null);
        setEditorOpen(true);
    };

    const handleEditField = (field: Partial<KbTemplateField>, index: number) => {
        setEditingField(field);
        setEditingIndex(index);
        setEditorOpen(true);
    };

    const handleDeleteField = (index: number) => {
        const newFields = [...fields];
        newFields.splice(index, 1);
        onChange(updateSortOrders(newFields));
    };

    const handleMoveField = (index: number, direction: "up" | "down") => {
        if (
            (direction === "up" && index === 0) ||
            (direction === "down" && index === fields.length - 1)
        ) {
            return;
        }

        const newFields = [...fields];
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        [newFields[index], newFields[targetIndex]] = [
            newFields[targetIndex],
            newFields[index],
        ];
        onChange(updateSortOrders(newFields));
    };

    const handleSaveField = (fieldData: CreateFieldDto & { id?: string }) => {
        const newFields = [...fields];

        // Map DTO back to Partial<KbTemplateField>
        // Note: This is a simplification. In a real app we might need more robust mapping or types.
        const field: Partial<KbTemplateField> = {
            id: fieldData.id,
            name: fieldData.name, // Was fieldName
            slug: fieldData.slug,
            displayName: fieldData.displayName,
            fieldType: fieldData.fieldType,
            description: fieldData.description, // Was helpText
            placeholder: fieldData.placeholder,
            isRequired: fieldData.isRequired || false,
            aiRelevance: fieldData.aiRelevance || "medium",
            aiIncludeInEmbedding: fieldData.aiIncludeInEmbedding ?? true,
            aiFieldHints: fieldData.aiFieldHints,
        };

        if (editingIndex !== null) {
            // Update existing
            newFields[editingIndex] = {
                ...newFields[editingIndex],
                ...field,
            };
        } else {
            // Add new
            newFields.push(field);
        }
        onChange(updateSortOrders(newFields));
    };

    const updateSortOrders = (
        currentFields: Partial<KbTemplateField>[]
    ): Partial<KbTemplateField>[] => {
        return currentFields.map((field, index) => ({
            ...field,
            sortOrder: index,
        }));
    };

    const getBadges = (field: Partial<KbTemplateField>) => {
        const badges = [];
        if (field.isRequired) badges.push(t("required"));
        if (field.isUnique) badges.push(t("unique"));
        return badges;
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>{t("title")}</CardTitle>
                    <CardDescription>{t("description")}</CardDescription>
                </div>
                <Button onClick={handleAddField} size="sm" type="button">
                    <Plus className="h-4 w-4 mr-2" />
                    {t("addField")}
                </Button>
            </CardHeader>
            <CardContent>
                {fields.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                        {t("noFields")}
                        <div className="mt-4">
                            <Button onClick={handleAddField} variant="outline" type="button">
                                <Plus className="h-4 w-4 mr-2" />
                                {t("addField")}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">#</TableHead>
                                    <TableHead>{t("columns.name")}</TableHead>
                                    <TableHead>{t("columns.type")}</TableHead>
                                    <TableHead>{t("columns.attributes")}</TableHead>
                                    <TableHead>{t("columns.ai")}</TableHead>
                                    <TableHead className="text-right">{t("columns.actions")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fields.map((field, index) => (
                                    <TableRow key={field.id || `field-${index}`}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>
                                            <div className="font-medium">{field.displayName}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {field.name}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="font-mono text-xs">
                                                {field.fieldType}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-1 flex-wrap">
                                                {getBadges(field).map((badge, i) => (
                                                    <Badge key={i} variant="secondary" className="text-xs">
                                                        {badge}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs">
                                                    <span className="text-muted-foreground">{t("aiRelevance")}: </span>
                                                    {field.aiRelevance}
                                                </span>
                                                {!field.aiIncludeInEmbedding && (
                                                    <Badge variant="destructive" className="text-[10px] w-fit">
                                                        {t("excludedFromEmbedding")}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleMoveField(index, "up")}
                                                    disabled={index === 0}
                                                    className="h-8 w-8"
                                                    type="button"
                                                >
                                                    <ArrowUp className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleMoveField(index, "down")}
                                                    disabled={index === fields.length - 1}
                                                    className="h-8 w-8"
                                                    type="button"
                                                >
                                                    <ArrowDown className="h-4 w-4" />
                                                </Button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" type="button">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem
                                                            onClick={() => handleEditField(field, index)}
                                                        >
                                                            <Edit className="h-4 w-4 mr-2" />
                                                            {t("edit")}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="text-destructive focus:text-destructive"
                                                            onClick={() => handleDeleteField(index)}
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                            {t("delete")}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>

            <FieldEditorDialog
                open={editorOpen}
                onOpenChange={setEditorOpen}
                field={editingField as KbTemplateField}
                onSave={handleSaveField}
            />
        </Card>
    );
}
