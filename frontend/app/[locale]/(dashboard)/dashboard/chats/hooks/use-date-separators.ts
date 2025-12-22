"use client";

import { getDateKey, isSameDay, parseDate } from "@/lib/utils/date-formatter";
import { useMemo } from "react";

// ============================================================
// TYPES
// ============================================================

/**
 * Base message type with required timestamp.
 * Extends whatever message type is used in the application.
 */
export interface MessageWithTimestamp {
  timestamp: string | Date;
  [key: string]: unknown;
}

/**
 * A render item that can be either a message or a date separator.
 */
export type MessageListItem<T extends MessageWithTimestamp> =
  | { type: "message"; data: T; key: string }
  | { type: "date-separator"; date: Date; dateKey: string; key: string };

/**
 * Options for the hook.
 */
export interface UseDateSeparatorsOptions {
  /**
   * Key extractor function for messages.
   * Should return a unique identifier for each message.
   */
  getMessageKey?: (message: MessageWithTimestamp) => string;
}

// ============================================================
// DEFAULT KEY EXTRACTOR
// ============================================================

/**
 * Default key extractor tries common message ID fields.
 */
function defaultGetMessageKey(message: MessageWithTimestamp): string {
  // Try common ID fields
  if (typeof message.messageId === "string") return message.messageId;
  if (typeof message.id === "string") return message.id;
  if (typeof message.id === "number") return String(message.id);

  // Fallback to timestamp + random
  return `msg-${message.timestamp}-${Math.random().toString(36).slice(2)}`;
}

// ============================================================
// HOOK
// ============================================================

/**
 * Hook to insert date separators between messages from different days.
 *
 * This hook takes a list of messages and returns a list of items that
 * includes both messages and date separators. The separators are inserted
 * whenever the date changes between consecutive messages.
 *
 * Messages are assumed to be sorted by timestamp (oldest first).
 *
 * @param messages - Array of messages with timestamps
 * @param options - Hook options
 * @returns Array of message list items (messages and date separators)
 *
 * @example
 * ```tsx
 * const items = useDateSeparators(messages);
 *
 * return items.map(item => {
 *   if (item.type === 'date-separator') {
 *     return <DateSeparator key={item.key} date={item.date} />;
 *   }
 *   return <MessageBubble key={item.key} message={item.data} />;
 * });
 * ```
 */
export function useDateSeparators<T extends MessageWithTimestamp>(
  messages: T[],
  options: UseDateSeparatorsOptions = {}
): MessageListItem<T>[] {
  const { getMessageKey = defaultGetMessageKey } = options;

  return useMemo(() => {
    if (messages.length === 0) {
      return [];
    }

    const items: MessageListItem<T>[] = [];
    let lastDateKey: string | null = null;

    for (const message of messages) {
      const messageDate = parseDate(message.timestamp);
      const dateKey = getDateKey(messageDate);

      // Insert date separator if day changed
      if (dateKey !== lastDateKey) {
        items.push({
          type: "date-separator",
          date: messageDate,
          dateKey,
          key: `date-sep-${dateKey}`,
        });
        lastDateKey = dateKey;
      }

      // Add the message
      items.push({
        type: "message",
        data: message,
        key: getMessageKey(message),
      });
    }

    return items;
  }, [messages, getMessageKey]);
}

/**
 * Simple utility to check if a date separator should be shown
 * between two messages (for manual integration without the hook).
 *
 * @param prevTimestamp - Timestamp of previous message
 * @param currTimestamp - Timestamp of current message
 * @returns true if a date separator should be shown
 */
export function shouldShowDateSeparator(
  prevTimestamp: string | Date | null | undefined,
  currTimestamp: string | Date
): boolean {
  if (!prevTimestamp) {
    // First message - always show separator
    return true;
  }

  const prevDate = parseDate(prevTimestamp);
  const currDate = parseDate(currTimestamp);

  return !isSameDay(prevDate, currDate);
}

export default useDateSeparators;
