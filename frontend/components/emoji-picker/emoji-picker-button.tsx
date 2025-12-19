"use client";

/**
 * Emoji Picker Button
 * A button component that opens the emoji picker popover
 * Designed to be placed in the chat message input area
 *
 * This component:
 * - Shows a smile icon button
 * - Opens a floating emoji picker on click
 * - Handles keyboard accessibility
 * - Can be positioned in the input area
 */

import { cn } from "@/lib/utils";
import { Smile } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { EmojiPickerI18n } from "./emoji-picker-content";
import { FloatingEmojiPicker } from "./floating-emoji-picker";
import { Emoji } from "./types";

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: Emoji) => void;
  disabled?: boolean;
  className?: string;
  /** Position of the picker relative to the button */
  placement?: "top" | "bottom" | "top-end" | "bottom-end";
  /** Locale for translations - defaults to 'en' */
  locale?: string;
  /** Custom translations object */
  i18n?: EmojiPickerI18n;
}

export function EmojiPickerButton({
  onEmojiSelect,
  disabled = false,
  className,
  placement = "top",
  locale = "en",
  i18n,
}: EmojiPickerButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen((prev) => !prev);
    }
  }, [disabled]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleEmojiSelect = useCallback(
    (emoji: Emoji) => {
      onEmojiSelect(emoji);
      // Picker closes automatically via FloatingEmojiPicker
    },
    [onEmojiSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleToggle();
      }
    },
    [handleToggle]
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          "p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          isOpen && "text-foreground bg-muted",
          className
        )}
        title="Emoji"
        aria-label="Open emoji picker"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Smile className="h-5 w-5" />
      </button>

      <FloatingEmojiPicker
        isOpen={isOpen}
        onClose={handleClose}
        onEmojiSelect={handleEmojiSelect}
        triggerRef={buttonRef}
        placement={placement}
        locale={locale}
        i18n={i18n}
      />
    </>
  );
}
