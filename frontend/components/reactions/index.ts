// Core components
export { MessageReactionDisplay } from "./message-reaction-display";
export { ReactionTrigger } from "./reaction-trigger";
export { ReactionsDetailsOverlay } from "./reactions-details-overlay";
export { ReactionsSummary } from "./reactions-summary";

// Types and utilities
export type {
  BaseReaction,
  CrmReaction,
  CustomerReaction,
  ReactionGroup,
  ReactorInfo,
  UnifiedReaction,
} from "./types";

export {
  getReactionKey,
  getUniqueEmojis,
  groupReactionsByEmoji,
  isOwnReaction,
  toCrmReaction,
  toCustomerReaction,
} from "./types";
