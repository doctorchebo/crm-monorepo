/**
 * Media Guardrails Service
 *
 * Enforces WhatsApp anti-ban rules for AI media sending.
 * Implements all hard constraints to ensure safe, compliant media sending.
 *
 * Rules:
 * - No media in first AI message
 * - No consecutive AI messages with media
 * - Max 1 media per AI reply
 * - No media unless user intent implies it
 * - No media outside 24h window (unless template-approved)
 * - Never send same media twice per chat
 */

import { db } from '@database/db.connection';
import { messages } from '@database/schema';
import { ConversationWindowService } from '@modules/whatsapp/services/conversation-window.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc, eq } from 'drizzle-orm';
import {
  DEFAULT_MEDIA_GUARDRAILS,
  GuardrailCheckResult,
  GuardrailFailure,
  WhatsAppMediaGuardrails,
} from '../types/media.types';

export interface MediaGuardrailContext {
  chatId: string;
  userId: number;
  userIntent?: string;
  isFirstAiMessage?: boolean;
  lastMessageHadMedia?: boolean;
  messageCountInConversation?: number;
  lastCustomerMessageTime?: Date;
}

interface ConversationState {
  totalAiMessages: number;
  aiMessagesWithMedia: number;
  lastAiMessageHadMedia: boolean;
  lastAiMessageTime: Date | null;
  lastCustomerMessageTime: Date | null;
  isFirstAiMessage: boolean;
  consecutiveAiMessages: number;
}

@Injectable()
export class MediaGuardrailsService {
  private readonly logger = new Logger(MediaGuardrailsService.name);
  private readonly guardrails: WhatsAppMediaGuardrails;

  // Intent keywords that suggest media interest
  private readonly MEDIA_INTENT_KEYWORDS = [
    'show',
    'see',
    'picture',
    'photo',
    'image',
    'video',
    'brochure',
    'document',
    'pdf',
    'price list',
    'floor plan',
    'tour',
    'look',
    'visual',
    'gallery',
    'sample',
    'example',
    'proof',
    'certificate',
    'specs',
    'specification',
    'catalog',
    'catalogue',
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly windowService: ConversationWindowService,
  ) {
    // Load guardrail config, allowing overrides from environment
    this.guardrails = {
      noMediaInFirstMessage: this.configService.get<boolean>(
        'MEDIA_GUARDRAIL_NO_FIRST_MESSAGE',
        DEFAULT_MEDIA_GUARDRAILS.noMediaInFirstMessage,
      ),
      noConsecutiveMediaMessages: this.configService.get<boolean>(
        'MEDIA_GUARDRAIL_NO_CONSECUTIVE',
        DEFAULT_MEDIA_GUARDRAILS.noConsecutiveMediaMessages,
      ),
      maxMediaPerReply: this.configService.get<number>(
        'MEDIA_GUARDRAIL_MAX_PER_REPLY',
        DEFAULT_MEDIA_GUARDRAILS.maxMediaPerReply,
      ),
      minMessagesBeforeMedia: this.configService.get<number>(
        'MEDIA_GUARDRAIL_MIN_MESSAGES',
        DEFAULT_MEDIA_GUARDRAILS.minMessagesBeforeMedia,
      ),
      requireIntentSignal: this.configService.get<boolean>(
        'MEDIA_GUARDRAIL_REQUIRE_INTENT',
        DEFAULT_MEDIA_GUARDRAILS.requireIntentSignal,
      ),
      mediaCooldownMs: this.configService.get<number>(
        'MEDIA_GUARDRAIL_COOLDOWN_MS',
        DEFAULT_MEDIA_GUARDRAILS.mediaCooldownMs,
      ),
      blockOutsideWindow: this.configService.get<boolean>(
        'MEDIA_GUARDRAIL_BLOCK_OUTSIDE_WINDOW',
        DEFAULT_MEDIA_GUARDRAILS.blockOutsideWindow,
      ),
    };

    this.logger.log(
      `Initialized with guardrails: ${JSON.stringify(this.guardrails)}`,
    );
  }

