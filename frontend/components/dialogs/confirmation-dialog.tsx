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
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";

interface ConfirmationDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when the dialog should close (cancel or backdrop click) */
  onOpenChange: (open: boolean) => void;
  /** Title of the dialog */
  title: string;
  /** Description text or React node */
  description: ReactNode;
  /** Callback when user confirms the action */
  onConfirm: () => void | Promise<void>;
  /** Whether the confirm action is in progress */
  isLoading?: boolean;
  /** Text for the confirm button (defaults to "Confirm") */
  confirmText?: string;
  /** Text for the cancel button (defaults to "Cancel") */
  cancelText?: string;
  /** Variant for the confirm button (defaults to "default") */
  confirmVariant?: ButtonVariant;
  /** Optional icon to display in the header */
  icon?: ReactNode;
}

/**
 * A reusable confirmation dialog component.
 * Use this for any action that requires user confirmation before proceeding.
 *
 * For destructive actions like delete, use `confirmVariant="destructive"`.
 * For warning-style actions, pass a warning icon via the `icon` prop.
 */
export function ConfirmationDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  onConfirm,
  isLoading = false,
  confirmText,
  cancelText,
  confirmVariant = "default",
  icon,
}: ConfirmationDialogProps) {
  const t = useTranslations("common");

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {icon}
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-4 gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelText || t("cancel")}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {confirmText || t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
