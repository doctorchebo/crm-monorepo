/**
 * AI Chatbot Service
 *
 * Main orchestrator for goal-based AI responses.
 *
 * Simplified processMessage flow:
 * 1. Skip outbound messages
 * 2. Check handoff keywords → auto-handoff
 * 3. Check canAISend → rate limit auto-pause
 * 4. Acquire chat lock
 * 5. Generate AI response (KB retrieval, prompt building, LLM call)
 * 6. Extract & update customer profile (async, non-blocking)
 * 7. Release lock
 * 8. Return result
 *
 * Profile extraction:
 * - Automatically extracts customer info (name, email, phone, preferences)
 * - Updates contact profile with extracted data
 * - Saves additional phone numbers as attributes (never replaces existing)
 * - Updates chat participant name when customer introduces themselves
 */

import { db } from '@database/db.connection';
import { chats, messages } from '@database/schema';
import { InteractiveMessageService } from '@modules/ai-reply/services';
import { AIReplyInteractiveData } from '@modules/ai-reply/types';
import { ChatLockService } from '@modules/chats/services/chat-lock.service';
import { RetrievalService } from '@modules/knowledge-base/services';
import { MediaOrchestratorService } from '@modules/knowledge-base/services/media-orchestrator.service';
import { WhatsAppGateway } from '@modules/whatsapp/whatsapp.gateway';
import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { desc, eq } from 'drizzle-orm';

// Type-only import to avoid circular dependency at module load time
import type { WhatsAppService } from '@modules/whatsapp/whatsapp.service';

// AI infrastructure services (now local to this module)
import { AiConfigurationService } from './ai-configuration.service';
import { AiProfileUpdateService } from './ai-profile-update.service';
import { AiResumptionContextService } from './ai-resumption-context.service';
import { CustomerProfileExtractionService } from './customer-profile-extraction.service';
import { HandoffService } from './handoff.service';
import { LLMService } from './llm.service';
import { RateLimiterService } from './rate-limiter.service';

// Local services & types
import type {
  AiResponseResult,
  AiStatusResult,
  ChatMessageInput,
  ChatMessageResult,
  GoalType,
  MediaContext,
} from '../types/ai-chatbot.types';
import {
  buildConversationContextForRetrieval,
  checkHandoffRequest,
  getContactLanguage,
  getWhatsAppMediaType,
} from '../utils/ai-chatbot.utils';
import { GoalPromptBuilderService } from './goal-prompt-builder.service';

@Injectable()
export class AiChatbotService implements OnModuleInit {
  private readonly logger = new Logger(AiChatbotService.name);

  // Lazily resolved to break circular dependency
  private whatsappService: WhatsAppService | undefined;

  constructor(
    private readonly handoffService: HandoffService,
    private readonly rateLimiter: RateLimiterService,
    private readonly aiConfigService: AiConfigurationService,
    private readonly aiContextService: AiResumptionContextService,
    private readonly llmService: LLMService,
    private readonly retrievalService: RetrievalService,
    private readonly goalPromptBuilder: GoalPromptBuilderService,
    private readonly profileExtractionService: CustomerProfileExtractionService,
    private readonly profileUpdateService: AiProfileUpdateService,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly chatLockService?: ChatLockService,
    @Optional() private readonly whatsappGateway?: WhatsAppGateway,
    @Optional()
    private readonly mediaOrchestratorService?: MediaOrchestratorService,
    @Optional()
    private readonly interactiveMessageService?: InteractiveMessageService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('AI Chatbot Service initialized');

    // Lazily resolve WhatsAppService to break circular dependency
    try {
      const { WhatsAppService } =
        await import('../../whatsapp/whatsapp.service.js');
      this.whatsappService = this.moduleRef.get(WhatsAppService, {
        strict: false,
      });
      this.logger.log(
        `WhatsAppService: ${this.whatsappService ? 'AVAILABLE' : 'NOT RESOLVED'}`,
      );
    } catch {
      this.logger.warn(
        'Failed to resolve WhatsAppService lazily - expected in test environments',
      );
    }
  }

  // ============================================================================
  // Main Entry Point
  // ============================================================================

