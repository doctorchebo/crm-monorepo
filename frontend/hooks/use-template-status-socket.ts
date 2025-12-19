"use client";

import { useCallback, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

/**
 * Template status update event from WebSocket
 */
export interface TemplateStatusUpdate {
  templateId: string;
  templateName: string;
  language: string;
  status: string;
  reason?: string;
  timestamp: string;
  localeId?: string;
}

/**
 * Template quality update event from WebSocket
 */
export interface TemplateQualityUpdate {
  templateId: string;
  templateName: string;
  qualityRating: "high" | "medium" | "low";
  timestamp: string;
}

/**
 * Options for the template status WebSocket hook
 */
export interface UseTemplateStatusSocketOptions {
  /** Callback when a single status update is received */
  onStatusUpdate?: (update: TemplateStatusUpdate) => void;
  /** Callback when multiple status updates are received */
  onStatusUpdates?: (updates: TemplateStatusUpdate[]) => void;
  /** Callback when a quality update is received */
  onQualityUpdate?: (update: TemplateQualityUpdate) => void;
  /** Callback when connected to the server */
  onConnect?: () => void;
  /** Callback when disconnected from the server */
  onDisconnect?: () => void;
  /** Callback on connection error */
  onError?: (error: Error) => void;
  /** Whether the socket should be enabled (default: true) */
  enabled?: boolean;
}

/**
 * Hook return type
 */
export interface UseTemplateStatusSocketReturn {
  /** Whether the socket is currently connected */
  isConnected: boolean;
  /** Manually reconnect the socket */
  reconnect: () => void;
  /** Manually disconnect the socket */
  disconnect: () => void;
}

/**
 * Hook to listen for real-time template status updates via WebSocket
 *
 * Connects to the /templates namespace on the backend WebSocket server
 * and receives notifications when template approval status changes.
 *
 * @example
 * ```tsx
 * const { isConnected } = useTemplateStatusSocket({
 *   onStatusUpdate: (update) => {
 *     console.log('Template status changed:', update);
 *     toast.info(`Template "${update.templateName}" is now ${update.status}`);
 *     // Refresh data, update UI, etc.
 *   },
 * });
 * ```
 */
export function useTemplateStatusSocket(
  options: UseTemplateStatusSocketOptions = {}
): UseTemplateStatusSocketReturn {
  const {
    onStatusUpdate,
    onStatusUpdates,
    onQualityUpdate,
    onConnect,
    onDisconnect,
    onError,
    enabled = true,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);

  // Store callbacks in refs to avoid reconnecting on callback changes
  const callbacksRef = useRef({
    onStatusUpdate,
    onStatusUpdates,
    onQualityUpdate,
    onConnect,
    onDisconnect,
    onError,
  });

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = {
      onStatusUpdate,
      onStatusUpdates,
      onQualityUpdate,
      onConnect,
      onDisconnect,
      onError,
    };
  }, [
    onStatusUpdate,
    onStatusUpdates,
    onQualityUpdate,
    onConnect,
    onDisconnect,
    onError,
  ]);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    // Get backend URL from environment or default
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

    // Connect to the /templates namespace
    const socket = io(`${backendUrl}/templates`, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on("connect", () => {
      console.log("📱 Template WebSocket connected:", socket.id);
      isConnectedRef.current = true;
      callbacksRef.current.onConnect?.();
    });

    socket.on("disconnect", (reason) => {
      console.log("📴 Template WebSocket disconnected:", reason);
      isConnectedRef.current = false;
      callbacksRef.current.onDisconnect?.();
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Template WebSocket error:", error);
      callbacksRef.current.onError?.(error);
    });

    // Listen for single status updates
    socket.on("template:status", (update: TemplateStatusUpdate) => {
      console.log("📡 Template status update received:", update);
      callbacksRef.current.onStatusUpdate?.(update);
    });

    // Listen for batch status updates
    socket.on("template:statuses", (updates: TemplateStatusUpdate[]) => {
      console.log(`📡 Received ${updates.length} template status updates`);
      callbacksRef.current.onStatusUpdates?.(updates);
    });

    // Listen for quality updates
    socket.on("template:quality", (update: TemplateQualityUpdate) => {
      console.log("📡 Template quality update received:", update);
      callbacksRef.current.onQualityUpdate?.(update);
    });

    socketRef.current = socket;
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      isConnectedRef.current = false;
    }
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [connect, disconnect]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    isConnected: isConnectedRef.current,
    reconnect,
    disconnect,
  };
}

/**
 * Utility type for status that can be used in UI components
 */
export type TemplateApprovalStatusValue =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled"
  | "appeal_requested";

/**
 * Map Meta webhook status to our internal status
 */
export function mapWebhookStatusToInternal(
  webhookStatus: string
): TemplateApprovalStatusValue {
  const statusMap: Record<string, TemplateApprovalStatusValue> = {
    APPROVED: "approved",
    REJECTED: "rejected",
    PENDING: "pending",
    PAUSED: "paused",
    FLAGGED: "paused",
    DISABLED: "disabled",
    IN_APPEAL: "appeal_requested",
    REINSTATED: "approved",
    PENDING_DELETION: "disabled",
  };

  return statusMap[webhookStatus] || "draft";
}
