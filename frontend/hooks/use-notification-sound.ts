/**
 * useNotificationSound Hook
 *
 * Plays a notification sound when new messages arrive.
 * Works globally across all pages, not just the chats page.
 *
 * Features:
 * - Plays WhatsApp-like notification sound using Web Audio API
 * - Automatically unlocks audio on first user interaction
 * - Prevents rapid repeated sounds (debouncing)
 * - Works in background tabs after user has interacted with the page
 *
 * Note: Due to browser autoplay policies, the sound will only play after
 * the user has interacted with the page at least once (click, tap, keypress).
 * This is a browser security feature and cannot be bypassed.
 */

import { useCallback, useEffect, useRef } from "react";

// Path to the notification sound file in public folder
const NOTIFICATION_SOUND_URL = "/sounds/notification.mp3";

// Debounce time in ms to prevent rapid repeated sounds
const DEBOUNCE_TIME = 1000;

// Singleton AudioContext and audio buffer for efficient playback
let audioContext: AudioContext | null = null;
let audioBuffer: AudioBuffer | null = null;
let isAudioUnlocked = false;
let isLoadingBuffer = false;

/**
 * Initialize the AudioContext (must be called, but won't be usable until user interaction)
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    } catch (e) {
      console.debug("[NotificationSound] Web Audio API not supported");
      return null;
    }
  }
  return audioContext;
}

/**
 * Load the audio file into a buffer for instant playback
 */
async function loadAudioBuffer(): Promise<void> {
  if (audioBuffer || isLoadingBuffer) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  isLoadingBuffer = true;

  try {
    const response = await fetch(NOTIFICATION_SOUND_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    console.debug("[NotificationSound] ✅ Audio buffer loaded successfully");
  } catch (error) {
    console.debug("[NotificationSound] Failed to load audio buffer:", error);
  } finally {
    isLoadingBuffer = false;
  }
}

/**
 * Unlock audio playback - must be called from a user interaction event
 */
async function unlockAudio(): Promise<void> {
  if (isAudioUnlocked) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    // Resume the AudioContext if it's suspended (browsers start it suspended)
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // Create and play a silent buffer to fully unlock audio
    const silentBuffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = silentBuffer;
    source.connect(ctx.destination);
    source.start(0);

    isAudioUnlocked = true;
    console.debug("[NotificationSound] ✅ Audio unlocked by user interaction");

    // Now load the actual notification sound
    loadAudioBuffer();
  } catch (error) {
    console.debug("[NotificationSound] Failed to unlock audio:", error);
  }
}

/**
 * Play the notification sound using Web Audio API
 */
function playNotificationSound(volume: number): boolean {
  const ctx = getAudioContext();
  if (!ctx || !audioBuffer || !isAudioUnlocked) {
    return false;
  }

  try {
    // Create a new buffer source for each playback
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    // Create a gain node for volume control
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;

    // Connect: source -> gain -> destination
    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Play immediately
    source.start(0);
    return true;
  } catch (error) {
    console.debug("[NotificationSound] Failed to play sound:", error);
    return false;
  }
}

export interface UseNotificationSoundOptions {
  enabled?: boolean;
  volume?: number;
}

export function useNotificationSound(
  options: UseNotificationSoundOptions = {}
) {
  const { enabled = true, volume = 0.5 } = options;
  const lastPlayedRef = useRef<number>(0);

  // Set up audio unlock listeners on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initialize AudioContext early (won't play until unlocked)
    getAudioContext();

    // If already unlocked (from another component), just load the buffer
    if (isAudioUnlocked) {
      loadAudioBuffer();
      return;
    }

    // Unlock audio on any user interaction
    const interactionEvents = ["click", "touchstart", "keydown"];

    const handleInteraction = () => {
      unlockAudio();
      // Remove listeners after first interaction
      interactionEvents.forEach((event) => {
        document.removeEventListener(event, handleInteraction, true);
      });
    };

    // Add listeners with capture to catch all interactions
    interactionEvents.forEach((event) => {
      document.addEventListener(event, handleInteraction, true);
    });

    return () => {
      interactionEvents.forEach((event) => {
        document.removeEventListener(event, handleInteraction, true);
      });
    };
  }, []);

  /**
   * Play the notification sound
   * Debounced to prevent rapid repeated plays
   */
  const playSound = useCallback(() => {
    if (!enabled) return;

    const now = Date.now();
    if (now - lastPlayedRef.current < DEBOUNCE_TIME) {
      return; // Skip if played too recently
    }

    // Try Web Audio API first (preferred - works in background)
    if (playNotificationSound(volume)) {
      lastPlayedRef.current = now;
      return;
    }

    // Fallback to HTML5 Audio (may not work in background or before interaction)
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = volume;
    audio.play().catch((error) => {
      console.debug(
        "[NotificationSound] Could not play sound (user interaction required):",
        error.message
      );
    });

    lastPlayedRef.current = now;
  }, [enabled, volume]);

  return { playSound, isUnlocked: isAudioUnlocked };
}