  /**
   * Process an incoming message and generate an AI response if appropriate.
   */
  async processMessage(input: ChatMessageInput): Promise<ChatMessageResult> {
    const { chatId, messageContent, userId, isFromCustomer } = input;

    try {
      // Only process customer messages
      if (!isFromCustomer) {
        return { success: true };
      }

      // Step 1: Check for explicit handoff request (keyword-based)
      if (checkHandoffRequest(messageContent)) {
        await this.handoffService.requestHandoff(userId, {
          chatId,
          reason: 'Customer requested to speak with a human',
          messageId: input.messageId,
        });

        return {
          success: true,
          handoffRequested: true,
          aiResponse: {
            content: 'Un momento, te comunico con un agente.',
            confidence: 1.0,
            shouldSend: true,
            requiresHandoff: true,
          },
        };
      }

      // Step 2: Check if AI can send messages
      const canAIResult = await this.handoffService.canAISend(chatId);

      if (!canAIResult.canSend) {
        this.logger.log(
          `[AI Check] Chat ${chatId}: blocked - ${canAIResult.reason}`,
        );

        // Auto-pause on rate limit
        if (canAIResult.isRateLimited) {
          this.logger.warn(
            `[Rate Limit] Exceeded for chat ${chatId}. Auto-pausing AI.`,
          );
          await this.handoffService.pauseAI(chatId, userId);

          this.whatsappGateway?.emitAIRateLimitExceeded({
            chatId,
            currentCount: canAIResult.rateLimitCurrentCount || 0,
            maxCount: canAIResult.rateLimitMaxCount || 0,
            resetTime: canAIResult.rateLimitReset,
          });
        }

        return { success: true };
      }

      // Step 3: Acquire chat lock (prevents concurrent AI + human actions)
      let lockAcquired = false;
      if (this.chatLockService) {
        const lockResult = await this.chatLockService.acquireLock(
          chatId,
          userId,
          'ai',
          'AI processing incoming message',
        );

        if (!lockResult.success) {
          this.logger.warn(
            `[AI Safety] Chat ${chatId} is locked by ${lockResult.currentHolder?.lockType ?? 'unknown'}. AI yielding.`,
          );
          return { success: true };
        }
        lockAcquired = true;
      }

      try {
        // Emit typing indicator
        this.whatsappGateway?.emitAITypingStart(chatId);

        // Step 4: Generate the AI response
        const aiResponse = await this.generateResponse(input);

        // Step 5: Extract and update customer profile (async, non-blocking)
        // This happens in the background after the response is generated
        this.extractAndUpdateProfile(input).catch((error) => {
          this.logger.warn(
            `[Profile Extraction] Non-critical error for chat ${chatId}: ${error.message}`,
          );
        });

        return {
          success: true,
          aiResponse,
        };
      } finally {
        // Step 6: Always release the lock
        if (lockAcquired && this.chatLockService) {
          await this.chatLockService.releaseLock(chatId, userId);
        }
      }
    } catch (error) {
      this.logger.error(`Error processing message for chat ${chatId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // AI Response Generation (private)
  // ============================================================================

  /**
   * Generate a full AI response including text, media, and interactive CTAs.
   */
  private async generateResponse(
    input: ChatMessageInput,
  ): Promise<AiResponseResult> {
    const { chatId, messageContent, userId } = input;

    // 1. Load conversation history
    const recentMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp))
      .limit(10);

    // 2. Get customer info
    const chat = await db.query.chats.findFirst({
      where: eq(chats.chatId, chatId),
    });
    const customerName = chat?.participantName || null;

    // 3. Load AI config (includes goalType, tone, style, etc.)
    const userConfig = await this.aiConfigService.getUserConfiguration(userId);
    const chatOverride = await this.aiConfigService.getChatOverride(chatId);

    // Goal type priority: chat override > user config > default
    const goalType =
      chatOverride?.goalType || userConfig.goalType || 'answer_faq';
    const goalDescription =
      chatOverride?.goalDescription || userConfig.goalDescription || null;
    const tone = chatOverride?.tone || userConfig.defaultTone || 'friendly';
    const style = chatOverride?.style || userConfig.defaultStyle || 'concise';
    const formalityLevel =
      chatOverride?.formalityLevel || userConfig.formalityLevel || 'balanced';
    const languagePreference =
      chatOverride?.languagePreference || userConfig.languagePreference;
    const maxResponseLength =
      chatOverride?.maxResponseLength || userConfig.maxResponseLength || 500;
    const customInstructions = chatOverride?.customInstructions || null;
    const avoidTopics =
      this.parseJsonArray(chatOverride?.avoidTopics) ||
      this.parseJsonArray(userConfig.avoidTopics) ||
      [];
    const temperature = (userConfig.temperature || 70) / 100; // Convert 0-100 to 0.0-1.0

    // 3.5 Load conversation context (for efficient context-aware responses)
    let conversationContextPrompt = '';
    try {
      const conversationContext =
        await this.aiContextService.getContext(chatId);
      if (conversationContext) {
        conversationContextPrompt =
          this.aiContextService.formatContextForPrompt(conversationContext);
        this.logger.log(
          `[Context] Loaded conversation context for chat ${chatId} (${conversationContext.keyFacts.length} facts, sentiment: ${conversationContext.customerSentiment})`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `[Context] Failed to load conversation context: ${(error as Error).message}`,
      );
    }

    // 4. Build conversation context for KB retrieval
    const conversationContext =
      buildConversationContextForRetrieval(recentMessages);

    // 5. Retrieve knowledge base context
    let knowledgeContext = '';
    let hasKnowledgeBase = false;

    try {
      const kbResponse = await this.retrievalService.retrieveByObject(
        userId,
        messageContent,
        {
          topK: 5,
          minSimilarity: 0.15,
          conversationContext,
        },
      );

      if (kbResponse.results.length > 0) {
        hasKnowledgeBase = true;
        this.logger.log(
          `[KB] Found ${kbResponse.results.length} results for: "${messageContent.substring(0, 50)}..."`,
        );

        const kbParts = kbResponse.results.map(
          (r) => `### ${r.templateName}: ${r.objectName}\n${r.content}`,
        );

        knowledgeContext = `
==========================================================================
KNOWLEDGE BASE DATA - USE THIS INFORMATION TO ANSWER THE CUSTOMER
==========================================================================

${kbParts.join('\n\n---\n\n')}

==========================================================================
END OF KNOWLEDGE BASE DATA
==========================================================================`;
      }
    } catch (error) {
      this.logger.warn(
        `[KB] Failed to retrieve context: ${(error as Error).message}`,
      );
    }

