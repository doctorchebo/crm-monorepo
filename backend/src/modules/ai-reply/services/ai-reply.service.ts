/**
 * AI Reply Service
 * Core orchestrator for AI-powered WhatsApp replies
 *
 * Features:
 * - Analyzes conversation context to determine message type (free-form vs template)
 * - Generates AI responses using LLM with conversation history
 * - Integrates with template system for out-of-window messaging
 * - Selects and sends relevant media attachments from knowledge base
 * - Generates proactive interactive CTAs for sales funnel engagement
 * - Enforces anti-ban rate limits and guardrails
 * - Tracks usage for billing and analytics
 */

import { db } from '@database/db.connection';
import {
  aiMemoryLogs,
  chats,
  contactAttributes,
  contacts,
  messages,
  senders,
} from '@database/schema';
import { AiMemoryService } from '@modules/ai-memory/services/ai-memory.service';
import { MediaOrchestratorService } from '@modules/knowledge-base/services/media-orchestrator.service';
import { VariableResolutionService } from '@modules/templates/services/variable-resolution.service';
import { ConversationWindowService } from '@modules/whatsapp/services/conversation-window.service';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import {
  AIReplyContext,
  AIReplyGenerationResult,
  AIReplyInteractiveData,
  AIReplyMediaAttachment,
  AIStylePreferences,
  BlockReason,
  ConversationAnalysis,
  CustomerContext,
  DEFAULT_RATE_LIMITS,
  GenerateAIReplyRequest,
  GenerateAIReplyResponse,
  MessageDecision,
  RateLimitConfig,
  RecentMessageContext,
  WhatsAppMediaType,
} from '../types';
import { AIReplySettingsService } from './ai-reply-settings.service';
import { CalendarChatPluginService } from './calendar-chat-plugin.service';
import { InteractiveMessageService } from './interactive-message.service';
import { RateLimiterService } from './rate-limiter.service';
import { TemplateSelectorService } from './template-selector.service';

/**
 * System prompt for AI reply generation
 */
const SYSTEM_PROMPT = `You are a helpful WhatsApp customer service assistant. Your role is to respond to customer messages in a natural, helpful, and professional manner.

Guidelines:
- Be concise and clear - WhatsApp messages should be easy to read
- Match the customer's language unless instructed otherwise
- Be warm but professional
- If you don't know something, be honest about it
- Avoid excessive punctuation or emojis unless the style preferences allow
- Never make up information about products, services, or policies
- If the customer seems frustrated, acknowledge their feelings

IMPORTANT - Media Capabilities:
You CAN send images, documents (PDFs), videos, and audio files to customers when appropriate.
When a customer asks for:
- Brochures, catalogs, or marketing materials → You can send them
- Price sheets or pricing information → You can send pricing documents
- Photos or images of products/properties → You can send images
- Video tours or demonstrations → You can send videos
- Floor plans or layouts → You can send those documents
- Any other visual or document materials → You can send them

When media is relevant to the customer's request, include a brief text message acknowledging you're sending the material.
For example: "Absolutely! Here's the brochure you requested." or "Here's our price sheet with all the details."

You will receive:
1. Recent conversation history
2. Customer information (if available)
3. Business context
4. Style preferences to follow
5. Available media that can be sent (if any)

Generate a single response message appropriate for the conversation context.`;

