"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

export type PlaybackSpeed = 1 | 1.5 | 2;

interface AudioPlaybackState {
  currentAudioId: string | null;
  isPlaying: boolean;
  duration: number;
  playbackSpeed: PlaybackSpeed;
}

interface AudioPositionMap {
  [audioId: string]: number; // Saved positions for each audio
}

interface AudioPlaybackContextValue {
  state: AudioPlaybackState;
  positions: AudioPositionMap;
  play: (audioId: string, audioUrl: string) => void;
  pause: () => void;
  seek: (time: number) => void;
  seekVisualOnly: (time: number) => void; // Update visual without touching audio
  commitSeek: () => void; // Apply the visual position to actual audio
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  cyclePlaybackSpeed: () => void;
  registerAudio: (audioId: string, duration: number) => void;
  unregisterAudio: (audioId: string) => void;
  getSavedPosition: (audioId: string) => number;
  setSavedPosition: (audioId: string, time: number) => void;
  isAudioPlaying: (audioId: string) => boolean;
  subscribeToTime: (callback: () => void) => () => void;
  getCurrentTime: () => number;
  getCurrentAudioId: () => string | null;
}

const PLAYBACK_SPEED_KEY = "audio_playback_speed";
const SPEED_CYCLE: PlaybackSpeed[] = [1, 1.5, 2];

const AudioPlaybackContext = createContext<AudioPlaybackContextValue | null>(
  null
);