    // 6. Pre-check media availability
    let mediaPreCheck: MediaContext | undefined;
    const aiMessageCount = recentMessages.filter(
      (m) => m.direction === 'outbound' && m.isAiGenerated === true,
    ).length;
    const lastOutboundMsg = recentMessages.find(
      (m) => m.direction === 'outbound' && m.isAiGenerated === true,
    );
    const lastMessageHadMedia = Boolean(
      lastOutboundMsg?.type && lastOutboundMsg.type !== 'text',
    );
    const recentConversation = recentMessages
      .slice(-5)
      .reverse()
      .map(
        (m) =>
          `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.text || '[media]'}`,
      )
      .join('\n');
    const contactLanguage = await getContactLanguage(chatId);

    if (this.mediaOrchestratorService) {
      try {
        const preCheckResult =
          await this.mediaOrchestratorService.preCheckMediaAvailability({
            query: messageContent,
            chatId,
            userId,
            isFirstAiMessage: aiMessageCount === 0,
            lastMessageHadMedia,
            aiMessageCount,
            conversationContext: recentConversation,
            chatLanguage: contactLanguage || undefined,
          });

        if (preCheckResult.willHaveMedia) {
          mediaPreCheck = {
            willHaveMedia: true,
            mediaDescription: preCheckResult.mediaDescription,
            mediaType: preCheckResult.mediaType,
            mediaFileName: preCheckResult.mediaFileName,
            aiInstructions: preCheckResult.aiInstructions,
          };
        }
      } catch (error) {
        this.logger.warn(
          `[Media Pre-check] Error (non-critical): ${(error as Error).message}`,
        );
      }
    }

