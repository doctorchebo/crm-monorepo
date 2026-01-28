"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface PhoneNumberInputProps
  extends Omit<React.ComponentProps<"input">, "type" | "onChange"> {
  /**
   * Callback when the filtered numeric value changes.
   * Only digits are passed to this callback.
   */
  onValueChange?: (value: string) => void;
  /**
   * Standard onChange handler for form compatibility.
   * The event target value will contain only digits.
   */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * PhoneNumberInput - A specialized input that only accepts numeric digits.
 *
 * This component filters out any non-digit characters (letters, symbols, spaces)
 * and only allows [0-9] to be typed. It's designed for phone number entry
 * where only the national number portion is expected (without country code).
 *
 * Features:
 * - Filters input to digits only in real-time
 * - Uses inputMode="numeric" for mobile keyboards
 * - Prevents paste of non-numeric content
 * - Supports both controlled and uncontrolled modes
 * - Compatible with standard Input styling
 *
 * @example
 * // Controlled with onValueChange
 * <PhoneNumberInput
 *   value={phoneNumber}
 *   onValueChange={(value) => setPhoneNumber(value)}
 *   placeholder="Enter phone number"
 * />
 *
 * @example
 * // With standard onChange for form handling
 * <PhoneNumberInput
 *   name="phoneNumber"
 *   value={formData.phoneNumber}
 *   onChange={handleChange}
 * />
 */
const PhoneNumberInput = React.forwardRef<
  HTMLInputElement,
  PhoneNumberInputProps
>(({ className, onValueChange, onChange, ...props }, ref) => {
  /**
   * Filters a string to only contain digits [0-9]
   */
  const filterToDigits = (value: string): string => {
    return value.replace(/\D/g, "");
  };

  /**
   * Handle input changes - filter non-digits and call appropriate callbacks
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const filteredValue = filterToDigits(rawValue);

    // Update the input value directly to show only digits
    e.target.value = filteredValue;

    // Call onValueChange with the filtered value
    if (onValueChange) {
      onValueChange(filteredValue);
    }

    // Call standard onChange with modified event
    if (onChange) {
      onChange(e);
    }
  };

  /**
   * Handle paste events - filter pasted content to digits only
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    const filteredText = filterToDigits(pastedText);

    // Insert filtered text at cursor position
    const input = e.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const currentValue = input.value;
    const newValue =
      currentValue.substring(0, start) +
      filteredText +
      currentValue.substring(end);

    // Trigger change with new value
    input.value = newValue;

    // Create and dispatch a synthetic change event
    const syntheticEvent = {
      target: input,
      currentTarget: input,
    } as React.ChangeEvent<HTMLInputElement>;

    handleChange(syntheticEvent);

    // Set cursor position after pasted content
    const newCursorPosition = start + filteredText.length;
    requestAnimationFrame(() => {
      input.setSelectionRange(newCursorPosition, newCursorPosition);
    });
  };

  /**
   * Prevent non-digit keys from being typed
   * Allows: digits, backspace, delete, arrow keys, tab, ctrl+a/c/v/x
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow control keys
    const allowedKeys = [
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
      "Home",
      "End",
    ];

    if (allowedKeys.includes(e.key)) {
      return;
    }

    // Allow Ctrl/Cmd combinations (copy, paste, select all, cut)
    if (e.ctrlKey || e.metaKey) {
      return;
    }

    // Only allow digit keys
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      onChange={handleChange}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
});

PhoneNumberInput.displayName = "PhoneNumberInput";

export { PhoneNumberInput };
