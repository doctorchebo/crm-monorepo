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
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  cyclePlaybackSpeed: () => void;
  registerAudio: (audioId: string, duration: number) => void;
  unregisterAudio: (audioId: string) => void;
  getSavedPosition: (audioId: string) => number;
  setSavedPosition: (audioId: string, time: number) => void;
  isAudioPlaying: (audioId: string) => boolean;
  subscribeToTime: (callback: () => void) => () => void;
  getCurrentTime: () => number;
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioIdRef = useRef<string | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Time subscription system - only the current audio subscribes
  const timeListenersRef = useRef<Set<() => void>>(new Set());
  const currentTimeRef = useRef<number>(0);

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
        setPositions((prev) => ({
          ...prev,
          [currentAudioIdRef.current!]: 0,
        }));
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
      setPositions((prev) => ({
        ...prev,
        [currentAudioIdRef.current!]: audioRef.current!.currentTime,
      }));
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
        setPositions((prev) => ({
          ...prev,
          [currentAudioIdRef.current!]: audio.currentTime,
        }));
      }

      // Stop current playback
      audio.pause();
      stopTimeTracking();

      // Load new audio
      currentAudioIdRef.current = audioId;
      audio.src = audioUrl;
      audio.playbackRate = state.playbackSpeed;

      // Resume from saved position if available
      const savedPosition = positions[audioId] || 0;
      audio.currentTime = savedPosition;
      currentTimeRef.current = savedPosition;

      try {
        await audio.play();
        setState((prev) => ({
          ...prev,
          currentAudioId: audioId,
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
    [positions, startTimeTracking, stopTimeTracking, state.playbackSpeed]
  );

  // Pause audio
  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    stopTimeTracking();

    // Save current position
    if (currentAudioIdRef.current) {
      setPositions((prev) => ({
        ...prev,
        [currentAudioIdRef.current!]: audio.currentTime,
      }));
    }

    setState((prev) => ({
      ...prev,
      isPlaying: false,
    }));
  }, [stopTimeTracking]);

  // Seek to position
  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = time;
    currentTimeRef.current = time;

    // Notify listeners of seek
    timeListenersRef.current.forEach((listener) => listener());

    if (currentAudioIdRef.current) {
      setPositions((prev) => ({
        ...prev,
        [currentAudioIdRef.current!]: time,
      }));
    }
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
        return { ...prev, [audioId]: 0 };
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
  const getSavedPosition = useCallback(
    (audioId: string): number => {
      return positions[audioId] || 0;
    },
    [positions]
  );

  // Set saved position for an audio (for seeking before play)
  const setSavedPosition = useCallback((audioId: string, time: number) => {
    setPositions((prev) => ({
      ...prev,
      [audioId]: time,
    }));
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

  const value: AudioPlaybackContextValue = {
    state,
    positions,
    play,
    pause,
    seek,
    setPlaybackSpeed,
    cyclePlaybackSpeed,
    registerAudio,
    unregisterAudio,
    getSavedPosition,
    setSavedPosition,
    isAudioPlaying,
    subscribeToTime,
    getCurrentTime,
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
    cyclePlaybackSpeed,
    getSavedPosition,
    setSavedPosition,
    isAudioPlaying,
    registerAudio,
    subscribeToTime,
    getCurrentTime,
  } = useAudioPlayback();

  const isPlaying = isAudioPlaying(audioId);
  const isCurrentAudio = state.currentAudioId === audioId;

  // Only subscribe to time updates if THIS is the current audio
  // This prevents other audio bubbles from re-rendering
  const currentTime = useSyncExternalStore(
    subscribeToTime,
    // Only return actual time if this is the current audio, otherwise return saved position
    () => (isCurrentAudio ? getCurrentTime() : getSavedPosition(audioId)),
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

  const seekTo = useCallback(
    (time: number) => {
      if (isCurrentAudio) {
        // Audio is currently loaded - seek directly
        seek(time);
      } else {
        // Audio not yet loaded - save position for when it plays
        setSavedPosition(audioId, time);
      }
    },
    [isCurrentAudio, seek, setSavedPosition, audioId]
  );

  return {
    isPlaying,
    currentPosition: currentTime,
    duration: isCurrentAudio ? state.duration : 0,
    playbackSpeed: state.playbackSpeed,
    toggle,
    seek: seekTo,
    cyclePlaybackSpeed,
    registerAudio,
  };
}
