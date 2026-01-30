/**
 * useAIEvents Hook
 *
 * Listens for AI-related WebSocket events:
 * - ai:typing_start - AI started generating a response
 * - ai:typing_stop - AI finished generating a response
 * - ai:rate_limit_exceeded - Rate limit was hit for a chat
 * - ai:pending_review - AI generated response awaiting user review
 * - message:new - New message received (to track when AI sends)
 *
 * Usage:
 * const { isAITyping, rateLimitInfo, pendingReview, showRegenerateBanner } = useAIEvents(chatId, socket);
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";

// =============================================================================
// Types
// =============================================================================

export interface RateLimitInfo {
  chatId: string;
  currentCount: number;
  maxCount: number;
  resetTime?: string;
  timestamp: string;
}

export interface PendingReviewInfo {
  chatId: string;
  content: string;
  mediaAttachment?: {
    fileName: string;
    mediaType: string;
    s3Key: string;
    mimeType: string;
  };
  interactiveData?: {
    type: string;
    buttons?: Array<{ id: string; title: string }>;
    sections?: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  };
  generatedAt: string;
}

export interface AIEventsState {
  isAITyping: boolean;
  isAIProcessing: boolean; // True from inbound message until AI typing starts
  rateLimitInfo: RateLimitInfo | null;
  pendingReview: PendingReviewInfo | null;
  /** True when user can trigger AI regeneration (explicitly enabled after user action) */
  showRegenerateBanner: boolean;
  clearRateLimitInfo: () => void;
  clearPendingReview: () => void;
  setAIProcessing: (processing: boolean) => void;
  /** Call when user discards AI response or pauses AI - enables regenerate banner */
  enableRegenerateBanner: () => void;
  /** Call to hide the regenerate banner */
  hideRegenerateBanner: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useAIEvents(
  chatId: string | null | undefined,
  socket: Socket | null,
): AIEventsState {
  const [isAITyping, setIsAITyping] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(
    null,
  );
  const [pendingReview, setPendingReview] = useState<PendingReviewInfo | null>(
    null,
  );
  // Regenerate banner is shown only when explicitly enabled by user action
  const [showRegenerateBanner, setShowRegenerateBanner] = useState(false);

  // Track if we're waiting for AI response (between typing_start and message sent)
  const waitingForAIResponse = useRef(false);

  // Clear rate limit info
  const clearRateLimitInfo = useCallback(() => {
    setRateLimitInfo(null);
  }, []);

  // Clear pending review
  const clearPendingReview = useCallback(() => {
    setPendingReview(null);
  }, []);

  // Enable regenerate banner (called after user discards AI response or pauses AI)
  const enableRegenerateBanner = useCallback(() => {
    setShowRegenerateBanner(true);
  }, []);

  // Hide regenerate banner
  const hideRegenerateBanner = useCallback(() => {
    setShowRegenerateBanner(false);
  }, []);

  // Reset state when chat changes
  useEffect(() => {
    setIsAITyping(false);
    setIsAIProcessing(false);
    setRateLimitInfo(null);
    setPendingReview(null);
    setShowRegenerateBanner(false);
    waitingForAIResponse.current = false;
  }, [chatId]);

  useEffect(() => {
    if (!socket || !chatId) return;

    // AI typing start
    const handleTypingStart = (data: { chatId: string; timestamp: string }) => {
      if (data.chatId === chatId) {
        setIsAITyping(true);
        setIsAIProcessing(false); // Clear processing state when typing starts
        setShowRegenerateBanner(false); // Hide regenerate banner when AI starts
        waitingForAIResponse.current = true;
      }
    };

    // AI typing stop
    const handleTypingStop = (data: { chatId: string; timestamp: string }) => {
      if (data.chatId === chatId) {
        setIsAITyping(false);
        setIsAIProcessing(false); // Clear processing state
        waitingForAIResponse.current = false;
        // Note: We don't show regenerate banner here automatically
        // It should only be shown after explicit user action
      }
    };

    // Rate limit exceeded
    const handleRateLimitExceeded = (data: RateLimitInfo) => {
      if (data.chatId === chatId) {
        setRateLimitInfo(data);
        setIsAITyping(false);
        waitingForAIResponse.current = false;
      }
    };

    // Pending review (for review-before-send mode)
    const handlePendingReview = (data: PendingReviewInfo) => {
      if (data.chatId === chatId) {
        setPendingReview(data);
        setIsAITyping(false); // Stop typing indicator when review is ready
        setShowRegenerateBanner(false);
        waitingForAIResponse.current = false;
      }
    };

    // New message - handle state updates based on message direction
    // For outbound: clear typing state and banner (AI finished or user sent message)
    // For inbound: clear banner (new message invalidates previous regenerate intent)
    const handleNewMessage = (data: { chatId: string; direction: string }) => {
      if (data.chatId === chatId) {
        if (data.direction === "outbound") {
          // When an outbound message arrives (including AI messages), clear typing state
          setIsAITyping(false);
          setIsAIProcessing(false);
          setShowRegenerateBanner(false);
          waitingForAIResponse.current = false;
        } else if (data.direction === "inbound") {
          // When a new inbound message arrives, clear the regenerate banner
          // A new customer message invalidates any previous "regenerate" intent
          // (if user wanted to regenerate for the previous message, they would have done so)
          setShowRegenerateBanner(false);
        }
      }
    };

    // Subscribe to events
    socket.on("ai:typing_start", handleTypingStart);
    socket.on("ai:typing_stop", handleTypingStop);
    socket.on("ai:rate_limit_exceeded", handleRateLimitExceeded);
    socket.on("ai:pending_review", handlePendingReview);
    socket.on("message:new", handleNewMessage);

    // Cleanup
    return () => {
      socket.off("ai:typing_start", handleTypingStart);
      socket.off("ai:typing_stop", handleTypingStop);
      socket.off("ai:rate_limit_exceeded", handleRateLimitExceeded);
      socket.off("ai:pending_review", handlePendingReview);
      socket.off("message:new", handleNewMessage);
    };
  }, [socket, chatId]);

  // Auto-clear rate limit when reset time is reached
  useEffect(() => {
    if (!rateLimitInfo?.resetTime) return;

    const resetDate = new Date(rateLimitInfo.resetTime);
    const now = new Date();
    const timeToWait = resetDate.getTime() - now.getTime();

    // If time passed, clear immediately
    if (timeToWait <= 0) {
      setRateLimitInfo(null);
      return;
    }

    // Otherwise set timer
    const timer = setTimeout(() => {
      setRateLimitInfo(null);
    }, timeToWait);

    return () => clearTimeout(timer);
  }, [rateLimitInfo?.resetTime]);

  return {
    isAITyping,
    isAIProcessing,
    rateLimitInfo,
    pendingReview,
    showRegenerateBanner,
    clearRateLimitInfo,
    clearPendingReview,
    setAIProcessing: setIsAIProcessing,
    enableRegenerateBanner,
    hideRegenerateBanner,
  };
}
