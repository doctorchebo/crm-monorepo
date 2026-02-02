/**
 * Chat Events Constants
 *
 * Centralized definition of all chat-related event names.
 * These events are emitted via NestJS EventEmitter2 for loosely-coupled
 * module communication.
 *
 * Usage:
 * - Emit: eventEmitter.emit(CHAT_EVENTS.CHAT_DELETED, { chatId, userId })
 * - Listen: @OnEvent(CHAT_EVENTS.CHAT_DELETED) handleChatDeleted(payload)
 */

export const CHAT_EVENTS = {
  /**
   * Emitted when a chat is permanently deleted.
   * Payload: { chatId: string, userId: number }
   *
   * Listeners should clean up all chat-related data including:
   * - Workflow state (workflowChatState) - handled by DB cascade
   * - Workflow executions (workflowExecutions) - handled by DB cascade
   * - Stage assignments (chatStageAssignments) - handled by DB cascade
   * - Conversation summaries (conversationSummaries) - requires manual cleanup
   * - Rate limit tracking (rateLimitTracking) - requires manual cleanup
   * - AI config overrides (chatAiOverrides) - requires manual cleanup
   */
  CHAT_DELETED: 'chat.deleted',

  /**
   * Emitted when a chat is archived.
   * Payload: { chatId: string, userId: number }
   */
  CHAT_ARCHIVED: 'chat.archived',

  /**
   * Emitted when a chat is unarchived.
   * Payload: { chatId: string, userId: number }
   */
  CHAT_UNARCHIVED: 'chat.unarchived',

  /**
   * Emitted when a new chat is created.
   * Payload: { chatId: string, userId: number, contactPhone: string }
   */
  CHAT_CREATED: 'chat.created',
} as const;

/**
 * Type for chat event payloads
 */
export interface ChatDeletedPayload {
  chatId: string;
  userId: number;
  /** ISO timestamp of when the deletion occurred */
  deletedAt: string;
}

export interface ChatArchivedPayload {
  chatId: string;
  userId: number;
  archivedAt: string;
}

export interface ChatUnarchivedPayload {
  chatId: string;
  userId: number;
  unarchivedAt: string;
}

export interface ChatCreatedPayload {
  chatId: string;
  userId: number;
  contactPhone: string;
  createdAt: string;
}
