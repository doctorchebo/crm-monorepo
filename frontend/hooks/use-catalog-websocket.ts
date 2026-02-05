"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

/**
 * Catalog status update event from WebSocket
 */
export interface CatalogStatusUpdateEvent {
  itemId: string;
  itemName: string;
  retailerId?: string;
  metaProductId?: string;
  previousStatus: string;
  newStatus: string;
  statusMessage?: string;
  timestamp: string;
}

/**
 * Batch status update event
 */
export interface CatalogBatchStatusUpdateEvent {
  updates: CatalogStatusUpdateEvent[];
  count: number;
}

interface UseCatalogWebSocketOptions {
  /** Team ID to subscribe to */
  teamId: number | null;
  /** Called when a single item's status changes */
  onStatusUpdate?: (event: CatalogStatusUpdateEvent) => void;
  /** Called when batch updates arrive */
  onBatchStatusUpdate?: (event: CatalogBatchStatusUpdateEvent) => void;
  /** Enable/disable the connection */
  enabled?: boolean;
}

interface UseCatalogWebSocketReturn {
  /** Whether the socket is connected */
  isConnected: boolean;
  /** Last error if any */
  error: Error | null;
  /** Manually reconnect */
  reconnect: () => void;
  /** Disconnect manually */
  disconnect: () => void;
}

/**
 * Custom hook for catalog WebSocket connection
 *
 * Connects to the backend WebSocket server and subscribes to catalog status updates
 * for the specified team. This eliminates the need for polling by receiving push
 * notifications when Meta updates product status via webhook.
 *
 * Architecture:
 * - Connects to /catalog namespace on the backend
 * - Subscribes to team-specific room
 * - Receives status updates in real-time
 * - Automatically reconnects on disconnect
 *
 * @example
 * ```tsx
 * const { isConnected, error } = useCatalogWebSocket({
 *   teamId: currentTeam?.id,
 *   onStatusUpdate: (event) => {
 *     // Update local state with new status
 *     setItems(prev => prev.map(item =>
 *       item.id === event.itemId
 *         ? { ...item, status: event.newStatus }
 *         : item
 *     ));
 *     // Show notification
 *     toast(`${event.itemName} is now ${event.newStatus}`);
 *   },
 *   enabled: isDrawerOpen, // Only connect when drawer is open
 * });
 * ```
 */
export function useCatalogWebSocket({
  teamId,
  onStatusUpdate,
  onBatchStatusUpdate,
  enabled = true,
}: UseCatalogWebSocketOptions): UseCatalogWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  // Stable callback refs
  const onStatusUpdateRef = useRef(onStatusUpdate);
  const onBatchStatusUpdateRef = useRef(onBatchStatusUpdate);

  useEffect(() => {
    onStatusUpdateRef.current = onStatusUpdate;
    onBatchStatusUpdateRef.current = onBatchStatusUpdate;
  }, [onStatusUpdate, onBatchStatusUpdate]);

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    if (!enabled || !teamId) return;

    // Disconnect existing socket if any
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

    // Connect to catalog namespace
    const socket = io(`${backendUrl}/catalog`, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: reconnectDelay,
      timeout: 10000,
    });

    socketRef.current = socket;

    // Connection events
    socket.on("connect", () => {
      console.log("[CatalogWS] Connected to catalog WebSocket");
      setIsConnected(true);
      setError(null);
      reconnectAttemptRef.current = 0;

      // Subscribe to team updates
      socket.emit("subscribe:team", teamId);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[CatalogWS] Disconnected: ${reason}`);
      setIsConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.error("[CatalogWS] Connection error:", err);
      setError(err);
      setIsConnected(false);
      reconnectAttemptRef.current++;
    });

    // Catalog status events
    socket.on("catalog:status-update", (event: CatalogStatusUpdateEvent) => {
      console.log("[CatalogWS] Status update received:", event);
      onStatusUpdateRef.current?.(event);
    });

    socket.on(
      "catalog:batch-status-update",
      (event: CatalogBatchStatusUpdateEvent) => {
        console.log("[CatalogWS] Batch status update received:", event);
        onBatchStatusUpdateRef.current?.(event);
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, teamId]);

  /**
   * Reconnect manually
   */
  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    connect();
  }, [connect]);

  /**
   * Disconnect manually
   */
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      // Unsubscribe from team before disconnecting
      if (teamId) {
        socketRef.current.emit("unsubscribe:team", teamId);
      }
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, [teamId]);

  // Connect on mount and when dependencies change
  useEffect(() => {
    const cleanup = connect();
    return () => cleanup?.();
  }, [connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  return {
    isConnected,
    error,
    reconnect,
    disconnect,
  };
}
