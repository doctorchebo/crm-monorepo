import { db } from '@database/db.connection';
import { chats, messages } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

/**
 * WhatsApp Cloud API Conversation Window Service
 *
 * Enforces Meta's 24-hour conversation window rules to prevent WABA bans:
 * - Business can only send free-form messages within 24 hours of customer's last message
 * - Outside the 24-hour window, only approved templates can be used to initiate conversations
 *
 * CRITICAL: This service adds safety margins to prevent edge-case violations
 *
 * @see https://developers.facebook.com/docs/whatsapp/conversation-types
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * The official WhatsApp conversation window duration (24 hours)
 */
export const CONVERSATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Safety margin to subtract from the window to avoid edge-case violations
 * We use 5 minutes to account for:
 * - Clock drift between servers
 * - Network latency
 * - Processing delays
 * - Database timestamp precision
 */
export const SAFETY_MARGIN_MS = 5 * 60 * 1000;

/**
 * Effective window duration after safety margin
 */
export const EFFECTIVE_WINDOW_MS = CONVERSATION_WINDOW_MS - SAFETY_MARGIN_MS;

// ============================================================================
// Types
// ============================================================================

export interface ConversationWindowStatus {
  /**
   * Whether we can send free-form messages (within effective window)
   */
  canSendFreeFormMessage: boolean;

  /**
   * Whether we can send approved templates (always true if template is approved)
   */
  canSendApprovedTemplate: boolean;

  /**
   * Timestamp of the last inbound message from the customer
   */
  lastInboundMessageTime: Date | null;

  /**
   * When the conversation window expires (null if no window is open)
   */
  windowExpiresAt: Date | null;

  /**
   * Time remaining in milliseconds (0 if outside window)
   */
  timeRemainingMs: number;

  /**
   * Whether there has ever been an inbound message in this chat
   */
  hasInboundMessage: boolean;

  /**
   * Reason why free-form messaging is blocked (if applicable)
   */
  blockReason?: ConversationWindowBlockReason;
}

export type ConversationWindowBlockReason =
  | 'no_inbound_messages' // Customer has never messaged us
  | 'window_expired' // 24-hour window has expired
  | 'window_expiring_soon'; // Window is about to expire (within safety margin)

export interface ConversationWindowValidationResult {
  isValid: boolean;
  windowStatus: ConversationWindowStatus;
  errorMessage?: string;
  errorCode?: ConversationWindowErrorCode;
}

