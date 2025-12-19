"use client";

/**
 * GIF Attachment Component
 * WhatsApp-style GIF display with controlled loop playback
 *
 * Features:
 * - Shows "GIF" badge in a circle overlay when stopped
 * - Click anywhere on the GIF to start/stop playback
 * - Plays inline in the chat (not in a modal)
 * - Plays exactly 3 loops then stops automatically
 * - Supports auto-play for recently received GIFs
 *
 * Design:
 * - Similar to WhatsApp Web's GIF display
 * - Dark semi-transparent circle with "GIF" text
 * - Smooth transitions between states
 *
 * Architecture:
 * - Uses useGifPlayback hook for encapsulated playback logic
 * - Configurable loop count for easy maintenance
 * - Separation between UI state and playback control
 */

import { useMediaUrl } from "@/hooks/use-media-url";
import { Attachment } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ThumbnailSkeleton } from "./thumbnail-skeleton";

// ============================================================
// CONFIGURATION
// ============================================================

/** Number of times to loop the GIF before stopping */
const GIF_LOOP_COUNT = 3;

// ============================================================
// TYPES
// ============================================================

interface GifAttachmentProps {
  /** The GIF attachment metadata */
  attachment: Attachment;
  /** Message ID for media URL resolution */
  messageId: string;
  /** Whether this is an outbound message */
  isOutbound?: boolean;
  /** Optional delete handler */
  onDelete?: (attachmentId: string) => void;
  /** Maximum width constraint */
  maxWidth?: number;
  /**
   * Auto-play the GIF when component mounts (3 loops)
   * Used for recently received GIFs when opening a chat
   */
  autoPlay?: boolean;
  /**
   * Callback when auto-play has started - used to acknowledge receipt
   * This allows parent to know the GIF got the auto-play signal
   */
  onAutoPlayStarted?: () => void;
}

/**
 * Playback state for the GIF
 */
type GifPlaybackState = "idle" | "loading" | "playing" | "stopped";

// ============================================================
// SUB-COMPONENTS
// ============================================================

/**
 * GIF Badge Overlay
 * Circular badge with "GIF" text, WhatsApp-style
 */
function GifBadge({ visible }: { visible: boolean }) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
        <span className="text-white text-sm font-bold tracking-wider">GIF</span>
      </div>
    </div>
  );
}

/**
 * Loading Overlay
 * Shows while GIF is loading
 */
function LoadingOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
    </div>
  );
}

// ============================================================
// CUSTOM HOOK: useGifPlayback
// ============================================================

interface UseGifPlaybackOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  loopCount: number;
  autoPlay: boolean;
  onStateChange?: (state: GifPlaybackState) => void;
  onAutoPlayStarted?: () => void;
}

interface UseGifPlaybackResult {
  state: GifPlaybackState;
  currentLoop: number;
  startPlayback: () => void;
  stopPlayback: () => void;
  handleVideoEnded: () => void;
  handleVideoLoaded: () => void;
  handleVideoError: () => void;
}

/**
 * Custom hook for managing GIF playback with loop counting
 * Encapsulates all playback logic for maintainability
 */
