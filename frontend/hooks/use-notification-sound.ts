/**
 * useNotificationSound Hook
 *
 * Plays a notification sound when new messages arrive.
 * Works globally across all pages, not just the chats page.
 *
 * Features:
 * - Plays WhatsApp-like notification sound using Web Audio API
 * - Automatically unlocks audio on first user interaction (set up at module load)
 * - Prevents rapid repeated sounds (debouncing)
 * - Works in background tabs after user has interacted with the page
 *
 * Note: Due to browser autoplay policies, the sound will only play after
 * the user has interacted with the page at least once (click, tap, keypress).
 * The unlock listeners are set up immediately when this module loads to catch
 * the very first interaction, even before React mounts.
 */

import { useCallback, useRef } from "react";

// Path to the notification sound file in public folder
const NOTIFICATION_SOUND_URL = "/sounds/notification.mp3";

// Debounce time in ms to prevent rapid repeated sounds
const DEBOUNCE_TIME = 1000;

// Singleton AudioContext and audio buffer for efficient playback
let audioContext: AudioContext | null = null;
let audioBuffer: AudioBuffer | null = null;
let isAudioUnlocked = false;
let isLoadingBuffer = false;

// Queue to track if a notification arrived before user interaction
// We'll play sound immediately when user interacts if this is true
let pendingNotificationSound = false;
let pendingNotificationVolume = 0.5;

// Track if we've already set up the global listeners
let globalListenersSetup = false;

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

    // Now load the actual notification sound and wait for it to complete
    // This ensures the audio buffer is ready when the first message arrives
    await loadAudioBuffer();

    // If there was a pending notification sound, play it now
    if (pendingNotificationSound) {
      console.debug("[NotificationSound] 🔔 Playing queued notification sound");
      pendingNotificationSound = false;
      // Small delay to ensure everything is ready
      setTimeout(() => {
        playNotificationSound(pendingNotificationVolume);
      }, 100);
    }
  } catch (error) {
    console.debug("[NotificationSound] Failed to unlock audio:", error);
  }
}

/**
 * Play the notification sound using Web Audio API
 */
function playNotificationSound(volume: number): boolean {
  const ctx = getAudioContext();

  // Debug logging to understand why sound might not play
  if (!ctx) {
    console.debug("[NotificationSound] ⚠️ Cannot play: no AudioContext");
    return false;
  }
  if (!audioBuffer) {
    console.debug(
      "[NotificationSound] ⚠️ Cannot play: audio buffer not loaded"
    );
    return false;
  }
  if (!isAudioUnlocked) {
    console.debug(
      "[NotificationSound] ⚠️ Cannot play: audio not unlocked (no user interaction yet)"
    );
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
    console.debug("[NotificationSound] 🔊 Playing notification sound");
    return true;
  } catch (error) {
    console.debug("[NotificationSound] Failed to play sound:", error);
    return false;
  }
}

/**
 * Try to unlock audio immediately without waiting for user interaction.
 * This works in some browsers if:
 * - The page was navigated to via user action (clicking a link, refreshing)
 * - The user has interacted with the site before (some browsers remember this)
 * - The browser has a permissive autoplay policy
 */
async function tryImmediateUnlock(): Promise<boolean> {
  if (isAudioUnlocked) return true;

  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    // Try to resume the AudioContext - this might work if we have user gesture
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // Check if we successfully resumed
    if (ctx.state === "running") {
      // Try to play a silent buffer to confirm we're unlocked
      const silentBuffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = silentBuffer;
      source.connect(ctx.destination);
      source.start(0);

      isAudioUnlocked = true;
      console.debug(
        "[NotificationSound] ✅ Audio unlocked immediately (browser allowed it)"
      );
      return true;
    }
  } catch (error) {
    console.debug(
      "[NotificationSound] Could not unlock audio immediately:",
      error
    );
  }

  return false;
}

/**
 * Set up global event listeners to unlock audio on first user interaction.
 * This is called immediately when the module loads, BEFORE React mounts,
 * so we can catch the very first click/interaction on the page.
 */
