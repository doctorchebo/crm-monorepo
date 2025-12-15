"use client";

/**
 * Hook for listening to thumbnail ready WebSocket events
 * Updates attachments in real-time when thumbnails are generated
 */

import { ThumbnailReadyEvent } from "@/lib/media/types";
import { useCallback, useEffect } from "react";
import { useRealtimeChat } from "./use-message-status-socket";

interface UseThumbnailUpdatesOptions {
  /** Callback when a thumbnail becomes ready */
  onThumbnailReady?: (event: ThumbnailReadyEvent) => void;
  /** Callback for batch thumbnail updates */
  onThumbnailsBatch?: (events: ThumbnailReadyEvent[]) => void;
}

/**
 * Subscribe to thumbnail ready events via WebSocket
 *
 * @example
 * ```tsx
 * useThumbnailUpdates({
 *   onThumbnailReady: (event) => {
 *     // Update local state with new thumbnail data
 *     updateMessageAttachment(event.messageId, event.attachmentId, {
 *       thumbnailKey: event.thumbnailKey,
 *       thumbnailStatus: 'ready',
 *       width: event.width,
 *       height: event.height,
 *       blurhash: event.blurhash,
 *     });
 *   },
 * });
 * ```
 */
export function useThumbnailUpdates(options: UseThumbnailUpdatesOptions = {}) {
  const { onThumbnailReady, onThumbnailsBatch } = options;
  const { socket, isConnected } = useRealtimeChat();

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Listen for single thumbnail ready events
    const handleThumbnailReady = (event: ThumbnailReadyEvent) => {
      console.log("📷 Thumbnail ready:", event.messageId, event.attachmentId);
      onThumbnailReady?.(event);
    };

    // Listen for batch thumbnail events
    const handleThumbnailsBatch = (events: ThumbnailReadyEvent[]) => {
      console.log("📷 Thumbnails batch ready:", events.length);
      onThumbnailsBatch?.(events);

      // Also call individual handler for each
      if (onThumbnailReady) {
        events.forEach(onThumbnailReady);
      }
    };

    socket.on("thumbnail:ready", handleThumbnailReady);
    socket.on("thumbnails:batch", handleThumbnailsBatch);

    return () => {
      socket.off("thumbnail:ready", handleThumbnailReady);
      socket.off("thumbnails:batch", handleThumbnailsBatch);
    };
  }, [socket, isConnected, onThumbnailReady, onThumbnailsBatch]);

  return { isConnected };
}

/**
 * Create a thumbnail update handler for message state management
 *
 * @example
 * ```tsx
 * const { messages, setMessages } = useMessages();
 * const updateHandler = createThumbnailUpdateHandler(setMessages);
 * useThumbnailUpdates({ onThumbnailReady: updateHandler });
 * ```
 */
export function createThumbnailUpdateHandler(
  setMessages: React.Dispatch<React.SetStateAction<any[]>>
) {
  return useCallback(
    (event: ThumbnailReadyEvent) => {
      setMessages((prevMessages) =>
        prevMessages.map((message) => {
          if (message.messageId !== event.messageId) {
            return message;
          }

          // Update the specific attachment
          const updatedAttachments = (message.attachments || []).map(
            (attachment: any) => {
              if (attachment.id !== event.attachmentId) {
                return attachment;
              }

              return {
                ...attachment,
                thumbnailKey: event.thumbnailKey,
                thumbnailStatus: "ready",
                width: event.width,
                height: event.height,
                blurhash: event.blurhash,
              };
            }
          );

          return {
            ...message,
            attachments: updatedAttachments,
          };
        })
      );
    },
    [setMessages]
  );
}
