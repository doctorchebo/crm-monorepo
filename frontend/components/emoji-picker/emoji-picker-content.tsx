"use client";

/**
 * Emoji Picker Component
 * A WhatsApp-style emoji picker with categories, search, and skin tone support
 *
 * Features:
 * - Category tabs with icons (clock for recent, then category icons)
 * - Search bar with semantic search (finds by related words)
 * - Scrollable emoji grid that updates active tab on scroll
 * - Skin tone selector for human emojis
 * - Keyboard navigation support
 *
 * Architecture:
 * - Uses emoji-mart for comprehensive emoji data and search
 * - Designed to be wrapped in a popover/floating component
 * - Can be reused for reactions feature
 */

import { cn } from "@/lib/utils";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { useCallback, useEffect, useState } from "react";
import { useEmojiPickerContextOptional } from "./emoji-picker-context";
import { Emoji, SkinTone } from "./types";

interface EmojiPickerContentProps {
  onEmojiSelect: (emoji: Emoji) => void;
  autoFocus?: boolean;
  className?: string;
  theme?: "light" | "dark" | "auto";
  /** Compact mode for reactions - hides search and some UI */
  compact?: boolean;
  /** Locale for translations - defaults to 'en' */
  locale?: string;
  /** Custom translations object */
  i18n?: EmojiPickerI18n;
}

/**
 * Translations interface for the emoji picker
 */
export interface EmojiPickerI18n {
  search?: string;
  search_no_results_1?: string;
  search_no_results_2?: string;
  pick?: string;
  categories?: {
    frequent?: string;
    people?: string;
    nature?: string;
    foods?: string;
    activity?: string;
    places?: string;
    objects?: string;
    symbols?: string;
    flags?: string;
    search?: string;
  };
  skins?: {
    choose?: string;
    1?: string;
    2?: string;
    3?: string;
    4?: string;
    5?: string;
    6?: string;
  };
}

/**
 * Default English translations
 */
const DEFAULT_I18N: EmojiPickerI18n = {
  search: "Search emoji",
  search_no_results_1: "No emoji found",
  search_no_results_2: "",
  pick: "",
  categories: {
    search: "Search results",
    frequent: "Recently used",
    people: "Smileys & People",
    nature: "Animals & Nature",
    foods: "Food & Drink",
    activity: "Activity",
    places: "Travel & Places",
    objects: "Objects",
    symbols: "Symbols",
    flags: "Flags",
  },
  skins: {
    choose: "Choose skin tone",
    1: "Default",
    2: "Light",
    3: "Medium-Light",
    4: "Medium",
    5: "Medium-Dark",
    6: "Dark",
  },
};

/**
 * Main emoji picker content component
 * Renders the emoji-mart picker with custom styling to match WhatsApp
 */