@Injectable()
export class AIReplyService {
  private readonly logger = new Logger(AIReplyService.name);
  private readonly openai: OpenAI;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly mediaEnabled: boolean;
  private readonly interactiveEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: AIReplySettingsService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly templateSelectorService: TemplateSelectorService,
    private readonly conversationWindowService: ConversationWindowService,
    private readonly variableResolutionService: VariableResolutionService,
    @Optional() private readonly memoryService: AiMemoryService,
    @Optional()
    private readonly mediaOrchestratorService: MediaOrchestratorService,
    @Optional()
    private readonly interactiveMessageService: InteractiveMessageService,
    @Optional()
    private readonly calendarPlugin: CalendarChatPluginService,
  ) {
    // Support both OPENAI_API_KEY and AI_MEMORY_PROVIDER_API_KEY for flexibility
    const apiKey =
      this.configService.get<string>('OPENAI_API_KEY') ||
      this.configService.get<string>('AI_MEMORY_PROVIDER_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY or AI_MEMORY_PROVIDER_API_KEY not configured - AI replies will not work',
      );
    }

    this.openai = new OpenAI({
      apiKey: apiKey || 'not-configured',
    });

    this.model = this.configService.get<string>(
      'AI_REPLY_MODEL',
      'gpt-4o-mini',
    );
    this.maxTokens = this.configService.get<number>('AI_REPLY_MAX_TOKENS', 500);
    this.mediaEnabled = this.configService.get<boolean>(
      'AI_MEDIA_ENABLED',
      true,
    );
    this.interactiveEnabled = this.configService.get<boolean>(
      'AI_INTERACTIVE_ENABLED',
      true,
    );
  }

  // ============================================================================
  // Main Entry Points
  // ============================================================================

  /**
   * Generate and optionally send an AI reply
   * This is the main entry point for AI-powered replies
   */
  async generateReply(
    request: GenerateAIReplyRequest,
  ): Promise<GenerateAIReplyResponse> {
    const startTime = Date.now();

    try {
      // Check if AI is enabled for this user
      const isEnabled = await this.settingsService.isEnabled(request.userId);
      if (!isEnabled) {
        return {
          success: false,
          error: 'AI replies are disabled for this user',
          analysis: await this.analyzeConversation(
            request.chatId,
            request.senderId,
          ),
        };
      }

      // Get user settings
      const settings = await this.settingsService.getSettings(request.userId);
      const rateLimitConfig: RateLimitConfig = {
        ...DEFAULT_RATE_LIMITS,
        ...settings.rateLimits,
      };

      // Analyze conversation context
      const analysis = await this.analyzeConversation(
        request.chatId,
        request.senderId,
        rateLimitConfig,
      );

      // Check if message is blocked
      if (analysis.decision === 'blocked') {
        return {
          success: false,
          analysis,
          error: `Message blocked: ${analysis.blockReason}`,
        };
      }

      // Determine message type
      const useTemplate =
        request.forceTemplate ||
        analysis.decision === 'template' ||
        request.specificTemplateId;

      if (useTemplate) {
        // Handle template-based reply
        return await this.handleTemplateReply(request, analysis, settings);
      } else {
        // Handle free-form AI reply
        return await this.handleFreeFormReply(request, analysis, settings);
      }
    } catch (error) {
      this.logger.error(`AI reply generation failed: ${error.message}`, error);

      // Log the failure
      await this.logUsage({
        chatId: request.chatId,
        userId: request.userId,
        senderId: request.senderId,
        operationType: 'generation',
        status: 'failed',
        errorMessage: error.message,
        latencyMs: Date.now() - startTime,
      });

      return {
        success: false,
        error: `AI reply failed: ${error.message}`,
        analysis: await this.analyzeConversation(
          request.chatId,
          request.senderId,
        ),
      };
    }
  }

  /**
   * Analyze conversation to determine what type of message can be sent
   */
  async analyzeConversation(
    chatId: string,
    senderId: number,
    rateLimitConfig: RateLimitConfig = DEFAULT_RATE_LIMITS,
  ): Promise<ConversationAnalysis> {
    // Get conversation window status
    const windowStatus =
      await this.conversationWindowService.getWindowStatus(chatId);

    // Check rate limits
    const rateLimitStatus = await this.rateLimiterService.checkRateLimit(
      chatId,
      rateLimitConfig,
    );

    // Build analysis result
    let decision: MessageDecision;
    let blockReason: BlockReason | undefined;
    let recommendedTemplateId: string | undefined;

    if (!rateLimitStatus.canSend) {
      decision = 'blocked';
      blockReason = rateLimitStatus.blockReason;
    } else if (windowStatus.canSendFreeFormMessage) {
      decision = 'free_form';
    } else if (windowStatus.canSendApprovedTemplate) {
      decision = 'template';
      // We'll select a template later if needed
    } else {
      decision = 'blocked';
      blockReason = 'outside_window_no_template';
    }

    return {
      isWithinWindow: windowStatus.canSendFreeFormMessage,
      windowTimeRemainingMs: windowStatus.timeRemainingMs,
      lastCustomerMessageAt: windowStatus.lastInboundMessageTime,
      messagesSentLastHour: rateLimitStatus.messagesLastHour,
      messagesSentToday: rateLimitStatus.messagesToday,
      isRepetitiveContent: false, // Will be checked when we have content
      decision,
      blockReason,
      recommendedTemplateId,
    };
  }

  // ============================================================================
  // Reply Handlers
  // ============================================================================

  /**
   * Handle template-based reply
   */
  private async handleTemplateReply(
    request: GenerateAIReplyRequest,
    analysis: ConversationAnalysis,
    settings: Awaited<ReturnType<typeof this.settingsService.getSettings>>,
  ): Promise<GenerateAIReplyResponse> {
    const startTime = Date.now();

    // Get sender info for template selection
    const sender = await db.query.senders.findFirst({
      where: eq(senders.id, request.senderId),
    });

    if (!sender) {
      return {
        success: false,
        analysis,
        error: 'Sender not found',
      };
    }

    // Select or use specified template
    let templateSelection;
    if (request.specificTemplateId) {
      // Use specific template
      const template = await this.templateSelectorService.getTemplateForSending(
        request.specificTemplateId,
        settings.stylePreferences.language,
      );

      if (!template) {
        return {
          success: false,
          analysis,
          error: `Template ${request.specificTemplateId} not found or not approved`,
        };
      }

      templateSelection = {
        found: true,
        localeId: template.localeId,
        templateId: template.templateId,
        templateName: template.templateName,
        templateBody: template.body,
        requiredVariables: template.variables,
        matchScore: 1,
        reason: 'User specified template',
      };
    } else {
      // Auto-select template based on context
      const contextKeywords = await this.extractContextKeywords(request.chatId);

      templateSelection = await this.templateSelectorService.selectTemplate(
        sender.userId,
        {
          contextKeywords,
          language: settings.stylePreferences.language,
          category: 'utility',
        },
      );
    }

    if (!templateSelection.found || !templateSelection.localeId) {
      return {
        success: false,
        analysis,
        error: 'No suitable template found for this conversation',
      };
    }

    // Get chat info for variable resolution
    const chat = await db.query.chats.findFirst({
      where: eq(chats.chatId, request.chatId),
    });

    // Find contact by phone
    let contactId: string | undefined;
    if (chat) {
      const contact = await db.query.contacts.findFirst({
        where: eq(contacts.phoneNumber, chat.participantPhone),
      });
      contactId = contact?.contactId;
    }

    // Resolve template variables
    let resolvedText = templateSelection.templateBody || '';
    if (contactId && templateSelection.requiredVariables?.length) {
      try {
        const resolution =
          await this.variableResolutionService.resolveAndRenderTemplate(
            templateSelection.localeId,
            contactId,
            {
              senderId: request.senderId,
              chatId: request.chatId,
              overrides: request.templateVariables,
            },
          );

        if (resolution.success) {
          resolvedText = resolution.body;
        }
      } catch (error) {
        this.logger.warn(`Variable resolution failed: ${error.message}`);
        // Use template with unresolved variables as fallback
      }
    }

    // Log usage
    await this.logUsage({
      chatId: request.chatId,
      userId: request.userId,
      senderId: request.senderId,
      operationType: 'template_selection',
      status: 'success',
      latencyMs: Date.now() - startTime,
    });

    return {
      success: true,
      analysis,
      generatedText: resolvedText,
      templateUsed: {
        templateId: templateSelection.templateId!,
        localeId: templateSelection.localeId,
        templateName: templateSelection.templateName!,
      },
    };
  }

  /**
   * Handle free-form AI reply
   */
  private async handleFreeFormReply(
    request: GenerateAIReplyRequest,
    analysis: ConversationAnalysis,
    settings: Awaited<ReturnType<typeof this.settingsService.getSettings>>,
  ): Promise<GenerateAIReplyResponse> {
    const startTime = Date.now();

    // Build context for AI
    const context = await this.buildAIContext(
      request.chatId,
      request.senderId,
      settings.stylePreferences,
      request.userPrompt,
      settings.recentMessagesCount,
    );

    // Process through calendar plugin if available
    let calendarContext = '';
    if (this.calendarPlugin?.isAvailable()) {
      try {
        // Get the last inbound message for calendar processing
        const lastInboundMessage = context.recentMessages
          .filter((m) => m.direction === 'inbound')
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

        if (lastInboundMessage?.text) {
          const calendarResult =
            await this.calendarPlugin.processMessageForReply(
              {
                message: lastInboundMessage.text,
                userId: request.userId,
                chatId: request.chatId,
              },
              context,
            );

          // If calendar fully handled the message, return the response
          if (calendarResult.skipAiReply && calendarResult.suggestedResponse) {
            await this.logUsage({
              chatId: request.chatId,
              userId: request.userId,
              senderId: request.senderId,
              operationType: 'generation',
              status: 'success',
              latencyMs: Date.now() - startTime,
            });

            return {
              success: true,
              analysis,
              generatedText: calendarResult.suggestedResponse,
            };
          }

          // Add calendar context to AI prompt
          if (calendarResult.additionalContext) {
            calendarContext = calendarResult.additionalContext;
          }
        }
      } catch (error) {
        this.logger.warn(
          `Calendar processing failed (non-critical): ${error.message}`,
        );
        // Continue without calendar context
      }
    }

    // Generate AI response (with optional calendar context)
    const generationResult = await this.generateAIResponse(
      context,
      settings,
      calendarContext,
    );

    if (!generationResult.success || !generationResult.generatedText) {
      return {
        success: false,
        analysis,
        error: generationResult.error || 'Failed to generate AI response',
      };
    }

    // Check for repetitive content
    const repetitionCheck = await this.rateLimiterService.isRepetitiveContent(
      request.chatId,
      generationResult.generatedText,
    );

    if (repetitionCheck.isRepetitive) {
      return {
        success: false,
        analysis: { ...analysis, isRepetitiveContent: true },
        error: 'Generated response is too similar to recent messages',
        warnings: [
          'Repetitive content detected - consider varying your responses',
        ],
      };
    }

    // Try to select relevant media if media selection is enabled
    let mediaAttachment: AIReplyMediaAttachment | undefined;

    if (request.includeMedia !== false && this.mediaOrchestratorService) {
      try {
        mediaAttachment = await this.selectMediaForReply(
          request,
          context,
          generationResult.generatedText,
        );
      } catch (error) {
        this.logger.warn(
          `Media selection failed (non-critical): ${error.message}`,
        );
        // Continue without media - text response is still valid
      }
    }

    // Generate interactive CTAs if enabled
    let interactiveData: AIReplyInteractiveData | undefined;

    if (
      request.includeInteractiveCTAs !== false &&
      this.interactiveEnabled &&
      this.interactiveMessageService
    ) {
      try {
        interactiveData = await this.generateInteractiveCTAs(
          request,
          context,
          generationResult.generatedText,
          mediaAttachment,
        );
      } catch (error) {
        this.logger.warn(
          `Interactive CTA generation failed (non-critical): ${error.message}`,
        );
        // Continue without interactive CTAs
      }
    }

    // Log usage
    await this.logUsage({
      chatId: request.chatId,
      userId: request.userId,
      senderId: request.senderId,
      operationType: 'generation',
      status: 'success',
      inputTokens: generationResult.tokensUsed
        ? Math.floor(generationResult.tokensUsed * 0.7)
        : 0,
      outputTokens: generationResult.tokensUsed
        ? Math.floor(generationResult.tokensUsed * 0.3)
        : 0,
      model: this.model,
      latencyMs: Date.now() - startTime,
    });

    return {
      success: true,
      analysis,
      generatedText: generationResult.generatedText,
      mediaAttachment,
      interactiveData,
      warnings: generationResult.warnings,
      usage: generationResult.tokensUsed
        ? {
            inputTokens: Math.floor(generationResult.tokensUsed * 0.7),
            outputTokens: Math.floor(generationResult.tokensUsed * 0.3),
            totalTokens: generationResult.tokensUsed,
            costUsd: this.calculateCost(generationResult.tokensUsed),
          }
        : undefined,
    };
  }

  // ============================================================================
  // Interactive CTAs Generation
  // ============================================================================

  /**
   * Generate interactive CTAs for proactive engagement
   *
   * Now supports DYNAMIC CTAs: AI-generated contextual follow-up suggestions
   * based on the actual response content, like ChatGPT does after every reply.
   *
   * @param request - The original AI reply request
   * @param context - The conversation context
   * @param generatedText - The AI's generated response text (used for dynamic CTAs)
   * @param mediaAttachment - Optional media attachment
   */
  private async generateInteractiveCTAs(
    request: GenerateAIReplyRequest,
    context: AIReplyContext,
    generatedText: string,
    mediaAttachment?: AIReplyMediaAttachment,
  ): Promise<AIReplyInteractiveData | undefined> {
    if (!this.interactiveMessageService) {
      return undefined;
    }

    // Get available media roles from media attachment if present
    const availableMediaRoles: string[] = [];
    if (mediaAttachment) {
      availableMediaRoles.push(mediaAttachment.mediaRole);
    }

    // Build conversation context string
    const conversationContext = context.recentMessages
      .slice(-5)
      .map(
        (m) =>
          `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.text || '[media]'}`,
      )
      .join('\n');

    // Get the customer's last message
    const lastInboundMessage = context.recentMessages
      .filter((m) => m.direction === 'inbound')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    // Generate CTAs - now with DYNAMIC mode using the AI response
    const ctaResult =
      await this.interactiveMessageService.generateInteractiveCTAs({
        chatId: request.chatId,
        userId: request.userId,
        conversationContext,
        availableMediaRoles,
        includeMediaCTAs: true,
        maxCTAs: 3,

        // Dynamic CTA options - enables AI-generated contextual CTAs
        aiResponseText: generatedText,
        customerMessage: lastInboundMessage?.text ?? undefined,
        hasMediaAttachment: !!mediaAttachment,
        mediaType: mediaAttachment?.mediaRole,
        businessContext: 'real estate', // TODO: Make this configurable per user/account
      });

    // Don't include interactive data if no CTAs generated
    if (
      ctaResult.format === 'none' ||
      !ctaResult.buttons ||
      ctaResult.buttons.length === 0
    ) {
      return undefined;
    }

    // Use footer text from CTA result (dynamic or stage-based)
    const footerText =
      ctaResult.footerText ||
      this.interactiveMessageService.generateFooterText(
        ctaResult.funnelAnalysis.currentStage,
      );

    return {
      enabled: true,
      buttons: ctaResult.buttons,
      footerText,
      funnelStage: ctaResult.funnelAnalysis.currentStage,
      reasoning: ctaResult.reasoning,
    };
  }

  // ============================================================================
  // Media Selection
  // ============================================================================

  /**
   * Select relevant media for an AI reply
   *
   * Uses the MediaOrchestratorService to find appropriate media based on:
   * - Customer's message/query
   * - Conversation context
   * - Guardrail rules (rate limits, timing, etc.)
   *
   * @returns Media attachment if relevant media was found, undefined otherwise
   */
  private async selectMediaForReply(
    request: GenerateAIReplyRequest,
    context: AIReplyContext,
    generatedText: string,
  ): Promise<AIReplyMediaAttachment | undefined> {
    if (!this.mediaOrchestratorService) {
      return undefined;
    }

    // Get the customer's last message as the query
    const lastInboundMessage = context.recentMessages
      .filter((m) => m.direction === 'inbound')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    if (!lastInboundMessage?.text) {
      return undefined;
    }

    // Count AI messages in conversation for guardrail context
    const aiMessageCount = context.recentMessages.filter(
      (m) => m.direction === 'outbound',
    ).length;

    // Check if last AI message had media
    const recentOutbound = context.recentMessages
      .filter((m) => m.direction === 'outbound')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const lastMessageHadMedia = Boolean(
      recentOutbound[0]?.type && recentOutbound[0].type !== 'text',
    );

    // Build conversation context string for relevance
    const conversationContext = context.recentMessages
      .slice(-5)
      .map(
        (m) =>
          `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.text || '[media]'}`,
      )
      .join('\n');

    try {
      const selectionResult =
        await this.mediaOrchestratorService.selectMediaForReply({
          query: lastInboundMessage.text,
          chatId: request.chatId,
          userId: request.userId,
          messageId: request.messageId || uuidv4(),
          chatLanguage: context.stylePreferences.language,
          conversationContext,
          isFirstAiMessage: aiMessageCount === 0,
          lastMessageHadMedia,
          aiMessageCount,
        });

      if (!selectionResult.shouldSendMedia || !selectionResult.selectedMedia) {
        this.logger.debug(
          `No media selected for chat ${request.chatId}: ${selectionResult.reason}`,
        );
        return undefined;
      }

      const media = selectionResult.selectedMedia;

      // Convert MIME type to WhatsApp media type
      const whatsAppMediaType = this.getWhatsAppMediaType(media.mimeType);

      this.logger.log(
        `Selected media ${media.mediaId} (${media.fileName}) for chat ${request.chatId}`,
      );

      return {
        mediaId: media.mediaId,
        objectId: media.objectId,
        objectName: media.objectName,
        mediaRole: media.mediaRole,
        whatsAppMediaType,
        s3Key: media.s3Key,
        s3Bucket: media.s3Bucket,
        fileName: media.fileName,
        mimeType: media.mimeType,
        caption: media.caption,
        altText: media.altText,
        selectionReason: selectionResult.reason,
        similarityScore: media.similarity,
        auditId: selectionResult.auditId,
      };
    } catch (error) {
      this.logger.error(`Media selection error: ${error.message}`, error.stack);
      return undefined;
    }
  }

  /**
   * Convert MIME type to WhatsApp media type
   */
  private getWhatsAppMediaType(mimeType: string): WhatsAppMediaType {
    if (mimeType.startsWith('image/')) {
      return 'image';
    }
    if (mimeType.startsWith('video/')) {
      return 'video';
    }
    if (mimeType.startsWith('audio/')) {
      return 'audio';
    }
    // Default to document for PDFs, office docs, etc.
    return 'document';
  }

  // ============================================================================
  // AI Generation
  // ============================================================================

  /**
   * Generate AI response using OpenAI
   */
  private async generateAIResponse(
    context: AIReplyContext,
    settings: Awaited<ReturnType<typeof this.settingsService.getSettings>>,
    calendarContext?: string,
  ): Promise<AIReplyGenerationResult> {
    try {
      // Build the user message with context
      let userMessage = this.buildUserMessage(context, settings);

      // Add calendar context if available
      if (calendarContext) {
        userMessage = `${calendarContext}\n\n${userMessage}`;
      }

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: this.maxTokens,
        temperature: 0.7,
      });

      const generatedText = response.choices[0]?.message?.content?.trim();

      if (!generatedText) {
        return {
          success: false,
          error: 'No response generated',
        };
      }

      // Check for low confidence (very short responses)
      const warnings: string[] = [];
      let confidence = 1.0;

      if (generatedText.length < 20) {
        warnings.push('Response is very short - consider reviewing');
        confidence = 0.7;
      }

      // Check for avoided keywords
      if (settings.avoidKeywords.length > 0) {
        const lowerText = generatedText.toLowerCase();
        const foundKeywords = settings.avoidKeywords.filter((kw) =>
          lowerText.includes(kw.toLowerCase()),
        );
        if (foundKeywords.length > 0) {
          warnings.push(
            `Response contains avoided keywords: ${foundKeywords.join(', ')}`,
          );
          confidence = 0.5;
        }
      }

      return {
        success: true,
        generatedText,
        confidence,
        tokensUsed: response.usage?.total_tokens,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      this.logger.error(`OpenAI API error: ${error.message}`);
      return {
        success: false,
        error: `AI generation failed: ${error.message}`,
      };
    }
  }

  /**
   * Build user message for OpenAI with full context
   */
  private buildUserMessage(
    context: AIReplyContext,
    settings: Awaited<ReturnType<typeof this.settingsService.getSettings>>,
  ): string {
    const parts: string[] = [];

    // Style preferences
    parts.push('## Style Preferences');
    parts.push(`- Tone: ${context.stylePreferences.tone}`);
    parts.push(`- Length: ${context.stylePreferences.length}`);
    parts.push(
      `- Use emojis: ${context.stylePreferences.useEmojis ? 'Yes' : 'No'}`,
    );
    parts.push(`- Language: ${context.stylePreferences.language}`);
    if (context.stylePreferences.customInstructions) {
      parts.push(
        `- Custom instructions: ${context.stylePreferences.customInstructions}`,
      );
    }
    parts.push('');

    // Business context
    parts.push('## Business Context');
    if (context.business.businessName) {
      parts.push(`- Business: ${context.business.businessName}`);
    }
    if (context.stylePreferences.businessContext) {
      parts.push(`- About: ${context.stylePreferences.businessContext}`);
    }
    if (context.stylePreferences.productsServices) {
      parts.push(
        `- Products/Services: ${context.stylePreferences.productsServices}`,
      );
    }
    parts.push('');

    // Customer context
    parts.push('## Customer Information');
    if (context.customer.firstName) {
      parts.push(
        `- Name: ${context.customer.firstName} ${context.customer.lastName || ''}`,
      );
    }
    parts.push(`- Phone: ${context.customer.phoneNumber}`);
    if (context.customer.language) {
      parts.push(`- Preferred language: ${context.customer.language}`);
    }
    if (Object.keys(context.customer.attributes).length > 0) {
      parts.push('- Custom attributes:');
      for (const [key, value] of Object.entries(context.customer.attributes)) {
        if (value) {
          parts.push(`  - ${key}: ${value}`);
        }
      }
    }
    parts.push('');

    // Relevant memories
    if (context.relevantMemories && context.relevantMemories.length > 0) {
      parts.push('## Relevant Context from Past Conversations');
      for (const memory of context.relevantMemories) {
        parts.push(`- ${memory}`);
      }
      parts.push('');
    }

    // Conversation history
    parts.push('## Recent Conversation');
    for (const msg of context.recentMessages) {
      const sender = msg.direction === 'inbound' ? 'Customer' : 'You';
      const timestamp = msg.timestamp.toLocaleTimeString();
      parts.push(`[${timestamp}] ${sender}: ${msg.text || `[${msg.type}]`}`);
    }
    parts.push('');

    // User prompt if provided
    if (context.userPrompt) {
      parts.push('## Additional Instructions');
      parts.push(context.userPrompt);
      parts.push('');
    }

    // Reply to message if applicable
    if (context.replyToMessage) {
      parts.push('## Reply Context');
      parts.push(`You are replying to: "${context.replyToMessage.text}"`);
      parts.push('');
    }

    parts.push('## Your Task');
    parts.push(
      'Generate a single appropriate response message for this WhatsApp conversation. Just provide the message text, nothing else.',
    );

    return parts.join('\n');
  }

  // ============================================================================
  // Context Building
  // ============================================================================

  /**
   * Build full AI context for reply generation
   */
  private async buildAIContext(
    chatId: string,
    senderId: number,
    stylePreferences: AIStylePreferences,
    userPrompt?: string,
    recentMessagesCount: number = 10,
  ): Promise<AIReplyContext> {
    // Get chat and sender info
    const [chat, sender] = await Promise.all([
      db.query.chats.findFirst({ where: eq(chats.chatId, chatId) }),
      db.query.senders.findFirst({ where: eq(senders.id, senderId) }),
    ]);

    if (!chat || !sender) {
      throw new Error('Chat or sender not found');
    }

    // Get recent messages
    const recentMessages = await this.getRecentMessages(
      chatId,
      recentMessagesCount,
    );

    // Get customer context
    const customer = await this.getCustomerContext(chat.participantPhone);

    // Get relevant memories if memory service is available
    let relevantMemories: string[] | undefined;
    if (this.memoryService && recentMessages.length > 0 && sender) {
      const lastCustomerMessage = recentMessages.find(
        (m) => m.direction === 'inbound',
      );
      if (lastCustomerMessage?.text) {
        try {
          const memories = await this.memoryService.retrieveMemories({
            userId: sender.userId,
            chatId,
            query: lastCustomerMessage.text,
            topK: 3,
            minScore: 0.7,
          });
          relevantMemories = memories.memories.map((m) => m.content);
        } catch (error) {
          this.logger.warn(`Memory retrieval failed: ${error.message}`);
        }
      }
    }

    return {
      chatId,
      recentMessages,
      customer,
      stylePreferences,
      business: {
        senderId,
        businessName: sender.displayName || sender.verifiedName || undefined,
        businessPhone: sender.phoneNumber,
      },
      userPrompt,
      relevantMemories,
    };
  }

  /**
   * Get recent messages for context
   */
  private async getRecentMessages(
    chatId: string,
    count: number,
  ): Promise<RecentMessageContext[]> {
    const recentMsgs = await db
      .select({
        messageId: messages.messageId,
        direction: messages.direction,
        type: messages.type,
        text: messages.text,
        timestamp: messages.timestamp,
        sender: messages.sender,
      })
      .from(messages)
      .where(and(eq(messages.chatId, chatId), eq(messages.isDeleted, false)))
      .orderBy(desc(messages.timestamp))
      .limit(count);

    return recentMsgs
      .reverse() // Chronological order
      .map((msg) => ({
        messageId: msg.messageId,
        direction: msg.direction as 'inbound' | 'outbound',
        type: msg.type,
        text: msg.text,
        timestamp: msg.timestamp,
        senderName: msg.direction === 'inbound' ? 'Customer' : 'You',
      }));
  }

  /**
   * Get customer context from contact data
   */
  private async getCustomerContext(
    phoneNumber: string,
  ): Promise<CustomerContext> {
    // Find contact by phone number
    const contact = await db.query.contacts.findFirst({
      where: eq(contacts.phoneNumber, phoneNumber),
    });

    let attributes: Record<string, string | null> = {};
    if (contact) {
      const attrs = await db.query.contactAttributes.findMany({
        where: eq(contactAttributes.contactId, contact.contactId),
      });
      attributes = attrs.reduce(
        (map, attr) => {
          map[attr.key] = attr.value;
          return map;
        },
        {} as Record<string, string | null>,
      );
    }

    return {
      contactId: contact?.contactId,
      firstName: contact?.firstName,
      lastName: contact?.lastName || undefined,
      phoneNumber,
      language: contact?.language || undefined,
      attributes,
    };
  }

  /**
   * Extract keywords from recent conversation for template selection
   */
  private async extractContextKeywords(chatId: string): Promise<string[]> {
    const recentMsgs = await db
      .select({ text: messages.text })
      .from(messages)
      .where(
        and(
          eq(messages.chatId, chatId),
          eq(messages.direction, 'inbound'),
          eq(messages.isDeleted, false),
        ),
      )
      .orderBy(desc(messages.timestamp))
      .limit(5);

    const allText = recentMsgs
      .map((m) => m.text)
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // Extract simple keywords (words > 4 chars that appear meaningful)
    const words = allText
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 4);

    // Return unique keywords
    return [...new Set(words)].slice(0, 10);
  }

  // ============================================================================
  // Usage Tracking
  // ============================================================================

  /**
   * Log AI usage for billing and analytics
   */
  private async logUsage(data: {
    chatId: string;
    userId: number;
    senderId: number;
    operationType: 'generation' | 'template_selection' | 'memory_retrieval';
    status: 'success' | 'failed';
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    latencyMs: number;
    errorMessage?: string;
  }): Promise<void> {
    try {
      const totalTokens = (data.inputTokens || 0) + (data.outputTokens || 0);
      const costUsd = this.calculateCost(totalTokens);

      await db.insert(aiMemoryLogs).values({
        id: uuidv4(),
        operation: `ai_reply:${data.operationType}`,
        status: data.status,
        userId: data.userId,
        chatId: data.chatId,
        requestMetadata: {
          senderId: data.senderId,
          operationType: data.operationType,
        },
        responseMetadata: {
          model: data.model,
        },
        errorMessage: data.errorMessage,
        latencyMs: data.latencyMs,
        tokensUsed: totalTokens,
        costUsd,
      });
    } catch (error) {
      this.logger.warn(`Failed to log AI usage: ${error.message}`);
    }
  }

  /**
   * Calculate cost in USD for tokens used
   */
  private calculateCost(tokens: number): string {
    // Pricing for gpt-4o-mini (as of 2024)
    // Input: $0.150 / 1M tokens
    // Output: $0.600 / 1M tokens
    // Simplified average: ~$0.375 / 1M tokens
    const costPerMillion = 0.375;
    const cost = (tokens / 1_000_000) * costPerMillion;
    return cost.toFixed(6);
  }

  // ============================================================================
  // Public Utility Methods
  // ============================================================================

  /**
   * Mark a message as sent (update rate limiter cache)
   */
  recordMessageSent(chatId: string, content: string): void {
    this.rateLimiterService.recordMessageSent(chatId, content);
  }

  /**
   * Get rate limit status for a chat
   */
  async getRateLimitStatus(
    chatId: string,
    userId: number,
  ): Promise<{
    canSend: boolean;
    messagesLastHour: number;
    messagesToday: number;
    cooldownRemaining: number;
    blockReason?: BlockReason;
  }> {
    const settings = await this.settingsService.getSettings(userId);
    const config: RateLimitConfig = {
      ...DEFAULT_RATE_LIMITS,
      ...settings.rateLimits,
    };

    return this.rateLimiterService.checkRateLimit(chatId, config);
  }
}
