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
import type { CreateStageDto, WorkflowStage } from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useState } from "react";

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

interface CreateStageModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal should close */
  onOpenChange: (open: boolean) => void;
  /** Position where the new stage should be inserted (sortOrder) */
  insertAtPosition: number;
  /** Callback when a stage is successfully created */
  onStageCreated: (stage: WorkflowStage) => void;
  /** Whether this will be the only/first stage (for default selection) */
  isFirstStage?: boolean;
}

/**
 * Create Stage Modal
 *
 * Allows users to create new pipeline stages with:
 * - Name (required)
 * - Description (optional)
 * - Color selection
 * - Default stage toggle
 * - Final stage toggle
 * - AI settings
 */
export const CreateStageModal = memo(function CreateStageModal({
  open,
  onOpenChange,
  insertAtPosition,
  onStageCreated,
  isFirstStage = false,
}: CreateStageModalProps) {
  const t = useTranslations("kanban");
  const { addNotification } = useNotification();

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(STAGE_COLORS[0].value);
  const [isDefault, setIsDefault] = useState(isFirstStage);
  const [isFinal, setIsFinal] = useState(false);
  const [aiAutoReply, setAiAutoReply] = useState(true);
  const [aiHandoffRequired, setAiHandoffRequired] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Reset form
  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setColor(STAGE_COLORS[0].value);
    setIsDefault(isFirstStage);
    setIsFinal(false);
    setAiAutoReply(true);
    setAiHandoffRequired(false);
  }, [isFirstStage]);

  // Handle create
  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      addNotification(t("stageNameRequired"), "error");
      return;
    }

    setIsCreating(true);

    try {
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
      onStageCreated(newStage);
      resetForm();
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("stageCreateFailed");
      addNotification(message, "error");
    } finally {
      setIsCreating(false);
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
    onStageCreated,
    onOpenChange,
    resetForm,
    addNotification,
    t,
  ]);

  // Handle close
  const handleClose = useCallback(
    (open: boolean) => {
      if (!open) {
        resetForm();
      }
      onOpenChange(open);
    },
    [onOpenChange, resetForm],
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("createStage")}</DialogTitle>
          <DialogDescription>{t("createStageDescription")}</DialogDescription>
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
                if (e.key === "Enter" && !isCreating) {
                  handleCreate();
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
            onClick={() => handleClose(false)}
            disabled={isCreating}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !name.trim()}>
            {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
