/**
 * useRealtimeChat Hook
 *
 * Connects to the backend WebSocket server to receive real-time updates:
 * - Message status updates (sent, delivered, read, failed)
 * - Inbound messages from contacts
 *
 * This hook:
 * - Establishes WebSocket connection on mount
 * - Listens for message:status, message:statuses, message:new, message:batch events
 * - Updates React state when updates arrive
 * - Automatically reconnects if connection drops
 * - Cleans up on unmount
 *
 * Usage:
 * const { statusMap, messages, isConnected } = useRealtimeChat(chatId);
 * statusMap[messageId] // → { status: 'read', timestamp: '2024-12-12T...Z' }
 * messages // → [{ messageId, chatId, sender, text, timestamp, ... }]
 *
 * This eliminates the need for polling and provides instant updates.
 */

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

interface MessageStatusUpdate {
  messageId: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  timestamp: string;
}

interface StatusMapEntry {
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  updatedAt: string;
}

export interface InboundMessage {
  messageId: string;
  chatId: string;
  sender: string;
  text: string;
  type: string;
  timestamp: string;
  direction?: "inbound" | "outbound"; // Direction of the message (defaults to inbound for legacy compatibility)
  status?: string;
  attachments?: Array<{
    id: string;
    type: string;
    mediaId: string; // For backwards compatibility (same as id)
    fileName?: string;
    mimeType?: string;
    size?: number;
    s3Key?: string;
    thumbnailKey?: string;
    thumbnailStatus?:
      | "pending"
      | "processing"
      | "ready"
      | "failed"
      | "not-applicable";
    width?: number;
    height?: number;
    blurhash?: string;
    duration?: number;
    status?: string;
    isVoiceNote?: boolean;
    isAnimated?: boolean;
  }>;
  replyToMessageId?: string;
  replyPreview?: {
    messageId: string;
    senderType: "customer" | "agent";
    senderName: string;
    type: "text" | "image" | "video" | "audio" | "document" | "contacts";
    text?: string;
    media?: {
      url?: string;
      mimeType: string;
      thumbnailUrl?: string;
      fileName?: string;
    };
    unavailable?: boolean;
  };
}

/**
 * Hook to connect to WebSocket and listen for real-time message and status updates
 *
 * @param chatId - The chat ID to filter messages (only messages matching this chatId will be added to state)
 * @returns Object with:
 *   - statusMap: Record<messageId, StatusMapEntry>
 *   - messages: InboundMessage[]
 *   - isConnected: Whether WebSocket is connected
 *   - connectionStatus: 'idle' | 'connecting' | 'connected' | 'disconnected'
 */
