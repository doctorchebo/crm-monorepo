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
import { AlertTriangle } from "lucide-react";

export interface UnsavedChangesDialogProps {
  /**
   * Whether the dialog is open
   */
  isOpen: boolean;
  /**
   * Called when user confirms they want to leave (discard changes)
   */
  onConfirm: () => void;
  /**
   * Called when user cancels and wants to stay
   */
  onCancel: () => void;
  /**
   * Custom title for the dialog
   * @default "Unsaved Changes"
   */
  title?: string;
  /**
   * Custom description for the dialog
   * @default "You have unsaved changes that will be lost if you leave this page."
   */
  description?: string;
  /**
   * Text for the confirm (leave) button
   * @default "Leave"
   */
  confirmText?: string;
  /**
   * Text for the cancel (stay) button
   * @default "Stay"
   */
  cancelText?: string;
}

/**
 * A reusable dialog component for confirming navigation away from unsaved changes.
 *
 * Features:
 * - Clear visual warning with icon
 * - Customizable text for different contexts
 * - Accessible dialog with proper focus management
 * - Consistent styling with the design system
 *
 * Usage:
 * ```tsx
 * <UnsavedChangesDialog
 *   isOpen={showDialog}
 *   onConfirm={() => {
 *     // User wants to leave - proceed with navigation
 *     router.push('/destination');
 *   }}
 *   onCancel={() => setShowDialog(false)}
 * />
 * ```
 */
export function UnsavedChangesDialog({
  isOpen,
  onConfirm,
  onCancel,
  title = "Unsaved Changes",
  description = "You have unsaved changes that will be lost if you leave this page. Are you sure you want to continue?",
  confirmText = "Leave Without Saving",
  cancelText = "Stay on Page",
}: UnsavedChangesDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/20">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-500" />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
