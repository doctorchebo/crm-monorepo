"use client";

import { ChatMessageInputRef } from "@/components/chat-message-input";
import { useCallback, useEffect, useRef } from "react";

interface UseInputFocusOptions {
  /**
   * The current chat ID - focus is triggered when this changes to a non-null value
   */
  selectedChatId: string | null;

  /**
   * Whether the chat data is ready (messages loaded, not in initial load state)
   * Focus will wait until this is true before attempting to focus
   */
  isChatReady: boolean;

  /**
   * Whether the component is currently in a loading state
   * Focus will be deferred while loading
   */
  isLoading: boolean;
}

interface UseInputFocusReturn {
  /**
   * Ref callback to attach to the input component
   * The component must expose a focus() method via forwardRef/useImperativeHandle
   */
  inputRef: React.RefObject<ChatMessageInputRef | null>;

  /**
   * Manually trigger focus (e.g., after replying to a message)
   * This uses requestAnimationFrame to ensure DOM is ready
   */
  triggerFocus: () => void;
}

/**
 * Hook for managing input focus in the chat interface
 *
 * This hook provides reliable input focusing that accounts for:
 * - Async data loading
 * - Component re-renders
 * - Chat switching
 * - URL-based navigation
 *
 * Uses requestAnimationFrame to ensure the DOM is painted before focusing,
 * avoiding race conditions with React's render cycle.
 */
export function useInputFocus(
  options: UseInputFocusOptions
): UseInputFocusReturn {
  const { selectedChatId, isChatReady, isLoading } = options;

  const inputRef = useRef<ChatMessageInputRef | null>(null);

  // Track which chat we've already focused to prevent re-focusing on every render
  const lastFocusedChatRef = useRef<string | null>(null);

  // Track pending focus request
  const pendingFocusRef = useRef<number | null>(null);

  /**
   * Core focus implementation using requestAnimationFrame
   * This ensures focus happens after the browser has painted,
   * avoiding race conditions with React's virtual DOM reconciliation
   */
  const performFocus = useCallback(() => {
    // Cancel any pending focus request
    if (pendingFocusRef.current !== null) {
      cancelAnimationFrame(pendingFocusRef.current);
    }

    // Use double rAF to ensure we're after React's commit phase and browser paint
    pendingFocusRef.current = requestAnimationFrame(() => {
      pendingFocusRef.current = requestAnimationFrame(() => {
        pendingFocusRef.current = null;

        if (inputRef.current) {
          inputRef.current.focus();
        }
      });
    });
  }, []);

  /**
   * Manual focus trigger for external use (e.g., after setting reply)
   */
  const triggerFocus = useCallback(() => {
    performFocus();
  }, [performFocus]);

  /**
   * Auto-focus when chat becomes ready
   * This effect handles:
   * - Initial navigation to a chat (from URL or click)
   * - Switching between chats
   * - Waiting for loading to complete
   */
  useEffect(() => {
    // Don't focus if no chat is selected
    if (!selectedChatId) {
      lastFocusedChatRef.current = null;
      return;
    }

    // Don't focus if still loading or chat not ready
    if (isLoading || !isChatReady) {
      return;
    }

    // Don't re-focus if we've already focused this chat
    if (lastFocusedChatRef.current === selectedChatId) {
      return;
    }

    // Mark as focused and trigger focus
    lastFocusedChatRef.current = selectedChatId;
    performFocus();
  }, [selectedChatId, isChatReady, isLoading, performFocus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pendingFocusRef.current !== null) {
        cancelAnimationFrame(pendingFocusRef.current);
      }
    };
  }, []);

  return {
    inputRef,
    triggerFocus,
  };
}
