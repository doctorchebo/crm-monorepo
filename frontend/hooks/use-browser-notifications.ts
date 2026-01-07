/**
 * useBrowserNotifications Hook
 *
 * Manages browser notification permissions and display.
 * Follows WhatsApp Web's pattern:
 * - Notifications are off by default
 * - When user enables notifications, browser permission is requested (once)
 * - After permission is granted, user can toggle notifications freely
 *
 * Features:
 * - Permission state management
 * - Request permission only when user enables notifications
 * - Show native browser notifications
 * - Notification click handling (focus chat)
 * - Works across browser tabs
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser notification permission states
 */
export type NotificationPermission = "default" | "granted" | "denied";

/**
 * Options for showing a notification
 */
export interface ShowNotificationOptions {
  /** Notification title */
  title: string;
  /** Notification body text */
  body?: string;
  /** Icon URL for the notification */
  icon?: string;
  /** Tag for replacing existing notifications */
  tag?: string;
  /** Data to pass to click handler */
  data?: {
    chatId?: string;
    messageId?: string;
    [key: string]: unknown;
  };
  /** Whether notification should auto-close */
  requireInteraction?: boolean;
}

/**
 * Hook return type
 */
export interface UseBrowserNotificationsReturn {
  /** Current browser permission state */
  permission: NotificationPermission;
  /** Whether notifications are supported */
  isSupported: boolean;
  /** Whether permission has been granted */
  isGranted: boolean;
  /** Whether permission was denied */
  isDenied: boolean;
  /** Whether we're waiting for user to respond to permission prompt */
  isPending: boolean;
  /** Request notification permission (should be called on user action) */
  requestPermission: () => Promise<NotificationPermission>;
  /** Show a browser notification */
  showNotification: (options: ShowNotificationOptions) => Notification | null;
  /** Check current permission state */
  checkPermission: () => NotificationPermission;
}

// Default notification icon (can be customized)
const DEFAULT_ICON = "/favicon.ico";

/**
 * Check if browser supports notifications
 */
function getNotificationSupport(): boolean {
  if (typeof window === "undefined") return false;
  return "Notification" in window;
}

/**
 * Get current notification permission
 */
function getCurrentPermission(): NotificationPermission {
  if (!getNotificationSupport()) return "denied";
  return Notification.permission as NotificationPermission;
}

/**
 * Hook to manage browser notifications
 */
export function useBrowserNotifications(): UseBrowserNotificationsReturn {
  // Initialize with "default" to avoid hydration mismatch (server vs client)
  // Actual permission is synced in useEffect after mount
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [isPending, setIsPending] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const isSupported = getNotificationSupport();
  const isGranted = permission === "granted";
  const isDenied = isMounted && permission === "denied"; // Only show denied state after mount

  // Track shown notifications for cleanup
  const notificationsRef = useRef<Map<string, Notification>>(new Map());

  /**
   * Check and update current permission state
   */
  const checkPermission = useCallback((): NotificationPermission => {
    const current = getCurrentPermission();
    setPermission(current);
    return current;
  }, []);

  // Sync permission state on mount
  useEffect(() => {
    setIsMounted(true);
    if (isSupported) {
      checkPermission();
    }
  }, [isSupported, checkPermission]);

  // Sync permission state when window gains focus
  useEffect(() => {
    if (!isSupported) return;

    // Re-check permission when window gains focus
    // (user may have changed browser settings)
    const handleFocus = () => {
      checkPermission();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [isSupported, checkPermission]);

  // Cleanup notifications on unmount
  useEffect(() => {
    return () => {
      notificationsRef.current.forEach((notification) => {
        notification.close();
      });
      notificationsRef.current.clear();
    };
  }, []);

  /**
   * Request permission from user
   * Should be called from a user interaction event (click, etc.)
   */
  const requestPermission =
    useCallback(async (): Promise<NotificationPermission> => {
      if (!isSupported) {
        console.warn(
          "[BrowserNotifications] Notifications not supported in this browser"
        );
        return "denied";
      }

      // Already granted or denied - return current state
      if (permission !== "default") {
        return permission;
      }

      setIsPending(true);

      try {
        const result = await Notification.requestPermission();
        const newPermission = result as NotificationPermission;
        setPermission(newPermission);

        console.log(
          `[BrowserNotifications] Permission ${
            newPermission === "granted" ? "✅ granted" : "❌ " + newPermission
          }`
        );

        return newPermission;
      } catch (error) {
        console.error(
          "[BrowserNotifications] Error requesting permission:",
          error
        );
        return "denied";
      } finally {
        setIsPending(false);
      }
    }, [isSupported, permission]);

  /**
   * Show a browser notification
   * Returns the Notification instance or null if not possible
   */
  const showNotification = useCallback(
    (options: ShowNotificationOptions): Notification | null => {
      if (!isSupported || !isGranted) {
        console.debug(
          "[BrowserNotifications] Cannot show notification - not supported or not granted"
        );
        return null;
      }

      try {
        const notification = new Notification(options.title, {
          body: options.body,
          icon: options.icon || DEFAULT_ICON,
          tag: options.tag,
          data: options.data,
          requireInteraction: options.requireInteraction ?? false,
        });

        // Track notification for cleanup
        const notificationId = options.tag || `notification-${Date.now()}`;
        notificationsRef.current.set(notificationId, notification);

        // Handle notification click
        notification.onclick = (event) => {
          event.preventDefault();

          // Focus the window
          window.focus();

          // If there's a chatId, navigate to it
          const data = options.data;
          if (data?.chatId) {
            // Navigate to the chat
            const chatUrl = `/dashboard/chats?selectedChatId=${data.chatId}`;
            if (window.location.pathname !== chatUrl) {
              window.location.href = chatUrl;
            }
          }

          // Close the notification
          notification.close();
        };

        // Clean up tracking when notification closes
        notification.onclose = () => {
          notificationsRef.current.delete(notificationId);
        };

        console.debug(
          `[BrowserNotifications] 🔔 Showing notification: ${options.title}`
        );

        return notification;
      } catch (error) {
        console.error(
          "[BrowserNotifications] Error showing notification:",
          error
        );
        return null;
      }
    },
    [isSupported, isGranted]
  );

  return {
    permission,
    isSupported,
    isGranted,
    isDenied,
    isPending,
    requestPermission,
    showNotification,
    checkPermission,
  };
}

/**
 * Hook to manage the notification permission flow when enabling notifications
 *
 * This hook encapsulates the logic:
 * - When user tries to enable notifications
 * - If permission not granted, request it
 * - Only enable if permission is granted
 */
export function useNotificationPermissionFlow() {
  const {
    permission,
    isGranted,
    isDenied,
    isSupported,
    isPending,
    requestPermission,
  } = useBrowserNotifications();

  /**
   * Handle enabling notifications
   * Returns true if notifications were enabled, false otherwise
   */
  const enableNotifications = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      console.warn(
        "[NotificationPermission] Browser does not support notifications"
      );
      return false;
    }

    // Already granted
    if (isGranted) {
      return true;
    }

    // Already denied - user needs to change browser settings
    if (isDenied) {
      console.warn(
        "[NotificationPermission] Permission previously denied. User must enable in browser settings."
      );
      return false;
    }

    // Request permission
    const result = await requestPermission();
    return result === "granted";
  }, [isSupported, isGranted, isDenied, requestPermission]);

  return {
    permission,
    isGranted,
    isDenied,
    isPending,
    isSupported,
    enableNotifications,
    requestPermission,
  };
}
