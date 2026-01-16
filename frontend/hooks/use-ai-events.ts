/**
 * useAIEvents Hook
 *
 * Listens for AI-related WebSocket events:
 * - ai:typing_start - AI started generating a response
 * - ai:typing_stop - AI finished generating a response
 * - ai:rate_limit_exceeded - Rate limit was hit for a chat
 * - ai:pending_review - AI generated response awaiting user review
 *
 * Usage:
 * const { isAITyping, rateLimitInfo, pendingReview } = useAIEvents(chatId, socket);
 */

import { useEffect, useState, useCallback } from "react";
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
  clearRateLimitInfo: () => void;
  clearPendingReview: () => void;
  setAIProcessing: (processing: boolean) => void;
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

  // Clear rate limit info
  const clearRateLimitInfo = useCallback(() => {
    setRateLimitInfo(null);
  }, []);

  // Clear pending review
  const clearPendingReview = useCallback(() => {
    setPendingReview(null);
  }, []);

  // Reset state when chat changes
  useEffect(() => {
    setIsAITyping(false);
    setIsAIProcessing(false);
    setRateLimitInfo(null);
    setPendingReview(null);
  }, [chatId]);

  useEffect(() => {
    if (!socket || !chatId) return;

    // AI typing start
    const handleTypingStart = (data: { chatId: string; timestamp: string }) => {
      if (data.chatId === chatId) {
        setIsAITyping(true);
        setIsAIProcessing(false); // Clear processing state when typing starts
      }
    };

    // AI typing stop
    const handleTypingStop = (data: { chatId: string; timestamp: string }) => {
      if (data.chatId === chatId) {
        setIsAITyping(false);
        setIsAIProcessing(false); // Clear processing state
      }
    };

    // Rate limit exceeded
    const handleRateLimitExceeded = (data: RateLimitInfo) => {
      if (data.chatId === chatId) {
        setRateLimitInfo(data);
      }
    };

    // Pending review (for review-before-send mode)
    const handlePendingReview = (data: PendingReviewInfo) => {
      if (data.chatId === chatId) {
        setPendingReview(data);
        setIsAITyping(false); // Stop typing indicator when review is ready
      }
    };

    // Subscribe to events
    socket.on("ai:typing_start", handleTypingStart);
    socket.on("ai:typing_stop", handleTypingStop);
    socket.on("ai:rate_limit_exceeded", handleRateLimitExceeded);
    socket.on("ai:pending_review", handlePendingReview);

    // Cleanup
    return () => {
      socket.off("ai:typing_start", handleTypingStart);
      socket.off("ai:typing_stop", handleTypingStop);
      socket.off("ai:rate_limit_exceeded", handleRateLimitExceeded);
      socket.off("ai:pending_review", handlePendingReview);
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
    clearRateLimitInfo,
    clearPendingReview,
    setAIProcessing: setIsAIProcessing,
  };
}
