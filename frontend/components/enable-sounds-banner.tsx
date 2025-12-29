"use client";

/**
 * EnableSoundsBanner
 *
 * A small banner that appears when notification sounds are blocked by the browser.
 * Clicking it unlocks audio playback for the session.
 *
 * This is necessary because browsers block audio until user interaction.
 * The banner provides a clear, intentional way for users to enable sounds.
 */

import { Button } from "@/components/ui/button";
import { getIsAudioUnlocked, unlockAudioManually } from "@/hooks/use-notification-sound";
import { Volume2, X } from "lucide-react";
import { useEffect, useState } from "react";

export function EnableSoundsBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check periodically if we need to show the banner
    const checkInterval = setInterval(() => {
      // Show banner if:
      // 1. Audio is not unlocked
      // 2. There's a pending notification OR we haven't dismissed yet
      // 3. User hasn't dismissed the banner
      if (!getIsAudioUnlocked() && !dismissed) {
        setShowBanner(true);
      } else if (getIsAudioUnlocked()) {
        setShowBanner(false);
      }
    }, 1000);

    // Initial check
    if (!getIsAudioUnlocked() && !dismissed) {
      // Small delay to avoid flash on page load
      const timeout = setTimeout(() => {
        if (!getIsAudioUnlocked()) {
          setShowBanner(true);
        }
      }, 2000);
      return () => {
        clearTimeout(timeout);
        clearInterval(checkInterval);
      };
    }

    return () => clearInterval(checkInterval);
  }, [dismissed]);

  const handleEnableSounds = async () => {
    const success = await unlockAudioManually();
    if (success) {
      setShowBanner(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShowBanner(false);
  };

  if (!showBanner) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 bg-primary text-primary-foreground px-4 py-3 rounded-lg shadow-lg max-w-sm">
        <Volume2 className="h-5 w-5 flex-shrink-0" />
        <div className="flex-1 text-sm">
          <p className="font-medium">Enable notification sounds?</p>
          <p className="text-primary-foreground/80 text-xs">
            Click to hear sounds for new messages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleEnableSounds}
            className="h-8"
          >
            Enable
          </Button>
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-primary-foreground/10 rounded"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
