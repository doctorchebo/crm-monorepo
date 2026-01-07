"use client";

/**
 * Hook to build previewable media items from a messages array
 *
 * This extracts all visual media (images and videos) from the current
 * batch of messages and organizes them for the media preview modal.
 */

import type { PreviewableMediaItem } from "@/components/media/media-preview-context";
import { Attachment } from "@/lib/media/types";
import { useMemo } from "react";

interface Message {
  messageId: string;
  attachments?: Attachment[];
}

/**
 * Extract all visual media from messages in chronological order
 *
 * @param messages Array of messages with attachments
 * @returns Array of previewable media items
 */
export function usePreviewableMedia(
  messages: Message[]
): PreviewableMediaItem[] {
  return useMemo(() => {
    const items: PreviewableMediaItem[] = [];

    for (const message of messages) {
      if (!message.attachments) continue;

      message.attachments.forEach((attachment, index) => {
        // Only include visual media (images and videos)
        if (attachment.type === "image" || attachment.type === "video") {
          items.push({
            attachment,
            messageId: message.messageId,
            attachmentIndex: index,
          });
        }
      });
    }

    return items;
  }, [messages]);
}

/**
 * Find the index of a specific media item in the previewable items array
 *
 * @param items Array of previewable media items
 * @param messageId Message ID to find
 * @param attachmentIndex Index of attachment within the message
 * @returns Index in the items array, or 0 if not found
 */
export function findMediaItemIndex(
  items: PreviewableMediaItem[],
  messageId: string,
  attachmentIndex: number
): number {
  const index = items.findIndex(
    (item) =>
      item.messageId === messageId && item.attachmentIndex === attachmentIndex
  );
  return index >= 0 ? index : 0;
}

/**
 * Find the index of a media item by attachment ID
 *
 * @param items Array of previewable media items
 * @param messageId Message ID to find
 * @param attachmentId Attachment ID to find
 * @returns Index in the items array, or 0 if not found
 */
export function findMediaItemIndexByAttachmentId(
  items: PreviewableMediaItem[],
  messageId: string,
  attachmentId: string
): number {
  const index = items.findIndex(
    (item) =>
      item.messageId === messageId && item.attachment.id === attachmentId
  );
  return index >= 0 ? index : 0;
}
