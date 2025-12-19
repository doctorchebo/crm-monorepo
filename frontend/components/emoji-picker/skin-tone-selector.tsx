"use client";

/**
 * Skin Tone Selector
 * A popup that allows users to select their preferred skin tone for emojis
 */

import { cn } from "@/lib/utils";
import { useCallback, useState } from "react";
import { SKIN_TONE_LABELS, SkinTone } from "./types";

interface SkinToneSelectorProps {
  currentSkinTone: SkinTone;
  onSkinToneSelect: (skinTone: SkinTone) => void;
  className?: string;
}

// Skin tone sample emojis (hand wave with different skin tones)
const SKIN_TONE_EMOJIS: Record<SkinTone, string> = {
  1: "👋",
  2: "👋🏻",
  3: "👋🏼",
  4: "👋🏽",
  5: "👋🏾",
  6: "👋🏿",
};

export function SkinToneSelector({
  currentSkinTone,
  onSkinToneSelect,
  className,
}: SkinToneSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = useCallback(
    (skinTone: SkinTone) => {
      onSkinToneSelect(skinTone);
      setIsOpen(false);
    },
    [onSkinToneSelect]
  );

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, skinTone: SkinTone) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleSelect(skinTone);
      }
    },
    [handleSelect]
  );

  return (
    <div className={cn("relative", className)}>
      {/* Trigger button showing current skin tone */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center justify-center w-8 h-8 rounded hover:bg-muted transition-colors"
        title="Change skin tone"
        aria-label="Change skin tone"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="text-xl leading-none">
          {SKIN_TONE_EMOJIS[currentSkinTone]}
        </span>
      </button>

      {/* Skin tone popup */}
      {isOpen && (
        <>
          {/* Backdrop to close on click outside */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Popup */}
          <div
            className="absolute bottom-full left-0 mb-2 z-50 bg-popover border border-border rounded-lg shadow-lg p-2"
            role="listbox"
            aria-label="Select skin tone"
          >
            <div className="flex gap-1">
              {(Object.keys(SKIN_TONE_EMOJIS) as unknown as SkinTone[]).map(
                (tone) => {
                  const skinTone = Number(tone) as SkinTone;
                  return (
                    <button
                      key={skinTone}
                      type="button"
                      role="option"
                      aria-selected={currentSkinTone === skinTone}
                      onClick={() => handleSelect(skinTone)}
                      onKeyDown={(e) => handleKeyDown(e, skinTone)}
                      className={cn(
                        "flex items-center justify-center w-9 h-9 rounded transition-colors text-2xl",
                        currentSkinTone === skinTone
                          ? "bg-accent ring-2 ring-primary"
                          : "hover:bg-muted"
                      )}
                      title={SKIN_TONE_LABELS[skinTone]}
                    >
                      {SKIN_TONE_EMOJIS[skinTone]}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