export function AudioPlaybackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AudioPlaybackState>({
    currentAudioId: null,
    isPlaying: false,
    duration: 0,
    playbackSpeed: 1,
  });

  const [positions, setPositions] = useState<AudioPositionMap>({});
  const positionsRef = useRef<AudioPositionMap>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioIdRef = useRef<string | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Time subscription system - only the current audio subscribes
  const timeListenersRef = useRef<Set<() => void>>(new Set());
  const currentTimeRef = useRef<number>(0);
  // Track pending seek position for visual-only seeking during drag
  const pendingSeekPositionRef = useRef<number | null>(null);

  // Load saved playback speed from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedSpeed = localStorage.getItem(PLAYBACK_SPEED_KEY);
      if (savedSpeed) {
        const speed = parseFloat(savedSpeed) as PlaybackSpeed;
        if (SPEED_CYCLE.includes(speed)) {
          setState((prev) => ({ ...prev, playbackSpeed: speed }));
        }
      }
    }
  }, []);

  // Create audio element once
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.preload = "metadata";

    const audio = audioRef.current;

    const handleEnded = () => {
      if (currentAudioIdRef.current) {
        // Reset position to beginning when ended
        setPositions((prev) => {
          const updated = { ...prev, [currentAudioIdRef.current!]: 0 };
          positionsRef.current = updated;
          return updated;
        });
      }
      currentTimeRef.current = 0;
      // Notify listeners of reset
      timeListenersRef.current.forEach((listener) => listener());
      setState((prev) => ({
        ...prev,
        isPlaying: false,
      }));
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };

    const handleLoadedMetadata = () => {
      setState((prev) => ({
        ...prev,
        duration: audio.duration,
      }));
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.pause();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Update time tracking with animation frame - notifies only subscribers
  const startTimeTracking = useCallback(() => {
    const updateTime = () => {
      if (audioRef.current && !audioRef.current.paused) {
        currentTimeRef.current = audioRef.current.currentTime;

        // Notify only subscribed components (the currently playing audio)
        timeListenersRef.current.forEach((listener) => listener());

        animationFrameRef.current = requestAnimationFrame(updateTime);
      }
    };
    animationFrameRef.current = requestAnimationFrame(updateTime);
  }, []);

  const stopTimeTracking = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    // Save final position when stopping
    if (currentAudioIdRef.current && audioRef.current) {
      const audioId = currentAudioIdRef.current;
      const currentTime = audioRef.current.currentTime;
      setPositions((prev) => {
        const updated = { ...prev, [audioId]: currentTime };
        positionsRef.current = updated;
        return updated;
      });
    }
  }, []);

  // Play audio
  const play = useCallback(
    async (audioId: string, audioUrl: string) => {
      const audio = audioRef.current;
      if (!audio) return;

      // If same audio, just resume
      if (currentAudioIdRef.current === audioId && audio.src) {
        audio.playbackRate = state.playbackSpeed;
        await audio.play();
        setState((prev) => ({ ...prev, isPlaying: true }));
        startTimeTracking();
        return;
      }

      // Save current position before switching
      if (currentAudioIdRef.current && audio.currentTime > 0) {
        const prevAudioId = currentAudioIdRef.current;
        const prevTime = audio.currentTime;
        // Update positionsRef immediately so the old audio shows correct position
        positionsRef.current = {
          ...positionsRef.current,
          [prevAudioId]: prevTime,
        };
        setPositions((prev) => ({ ...prev, [prevAudioId]: prevTime }));
      }

      // Stop current playback
      audio.pause();
      stopTimeTracking();

      // Update current audio ID ref before loading new audio
      const prevAudioId = currentAudioIdRef.current;
      currentAudioIdRef.current = audioId;

      // Update state to reflect new current audio BEFORE notifying listeners
      setState((prev) => ({
        ...prev,
        currentAudioId: audioId,
        isPlaying: false, // Will be set to true after successful play
      }));

      // Now notify listeners - they will see the updated currentAudioId
      if (prevAudioId) {
        timeListenersRef.current.forEach((listener) => listener());
      }

      // Load new audio
      audio.src = audioUrl;
      audio.playbackRate = state.playbackSpeed;

      // Resume from saved position if available - use ref for latest value
      const savedPosition = positionsRef.current[audioId] || 0;
      audio.currentTime = savedPosition;
      currentTimeRef.current = savedPosition;

      try {
        await audio.play();
        setState((prev) => ({
          ...prev,
          isPlaying: true,
          duration: audio.duration || 0,
        }));
        startTimeTracking();
      } catch (err) {
        console.error("Failed to play audio:", err);
        setState((prev) => ({
          ...prev,
          isPlaying: false,
        }));
      }
    },
    [startTimeTracking, stopTimeTracking, state.playbackSpeed]
  );

  // Pause audio
  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    stopTimeTracking();

    // Save current position
    if (currentAudioIdRef.current) {
      const audioId = currentAudioIdRef.current;
      setPositions((prev) => {
        const updated = { ...prev, [audioId]: audio.currentTime };
        positionsRef.current = updated;
        return updated;
      });
    }

    setState((prev) => ({
      ...prev,
      isPlaying: false,
    }));
  }, [stopTimeTracking]);

  // Seek to position - immediately updates both visual and audio
  // Use this for single clicks, NOT for dragging
  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Update visual position
    currentTimeRef.current = time;
    pendingSeekPositionRef.current = null;
    timeListenersRef.current.forEach((listener) => listener());

    // Update audio element
    audio.currentTime = time;

    if (currentAudioIdRef.current) {
      const audioId = currentAudioIdRef.current;
      positionsRef.current = { ...positionsRef.current, [audioId]: time };
      setPositions((prev) => ({ ...prev, [audioId]: time }));
    }
  }, []);

  // Seek visual only - updates the UI without touching the audio element
  // Use this during drag operations to prevent stuttering
  const seekVisualOnly = useCallback((time: number) => {
    // Update visual position only - don't touch audio.currentTime
    currentTimeRef.current = time;
    pendingSeekPositionRef.current = time;
    timeListenersRef.current.forEach((listener) => listener());

    if (currentAudioIdRef.current) {
      const audioId = currentAudioIdRef.current;
      positionsRef.current = { ...positionsRef.current, [audioId]: time };
      setPositions((prev) => ({ ...prev, [audioId]: time }));
    }
  }, []);

  // Commit the pending seek - applies the visual position to the audio element
  // Call this when drag ends
  const commitSeek = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || pendingSeekPositionRef.current === null) return;

    // Apply the pending position to the audio element
    audio.currentTime = pendingSeekPositionRef.current;
    pendingSeekPositionRef.current = null;
  }, []);

  // Set playback speed
  const setPlaybackSpeed = useCallback((speed: PlaybackSpeed) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    localStorage.setItem(PLAYBACK_SPEED_KEY, speed.toString());
    setState((prev) => ({
      ...prev,
      playbackSpeed: speed,
    }));
  }, []);

  // Cycle through playback speeds
  const cyclePlaybackSpeed = useCallback(() => {
    setState((prev) => {
      const currentIndex = SPEED_CYCLE.indexOf(prev.playbackSpeed);
      const nextIndex = (currentIndex + 1) % SPEED_CYCLE.length;
      const newSpeed = SPEED_CYCLE[nextIndex];

      if (audioRef.current) {
        audioRef.current.playbackRate = newSpeed;
      }
      localStorage.setItem(PLAYBACK_SPEED_KEY, newSpeed.toString());

      return {
        ...prev,
        playbackSpeed: newSpeed,
      };
    });
  }, []);

  // Register audio (for tracking)
  const registerAudio = useCallback((audioId: string, duration: number) => {
    setPositions((prev) => {
      if (!(audioId in prev)) {
        const updated = { ...prev, [audioId]: 0 };
        positionsRef.current = updated;
        return updated;
      }
      return prev;
    });
  }, []);

  // Unregister audio (cleanup)
  const unregisterAudio = useCallback((audioId: string) => {
    // Optionally clean up position data
    // For now, keep positions to allow resuming even after unmount
  }, []);

  // Get saved position for an audio (does NOT trigger re-renders on time update)
  // Uses positionsRef to always get the latest value without stale closures
  const getSavedPosition = useCallback((audioId: string): number => {
    return positionsRef.current[audioId] || 0;
  }, []);

  // Set saved position for an audio (for seeking before play)
  const setSavedPosition = useCallback((audioId: string, time: number) => {
    positionsRef.current = { ...positionsRef.current, [audioId]: time };
    setPositions((prev) => {
      return { ...prev, [audioId]: time };
    });
    // Notify listeners so the UI updates
    timeListenersRef.current.forEach((listener) => listener());
  }, []);

  // Check if specific audio is playing
  const isAudioPlaying = useCallback(
    (audioId: string): boolean => {
      return state.currentAudioId === audioId && state.isPlaying;
    },
    [state.currentAudioId, state.isPlaying]
  );

  // Subscribe to time updates (for useSyncExternalStore)
  const subscribeToTime = useCallback((callback: () => void) => {
    timeListenersRef.current.add(callback);
    return () => {
      timeListenersRef.current.delete(callback);
    };
  }, []);

  // Get current time (for useSyncExternalStore)
  const getCurrentTime = useCallback(() => {
    return currentTimeRef.current;
  }, []);

  // Get current audio ID (for useSyncExternalStore snapshot)
  const getCurrentAudioId = useCallback(() => {
    return currentAudioIdRef.current;
  }, []);

  const value: AudioPlaybackContextValue = {
    state,
    positions,
    play,
    pause,
    seek,
    seekVisualOnly,
    commitSeek,
    setPlaybackSpeed,
    cyclePlaybackSpeed,
    registerAudio,
    unregisterAudio,
    getSavedPosition,
    setSavedPosition,
    isAudioPlaying,
    subscribeToTime,
    getCurrentTime,
    getCurrentAudioId,
  };

  return (
    <AudioPlaybackContext.Provider value={value}>
      {children}
    </AudioPlaybackContext.Provider>
  );
}