export function useRealtimeChat(chatId?: string) {
  const socketRef = useRef<Socket | null>(null);
  const chatIdRef = useRef<string | undefined>(chatId);
  const [statusMap, setStatusMap] = useState<Record<string, StatusMapEntry>>(
    {}
  );
  const [messages, setMessages] = useState<InboundMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "connected" | "disconnected"
  >("idle");

  // Keep chatIdRef in sync with chatId prop
  useEffect(() => {
    chatIdRef.current = chatId;
    // Clear messages when chat changes to avoid showing old messages in new chat
    setMessages([]);
  }, [chatId]);

  useEffect(() => {
    // Connect to WebSocket server
    setConnectionStatus("connecting");

    const socket = io(
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
      {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      }
    );

    socketRef.current = socket;

    // Connection established
    socket.on("connect", () => {
      setIsConnected(true);
      setConnectionStatus("connected");
    });

    // Listen for single status update
    socket.on("message:status", (update: MessageStatusUpdate) => {
      setStatusMap((prev) => ({
        ...prev,
        [update.messageId]: {
          status: update.status,
          timestamp: update.timestamp,
          updatedAt: new Date().toISOString(),
        },
      }));
    });

    // Listen for batch status updates
    socket.on("message:statuses", (updates: MessageStatusUpdate[]) => {
      setStatusMap((prev) => {
        const updated = { ...prev };
        for (const update of updates) {
          updated[update.messageId] = {
            status: update.status,
            timestamp: update.timestamp,
            updatedAt: new Date().toISOString(),
          };
        }
        return updated;
      });
    });

    // Listen for new inbound message
    socket.on("message:new", (message: InboundMessage) => {
      // Only add message if it matches the currently selected chat
      // This prevents messages from appearing in the wrong chat
      const currentChatId = chatIdRef.current;

      // If no chat is selected, don't add any messages
      if (!currentChatId) {
        return;
      }

      if (message.chatId !== currentChatId) {
        return;
      }

      setMessages((prev) => {
        // Check if message already exists (avoid duplicates)
        const exists = prev.some((m) => m.messageId === message.messageId);
        if (exists) {
          return prev;
        }
        return [...prev, message];
      });
    });

    // Listen for batch new messages
    socket.on("message:batch", (messageList: InboundMessage[]) => {
      const currentChatId = chatIdRef.current;

      // If no chat is selected, don't add any messages
      if (!currentChatId) {
        return;
      }

      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.messageId));
        // Filter for messages that belong to the current chat and don't already exist
        const newMessages = messageList.filter(
          (m) => !existingIds.has(m.messageId) && m.chatId === currentChatId
        );
        return [...prev, ...newMessages];
      });
    });

    // Listen for attachment updated (s3Key populated after upload)
    socket.on(
      "attachment:updated",
      (update: {
        messageId: string;
        chatId: string;
        attachmentId: string;
        s3Key: string;
        thumbnailKey?: string;
        thumbnailStatus?: string;
        width?: number;
        height?: number;
        blurhash?: string;
      }) => {
        const currentChatId = chatIdRef.current;

        // Only update if it's for the current chat
        if (!currentChatId || update.chatId !== currentChatId) {
          return;
        }

        // Update the message's attachment with the new s3Key
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.messageId !== update.messageId) return msg;

            // Update the attachment's s3Key
            const updatedAttachments = msg.attachments?.map((att: any) => {
              if (att.id === update.attachmentId) {
                // CRITICAL: Ignore stale staging s3Key updates
                // If the update's s3Key is a staging path but the attachment
                // has already been promoted (s3Key doesn't start with "staging/"),
                // this is a late-arriving event from before promotion - ignore it.
                const updateIsStaging = update.s3Key?.startsWith("staging/");
                const attachmentIsPromoted =
                  att.s3Key && !att.s3Key.startsWith("staging/");

                if (updateIsStaging && attachmentIsPromoted) {
                  console.log(
                    `[attachment:updated] Ignoring stale staging s3Key for promoted attachment ${att.id}:`,
                    `update s3Key=${update.s3Key}, current s3Key=${att.s3Key}`
                  );
                  return att; // Don't apply stale staging path
                }

                return {
                  ...att,
                  s3Key: update.s3Key,
                  // Include thumbnail fields if provided
                  thumbnailKey: update.thumbnailKey || att.thumbnailKey,
                  thumbnailStatus:
                    update.thumbnailStatus || att.thumbnailStatus,
                  width: update.width || att.width,
                  height: update.height || att.height,
                  blurhash: update.blurhash || att.blurhash,
                };
              }
              return att;
            });

            return {
              ...msg,
              attachments: updatedAttachments,
            };
          })
        );
      }
    );

    // Listen for attachment status updates (when individual attachments are sent in multi-media messages)
    socket.on(
      "attachment:status",
      (event: {
        messageId: string;
        attachmentId: string;
        status: string;
        waMessageId?: string;
        timestamp?: string;
      }) => {
        // Update the message's attachment status
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.messageId !== event.messageId) return msg;

            // Update the specific attachment's status
            const updatedAttachments = msg.attachments?.map((att: any) => {
              if (att.id === event.attachmentId) {
                return {
                  ...att,
                  status: event.status,
                  waMessageId: event.waMessageId || att.waMessageId,
                };
              }
              return att;
            });

            return {
              ...msg,
              attachments: updatedAttachments,
            };
          })
        );
      }
    );

    // NOTE: thumbnail:ready events are handled by useThumbnailUpdates hook
    // which has proper stale staging path detection. Do NOT add a handler here
    // to avoid duplicate updates that could overwrite correct data with stale data.
    // Connection errors
    socket.on("error", (error: any) => {
      console.error("[RealtimeChat] ❌ WebSocket error:", error);
    });

    // Disconnected
    socket.on("disconnect", () => {
      setIsConnected(false);
      setConnectionStatus("disconnected");
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return {
    statusMap,
    messages,
    isConnected,
    connectionStatus,
    socket: socketRef.current,
  };
}

// Backward compatibility export
export function useMessageStatusSocket(chatId?: string) {
  const { statusMap, isConnected, connectionStatus, socket } =
    useRealtimeChat(chatId);
  return { statusMap, isConnected, connectionStatus, socket };
}
