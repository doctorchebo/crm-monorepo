"use client";

/**
 * Label Form Modal
 * A unified modal for creating and editing labels
 *
 * Features:
 * - Single component for both create and edit operations
 * - Inline emoji picker inside the text input (WhatsApp-style)
 * - Color selection via expandable color picker
 * - Proper handling of emoji picker portal interactions
 *
 * Architecture:
 * - Uses controlled form state that resets only when modal transitions from closed to open
 * - Form state is preserved during submission to prevent visual flickering
 * - CRITICAL: The FloatingEmojiPicker is rendered OUTSIDE the Dialog component
 *   as a sibling, not inside DialogContent. This prevents Radix Dialog's focus
 *   trapping and event interception from interfering with emoji selection.
 * - The picker is positioned relative to the button ref which is inside the dialog
 */

import { FloatingEmojiPicker, type Emoji } from "@/components/emoji-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Loader2, Smile } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { LabelColorDot } from "./label-color-picker";
import { getContrastTextColor, LABEL_COLORS } from "./label-colors";

// =============================================================================
// Types
// =============================================================================

/** Mode discriminator for create vs edit */
export type LabelFormMode = "create" | "edit";

/** Form data interface for label creation/editing */
export interface LabelFormData {
  name: string;
  color: string;
  emoji: string | null;
}

/** Props for create mode */
interface CreateModeProps {
  mode: "create";
  initialData?: Partial<LabelFormData>;
  defaultColor: string;
  onSubmit: (data: LabelFormData) => Promise<void>;
}

/** Props for edit mode */
interface EditModeProps {
  mode: "edit";
  initialData: {
    name: string;
    color: string;
    emoji: string | null;
  };
  onSubmit: (data: LabelFormData) => Promise<void>;
}

type LabelFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & (CreateModeProps | EditModeProps);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Computes initial form values based on mode and props.
 * For edit mode, prepends existing emoji to name for inline display.
 */
function computeInitialFormData(
  mode: LabelFormMode,
  props: LabelFormModalProps,
): LabelFormData {
  if (mode === "edit") {
    const editProps = props as EditModeProps;
    const existingEmoji = editProps.initialData.emoji || "";
    const existingName = editProps.initialData.name || "";
    return {
      // Prepend emoji to name if it exists (user can edit/remove it as part of the name)
      name: existingEmoji ? `${existingEmoji} ${existingName}` : existingName,
      color: editProps.initialData.color,
      emoji: null, // Emojis are embedded in name, no separate field needed
    };
  }

  // Create mode
  const createProps = props as CreateModeProps;
  return {
    name: createProps.initialData?.name ?? "",
    color: createProps.initialData?.color ?? createProps.defaultColor,
    emoji: null, // Emojis are embedded in name, no separate field needed
  };
}

// =============================================================================
// Component
// =============================================================================