async function setupGlobalAudioUnlock(): Promise<void> {
  if (typeof window === "undefined") return;
  if (globalListenersSetup) return;

  globalListenersSetup = true;

  // Initialize AudioContext early
  getAudioContext();

  // Start preloading the audio buffer immediately
  loadAudioBuffer();

  // If already unlocked somehow, nothing to do
  if (isAudioUnlocked) {
    console.debug("[NotificationSound] Audio already unlocked at module load");
    return;
  }

  // Try to unlock immediately - this works if page was loaded via user action
  const immediatelyUnlocked = await tryImmediateUnlock();
  if (immediatelyUnlocked) {
    return;
  }

  console.debug("[NotificationSound] Setting up global audio unlock listeners");

  // Unlock audio on any user interaction - using capture phase to get events first
  const interactionEvents = ["click", "touchstart", "keydown", "mousedown"];

  const handleInteraction = async () => {
    // Remove listeners immediately to prevent multiple calls
    interactionEvents.forEach((event) => {
      document.removeEventListener(event, handleInteraction, true);
    });

    // Unlock audio
    await unlockAudio();
  };

  // Add listeners with capture to catch all interactions before any other handler
  interactionEvents.forEach((event) => {
    document.addEventListener(event, handleInteraction, true);
  });
}

// IMMEDIATELY set up global listeners when this module is imported
// This runs before React mounts, catching interactions that happen during page load
setupGlobalAudioUnlock();

export interface UseNotificationSoundOptions {
  enabled?: boolean;
  volume?: number;
}

export function useNotificationSound(
  options: UseNotificationSoundOptions = {}
) {
  const { enabled = true, volume = 0.5 } = options;
  const lastPlayedRef = useRef<number>(0);

  // No need for useEffect - global listeners are already set up at module load time
  // This ensures we catch interactions that happen before React even mounts

  /**
   * Play the notification sound
   * Debounced to prevent rapid repeated plays
   * If audio isn't unlocked yet, queues the sound to play on first user interaction
   */
  const playSound = useCallback(() => {
    console.debug(
      `[NotificationSound] playSound called, enabled=${enabled}, isAudioUnlocked=${isAudioUnlocked}, hasBuffer=${!!audioBuffer}`
    );

    if (!enabled) {
      console.debug("[NotificationSound] ⏭️ Sound disabled, skipping");
      return;
    }

    const now = Date.now();
    const timeSinceLastPlay = now - lastPlayedRef.current;

    // Only debounce if we actually played a sound recently
    // Don't debounce if the last "play" was just a queue operation
    if (timeSinceLastPlay < DEBOUNCE_TIME && lastPlayedRef.current > 0) {
      console.debug(
        `[NotificationSound] ⏭️ Debounced, skipping (${timeSinceLastPlay}ms since last play)`
      );
      return;
    }

    // Try Web Audio API first (preferred - works in background)
    if (playNotificationSound(volume)) {
      lastPlayedRef.current = now;
      return;
    }

    // If audio isn't unlocked, try one more time to unlock immediately
    // This might work if the browser's autoplay policy has changed
    if (!isAudioUnlocked) {
      // Try immediate unlock - might work now
      tryImmediateUnlock().then((unlocked) => {
        if (unlocked && audioBuffer) {
          console.debug(
            "[NotificationSound] 🔊 Late unlock succeeded, playing sound now"
          );
          playNotificationSound(volume);
          lastPlayedRef.current = Date.now();
        } else {
          // Still can't unlock, queue for when user interacts
          console.debug(
            "[NotificationSound] 🔔 Queuing notification sound for when user interacts"
          );
          pendingNotificationSound = true;
          pendingNotificationVolume = volume;
        }
      });
      return;
    }

    console.debug("[NotificationSound] Falling back to HTML5 Audio");
    // Fallback to HTML5 Audio (may not work in background or before interaction)
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = volume;
    audio
      .play()
      .then(() => {
        // Only set the debounce timestamp if audio actually played
        lastPlayedRef.current = Date.now();
        console.debug("[NotificationSound] 🔊 HTML5 Audio played successfully");
      })
      .catch((error) => {
        // Don't set lastPlayedRef - allow retry on next message
        console.debug(
          "[NotificationSound] Could not play sound (user interaction required):",
          error.message
        );
      });
  }, [enabled, volume]);

  return { playSound, isUnlocked: isAudioUnlocked };
}

/**
 * Check if audio is currently unlocked
 * Exported for use by the EnableSoundsBanner component
 */
export function getIsAudioUnlocked(): boolean {
  return isAudioUnlocked;
}

/**
 * Check if there's a pending notification sound
 * Exported for use by the EnableSoundsBanner component
 */
export function hasPendingNotification(): boolean {
  return pendingNotificationSound;
}

/**
 * Manually unlock audio - called from the EnableSoundsBanner when user clicks
 * This is a user interaction, so it should work to unlock audio
 */
export async function unlockAudioManually(): Promise<boolean> {
  try {
    await unlockAudio();
    return isAudioUnlocked;
  } catch (error) {
    console.debug("[NotificationSound] Manual unlock failed:", error);
    return false;
  }
}