    // 7. Build system prompt using goal-based builder
    const systemPrompt = await this.goalPromptBuilder.buildPrompt({
      goalType: goalType as GoalType,
      goalDescription,
      tone,
      style,
      formalityLevel,
      languagePreference,
      maxResponseLength,
      customInstructions,
      avoidTopics,
      knowledgeContext,
      hasKnowledgeBase,
      mediaContext: mediaPreCheck,
      customerName,
      conversationContext: conversationContextPrompt || undefined,
    });

    // 8. Build message array and call LLM
    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...recentMessages.reverse().map((msg) => ({
        role: (msg.direction === 'outbound' ? 'assistant' : 'user') as
          | 'assistant'
          | 'user',
        content: msg.text || '',
      })),
      { role: 'user' as const, content: messageContent },
    ];

    const llmResponse = await this.llmService.chat({
      userId,
      chatId,
      operationType: 'chat',
      messages: chatMessages,
      maxTokens: 512,
      temperature,
    });

    const responseText = llmResponse.content;
    this.logger.log(`[LLM] Response: "${responseText.substring(0, 100)}..."`);

    // 9. Select media attachment (if pre-check indicated availability)
    let mediaAttachment: AiResponseResult['mediaAttachment'];

    if (this.mediaOrchestratorService && mediaPreCheck?.willHaveMedia) {
      try {
        const mediaResult =
          await this.mediaOrchestratorService.selectMediaForReply({
            query: messageContent,
            chatId,
            userId,
            messageId: input.messageId,
            isFirstAiMessage: aiMessageCount === 0,
            lastMessageHadMedia,
            aiMessageCount,
            conversationContext: recentConversation,
            chatLanguage: contactLanguage || undefined,
          });

        if (mediaResult.shouldSendMedia && mediaResult.selectedMedia) {
          const media = mediaResult.selectedMedia;
          mediaAttachment = {
            mediaId: media.mediaId,
            objectId: media.objectId,
            objectName: media.objectName,
            s3Key: media.s3Key,
            s3Bucket: media.s3Bucket,
            fileName: media.fileName,
            mimeType: media.mimeType,
            caption: media.caption,
            mediaType: getWhatsAppMediaType(media.mimeType),
          };
        }
      } catch (error) {
        this.logger.warn(
          `[Media Selection] Error (non-critical): ${(error as Error).message}`,
        );
      }
    }

    // 10. Generate interactive CTAs
    let interactiveData: AIReplyInteractiveData | undefined;

    if (this.interactiveMessageService) {
      try {
        const lastInbound = recentMessages.find(
          (m) => m.direction === 'inbound',
        );

        const ctaResult =
          await this.interactiveMessageService.generateInteractiveCTAs({
            chatId,
            userId,
            conversationContext: recentConversation,
            maxCTAs: 3,
            includeMediaCTAs: true,
            aiResponseText: responseText,
            customerMessage: lastInbound?.text ?? undefined,
            hasMediaAttachment: !!mediaAttachment,
            mediaType: mediaAttachment?.mediaType,
            businessContext: 'real estate',
          });

        if (
          ctaResult.format !== 'none' &&
          ctaResult.buttons &&
          ctaResult.buttons.length > 0
        ) {
          interactiveData = {
            enabled: true,
            buttons: ctaResult.buttons,
            footerText:
              ctaResult.footerText ||
              this.interactiveMessageService.generateFooterText(
                ctaResult.funnelAnalysis.currentStage,
              ),
            funnelStage: ctaResult.funnelAnalysis.currentStage,
            reasoning: ctaResult.reasoning,
          };
        }
      } catch (error) {
        this.logger.warn(
          `[CTAs] Error (non-critical): ${(error as Error).message}`,
        );
      }
    }

    // 11. Build result
    const aiResponse: AiResponseResult = {
      content: responseText,
      confidence: 80, // Fixed confidence — we trust the goal-driven LLM
      shouldSend: true,
      requiresHandoff: false,
      mediaAttachment,
      interactiveData,
    };

    // 12. Check "Review Before Send"
    if (
      chatOverride?.reviewBeforeSend &&
      aiResponse.shouldSend &&
      aiResponse.content
    ) {
      this.logger.log(
        `[Review] "Review Before Send" enabled for chat ${chatId}. Emitting pending review.`,
      );

      this.whatsappGateway?.emitAIPendingReview({
        chatId,
        content: aiResponse.content,
        mediaAttachment: aiResponse.mediaAttachment,
        interactiveData: aiResponse.interactiveData
          ? {
              type: 'button_reply',
              buttons: aiResponse.interactiveData.buttons.map((b) => ({
                id: b.id,
                title: b.title,
              })),
            }
          : undefined,
      });

      aiResponse.shouldSend = false;
    }

    return aiResponse;
  }

  // ============================================================================
  // Status & Delegated Methods
  // ============================================================================

  /**
   * Get AI status for a specific chat
   */
  async getAIStatus(chatId: string): Promise<AiStatusResult> {
    const chat = await db.query.chats.findFirst({
      where: eq(chats.chatId, chatId),
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    const userId = chat.userId || 1;
    const canAIResult = await this.handoffService.canAISend(chatId);

    this.logger.log(
      `[getAIStatus] canAISend result: ${JSON.stringify(canAIResult)}`,
    );

    const result: AiStatusResult = {
      chatId,
      aiEnabled: canAIResult.canSend,
      aiConfigEnabled: canAIResult.configEnabled,
      reason: canAIResult.reason,
      isRateLimited: false,
    };

    // Check rate limits
    try {
      const rateLimitStatus = await this.rateLimiter.checkRateLimit(
        userId,
        chatId,
        { isAiMessage: true },
      );

      if (!rateLimitStatus.allowed) {
        result.isRateLimited = true;
        result.aiEnabled = false;
        result.reason = 'Rate limit exceeded';
        result.rateLimitReset = rateLimitStatus.resetTime;

        if (rateLimitStatus.limits?.length > 0) {
          const criticalLimit = rateLimitStatus.limits.sort(
            (a, b) => b.percentUsed - a.percentUsed,
          )[0];
          result.rateLimitCurrentCount = criticalLimit.current;
          result.rateLimitMaxCount = criticalLimit.max;
        }
      }
    } catch (e) {
      this.logger.error(`[Status] Rate limit check error for ${chatId}`, e);
    }

    this.logger.log(`[getAIStatus] Returning: ${JSON.stringify(result)}`);

    return result;
  }

  /**
   * Send a reviewed AI response (triggered manually after review)
   */
  async sendReviewedAiResponse(
    userId: number,
    chatId: string,
    content: string,
    _mediaAttachment?: any,
    _interactiveData?: any,
  ): Promise<void> {
    this.logger.log(`Sending reviewed response for chat ${chatId}`);

    const chat = await db.query.chats.findFirst({
      where: eq(chats.chatId, chatId),
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    await this.whatsappService?.sendMessage(
      {
        to: chat.participantPhone,
        body: content,
        senderId: chat.senderId,
      },
      userId,
    );

    // Record for rate limiting
    await this.rateLimiter.recordMessage(userId, chatId, {
      isAiMessage: true,
    });

    this.whatsappGateway?.emitAITypingStop(chatId);
  }

  /**
   * Regenerate AI response for a chat (re-processes last inbound message)
   */
  async regenerateResponse(chatId: string): Promise<void> {
    const chat = await db.query.chats.findFirst({
      where: eq(chats.chatId, chatId),
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    const userId = chat.userId || 1;

    // Check rate limits
    const rateLimitStatus = await this.rateLimiter.checkRateLimit(
      userId,
      chatId,
      { isAiMessage: true },
    );

    if (!rateLimitStatus.allowed) {
      const criticalLimit = rateLimitStatus.limits?.sort(
        (a, b) => b.percentUsed - a.percentUsed,
      )?.[0];

      this.whatsappGateway?.emitAIRateLimitExceeded({
        chatId,
        currentCount: criticalLimit?.current || 0,
        maxCount: criticalLimit?.max || 0,
        resetTime: rateLimitStatus.resetTime || new Date(Date.now() + 60000),
      });
      return;
    }

    this.whatsappGateway?.emitAITypingStart(chatId);

    // Fetch last inbound message
    const lastInbound = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp))
      .limit(20);

    const lastCustomerMsg = lastInbound.find((m) => m.direction === 'inbound');

    if (!lastCustomerMsg?.text) {
      this.whatsappGateway?.emitAITypingStop(chatId);
      return;
    }

    // Re-process through the full pipeline
    const result = await this.processMessage({
      chatId,
      messageId: lastCustomerMsg.messageId,
      messageContent: lastCustomerMsg.text,
      senderId: chat.senderId,
      userId,
      isFromCustomer: true,
    });

    // If a response was generated, the caller (WhatsApp service) handles dispatch
    if (!result.aiResponse?.shouldSend) {
      this.whatsappGateway?.emitAITypingStop(chatId);
    }
  }

  // ============================================================================
  // Customer Profile Extraction & Update
  // ============================================================================

  /**
   * Extract customer profile data from their message and update their profile.
   * This runs asynchronously and doesn't block the AI response.
   *
   * Extracts:
   * - Name (first, last)
   * - Email
   * - Additional phone numbers (saved as attributes, never replaces existing)
   * - Preferences and custom fields
   */
  private async extractAndUpdateProfile(
    input: ChatMessageInput,
  ): Promise<void> {
    const { chatId, messageContent, userId } = input;

    try {
      // Get the chat to find participant phone (existing contact number)
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      if (!chat) {
        return;
      }

      // Build recent conversation context for better extraction
      const recentMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, chatId))
        .orderBy(desc(messages.timestamp))
        .limit(5);

      const recentContext = recentMessages
        .reverse()
        .filter((m) => m.text)
        .map((m) => ({
          role: (m.direction === 'inbound' ? 'customer' : 'agent') as
            | 'customer'
            | 'agent',
          content: m.text || '',
        }));

      // Extract profile data from the customer message
      const extractedData =
        await this.profileExtractionService.extractProfileData(messageContent, {
          existingPhoneNumber: chat.participantPhone,
          existingName: chat.participantName || undefined,
          recentMessages: recentContext,
        });

      // If no data was extracted, skip the update
      if (!extractedData.hasData) {
        return;
      }

      this.logger.log(
        `[Profile Extraction] Extracted data for chat ${chatId}: ${JSON.stringify(
          {
            firstName: extractedData.firstName,
            lastName: extractedData.lastName,
            email: extractedData.email ? '[email]' : undefined,
            alternatePhone: extractedData.alternatePhone
              ? '[phone]'
              : undefined,
            customFieldsCount: extractedData.customFields
              ? Object.keys(extractedData.customFields).length
              : 0,
          },
        )}`,
      );

      // Update the customer profile with extracted data
      const updateResult = await this.profileUpdateService.updateProfile(
        extractedData,
        {
          chatId,
          userId,
          updateMode: 'fill_empty', // Only fill empty fields, don't overwrite existing
        },
      );

      if (updateResult.success) {
        const updates = [
          ...updateResult.updatedFields,
          ...updateResult.createdAttributes,
        ];
        if (updates.length > 0) {
          this.logger.log(
            `[Profile Update] Chat ${chatId}: Updated [${updates.join(', ')}]`,
          );

          // Update the chat's participant name if we extracted a name
          if (
            extractedData.firstName &&
            (!chat.participantName || chat.participantName === 'Unknown')
          ) {
            const newName = extractedData.lastName
              ? `${extractedData.firstName} ${extractedData.lastName}`
              : extractedData.firstName;

            await db
              .update(chats)
              .set({
                participantName: newName,
                updatedAt: new Date(),
              })
              .where(eq(chats.chatId, chatId));

            this.logger.log(
              `[Profile Update] Updated chat participant name to: ${newName}`,
            );
          }
        }
      } else if (updateResult.errors.length > 0) {
        this.logger.warn(
          `[Profile Update] Errors for chat ${chatId}: ${updateResult.errors.join(', ')}`,
        );
      }
    } catch (error) {
      // Non-critical error - log and continue
      this.logger.warn(
        `[Profile Extraction] Error for chat ${chatId}: ${(error as Error).message}`,
      );
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private parseJsonArray(value: unknown): string[] | null {
    if (!value) return null;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}
