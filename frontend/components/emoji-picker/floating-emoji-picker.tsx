"use client";

/**
 * Floating Emoji Picker
 * A wrapper component that displays the emoji picker in a floating popover
 * Handles positioning and click-outside behavior
 *
 * Features:
 * - Floating positioning relative to trigger element
 * - Click outside to close
 * - Keyboard escape to close
 * - Smooth animations
 * - Responsive positioning
 * - Portal rendering to avoid z-index issues
 */

import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  EmojiPickerContent,
  EmojiPickerI18n,
  emojiPickerStyles,
} from "./emoji-picker-content";
import { Emoji } from "./types";

interface FloatingEmojiPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onEmojiSelect: (emoji: Emoji) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  placement?: "top" | "bottom" | "top-end" | "bottom-end";
  offset?: number;
  className?: string;
  /** Locale for translations - defaults to 'en' */
  locale?: string;
  /** Custom translations object */
  i18n?: EmojiPickerI18n;
}

interface Position {
  top: number;
  left: number;
  transformOrigin: string;
}

// Emoji-mart picker default dimensions
const PICKER_WIDTH = 352;
const PICKER_HEIGHT = 435;

export function FloatingEmojiPicker({
  isOpen,
  onClose,
  onEmojiSelect,
  triggerRef,
  placement = "top",
  offset = 8,
  className,
  locale = "en",
  i18n,
}: FloatingEmojiPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({
    top: 0,
    left: 0,
    transformOrigin: "bottom left",
  });
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Ensure we're mounted (for portal)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Calculate position function - extracted for reuse
  const calculatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Use actual picker dimensions if available, otherwise use defaults
    const picker = pickerRef.current;
    const pickerWidth = picker?.offsetWidth || PICKER_WIDTH;
    const pickerHeight = picker?.offsetHeight || PICKER_HEIGHT;

    let top = 0;
    let left = 0;
    let transformOrigin = "bottom left";

    // Calculate base position based on placement
    switch (placement) {
      case "top":
        top = triggerRect.top - pickerHeight - offset;
        left = triggerRect.left;
        transformOrigin = "bottom left";
        break;
      case "top-end":
        top = triggerRect.top - pickerHeight - offset;
        left = triggerRect.right - pickerWidth;
        transformOrigin = "bottom right";
        break;
      case "bottom":
        top = triggerRect.bottom + offset;
        left = triggerRect.left;
        transformOrigin = "top left";
        break;
      case "bottom-end":
        top = triggerRect.bottom + offset;
        left = triggerRect.right - pickerWidth;
        transformOrigin = "top right";
        break;
    }

    // Ensure picker stays within viewport bounds
    // Vertical bounds - flip if needed
    if (top < 10) {
      top = triggerRect.bottom + offset;
      transformOrigin = transformOrigin.replace("bottom", "top");
    } else if (top + pickerHeight > viewportHeight - 10) {
      top = triggerRect.top - pickerHeight - offset;
      transformOrigin = transformOrigin.replace("top", "bottom");
    }

    // Horizontal bounds
    if (left < 10) {
      left = 10;
    } else if (left + pickerWidth > viewportWidth - 10) {
      left = viewportWidth - pickerWidth - 10;
    }

    setPosition({ top, left, transformOrigin });
  }, [placement, offset, triggerRef]);

  // Calculate position immediately when opening using useLayoutEffect
  // This ensures position is set before the browser paints
  useLayoutEffect(() => {
    if (isOpen && triggerRef.current) {
      calculatePosition();
    }
  }, [isOpen, calculatePosition, triggerRef]);

  // Recalculate on scroll or resize
  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener("scroll", calculatePosition, true);
    window.addEventListener("resize", calculatePosition);

    return () => {
      window.removeEventListener("scroll", calculatePosition, true);
      window.removeEventListener("resize", calculatePosition);
    };
  }, [isOpen, calculatePosition]);

  // Handle open/close animations
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      // Small delay to trigger animation
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      // Wait for animation to complete before hiding
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Don't close if clicking on the picker
      if (pickerRef.current?.contains(target)) {
        return;
      }

      // Don't close if clicking on the trigger
      if (triggerRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    // Add listener with a small delay to avoid immediate close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose, triggerRef]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleEmojiSelect = useCallback(
    (emoji: Emoji) => {
      onEmojiSelect(emoji);
      onClose();
    },
    [onEmojiSelect, onClose]
  );

  if (!isVisible || !isMounted) {
    return null;
  }

  const pickerContent = (
    <>
      {/* Inject styles */}
      <style>{emojiPickerStyles}</style>

      {/* Picker container */}
      <div
        ref={pickerRef}
        className={cn(
          "fixed z-50 transition-all duration-150",
          isAnimating
            ? "opacity-100 scale-100"
            : "opacity-0 scale-95 pointer-events-none",
          className
        )}
        style={{
          top: position.top,
          left: position.left,
          transformOrigin: position.transformOrigin,
        }}
      >
        <div className="rounded-lg shadow-lg overflow-hidden border border-border bg-popover">
          <EmojiPickerContent
            onEmojiSelect={handleEmojiSelect}
            autoFocus={isOpen}
            locale={locale}
            i18n={i18n}
          />
        </div>
      </div>
    </>
  );

  // Use portal to render at document body level
  return createPortal(pickerContent, document.body);
}
