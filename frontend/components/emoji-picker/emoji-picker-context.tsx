"use client";

/**
 * Emoji Picker Context
 * Provides shared state for skin tone and recent emojis across the application
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  EmojiPickerContextValue,
  MAX_RECENT_EMOJIS,
  SkinTone,
  STORAGE_KEYS,
} from "./types";

const EmojiPickerContext = createContext<EmojiPickerContextValue | null>(null);

interface EmojiPickerProviderProps {
  children: React.ReactNode;
}

export function EmojiPickerProvider({ children }: EmojiPickerProviderProps) {
  const [skinTone, setSkinToneState] = useState<SkinTone>(1);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);

  // Load preferences from localStorage on mount
  useEffect(() => {
    // Load skin tone
    const savedSkinTone = localStorage.getItem(STORAGE_KEYS.SKIN_TONE);
    if (savedSkinTone) {
      const parsed = parseInt(savedSkinTone, 10);
      if (parsed >= 1 && parsed <= 6) {
        setSkinToneState(parsed as SkinTone);
      }
    }

    // Load recent emojis
    const savedRecent = localStorage.getItem(STORAGE_KEYS.RECENT_EMOJIS);
    if (savedRecent) {
      try {
        const parsed = JSON.parse(savedRecent);
        if (Array.isArray(parsed)) {
          setRecentEmojis(parsed.slice(0, MAX_RECENT_EMOJIS));
        }
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, []);

  const setSkinTone = useCallback((tone: SkinTone) => {
    setSkinToneState(tone);
    localStorage.setItem(STORAGE_KEYS.SKIN_TONE, tone.toString());
  }, []);

  const addRecentEmoji = useCallback((emoji: string) => {
    setRecentEmojis((prev) => {
      // Remove if already exists (will be moved to front)
      const filtered = prev.filter((e) => e !== emoji);
      // Add to front
      const updated = [emoji, ...filtered].slice(0, MAX_RECENT_EMOJIS);
      // Persist to localStorage
      localStorage.setItem(STORAGE_KEYS.RECENT_EMOJIS, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <EmojiPickerContext.Provider
      value={{
        skinTone,
        setSkinTone,
        recentEmojis,
        addRecentEmoji,
      }}
    >
      {children}
    </EmojiPickerContext.Provider>
  );
}

export function useEmojiPickerContext(): EmojiPickerContextValue {
  const context = useContext(EmojiPickerContext);
  if (!context) {
    throw new Error(
      "useEmojiPickerContext must be used within EmojiPickerProvider"
    );
  }
  return context;
}

/**
 * Optional hook for components that may or may not be within the provider
 * Returns default values if not within provider
 */
export function useEmojiPickerContextOptional(): EmojiPickerContextValue {
  const context = useContext(EmojiPickerContext);

  // Return default implementation if not within provider
  if (!context) {
    return {
      skinTone: 1,
      setSkinTone: () => {},
      recentEmojis: [],
      addRecentEmoji: () => {},
    };
  }

  return context;
}
