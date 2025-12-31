/**
 * Unified Reaction Types
 *
 * These types provide a consistent interface for handling reactions
 * from both CRM users (agents/admins) and WhatsApp customers.
 */

/**
 * Base reaction data common to all reaction sources
 */
export interface BaseReaction {
  emoji: string;
  timestamp: string;
}

/**
 * Reaction from a CRM user (agent/admin)
 */
export interface CrmReaction extends BaseReaction {
  type: "crm";
  id: number;
  messageId: string;
  userId: number;
  userName?: string;
}

/**
 * Reaction from a WhatsApp customer
 */
export interface CustomerReaction extends BaseReaction {
  type: "customer";
  messageId: string;
  senderPhone: string;
  senderName?: string;
}

/**
 * Union type for any reaction
 */
export type UnifiedReaction = CrmReaction | CustomerReaction;

/**
 * Aggregated reaction info for display
 */
export interface ReactionGroup {
  emoji: string;
  count: number;
  reactions: UnifiedReaction[];
}

/**
 * Props for identifying a reactor
 */
export interface ReactorInfo {
  id: string; // unique identifier
  name: string;
  emoji: string;
  isCurrentUser: boolean;
  avatarUrl?: string;
  type: "crm" | "customer";
}

/**
 * Helper to create a unique key for a reaction
 */
export function getReactionKey(reaction: UnifiedReaction): string {
  if (reaction.type === "crm") {
    return `crm-${reaction.userId}`;
  }
  return `customer-${reaction.senderPhone}`;
}

/**
 * Helper to check if current user owns the reaction
 */
export function isOwnReaction(
  reaction: UnifiedReaction,
  currentUserId?: number
): boolean {
  if (reaction.type === "crm" && currentUserId) {
    return reaction.userId === currentUserId;
  }
  return false;
}

/**
 * Aggregate reactions by emoji
 */
export function groupReactionsByEmoji(
  reactions: UnifiedReaction[]
): ReactionGroup[] {
  const groups = new Map<string, UnifiedReaction[]>();

  for (const reaction of reactions) {
    const existing = groups.get(reaction.emoji) || [];
    existing.push(reaction);
    groups.set(reaction.emoji, existing);
  }

  return Array.from(groups.entries()).map(([emoji, groupReactions]) => ({
    emoji,
    count: groupReactions.length,
    reactions: groupReactions,
  }));
}

/**
 * Get all unique emojis from reactions
 */
export function getUniqueEmojis(reactions: UnifiedReaction[]): string[] {
  return [...new Set(reactions.map((r) => r.emoji))];
}

/**
 * Convert legacy MessageReaction to UnifiedReaction
 */
export function toCrmReaction(reaction: {
  id: number;
  messageId: string;
  userId: number;
  emoji: string;
  userName?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}): CrmReaction {
  return {
    type: "crm",
    id: reaction.id,
    messageId: reaction.messageId,
    userId: reaction.userId,
    emoji: reaction.emoji,
    userName: reaction.userName,
    timestamp:
      reaction.updatedAt || reaction.createdAt || new Date().toISOString(),
  };
}

/**
 * Convert customer reaction data to UnifiedReaction
 */
export function toCustomerReaction(
  reaction: {
    messageId: string;
    emoji: string;
    senderPhone: string;
    timestamp?: string;
  },
  senderName?: string
): CustomerReaction {
  return {
    type: "customer",
    messageId: reaction.messageId,
    emoji: reaction.emoji,
    senderPhone: reaction.senderPhone,
    senderName,
    timestamp: reaction.timestamp || new Date().toISOString(),
  };
}