export type ConversationWindowErrorCode =
  | 'OUTSIDE_CONVERSATION_WINDOW'
  | 'NO_CUSTOMER_MESSAGES'
  | 'TEMPLATE_NOT_APPROVED'
  | 'INVALID_MESSAGE_TYPE';

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class ConversationWindowService {
  private readonly logger = new Logger(ConversationWindowService.name);

  /**
   * Get the conversation window status for a chat
   *
   * @param chatId - The chat ID to check
   * @param referenceTime - Optional reference time (defaults to now)
   * @returns ConversationWindowStatus with window details
   */
  async getWindowStatus(
    chatId: string,
    referenceTime: Date = new Date(),
  ): Promise<ConversationWindowStatus> {
    try {
      // Find the most recent inbound message for this chat
      const lastInbound = await db.query.messages.findFirst({
        where: and(
          eq(messages.chatId, chatId),
          eq(messages.direction, 'inbound'),
        ),
        orderBy: [desc(messages.timestamp)],
      });

      if (!lastInbound) {
        return {
          canSendFreeFormMessage: false,
          canSendApprovedTemplate: true,
          lastInboundMessageTime: null,
          windowExpiresAt: null,
          timeRemainingMs: 0,
          hasInboundMessage: false,
          blockReason: 'no_inbound_messages',
        };
      }

      const lastInboundTime = new Date(lastInbound.timestamp);
      const windowExpiresAt = new Date(
        lastInboundTime.getTime() + CONVERSATION_WINDOW_MS,
      );
      const effectiveExpiresAt = new Date(
        lastInboundTime.getTime() + EFFECTIVE_WINDOW_MS,
      );
      const now = referenceTime.getTime();

      // Calculate time remaining with safety margin
      const timeRemainingMs = Math.max(0, effectiveExpiresAt.getTime() - now);
      const isWithinWindow = timeRemainingMs > 0;

      // Determine block reason if outside window
      let blockReason: ConversationWindowBlockReason | undefined;
      if (!isWithinWindow) {
        const rawTimeRemaining = windowExpiresAt.getTime() - now;
        if (rawTimeRemaining > 0 && rawTimeRemaining <= SAFETY_MARGIN_MS) {
          blockReason = 'window_expiring_soon';
        } else {
          blockReason = 'window_expired';
        }
      }

      return {
        canSendFreeFormMessage: isWithinWindow,
        canSendApprovedTemplate: true,
        lastInboundMessageTime: lastInboundTime,
        windowExpiresAt: isWithinWindow ? effectiveExpiresAt : null,
        timeRemainingMs,
        hasInboundMessage: true,
        blockReason,
      };
    } catch (error) {
      this.logger.error(
        `Error checking conversation window for chat ${chatId}:`,
        error,
      );
      // Fail closed - if we can't verify the window, don't allow free-form messages
      return {
        canSendFreeFormMessage: false,
        canSendApprovedTemplate: true,
        lastInboundMessageTime: null,
        windowExpiresAt: null,
        timeRemainingMs: 0,
        hasInboundMessage: false,
        blockReason: 'no_inbound_messages',
      };
    }
  }

  /**
   * Validate if a free-form message can be sent to a chat
   *
   * @param chatId - The chat ID
   * @returns Validation result with status and error details
   */
  async validateFreeFormMessage(
    chatId: string,
  ): Promise<ConversationWindowValidationResult> {
    const windowStatus = await this.getWindowStatus(chatId);

    if (!windowStatus.hasInboundMessage) {
      return {
        isValid: false,
        windowStatus,
        errorMessage:
          'Cannot send free-form message: Customer has never initiated a conversation. ' +
          'Please use an approved template to start the conversation.',
        errorCode: 'NO_CUSTOMER_MESSAGES',
      };
    }

    if (!windowStatus.canSendFreeFormMessage) {
      const reason =
        windowStatus.blockReason === 'window_expiring_soon'
          ? 'The 24-hour conversation window is about to expire.'
          : 'The 24-hour conversation window has expired.';

      return {
        isValid: false,
        windowStatus,
        errorMessage:
          `Cannot send free-form message: ${reason} ` +
          'Please use an approved template to re-engage the customer.',
        errorCode: 'OUTSIDE_CONVERSATION_WINDOW',
      };
    }

    return {
      isValid: true,
      windowStatus,
    };
  }

  /**
   * Validate if a template message can be sent
   * Templates can always be sent if they are approved, regardless of window status
   *
   * @param chatId - The chat ID
   * @param isTemplateApproved - Whether the template locale is approved
   * @returns Validation result
   */
  async validateTemplateMessage(
    chatId: string,
    isTemplateApproved: boolean,
  ): Promise<ConversationWindowValidationResult> {
    const windowStatus = await this.getWindowStatus(chatId);

    // Inside window - any template can be sent
    if (windowStatus.canSendFreeFormMessage) {
      return {
        isValid: true,
        windowStatus,
      };
    }

    // Outside window - only approved templates can be sent
    if (!isTemplateApproved) {
      return {
        isValid: false,
        windowStatus,
        errorMessage:
          'Cannot send template: Outside 24-hour window and template is not approved. ' +
          'Only approved templates can be used to initiate conversations.',
        errorCode: 'TEMPLATE_NOT_APPROVED',
      };
    }

    return {
      isValid: true,
      windowStatus,
    };
  }

  /**
   * Get window status by recipient phone number and sender ID
   * Useful when chat ID is not readily available
   *
   * @param recipientPhone - The recipient's phone number
   * @param senderId - The sender ID
   * @returns ConversationWindowStatus
   */
  async getWindowStatusByPhone(
    recipientPhone: string,
    senderId: number,
  ): Promise<ConversationWindowStatus> {
    try {
      // Find the chat for this phone/sender combination
      const chat = await db.query.chats.findFirst({
        where: and(
          eq(chats.participantPhone, recipientPhone),
          eq(chats.senderId, senderId),
        ),
      });

      if (!chat) {
        // No chat exists - customer has never been contacted or messaged us
        return {
          canSendFreeFormMessage: false,
          canSendApprovedTemplate: true,
          lastInboundMessageTime: null,
          windowExpiresAt: null,
          timeRemainingMs: 0,
          hasInboundMessage: false,
          blockReason: 'no_inbound_messages',
        };
      }

      return this.getWindowStatus(chat.chatId);
    } catch (error) {
      this.logger.error(
        `Error checking window status for phone ${recipientPhone}:`,
        error,
      );
      // Fail closed
      return {
        canSendFreeFormMessage: false,
        canSendApprovedTemplate: true,
        lastInboundMessageTime: null,
        windowExpiresAt: null,
        timeRemainingMs: 0,
        hasInboundMessage: false,
        blockReason: 'no_inbound_messages',
      };
    }
  }
}