function useGifPlayback({
  videoRef,
  loopCount,
  autoPlay,
  onStateChange,
  onAutoPlayStarted,
}: UseGifPlaybackOptions): UseGifPlaybackResult {
  const [state, setState] = useState<GifPlaybackState>("idle");
  const [currentLoop, setCurrentLoop] = useState(0);
  const isLoadedRef = useRef(false);
  const hasAutoPlayedRef = useRef(false);
  const currentLoopRef = useRef(0);
  // Track previous autoPlay value - start with undefined to detect initial render with autoPlay=true
  const prevAutoPlayRef = useRef<boolean | undefined>(undefined);
  // Store current autoPlay value in ref for use in callbacks (avoids stale closure issue)
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;
  // Store callback in ref to avoid effect re-runs
  const onAutoPlayStartedRef = useRef(onAutoPlayStarted);
  onAutoPlayStartedRef.current = onAutoPlayStarted;

  // Keep ref in sync with state for use in callbacks
  useEffect(() => {
    currentLoopRef.current = currentLoop;
  }, [currentLoop]);

  // Notify parent of state changes
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  /**
   * Start playback from beginning, reset loop counter
   * @param isAutoPlay - If true, notifies parent that auto-play started
   */
  const startPlayback = useCallback(
    (isAutoPlay = false) => {
      const video = videoRef.current;
      if (!video || !isLoadedRef.current) return;

      // Reset loop counter and start from beginning
      setCurrentLoop(0);
      currentLoopRef.current = 0;
      video.currentTime = 0;

      setState("playing");
      video.play().catch((err) => {
        console.error("Failed to play GIF:", err);
        setState("stopped");
      });

      // Notify parent that auto-play started (so it can clean up the auto-play tracking)
      if (isAutoPlay) {
        onAutoPlayStartedRef.current?.();
      }
    },
    [videoRef]
  );

  // Handle autoPlay prop changes (e.g., when a new GIF arrives while chat is open)
  // This effect triggers when:
  // 1. Component mounts with autoPlay=true (initial render case)
  // 2. autoPlay transitions from false to true (prop change case)
  useEffect(() => {
    const wasAutoPlay = prevAutoPlayRef.current;
    const isInitialRender = wasAutoPlay === undefined;
    prevAutoPlayRef.current = autoPlay;

    console.log(
      `[GifPlayback] autoPlay effect - isInitial: ${isInitialRender}, wasAutoPlay: ${wasAutoPlay}, autoPlay: ${autoPlay}, hasAutoPlayed: ${hasAutoPlayedRef.current}, isLoaded: ${isLoadedRef.current}`
    );

    // Trigger auto-play if:
    // 1. It's the initial render with autoPlay=true, OR
    // 2. autoPlay changed from false to true
    // AND we haven't already auto-played this GIF
    const shouldAutoPlay =
      ((isInitialRender && autoPlay) || (!wasAutoPlay && autoPlay)) &&
      !hasAutoPlayedRef.current;

    if (shouldAutoPlay) {
      console.log(`[GifPlayback] 🎬 Triggering auto-play!`);

      // If video is already loaded, start immediately and mark as auto-played
      if (isLoadedRef.current) {
        hasAutoPlayedRef.current = true;
        requestAnimationFrame(() => {
          startPlayback(true); // true = this is auto-play
        });
      } else {
        // Video not loaded yet - DON'T set hasAutoPlayedRef here!
        // handleVideoLoaded will check autoPlayRef.current and handle it
        console.log(
          `[GifPlayback] ⏳ Video not loaded yet, will auto-play when loaded`
        );
      }
    }
  }, [autoPlay, startPlayback]);

  /**
   * Stop playback immediately
   */
  const stopPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    video.currentTime = 0;
    setCurrentLoop(0);
    currentLoopRef.current = 0;
    setState("stopped");
  }, [videoRef]);

  /**
   * Handle video ended event - either loop again or stop
   */
  const handleVideoEnded = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const nextLoop = currentLoopRef.current + 1;

    if (nextLoop < loopCount) {
      // Continue looping
      setCurrentLoop(nextLoop);
      currentLoopRef.current = nextLoop;
      video.currentTime = 0;
      video.play().catch((err) => {
        console.error("Failed to replay GIF:", err);
        setState("stopped");
      });
    } else {
      // Done looping - stop playback
      video.currentTime = 0;
      setCurrentLoop(0);
      currentLoopRef.current = 0;
      setState("stopped");
    }
  }, [videoRef, loopCount]);

  /**
   * Handle video loaded - ready to play
   * Uses autoPlayRef to get the current value instead of the closure value
   */
  const handleVideoLoaded = useCallback(() => {
    console.log(
      `[GifPlayback] Video loaded - autoPlay: ${autoPlayRef.current}, hasAutoPlayed: ${hasAutoPlayedRef.current}`
    );
    isLoadedRef.current = true;

    // If autoPlay is enabled and we haven't auto-played yet
    // Use ref to get the CURRENT value, not the stale closure value
    if (autoPlayRef.current && !hasAutoPlayedRef.current) {
      console.log(`[GifPlayback] 🎬 Auto-playing on video load!`);
      hasAutoPlayedRef.current = true;
      // Small delay to ensure everything is ready
      requestAnimationFrame(() => {
        startPlayback(true); // true = this is auto-play
      });
    } else {
      setState("stopped");
    }
  }, [startPlayback]);

  /**
   * Handle video error
   */
  const handleVideoError = useCallback(() => {
    setState("stopped");
    setCurrentLoop(0);
    currentLoopRef.current = 0;
  }, []);

  return {
    state,
    currentLoop,
    startPlayback,
    stopPlayback,
    handleVideoEnded,
    handleVideoLoaded,
    handleVideoError,
  };
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export const GifAttachment = memo(function GifAttachment({
  attachment,
  messageId,
  isOutbound = false,
  onDelete,
  maxWidth = 280,
  autoPlay = false,
  onAutoPlayStarted,
}: GifAttachmentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);
  // Track video dimensions once loaded (fallback if API doesn't have them)
  const [videoDimensions, setVideoDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Use media URL hook for loading the GIF (comes as video/mp4 from WhatsApp)
  const {
    url: mediaUrl,
    thumbnailUrl,
    loading,
    error,
    blurhash,
    dimensions,
  } = useMediaUrl(messageId, attachment.id, {
    loadThumbnail: true,
    handleCloudApi: true,
    attachment,
  });

  // Use the playback hook for all playback logic
  const {
    state,
    startPlayback,
    stopPlayback,
    handleVideoEnded,
    handleVideoLoaded: originalHandleVideoLoaded,
    handleVideoError,
  } = useGifPlayback({
    videoRef,
    loopCount: GIF_LOOP_COUNT,
    autoPlay,
    onAutoPlayStarted,
  });

  // Enhanced video loaded handler that also captures dimensions
  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    if (video && video.videoWidth && video.videoHeight) {
      // Capture video dimensions for accurate height calculation
      setVideoDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
      });
    }
    originalHandleVideoLoaded();
  }, [originalHandleVideoLoaded]);

  // Combined error handler
  const onVideoError = useCallback(() => {
    setHasError(true);
    handleVideoError();
  }, [handleVideoError]);

  // Toggle playback on click
  const handleClick = useCallback(() => {
    if (!mediaUrl) return;

    if (state === "playing") {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [state, mediaUrl, startPlayback, stopPlayback]);

  // Configure video element when URL is available
  useEffect(() => {
    const video = videoRef.current;
    if (video && mediaUrl) {
      video.muted = true; // GIFs are silent
      video.playsInline = true;
      video.preload = "auto"; // Preload for smooth playback
    }
  }, [mediaUrl]);

  // Error state
  if (error || hasError) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 max-w-xs">
        Failed to load GIF
      </div>
    );
  }

  // Use API dimensions if available, otherwise use video dimensions, otherwise fallback
  const effectiveDimensions =
    dimensions?.width && dimensions?.height ? dimensions : videoDimensions;

  // Calculate display dimensions
  const displayWidth = effectiveDimensions?.width
    ? Math.min(effectiveDimensions.width, maxWidth)
    : maxWidth;
  const aspectRatio =
    effectiveDimensions?.width && effectiveDimensions?.height
      ? effectiveDimensions.width / effectiveDimensions.height
      : 16 / 9;
  const displayHeight = displayWidth / aspectRatio;

  // Show badge when not playing
  const showBadge = state !== "playing" && state !== "loading" && !loading;
  const isVideoVisible = state !== "idle" || mediaUrl;

  // Determine if we have known dimensions (from API metadata or video)
  const hasKnownDimensions = Boolean(
    effectiveDimensions?.width && effectiveDimensions?.height
  );

  return (
    <div
      ref={containerRef}
      className="relative inline-block rounded-lg overflow-hidden cursor-pointer group"
      style={{
        maxWidth: `${maxWidth}px`,
        // CRITICAL: Reserve height to prevent layout shift and ensure proper scroll calculation
        // This ensures the container has the correct height even before video loads
        width: hasKnownDimensions ? `${displayWidth}px` : undefined,
        height: hasKnownDimensions ? `${displayHeight}px` : undefined,
        minHeight: hasKnownDimensions ? `${displayHeight}px` : "150px",
      }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={state === "playing" ? "Stop GIF" : "Play GIF"}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      data-media-container="gif"
    >
      {/* Video element */}
      {mediaUrl && (
        <video
          ref={videoRef}
          src={mediaUrl}
          className={cn(
            "w-full h-full rounded-lg transition-opacity duration-300",
            isVideoVisible ? "opacity-100" : "opacity-0"
          )}
          style={{
            // Ensure video fills the reserved space
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
          onLoadedData={handleVideoLoaded}
          onEnded={handleVideoEnded}
          onError={onVideoError}
          muted
          playsInline
          loop={false}
        />
      )}

      {/* Thumbnail/placeholder while loading - now fills the reserved height */}
      {(loading || !isVideoVisible) && (
        <div className="absolute inset-0 w-full h-full">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt="GIF preview"
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <ThumbnailSkeleton
              width="100%"
              height="100%"
              blurhash={blurhash}
              variant="medium"
              mediaType="video"
            />
          )}
        </div>
      )}

      {/* Loading overlay */}
      <LoadingOverlay visible={loading && !thumbnailUrl} />

      {/* GIF Badge overlay - shown when not playing */}
      <GifBadge visible={showBadge} />

      {/* Delete button on hover */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(attachment.id);
          }}
          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
          title="Delete attachment"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
});

GifAttachment.displayName = "GifAttachment";