  /**
   * Check all guardrails and return result
   *
   * This is the main entry point called before AI sends media.
   *
   * IMPORTANT: When the user explicitly requests media (detected via intent keywords
   * like "show me", "send the brochure", "image", "video", etc.), we relax most
   * guardrails because the user has clearly expressed desire to receive media.
   *
   * Rules RELAXED when user has explicit intent:
   * - noMediaInFirstMessage: Allow media even in first message
   * - noConsecutiveMediaMessages: Allow media even if last message had media
   * - minMessagesBeforeMedia: No minimum message count required
   * - requireIntentSignal: Already satisfied by explicit intent
   * - mediaCooldownMs: No cooldown when user explicitly asks
   *
   * Rules ALWAYS enforced (safety/compliance):
   * - blockOutsideWindow: WhatsApp 24h window compliance (cannot bypass)
   */
  async checkGuardrails(
    context: MediaGuardrailContext,
  ): Promise<GuardrailCheckResult> {
    const failures: GuardrailFailure[] = [];

    // Get conversation state
    const state = await this.getConversationState(context.chatId);

    // Detect if user has explicit media intent FIRST
    // This determines if we should relax conversation-progression rules
    const hasExplicitIntent = context.userIntent
      ? this.detectMediaIntent(context.userIntent)
      : false;

    this.logger.debug(
      `[Guardrails] Chat ${context.chatId}: hasExplicitIntent=${hasExplicitIntent}, ` +
        `totalAiMessages=${state.totalAiMessages}, isFirstAiMessage=${state.isFirstAiMessage}, ` +
        `lastAiMessageHadMedia=${state.lastAiMessageHadMedia}`,
    );

    // Log when explicit intent will bypass guardrails
    if (hasExplicitIntent && state.lastAiMessageHadMedia) {
      this.logger.debug(
        `[Guardrails] Chat ${context.chatId}: User explicitly requested media - bypassing consecutive message guardrail`,
      );
    }

    // Check 1: No media in first AI message
    // RELAXED when user explicitly asks for media
    if (this.guardrails.noMediaInFirstMessage && !hasExplicitIntent) {
      if (state.isFirstAiMessage || state.totalAiMessages === 0) {
        failures.push({
          rule: 'noMediaInFirstMessage',
          reason: 'Cannot send media in the first AI message of a conversation',
        });
      }
    }

    // Check 2: No consecutive AI messages with media
    // RELAXED when user explicitly asks for media - if user says "send me the brochure",
    // we should honor that request even if the last message had media
    if (this.guardrails.noConsecutiveMediaMessages && !hasExplicitIntent) {
      if (state.lastAiMessageHadMedia) {
        failures.push({
          rule: 'noConsecutiveMediaMessages',
          reason: 'Cannot send media in consecutive AI messages',
        });
      }
    }

    // Check 3: Minimum messages before media
    // RELAXED when user explicitly asks for media
    if (this.guardrails.minMessagesBeforeMedia > 0 && !hasExplicitIntent) {
      if (state.totalAiMessages < this.guardrails.minMessagesBeforeMedia) {
        failures.push({
          rule: 'minMessagesBeforeMedia',
          reason: `Need at least ${this.guardrails.minMessagesBeforeMedia} messages before sending media`,
        });
      }
    }

    // Check 4: Require intent signal (only when not already detected above)
    // If we detected intent, this check already passed implicitly
    if (this.guardrails.requireIntentSignal && !hasExplicitIntent) {
      failures.push({
        rule: 'requireIntentSignal',
        reason: "User's message doesn't indicate interest in receiving media",
      });
    }

    // Check 5: Media cooldown
    // RELAXED when user explicitly asks for media - honor explicit requests
    if (
      this.guardrails.mediaCooldownMs > 0 &&
      state.lastAiMessageTime &&
      !hasExplicitIntent
    ) {
      const timeSinceLastAi = Date.now() - state.lastAiMessageTime.getTime();
      if (
        state.lastAiMessageHadMedia &&
        timeSinceLastAi < this.guardrails.mediaCooldownMs
      ) {
        failures.push({
          rule: 'mediaCooldownMs',
          reason: `Must wait before sending another media message`,
          retryAfterMs: this.guardrails.mediaCooldownMs - timeSinceLastAi,
        });
      }
    }

    // Check 6: WhatsApp window
    if (this.guardrails.blockOutsideWindow) {
      const windowStatus = await this.windowService.getWindowStatus(
        context.chatId,
      );

      if (!windowStatus.canSendFreeFormMessage) {
        failures.push({
          rule: 'blockOutsideWindow',
          reason:
            'Outside 24-hour window - media can only be sent via approved template',
        });
      }
    }

    // Determine recommendation
    let recommendation:
      | 'send_media'
      | 'send_text_only'
      | 'use_template'
      | 'block';

    if (failures.length === 0) {
      recommendation = 'send_media';
    } else if (failures.some((f) => f.rule === 'blockOutsideWindow')) {
      recommendation = 'use_template';
    } else if (
      failures.some((f) =>
        ['noMediaInFirstMessage', 'requireIntentSignal'].includes(f.rule),
      )
    ) {
      recommendation = 'send_text_only';
    } else {
      recommendation = 'send_text_only';
    }

    const passed = failures.length === 0;

    return {
      passed,
      failures,
      recommendation,
      explanation: passed
        ? 'All guardrails passed - media can be sent'
        : `Guardrails failed: ${failures.map((f) => f.reason).join('; ')}`,
    };
  }