export function useAudioPlayback() {
  const context = useContext(AudioPlaybackContext);
  if (!context) {
    throw new Error(
      "useAudioPlayback must be used within an AudioPlaybackProvider"
    );
  }
  return context;
}

// Hook for individual audio items
export function useAudioItem(audioId: string, audioUrl: string) {
  const {
    state,
    play,
    pause,
    seek,
    seekVisualOnly,
    commitSeek,
    cyclePlaybackSpeed,
    getSavedPosition,
    setSavedPosition,
    isAudioPlaying,
    registerAudio,
    subscribeToTime,
    getCurrentTime,
    getCurrentAudioId,
  } = useAudioPlayback();

  const isPlaying = isAudioPlaying(audioId);
  const isCurrentAudio = state.currentAudioId === audioId;

  // Store audioId in ref for stable access in snapshot function
  const audioIdRef = useRef(audioId);
  audioIdRef.current = audioId;

  // Only subscribe to time updates if THIS is the current audio
  // This prevents other audio bubbles from re-rendering
  const currentTime = useSyncExternalStore(
    subscribeToTime,
    // Check against currentAudioIdRef (via getCurrentAudioId) for real-time accuracy
    // This ensures the snapshot always reflects the true current state
    () => {
      const currentAudioId = getCurrentAudioId();
      if (currentAudioId === audioIdRef.current) {
        return getCurrentTime();
      }
      return getSavedPosition(audioIdRef.current);
    },
    // Server snapshot
    () => 0
  );

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play(audioId, audioUrl);
    }
  }, [isPlaying, pause, play, audioId, audioUrl]);

  // Immediate seek - for single clicks
  const seekTo = useCallback(
    (time: number) => {
      if (isCurrentAudio) {
        seek(time);
      } else {
        setSavedPosition(audioId, time);
      }
    },
    [isCurrentAudio, seek, setSavedPosition, audioId]
  );

  // Visual-only seek - for dragging (doesn't touch audio.currentTime)
  const seekVisualOnlyTo = useCallback(
    (time: number) => {
      if (isCurrentAudio) {
        seekVisualOnly(time);
      } else {
        setSavedPosition(audioId, time);
      }
    },
    [isCurrentAudio, seekVisualOnly, setSavedPosition, audioId]
  );

  // Commit the seek - call when drag ends
  const commitSeekPosition = useCallback(() => {
    if (isCurrentAudio) {
      commitSeek();
    }
  }, [isCurrentAudio, commitSeek]);

  return {
    isPlaying,
    currentPosition: currentTime,
    duration: isCurrentAudio ? state.duration : 0,
    playbackSpeed: state.playbackSpeed,
    toggle,
    seek: seekTo,
    seekVisualOnly: seekVisualOnlyTo,
    commitSeek: commitSeekPosition,
    cyclePlaybackSpeed,
    registerAudio,
  };
}
