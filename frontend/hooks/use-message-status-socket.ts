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
  attachments?: Array<{
    type: string;
    mediaId: string;
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
 * @param chatId - The chat ID (optional, for logging)
 * @returns Object with:
 *   - statusMap: Record<messageId, StatusMapEntry>
 *   - messages: InboundMessage[]
 *   - isConnected: Whether WebSocket is connected
 *   - connectionStatus: 'idle' | 'connecting' | 'connected' | 'disconnected'
 */
export function useRealtimeChat(chatId?: string) {
  const socketRef = useRef<Socket | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, StatusMapEntry>>(
    {}
  );
  const [messages, setMessages] = useState<InboundMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "connected" | "disconnected"
  >("idle");

  useEffect(() => {
    // Connect to WebSocket server
    setConnectionStatus("connecting");
    console.log("[RealtimeChat] Connecting to WebSocket server...");

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
      console.log("[RealtimeChat] ✅ Connected to WebSocket server");
    });

    // Listen for single status update
    socket.on("message:status", (update: MessageStatusUpdate) => {
      console.log(
        `[RealtimeChat] 📡 Received status: ${update.messageId} → ${update.status}`
      );

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
      console.log(
        `[RealtimeChat] 📡 Received ${updates.length} status updates`
      );

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
      console.log(
        `[RealtimeChat] 📨 Received new message: ${message.messageId} from ${message.sender}`
      );

      // Only add message if it matches current chat, or if no specific chat is being monitored
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
      console.log(
        `[RealtimeChat] 📨 Received ${messageList.length} new messages`
      );

      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.messageId));
        const newMessages = messageList.filter(
          (m) => !existingIds.has(m.messageId)
        );
        return [...prev, ...newMessages];
      });
    });

    // Connection errors
    socket.on("error", (error: any) => {
      console.error("[RealtimeChat] ❌ WebSocket error:", error);
    });

    // Disconnected
    socket.on("disconnect", () => {
      setIsConnected(false);
      setConnectionStatus("disconnected");
      console.log("[RealtimeChat] ❌ Disconnected from WebSocket server");
    });

    // Cleanup on unmount
    return () => {
      console.log("[RealtimeChat] Cleaning up WebSocket connection");
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
