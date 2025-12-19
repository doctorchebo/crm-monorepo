/**
 * Emoji Picker Types
 * Central type definitions for the emoji picker system
 * Designed to be extensible for GIFs, stickers, and reactions
 */

/**
 * Represents a single emoji
 */
export interface Emoji {
  id: string;
  native: string;
  unified: string;
  shortcodes?: string;
  name: string;
  keywords?: string[];
  skin?: number;
}

/**
 * Skin tone options for human emojis
 */
export type SkinTone = 1 | 2 | 3 | 4 | 5 | 6;

export const SKIN_TONE_LABELS: Record<SkinTone, string> = {
  1: "Default",
  2: "Light",
  3: "Medium-Light",
  4: "Medium",
  5: "Medium-Dark",
  6: "Dark",
};

/**
 * Category types for the picker tabs
 * Designed to support future GIF and sticker tabs
 */
export type PickerTab = "emoji" | "gif" | "sticker";

/**
 * Emoji categories as defined by emoji-mart
 */
export type EmojiCategory =
  | "frequent"
  | "people"
  | "nature"
  | "foods"
  | "activity"
  | "places"
  | "objects"
  | "symbols"
  | "flags";

/**
 * Category metadata for rendering
 */
export interface CategoryMeta {
  id: EmojiCategory;
  name: string;
}

export const EMOJI_CATEGORIES: CategoryMeta[] = [
  { id: "frequent", name: "Recently Used" },
  { id: "people", name: "Smileys & People" },
  { id: "nature", name: "Animals & Nature" },
  { id: "foods", name: "Food & Drink" },
  { id: "activity", name: "Activity" },
  { id: "places", name: "Travel & Places" },
  { id: "objects", name: "Objects" },
  { id: "symbols", name: "Symbols" },
  { id: "flags", name: "Flags" },
];

/**
 * Props for the main picker component
 */
export interface EmojiPickerProps {
  onEmojiSelect: (emoji: Emoji) => void;
  onClose?: () => void;
  skinTone?: SkinTone;
  onSkinToneChange?: (skinTone: SkinTone) => void;
}

/**
 * Props for the floating picker wrapper
 * Used for both chat input and reactions
 */
export interface FloatingPickerProps extends EmojiPickerProps {
  isOpen: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  placement?: "top" | "bottom" | "left" | "right";
  offset?: number;
}

/**
 * Props for the compact reaction picker
 * Optimized for showing on message hover
 */
export interface ReactionPickerProps {
  onReactionSelect: (emoji: Emoji) => void;
  onMoreClick?: () => void;
  quickReactions?: string[];
}

/**
 * Storage key for recent emojis and skin tone preference
 */
export const STORAGE_KEYS = {
  RECENT_EMOJIS: "emoji-picker-recent",
  SKIN_TONE: "emoji-picker-skin-tone",
  PICKER_TAB: "emoji-picker-tab",
} as const;

/**
 * Default quick reactions for the reaction picker
 */
export const DEFAULT_QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/**
 * Maximum number of recent emojis to store
 */
export const MAX_RECENT_EMOJIS = 36;

/**
 * Context for sharing picker state across components
 */
export interface EmojiPickerContextValue {
  skinTone: SkinTone;
  setSkinTone: (tone: SkinTone) => void;
  recentEmojis: string[];
  addRecentEmoji: (emoji: string) => void;
}