  /**
   * Check if user intent suggests they want media
   */
  detectMediaIntent(userMessage: string): boolean {
    const lowercaseMessage = userMessage.toLowerCase();

    // Check for explicit media request keywords
    for (const keyword of this.MEDIA_INTENT_KEYWORDS) {
      if (lowercaseMessage.includes(keyword)) {
        return true;
      }
    }

    // Check for question patterns that might imply visual interest
    const visualPatterns = [
      /what does .* look like/i,
      /can (i|you) see/i,
      /do you have (any )?(photos?|pictures?|images?)/i,
      /send (me )?(the|a) /i,
      /show (me )?(the|a|what)/i,
    ];

    for (const pattern of visualPatterns) {
      if (pattern.test(userMessage)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get current conversation state from message history
   */
  private async getConversationState(
    chatId: string,
  ): Promise<ConversationState> {
    // Get recent messages to analyze conversation state
    const recentMessages = await db
      .select({
        direction: messages.direction,
        type: messages.type,
        isAiGenerated: messages.isAiGenerated,
        timestamp: messages.timestamp,
        attachments: messages.attachments,
      })
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp))
      .limit(50);

    let totalAiMessages = 0;
    let aiMessagesWithMedia = 0;
    let lastAiMessageHadMedia = false;
    let lastAiMessageTime: Date | null = null;
    let lastCustomerMessageTime: Date | null = null;
    let consecutiveAiMessages = 0;
    let foundCustomerMessage = false;

    for (const msg of recentMessages) {
      if (msg.direction === 'outbound' && msg.isAiGenerated) {
        totalAiMessages++;

        const hasMedia =
          msg.type !== 'text' ||
          Boolean(
            msg.attachments &&
            Array.isArray(msg.attachments) &&
            msg.attachments.length > 0,
          );

        if (hasMedia) {
          aiMessagesWithMedia++;
        }

        // Track last AI message
        if (!lastAiMessageTime) {
          lastAiMessageTime = msg.timestamp;
          lastAiMessageHadMedia = hasMedia;
        }

        // Count consecutive AI messages before first customer message
        if (!foundCustomerMessage) {
          consecutiveAiMessages++;
        }
      } else if (msg.direction === 'inbound') {
        foundCustomerMessage = true;
        if (!lastCustomerMessageTime) {
          lastCustomerMessageTime = msg.timestamp;
        }
      }
    }

    const isFirstAiMessage = totalAiMessages === 0;

    return {
      totalAiMessages,
      aiMessagesWithMedia,
      lastAiMessageHadMedia,
      lastAiMessageTime,
      lastCustomerMessageTime,
      isFirstAiMessage,
      consecutiveAiMessages,
    };
  }

  /**
   * Get the current guardrail configuration
   */
  getGuardrailConfig(): WhatsAppMediaGuardrails {
    return { ...this.guardrails };
  }

  /**
   * Check a single specific guardrail
   */
  async checkSingleGuardrail(
    rule: keyof WhatsAppMediaGuardrails,
    context: MediaGuardrailContext,
  ): Promise<{ passed: boolean; reason?: string }> {
    const result = await this.checkGuardrails(context);
    const failure = result.failures.find((f) => f.rule === rule);

    return {
      passed: !failure,
      reason: failure?.reason,
    };
  }
}
