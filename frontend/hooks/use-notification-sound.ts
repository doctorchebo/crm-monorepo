/**
 * useNotificationSound Hook
 *
 * Plays a notification sound when new messages arrive.
 * Works globally across all pages, not just the chats page.
 *
 * Features:
 * - Plays WhatsApp-like notification sound
 * - Respects browser audio permissions
 * - Prevents rapid repeated sounds (debouncing)
 * - Works in background tabs
 */

import { useCallback, useEffect, useRef } from "react";

// Path to the notification sound file in public folder
// You can add a custom notification.mp3 file to /public/sounds/
const NOTIFICATION_SOUND_URL = "/sounds/notification.mp3";

// Fallback: Simple beep sound as base64 WAV (used if mp3 doesn't exist)
const FALLBACK_SOUND_URL =
  "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsphyTD5Wo8C4vZF4aF1spdXg0aJ/Y1Rch67GvqCBZltnlcfb15+LfXF+ipWgo5uLemtnbXZ6fYCCgYF+e3l4d3Z1dnV0dHR1dXV2d3h5ent8fX5/gICAgIB/f35+fX18fHt6eXl4eHd3d3Z2dnZ2dnd3d3h4eXl6enp7e3x8fH19fX5+fn9/f39/f39/f4CAgICAgICAgICAgH9/f39/f39+fn5+fn59fX19fHx8fHx8e3t7e3t7e3t7e3t7e3t7fHx8fHx8fX19fX1+fn5+fn9/f3+AgICAgICAgIGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYCAgICAgH9/f35+fn19fHx8e3t6enp5eXl5eHh4eHh4eHh4eHl5eXl6enp7e3t8fHx9fX1+fn5/f3+AgICAgYGBgYGBgYGBgYGBgYCAgICAgH9/f39/fn5+fX19fX18fHx8fHx7e3t7e3t7e3t7e3x8fHx8fH19fX19fn5+fn5/f39/f4CAgICAgICAgICAgYGBgYGBgYGBgYGBgYGBgYGBgICAgIB/f39/f35+fn5+fX19fX19fHx8fHx8fHx8fHx8fHx8fHx9fX19fX5+fn5+fn9/f39/gICAgICAgICAgIGBgYGBgYGBgYGBgYGBgYCAgICAgH9/f39/f35+fn5+fn19fX19fX19fX19fX19fX19fX5+fn5+fn5/f39/f39/gICAgICAgICA";

// Debounce time in ms to prevent rapid repeated sounds
const DEBOUNCE_TIME = 1000;

export interface UseNotificationSoundOptions {
  enabled?: boolean;
  volume?: number;
}

export function useNotificationSound(
  options: UseNotificationSoundOptions = {}
) {
  const { enabled = true, volume = 0.5 } = options;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayedRef = useRef<number>(0);
  const useFallbackRef = useRef(false);

  // Initialize audio on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const audio = new Audio(NOTIFICATION_SOUND_URL);
      audio.volume = volume;
      audio.preload = "auto";

      // If the mp3 file doesn't exist, use fallback
      audio.onerror = () => {
        console.debug("[NotificationSound] Using fallback sound");
        useFallbackRef.current = true;
        audioRef.current = new Audio(FALLBACK_SOUND_URL);
        if (audioRef.current) {
          audioRef.current.volume = volume;
        }
      };

      audioRef.current = audio;

      return () => {
        audioRef.current = null;
      };
    }
  }, [volume]);

  // Update volume when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  /**
   * Play the notification sound
   * Debounced to prevent rapid repeated plays
   */
  const playSound = useCallback(() => {
    if (!enabled || !audioRef.current) return;

    const now = Date.now();
    if (now - lastPlayedRef.current < DEBOUNCE_TIME) {
      return; // Skip if played too recently
    }

    lastPlayedRef.current = now;

    // Clone and play to allow overlapping sounds if needed
    const soundUrl = useFallbackRef.current
      ? FALLBACK_SOUND_URL
      : NOTIFICATION_SOUND_URL;
    const audio = new Audio(soundUrl);
    audio.volume = volume;

    audio.play().catch((error) => {
      // Browser may block autoplay - this is expected behavior
      console.debug("[NotificationSound] Could not play sound:", error.message);
    });
  }, [enabled, volume]);

  return { playSound };
}
