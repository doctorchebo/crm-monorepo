"use client";

/**
 * Auto-expanding Message Input
 * A textarea that automatically grows as the user types more content
 * Includes attachment button inside the input container
 */

import { cn } from "@/lib/utils";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxRows?: number;
  minRows?: number;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export interface MessageInputRef {
  focus: () => void;
  getCursorPosition: () => number;
  setCursorPosition: (position: number) => void;
}

export const MessageInput = forwardRef<MessageInputRef, MessageInputProps>(
  function MessageInput(
    {
      value,
      onChange,
      onKeyDown,
      placeholder = "Type a message...",
      disabled = false,
      className,
      maxRows = 5,
      minRows = 1,
      leftElement,
      rightElement,
    },
    ref
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
      focus: () => {
        textareaRef.current?.focus();
      },
      getCursorPosition: () => {
        return textareaRef.current?.selectionStart ?? 0;
      },
      setCursorPosition: (position: number) => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = position;
          textareaRef.current.selectionEnd = position;
        }
      },
    }));

    // Auto-resize textarea based on content
    const adjustHeight = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = "auto";

      // Calculate line height (approximately 20px per line)
      const lineHeight = 20;
      const minHeight = lineHeight * minRows;
      const maxHeight = lineHeight * maxRows;

      // Get the actual scroll height
      const scrollHeight = textarea.scrollHeight;

      // Clamp the height between min and max
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;

      // Enable scrolling if content exceeds max height
      textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
    }, [maxRows, minRows]);

    // Adjust height on value change
    useEffect(() => {
      adjustHeight();
    }, [value, adjustHeight]);

    // Adjust height on mount
    useEffect(() => {
      adjustHeight();
    }, [adjustHeight]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    };

    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-input bg-background px-2 py-1.5 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        {/* Left element (attachment button) */}
        {leftElement && (
          <div className="flex-shrink-0 flex items-center">{leftElement}</div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={minRows}
          className={cn(
            "flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed leading-5",
            "scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
          )}
          style={{
            minHeight: `${20 * minRows}px`,
            maxHeight: `${20 * maxRows}px`,
          }}
        />

        {/* Right element (send button or other actions) */}
        {rightElement && (
          <div className="flex-shrink-0 flex items-center">{rightElement}</div>
        )}
      </div>
    );
  }
);