export function LabelFormModal(props: LabelFormModalProps) {
  const { open, onOpenChange, mode, onSubmit } = props;

  const t = useTranslations("labels");
  const tc = useTranslations("common");

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [formData, setFormData] = useState<LabelFormData>(() =>
    computeInitialFormData(mode, props),
  );
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Refs
  // ---------------------------------------------------------------------------

  const inputRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  /**
   * Track the previous open state to detect open/close transitions.
   * This prevents form resets when props change while the modal is already open.
   */
  const wasOpenRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  /**
   * Reset form state only when modal transitions from closed to open.
   * This prevents the form from being reset during submission or when
   * parent state changes while the modal is already open.
   */
  useEffect(() => {
    const isOpening = open && !wasOpenRef.current;

    if (isOpening) {
      // Modal is opening - initialize form with fresh values
      setFormData(computeInitialFormData(mode, props));
      setShowEmojiPicker(false);
      setShowColorPicker(false);
    }

    // Update the ref for next render
    wasOpenRef.current = open;
  }, [open, mode, props]);

  /**
   * Close emoji picker when dialog closes.
   * This is a cleanup effect, separate from form initialization.
   */
  useEffect(() => {
    if (!open) {
      setShowEmojiPicker(false);
    }
  }, [open]);

  // ---------------------------------------------------------------------------
  // Form Field Handlers
  // ---------------------------------------------------------------------------

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, name: e.target.value }));
    },
    [],
  );

  const handleColorChange = useCallback((color: string) => {
    setFormData((prev) => ({ ...prev, color }));
    setShowColorPicker(false);
  }, []);

  /**
   * Handle emoji selection from the picker.
   * Inserts the emoji at the current cursor position in the input field (like WhatsApp).
   */
  const handleEmojiSelect = useCallback(
    (selectedEmoji: Emoji) => {
      const input = inputRef.current;
      const emoji = selectedEmoji.native;

      if (input) {
        // Get current selection/cursor position
        const start = input.selectionStart ?? formData.name.length;
        const end = input.selectionEnd ?? formData.name.length;

        // Insert emoji at cursor position (replacing any selected text)
        const newName =
          formData.name.slice(0, start) + emoji + formData.name.slice(end);

        setFormData((prev) => ({ ...prev, name: newName }));

        // After state update, restore cursor position after the inserted emoji
        setTimeout(() => {
          const newCursorPos = start + emoji.length;
          input.setSelectionRange(newCursorPos, newCursorPos);
          input.focus();
        }, 0);
      } else {
        // Fallback: append emoji to end
        setFormData((prev) => ({ ...prev, name: prev.name + emoji }));
      }

      // Close the picker
      setShowEmojiPicker(false);
    },
    [formData.name],
  );

  // ---------------------------------------------------------------------------
  // UI Toggle Handlers
  // ---------------------------------------------------------------------------

  const handleEmojiPickerClose = useCallback(() => {
    setShowEmojiPicker(false);
  }, []);

  const toggleEmojiPicker = useCallback(() => {
    setShowEmojiPicker((prev) => !prev);
  }, []);

  const toggleColorPicker = useCallback(() => {
    setShowColorPicker((prev) => !prev);
  }, []);

  // ---------------------------------------------------------------------------
  // Form Submission
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    const trimmedName = formData.name.trim();
    if (!trimmedName) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        color: formData.color,
        // Emojis are now embedded in the name, no separate emoji field needed
        emoji: null,
      });
      // Close modal only after successful submission
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, onSubmit, onOpenChange]);

  /** Handle Enter key for form submission */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !showEmojiPicker && !showColorPicker) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [showEmojiPicker, showColorPicker, handleSubmit],
  );

  // ---------------------------------------------------------------------------
  // Dialog Event Handlers
  // ---------------------------------------------------------------------------

  /**
   * Custom dialog open change handler.
   * Prevents the dialog from closing when the emoji picker is open or during submission.
   */
  const handleDialogOpenChange = useCallback(
    (newOpen: boolean) => {
      // If trying to close while emoji picker is open, just close the picker
      if (!newOpen && showEmojiPicker) {
        setShowEmojiPicker(false);
        return;
      }
      // Don't allow closing during submission
      if (!newOpen && isSubmitting) {
        return;
      }
      onOpenChange(newOpen);
    },
    [showEmojiPicker, isSubmitting, onOpenChange],
  );

  /**
   * Prevent dialog from closing when interacting outside
   * but within the emoji picker area or during submission.
   */
  const handleInteractOutside = useCallback(
    (event: Event) => {
      // Check if the click target is inside an emoji picker element
      const target = event.target as HTMLElement;
      if (target?.closest?.('[data-emoji-picker="true"]')) {
        event.preventDefault();
        return;
      }

      // If emoji picker is open, prevent closing the dialog
      if (showEmojiPicker) {
        event.preventDefault();
        return;
      }

      // Prevent closing during submission
      if (isSubmitting) {
        event.preventDefault();
      }
    },
    [showEmojiPicker, isSubmitting],
  );

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  const modalTitle = mode === "create" ? t("createLabel") : t("editLabel");
  const modalDescription =
    mode === "create" ? t("createLabelDescription") : t("editLabelDescription");
  const submitButtonText = mode === "create" ? tc("create") : tc("save");
  const isSubmitDisabled = isSubmitting || !formData.name.trim();

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="sm:max-w-[400px]"
          onInteractOutside={handleInteractOutside}
          onPointerDownOutside={handleInteractOutside}
        >
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
            <DialogDescription>{modalDescription}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Label Name Input with Emoji */}
            <div className="space-y-2">
              <label htmlFor="label-name" className="text-sm font-medium">
                {t("labelName")}
              </label>
              <div className="relative">
                {/* Input field - emojis are inserted directly into the text */}
                <input
                  ref={inputRef}
                  id="label-name"
                  type="text"
                  value={formData.name}
                  onChange={handleNameChange}
                  onKeyDown={handleKeyDown}
                  placeholder={t("labelNamePlaceholder")}
                  autoFocus
                  disabled={isSubmitting}
                  className={cn(
                    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                    "ring-offset-background placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "pr-10", // Space for the emoji button
                  )}
                />

                {/* Emoji picker button (right side) */}
                <button
                  ref={emojiButtonRef}
                  type="button"
                  onClick={toggleEmojiPicker}
                  disabled={isSubmitting}
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2",
                    "h-7 w-7 rounded-md flex items-center justify-center",
                    "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    showEmojiPicker && "text-foreground bg-accent",
                  )}
                  title={t("selectEmoji")}
                  aria-label={t("selectEmoji")}
                  aria-expanded={showEmojiPicker}
                >
                  <Smile className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Color Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("labelColor")}</label>

              {/* Color toggle button */}
              <button
                type="button"
                onClick={toggleColorPicker}
                disabled={isSubmitting}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md border border-input",
                  "hover:bg-accent hover:text-accent-foreground transition-colors",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  showColorPicker && "bg-accent",
                )}
              >
                <LabelColorDot color={formData.color} size="md" />
                <span className="flex-1 text-left text-sm">
                  {t("selectColor")}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    showColorPicker && "rotate-180",
                  )}
                />
              </button>

              {/* Color grid (expandable) */}
              {showColorPicker && (
                <div className="pt-2">
                  <div className="grid grid-cols-5 gap-2 justify-items-center p-3 rounded-md border border-input bg-muted/30">
                    {LABEL_COLORS.map((color) => {
                      const isSelected = formData.color === color;
                      const textColor = getContrastTextColor(color);

                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => handleColorChange(color)}
                          disabled={isSubmitting}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                            "hover:scale-110 hover:ring-2 hover:ring-offset-1 hover:ring-offset-background",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                            isSelected &&
                              "ring-2 ring-offset-1 ring-offset-background",
                          )}
                          style={{
                            backgroundColor: color,
                            ["--tw-ring-color" as string]: color,
                          }}
                          aria-label={`Select color ${color}`}
                          aria-pressed={isSelected}
                        >
                          {isSelected && (
                            <Check
                              className="w-4 h-4"
                              style={{ color: textColor }}
                              strokeWidth={3}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {tc("cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitDisabled}>
              {isSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {submitButtonText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        CRITICAL: FloatingEmojiPicker is rendered OUTSIDE the Dialog component.
        This is essential because Radix Dialog uses focus trapping and event
        interception that can interfere with portaled content inside it.
        By rendering the picker as a sibling to the Dialog, we avoid these issues.
        The picker still positions itself relative to emojiButtonRef which is
        inside the Dialog.
      */}
      <FloatingEmojiPicker
        isOpen={showEmojiPicker}
        onClose={handleEmojiPickerClose}
        onEmojiSelect={handleEmojiSelect}
        triggerRef={emojiButtonRef}
        placement="bottom-end"
      />
    </>
  );
}