export function EmojiPickerContent({
  onEmojiSelect,
  autoFocus = true,
  className,
  theme = "auto",
  compact = false,
  locale = "en",
  i18n,
}: EmojiPickerContentProps) {
  const { skinTone, setSkinTone, addRecentEmoji } =
    useEmojiPickerContextOptional();

  // Merge custom i18n with defaults
  const mergedI18n = i18n
    ? {
        ...DEFAULT_I18N,
        ...i18n,
        categories: { ...DEFAULT_I18N.categories, ...i18n.categories },
        skins: { ...DEFAULT_I18N.skins, ...i18n.skins },
      }
    : DEFAULT_I18N;

  // Track if we're in dark mode for theme
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const detectTheme = (): "light" | "dark" => {
      if (theme !== "auto") return theme;

      const htmlElement = document.documentElement;

      // Check for dark class on HTML element (common pattern)
      if (htmlElement.classList.contains("dark")) {
        return "dark";
      }

      // Check for data-theme attribute
      const dataTheme = htmlElement.getAttribute("data-theme");
      if (dataTheme === "dark") {
        return "dark";
      }
      if (dataTheme === "light") {
        return "light";
      }

      // Fall back to system preference
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    };

    // Set initial theme
    setResolvedTheme(detectTheme());

    // Watch for system preference changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const mediaHandler = () => setResolvedTheme(detectTheme());
    mediaQuery.addEventListener("change", mediaHandler);

    // Watch for class changes on HTML element
    const observer = new MutationObserver(() => {
      setResolvedTheme(detectTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => {
      mediaQuery.removeEventListener("change", mediaHandler);
      observer.disconnect();
    };
  }, [theme]);

  const handleSelect = useCallback(
    (emojiData: {
      id: string;
      native: string;
      unified: string;
      shortcodes?: string;
      name: string;
      keywords?: string[];
      skin?: number;
    }) => {
      const emoji: Emoji = {
        id: emojiData.id,
        native: emojiData.native,
        unified: emojiData.unified,
        shortcodes: emojiData.shortcodes,
        name: emojiData.name,
        keywords: emojiData.keywords,
        skin: emojiData.skin,
      };

      // Add to recent emojis
      addRecentEmoji(emoji.native);

      // Call parent handler
      onEmojiSelect(emoji);
    },
    [onEmojiSelect, addRecentEmoji],
  );

  const handleSkinToneChange = useCallback(
    (skin: number) => {
      setSkinTone(skin as SkinTone);
    },
    [setSkinTone],
  );

  return (
    <div
      className={cn(
        "emoji-picker-container",
        compact && "emoji-picker-compact",
        className,
      )}
      style={{ pointerEvents: "auto" }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Picker
        data={data}
        onEmojiSelect={handleSelect}
        theme={resolvedTheme}
        skin={skinTone}
        onSkinToneChange={handleSkinToneChange}
        autoFocus={autoFocus}
        skinTonePosition={compact ? "none" : "search"}
        previewPosition="none"
        searchPosition={compact ? "none" : "sticky"}
        navPosition="top"
        perLine={compact ? 8 : 9}
        maxFrequentRows={compact ? 1 : 4}
        emojiButtonSize={compact ? 32 : 36}
        emojiSize={compact ? 20 : 24}
        set="native"
        locale={locale}
        i18n={mergedI18n}
        icons="outline"
        categories={
          compact
            ? ["frequent", "people", "nature", "foods", "activity"]
            : [
                "frequent",
                "people",
                "nature",
                "foods",
                "activity",
                "places",
                "objects",
                "symbols",
                "flags",
              ]
        }
      />
    </div>
  );
}

/**
 * CSS styles for the emoji picker
 * These override emoji-mart's default styles to match WhatsApp's design
 */
export const emojiPickerStyles = `
  /* Ensure emoji picker container captures all pointer events */
  .emoji-picker-container {
    pointer-events: auto !important;
    position: relative;
    z-index: 1;
  }

  /* Ensure the emoji-mart web component captures events */
  .emoji-picker-container em-emoji-picker {
    --em-rgb-background: var(--background);
    --em-rgb-input: var(--input);
    --em-rgb-color: var(--foreground);
    --em-rgb-accent: var(--primary);
    --border-radius: var(--radius);
    border: 1px solid hsl(var(--border));
    background: hsl(var(--popover));
    color: hsl(var(--popover-foreground));
    pointer-events: auto !important;
    display: block;
  }

  /* Search input */
  .emoji-picker-container em-emoji-picker .search input {
    background: hsl(var(--input));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    color: hsl(var(--foreground));
  }

  .emoji-picker-container em-emoji-picker .search input::placeholder {
    color: hsl(var(--muted-foreground));
  }

  /* Category tabs */
  .emoji-picker-container em-emoji-picker .category-tabs {
    border-bottom: 1px solid hsl(var(--border));
  }

  .emoji-picker-container em-emoji-picker .category-tabs button {
    color: hsl(var(--muted-foreground));
  }

  .emoji-picker-container em-emoji-picker .category-tabs button.selected {
    color: hsl(var(--primary));
    border-bottom-color: hsl(var(--primary));
  }

  /* Emoji buttons */
  .emoji-picker-container em-emoji-picker button.emoji {
    border-radius: calc(var(--radius) - 2px);
  }

  .emoji-picker-container em-emoji-picker button.emoji:hover {
    background: hsl(var(--accent));
  }

  /* Scrollbar styling */
  .emoji-picker-container em-emoji-picker .scroll {
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--muted)) transparent;
  }

  .emoji-picker-container em-emoji-picker .scroll::-webkit-scrollbar {
    width: 6px;
  }

  .emoji-picker-container em-emoji-picker .scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .emoji-picker-container em-emoji-picker .scroll::-webkit-scrollbar-thumb {
    background: hsl(var(--muted));
    border-radius: 3px;
  }

  /* Category labels */
  .emoji-picker-container em-emoji-picker .category-label {
    color: hsl(var(--muted-foreground));
    font-size: 0.75rem;
    font-weight: 500;
  }

  /* Preview section */
  .emoji-picker-container em-emoji-picker .preview {
    border-top: 1px solid hsl(var(--border));
  }

  /* Compact mode adjustments */
  .emoji-picker-container.emoji-picker-compact em-emoji-picker {
    height: 280px;
  }
`;
