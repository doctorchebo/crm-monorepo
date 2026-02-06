"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { useNotification } from "@/hooks/use-notification";
import type {
  CreateStageDto,
  UpdateStageDto,
  WorkflowStage,
} from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useState } from "react";

// Predefined color palette for stages
const STAGE_COLORS = [
  { name: "Blue", value: "#3b82f6" },
  { name: "Green", value: "#22c55e" },
  { name: "Yellow", value: "#eab308" },
  { name: "Orange", value: "#f97316" },
  { name: "Red", value: "#ef4444" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Gray", value: "#6b7280" },
];

interface StageModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal should close */
  onOpenChange: (open: boolean) => void;
  /** Mode: 'create' for new stage, 'edit' for existing stage */
  mode: "create" | "edit";
  /** Existing stage data (required for edit mode) */
  stage?: WorkflowStage;
  /** Position where the new stage should be inserted (for create mode) */
  insertAtPosition?: number;
  /** Callback when a stage is successfully created */
  onStageCreated?: (stage: WorkflowStage) => void;
  /** Callback when a stage is successfully updated */
  onStageUpdated?: (stage: WorkflowStage) => void;
  /** Whether this will be the only/first stage (for default selection in create mode) */
  isFirstStage?: boolean;
}

/**
 * Stage Modal - Unified component for creating and editing pipeline stages
 *
 * Allows users to configure:
 * - Name (required)
 * - Description (optional)
 * - Color selection
 * - Default stage toggle
 * - Final stage toggle
 * - AI settings (auto-reply, handoff required)
 */
export const StageModal = memo(function StageModal({
  open,
  onOpenChange,
  mode,
  stage,
  insertAtPosition = 0,
  onStageCreated,
  onStageUpdated,
  isFirstStage = false,
}: StageModalProps) {
  const t = useTranslations("kanban");
  const { addNotification } = useNotification();

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(STAGE_COLORS[0].value);
  const [isDefault, setIsDefault] = useState(false);
  const [isFinal, setIsFinal] = useState(false);
  const [aiAutoReply, setAiAutoReply] = useState(true);
  const [aiHandoffRequired, setAiHandoffRequired] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form with stage data when in edit mode
  useEffect(() => {
    if (open) {
      if (mode === "edit" && stage) {
        setName(stage.name);
        setDescription(stage.description || "");
        setColor(stage.color || STAGE_COLORS[0].value);
        setIsDefault(stage.isDefault);
        setIsFinal(stage.isFinal);
        setAiAutoReply(stage.aiAutoReply);
        setAiHandoffRequired(stage.aiHandoffRequired);
      } else if (mode === "create") {
        // Reset to defaults for create mode
        setName("");
        setDescription("");
        setColor(STAGE_COLORS[0].value);
        setIsDefault(isFirstStage);
        setIsFinal(false);
        setAiAutoReply(true);
        setAiHandoffRequired(false);
      }
    }
  }, [open, mode, stage, isFirstStage]);

  // Handle save (create or update)
  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      addNotification(t("stageNameRequired"), "error");
      return;
    }

    setIsSaving(true);

    try {
      if (mode === "create") {
        const stageData: CreateStageDto = {
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          sortOrder: insertAtPosition,
          isDefault,
          isFinal,
          aiAutoReply,
          aiHandoffRequired,
        };

        const newStage = await backendApi.stages.createStage(stageData);
        addNotification(t("stageCreated", { name: newStage.name }), "success");
        onStageCreated?.(newStage);
      } else if (mode === "edit" && stage) {
        const updateData: UpdateStageDto = {
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          isDefault,
          isFinal,
          aiAutoReply,
          aiHandoffRequired,
        };

        const updatedStage = await backendApi.stages.updateStage(
          stage.id,
          updateData,
        );
        addNotification(
          t("stageUpdated", { name: updatedStage.name }),
          "success",
        );
        onStageUpdated?.(updatedStage);
      }

      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : mode === "create"
            ? t("stageCreateFailed")
            : t("stageUpdateFailed");
      addNotification(message, "error");
    } finally {
      setIsSaving(false);
    }
  }, [
    name,
    description,
    color,
    insertAtPosition,
    isDefault,
    isFinal,
    aiAutoReply,
    aiHandoffRequired,
    mode,
    stage,
    onStageCreated,
    onStageUpdated,
    onOpenChange,
    addNotification,
    t,
  ]);

  const isEditMode = mode === "edit";
  const dialogTitle = isEditMode ? t("editStage") : t("createStage");
  const dialogDescription = isEditMode
    ? t("editStageDescription")
    : t("createStageDescription");
  const saveButtonText = isEditMode ? t("save") : t("create");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name */}
          <div className="grid gap-2">
            <Label htmlFor="name">
              {t("stageName")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("stageNamePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSaving) {
                  handleSave();
                }
              }}
            />
          </div>

          {/* Description */}
          <div className="grid gap-2">
            <Label htmlFor="description">{t("stageDescription")}</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("stageDescriptionPlaceholder")}
            />
          </div>

          {/* Color */}
          <div className="grid gap-2">
            <Label>{t("stageColor")}</Label>
            <div className="flex flex-wrap gap-2">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "w-8 h-8 rounded-full transition-all",
                    color === c.value
                      ? "ring-2 ring-offset-2 ring-primary"
                      : "hover:scale-110",
                  )}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          {/* Stage type badges preview */}
          <div className="flex flex-wrap gap-2 pt-2">
            {isDefault && (
              <Badge variant="outline" className="text-xs">
                {t("defaultBadge")}
              </Badge>
            )}
            {isFinal && (
              <Badge variant="outline" className="text-xs">
                {t("finalBadge")}
              </Badge>
            )}
            {aiAutoReply && (
              <Badge
                variant="outline"
                className="text-xs bg-green-50 text-green-700 border-green-200"
              >
                {t("aiReplyBadge")}
              </Badge>
            )}
            {aiHandoffRequired && (
              <Badge
                variant="outline"
                className="text-xs bg-orange-50 text-orange-700 border-orange-200"
              >
                {t("handoffBadge")}
              </Badge>
            )}
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="isDefault" className="cursor-pointer">
                  {t("setAsDefault")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("setAsDefaultDescription")}
                </p>
              </div>
              <Switch
                id="isDefault"
                checked={isDefault}
                onCheckedChange={setIsDefault}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="isFinal" className="cursor-pointer">
                  {t("setAsFinal")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("setAsFinalDescription")}
                </p>
              </div>
              <Switch
                id="isFinal"
                checked={isFinal}
                onCheckedChange={setIsFinal}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="aiAutoReply" className="cursor-pointer">
                  {t("aiAutoReply")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("aiAutoReplyDescription")}
                </p>
              </div>
              <Switch
                id="aiAutoReply"
                checked={aiAutoReply}
                onCheckedChange={setAiAutoReply}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="aiHandoffRequired" className="cursor-pointer">
                  {t("handoffRequired")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("handoffRequiredDescription")}
                </p>
              </div>
              <Switch
                id="aiHandoffRequired"
                checked={aiHandoffRequired}
                onCheckedChange={setAiHandoffRequired}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {saveButtonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
