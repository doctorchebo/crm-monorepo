/**
 * Text Element Renderer Component
 * Handles text display, editing, auto-sizing, and emoji insertion
 *
 * Key behaviors:
 * - Auto-starts in edit mode when newly created
 * - Auto-expands to fit content (no scrollbar)
 * - Background fits text shape (not rectangular)
 * - Double-click to edit existing text
 */

"use client";

import { Emoji, EmojiPickerButton } from "@/components/emoji-picker";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { sizeToNormalized } from "./coordinate-utils";
import { useEditorContext } from "./editor-context";
import { TextElement } from "./types";

interface TextElementRendererProps {
  displayText: TextElement & { fontSize: number }; // fontSize in pixels
  isSelected: boolean;
  canvasWidth: number;
  canvasHeight: number;
  onSelect: () => void;
  /** When true, starts in edit mode immediately (for newly created text) */
  startInEditMode?: boolean;
}

export function TextElementRenderer({
  displayText,
  isSelected,
  canvasWidth,
  canvasHeight,
  onSelect,
  startInEditMode = false,
}: TextElementRendererProps) {
  const { updateText, updateTextNoHistory, commitToHistory, removeText } =
    useEditorContext();
  // Start in edit mode if requested (newly created text)
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const hasAutoFocusedRef = useRef(false);
  const isPlaceholder = displayText.text === "Type here";
  const isEmpty = isPlaceholder || displayText.text.trim() === "";

  // Focus textarea when entering edit mode or on initial mount if startInEditMode
  useEffect(() => {
    if (isEditing && textareaRef.current && !hasAutoFocusedRef.current) {
      hasAutoFocusedRef.current = true;
      // Small delay to ensure element is rendered
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Select all text for easy replacement
          textareaRef.current.select();
        }
      });
    }
  }, [isEditing]);

  // Reset auto-focus tracking when edit mode changes
  useEffect(() => {
    if (!isEditing) {
      hasAutoFocusedRef.current = false;
    }
  }, [isEditing]);

  // Exit edit mode when deselected
  useEffect(() => {
    if (!isSelected && isEditing) {
      setIsEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelected]);

  // Handle double-click to enter edit mode
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onSelect();
      setIsEditing(true);
    },
    [onSelect]
  );

  // Handle single click - select but don't edit
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isSelected) {
        onSelect();
      }
    },
    [isSelected, onSelect]
  );

  // Handle text change - auto-resize on every change
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      updateText(displayText.id, { text: value || "Type here" });
      // Auto-fit immediately after text change
      requestAnimationFrame(() => autoFitSize());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayText.id, updateText]
  );

  // Handle key down - Shift+Enter for new line, auto-resize after
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Plain Enter exits edit mode
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        setIsEditing(false);
        return;
      }
      // Shift+Enter adds new line - auto-resize after
      if (e.key === "Enter" && e.shiftKey) {
        // Let the default behavior add the newline, then resize
        requestAnimationFrame(() => autoFitSize());
      }
      // Prevent delete key from propagating to element delete handler
      if (e.key === "Delete" || e.key === "Backspace") {
        e.stopPropagation();
        // Auto-resize after deletion
        requestAnimationFrame(() => autoFitSize());
      }
      // Escape to exit edit mode
      if (e.key === "Escape") {
        setIsEditing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Handle blur - exit edit mode, commit to history, remove if empty
  const handleBlur = useCallback(() => {
    // Small delay to allow emoji click to register
    setTimeout(() => {
      if (!document.activeElement?.closest(".emoji-picker-container")) {
        setIsEditing(false);
        // Remove text if empty, otherwise commit to history
        if (isEmpty) {
          removeText(displayText.id);
        } else {
          commitToHistory();
        }
      }
    }, 100);
  }, [commitToHistory, isEmpty, displayText.id, removeText]);

  // Handle emoji selection
  const handleEmojiSelect = useCallback(
    (emoji: Emoji) => {
      if (textareaRef.current) {
        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        const currentText = isPlaceholder ? "" : displayText.text;
        const newText =
          currentText.slice(0, start) + emoji.native + currentText.slice(end);
        updateText(displayText.id, { text: newText });
        // Restore focus and cursor position
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const newPos = start + emoji.native.length;
            textareaRef.current.setSelectionRange(newPos, newPos);
          }
        }, 0);
      } else {
        const currentText = isPlaceholder ? "" : displayText.text;
        updateText(displayText.id, { text: currentText + emoji.native });
      }
    },
    [displayText.id, displayText.text, isPlaceholder, updateText]
  );

  // Auto-fit size to content - called on text changes and when exiting edit mode
  const autoFitSize = useCallback(() => {
    if (!measureRef.current || canvasWidth === 0) return;

    const measure = measureRef.current;
    // Padding for the text container
    const horizontalPadding = displayText.showBackground ? 32 : 16;
    const verticalPadding = displayText.showBackground ? 20 : 12;
    const minWidth = 80;
    const minHeight = 36;

    // Measure the actual content size
    const measuredWidth = Math.max(
      minWidth,
      measure.scrollWidth + horizontalPadding
    );
    const measuredHeight = Math.max(
      minHeight,
      measure.scrollHeight + verticalPadding
    );

    // Convert to normalized coordinates
    const normalized = sizeToNormalized(
      measuredWidth,
      measuredHeight,
      canvasWidth,
      canvasHeight
    );

    // Update without history during typing, commit on blur/exit
    updateTextNoHistory(displayText.id, normalized);
  }, [
    canvasWidth,
    canvasHeight,
    displayText.id,
    displayText.showBackground,
    updateTextNoHistory,
  ]);

  // Run auto-fit on mount and when text content changes
  useLayoutEffect(() => {
    autoFitSize();
  }, [autoFitSize, displayText.text]);

  // Common text styles
  const textStyles = {
    color: displayText.color,
    fontSize: displayText.fontSize,
    fontFamily: displayText.fontFamily,
    fontWeight: displayText.isBold ? "bold" : "normal",
    fontStyle: displayText.isItalic ? "italic" : "normal",
    textShadow: displayText.showBackground
      ? "none"
      : "0 1px 3px rgba(0,0,0,0.5)",
  } as const;

  return (
    <div
      className="relative w-full h-full flex items-center justify-center"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{
        // When not editing, hide DOM content - canvas renders the visual
        // When editing, show DOM content for user interaction
        opacity: isEditing || isSelected ? 1 : 0,
      }}
    >
      {/* Hidden measure element for auto-sizing - matches visible text exactly */}
      <div
        ref={measureRef}
        className="absolute invisible whitespace-pre-wrap break-words"
        style={{
          ...textStyles,
          padding: displayText.showBackground ? "6px 12px" : "4px 8px",
          maxWidth: canvasWidth * 0.9,
          minWidth: 60,
        }}
      >
        {(isPlaceholder ? "Type here" : displayText.text) || "Type here"}
      </div>

      {/* Text container - background fits content shape */}
      <div
        className={cn(
          "w-full h-full flex items-center justify-center",
          !isEditing && "cursor-grab"
        )}
      >
        {/* Inner wrapper with background that fits text */}
        <div
          className={cn(
            "flex items-center justify-center w-full h-full",
            displayText.showBackground && "rounded-2xl shadow-md"
          )}
          style={{
            backgroundColor: displayText.showBackground
              ? "rgba(255, 255, 255, 0.95)"
              : "transparent",
            padding: displayText.showBackground ? "6px 12px" : "4px 8px",
          }}
        >
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={isPlaceholder ? "" : displayText.text}
              placeholder="Type here"
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              className={cn(
                "w-full h-full bg-transparent text-center outline-none border-none resize-none overflow-hidden",
                "placeholder:text-gray-400"
              )}
              style={textStyles}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-center whitespace-pre-wrap break-words"
              style={textStyles}
            >
              {isPlaceholder ? (
                <span className="text-gray-400">Type here</span>
              ) : (
                displayText.text
              )}
            </div>
          )}
        </div>
      </div>

      {/* Emoji button - only show when editing */}
      {isEditing && isSelected && (
        <div className="emoji-picker-container absolute -top-10 left-1/2 -translate-x-1/2 z-50">
          <EmojiPickerButton
            onEmojiSelect={handleEmojiSelect}
            placement="top"
            className="p-1.5 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors shadow-lg"
          />
        </div>
      )}
    </div>
  );
}
