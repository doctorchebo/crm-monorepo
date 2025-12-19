/**
 * Emoji Picker Module
 *
 * A comprehensive emoji picker system for WhatsApp-style messaging
 *
 * ## Features
 * - Full emoji picker with categories and search
 * - Skin tone selection for human emojis
 * - Recent emojis tracking
 * - Reaction picker for message reactions
 * - Extensible architecture for GIFs and stickers
 *
 * ## Components
 *
 * ### EmojiPickerButton
 * The main entry point for adding emojis to messages.
 * Place this in your message input area.
 *
 * ```tsx
 * import { EmojiPickerButton } from "@/components/emoji-picker";
 *
 * <EmojiPickerButton
 *   onEmojiSelect={(emoji) => {
 *     // Insert emoji.native into your input
 *   }}
 * />
 * ```
 *
 * ### ReactionPicker
 * Compact picker for message reactions (future use).
 *
 * ```tsx
 * import { ReactionPicker } from "@/components/emoji-picker";
 *
 * <ReactionPicker
 *   onReactionSelect={(emoji) => {
 *     // Handle reaction
 *   }}
 * />
 * ```
 *
 * ### EmojiPickerProvider
 * Context provider for sharing skin tone and recent emojis.
 * Wrap your app or chat section with this provider.
 *
 * ```tsx
 * import { EmojiPickerProvider } from "@/components/emoji-picker";
 *
 * <EmojiPickerProvider>
 *   <YourChatComponent />
 * </EmojiPickerProvider>
 * ```
 *
 * ## Architecture
 *
 * The emoji picker is built with extensibility in mind:
 * - `types.ts` - Central type definitions
 * - `emoji-picker-context.tsx` - Shared state management
 * - `emoji-picker-content.tsx` - Core picker using emoji-mart
 * - `floating-emoji-picker.tsx` - Positioned popover wrapper
 * - `emoji-picker-button.tsx` - Button + popover integration
 * - `reaction-picker.tsx` - Quick reactions bar
 * - `content-picker-tabs.tsx` - Multi-tab picker (emoji/gif/sticker)
 * - `skin-tone-selector.tsx` - Skin tone popup
 */

// Main components
export { ContentPickerTabs } from "./content-picker-tabs";
export { EmojiPickerButton } from "./emoji-picker-button";
export {
  EmojiPickerContent,
  emojiPickerStyles,
  type EmojiPickerI18n,
} from "./emoji-picker-content";
export { FloatingEmojiPicker } from "./floating-emoji-picker";
export { ReactionPicker } from "./reaction-picker";
export { SkinToneSelector } from "./skin-tone-selector";

// Context
export {
  EmojiPickerProvider,
  useEmojiPickerContext,
  useEmojiPickerContextOptional,
} from "./emoji-picker-context";

// Types
export type {
  Emoji,
  EmojiCategory,
  EmojiPickerContextValue,
  EmojiPickerProps,
  FloatingPickerProps,
  PickerTab,
  ReactionPickerProps,
  SkinTone,
} from "./types";

export {
  DEFAULT_QUICK_REACTIONS,
  EMOJI_CATEGORIES,
  MAX_RECENT_EMOJIS,
  SKIN_TONE_LABELS,
  STORAGE_KEYS,
} from "./types";
