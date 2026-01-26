/**
 * useNotesSocket Hook
 *
 * Manages WebSocket connection for real-time notes updates.
 * Connects to the /notes namespace and subscribes to specific chats.
 *
 * Features:
 * - Connects to notes WebSocket namespace
 * - Subscribes to specific chat notes
 * - Receives real-time note created/deleted events
 * - Automatically reconnects on disconnect
 * - Handles multiple chats/subscriptions
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useUser } from "./use-user";

// Note interface matching backend response
export interface Note {
  id: number;
  messageId?: string;
  chatId?: string;
  userId: number;
  note: string;
  createdAt: Date | string;
  user?: {
    id: number;
    name: string;
    email: string;
  };
}

// Event payloads from WebSocket
export interface NoteCreatedEvent {
  type: "note:created";
  chatId: string;
  note: Note;
  timestamp: Date | string;
}

export interface NoteDeletedEvent {
  type: "note:deleted";
  chatId: string;
  noteId: number;
  timestamp: Date | string;
}

interface UseNotesSocketOptions {
  /** Whether to enable the socket connection */
  enabled?: boolean;
}

interface UseNotesSocketReturn {
  /** Whether connected to the notes WebSocket */
  isConnected: boolean;
  /** Subscribe to a specific chat's notes */
  subscribeToChat: (chatId: string) => void;
  /** Unsubscribe from a specific chat's notes */
  unsubscribeFromChat: (chatId: string) => void;
  /** Register callback for note created events */
  onNoteCreated: (callback: (event: NoteCreatedEvent) => void) => () => void;
  /** Register callback for note deleted events */
  onNoteDeleted: (callback: (event: NoteDeletedEvent) => void) => () => void;
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export function useNotesSocket(
  options: UseNotesSocketOptions = {},
): UseNotesSocketReturn {
  const { enabled = true } = options;
  const { user } = useUser();

  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const subscribedChatsRef = useRef<Set<string>>(new Set());

  // Callback registries
  const noteCreatedCallbacksRef = useRef<
    Set<(event: NoteCreatedEvent) => void>
  >(new Set());
  const noteDeletedCallbacksRef = useRef<
    Set<(event: NoteDeletedEvent) => void>
  >(new Set());

  // Initialize socket connection
  useEffect(() => {
    if (!enabled || !user?.id) {
      return;
    }

    const socket = io(`${BACKEND_URL}/notes`, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[NotesSocket] Connected to notes namespace");
      setIsConnected(true);

      // Register user with socket
      socket.emit("register", { userId: user.id });

      // Re-subscribe to previously subscribed chats
      subscribedChatsRef.current.forEach((chatId) => {
        socket.emit("subscribe:chat", { chatId, userId: user.id });
      });
    });

    socket.on("disconnect", () => {
      console.log("[NotesSocket] Disconnected from notes namespace");
      setIsConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error("[NotesSocket] Connection error:", error);
    });

    // Listen for note created events (room-based)
    socket.on("note:created", (event: NoteCreatedEvent) => {
      console.log("[NotesSocket] Note created:", event);
      noteCreatedCallbacksRef.current.forEach((callback) => callback(event));
    });

    // Listen for note deleted events (room-based)
    socket.on("note:deleted", (event: NoteDeletedEvent) => {
      console.log("[NotesSocket] Note deleted:", event);
      noteDeletedCallbacksRef.current.forEach((callback) => callback(event));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [enabled, user?.id]);

  // Subscribe to a chat's notes
  const subscribeToChat = useCallback(
    (chatId: string) => {
      if (!user?.id) return;

      subscribedChatsRef.current.add(chatId);

      if (socketRef.current?.connected) {
        socketRef.current.emit("subscribe:chat", { chatId, userId: user.id });
        console.log("[NotesSocket] Subscribed to chat:", chatId);
      }
    },
    [user?.id],
  );

  // Unsubscribe from a chat's notes
  const unsubscribeFromChat = useCallback((chatId: string) => {
    subscribedChatsRef.current.delete(chatId);

    if (socketRef.current?.connected) {
      socketRef.current.emit("unsubscribe:chat", { chatId });
      console.log("[NotesSocket] Unsubscribed from chat:", chatId);
    }
  }, []);

  // Register callback for note created events
  const onNoteCreated = useCallback(
    (callback: (event: NoteCreatedEvent) => void) => {
      noteCreatedCallbacksRef.current.add(callback);
      return () => {
        noteCreatedCallbacksRef.current.delete(callback);
      };
    },
    [],
  );

  // Register callback for note deleted events
  const onNoteDeleted = useCallback(
    (callback: (event: NoteDeletedEvent) => void) => {
      noteDeletedCallbacksRef.current.add(callback);
      return () => {
        noteDeletedCallbacksRef.current.delete(callback);
      };
    },
    [],
  );

  return {
    isConnected,
    subscribeToChat,
    unsubscribeFromChat,
    onNoteCreated,
    onNoteDeleted,
  };
}
