/**
 * Interactive Message Service
 *
 * Orchestrates proactive AI engagement through interactive WhatsApp messages.
 * Supports two modes of CTA generation:
 *
 * 1. DYNAMIC CTAs (preferred): AI-generated contextual follow-up suggestions
 *    based on the actual response content - like ChatGPT's follow-up suggestions.
 *
 * 2. STATIC CTAs (fallback): Predefined funnel-based CTAs when dynamic
 *    generation is not available or fails.
 *
 * IMPORTANT: Interactive messages can ONLY be sent within the 24-hour conversation
 * window. This service validates the window before generating CTAs.
 */

import { db } from '@database/db.connection';
import { chats, messages } from '@database/schema';
import {
  EFFECTIVE_WINDOW_MS,
  MAX_REPLY_BUTTONS,
  sanitizeButtonTitle,
} from '@modules/whatsapp/constants';
import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import {
  CTAAction,
  DEFAULT_FUNNEL_CONFIG,
  FUNNEL_CTA_REGISTRY,
  FunnelAnalysis,
  FunnelStage,
  GeneratedInteractiveCTAs,
  GenerateInteractiveCTAsOptions,
  InteractiveButton,
  ParsedInteractiveResponse,
} from '../types';
import {
  DynamicCTAContext,
  DynamicCTAGeneratorService,
} from './dynamic-cta-generator.service';

/**
 * Keywords that indicate specific funnel stages
 */
const STAGE_DETECTION_KEYWORDS: Record<FunnelStage, string[]> = {
  awareness: [
    'hello',
    'hi',
    'info',
    'tell me',
    'what is',
    'looking for',
    'interested in',
    'properties',
    'available',
  ],
  interest: [
    'price',
    'cost',
    'how much',
    'brochure',
    'details',
    'more info',
    'photos',
    'pictures',
    'images',
    'send me',
  ],
  consideration: [
    'compare',
    'options',
    'floor plan',
    'layout',
    'size',
    'sqft',
    'square feet',
    'square meters',
    'specifications',
    'features',
    'amenities',
  ],
  intent: [
    'visit',
    'viewing',
    'see',
    'appointment',
    'schedule',
    'available dates',
    'when can',
    'meet',
    'call',
    'speak to',
  ],
  evaluation: [
    'thinking',
    'deciding',
    'consider',
    'proposal',
    'offer',
    'discount',
    'negotiate',
    'terms',
    'payment',
    'financing',
  ],
  purchase: [
    'ready',
    'buy',
    'purchase',
    'contract',
    'sign',
    'closing',
    'deposit',
    'payment plan',
    'proceed',
  ],
};

/**
 * Keywords that indicate user wants specific media
 */
const MEDIA_REQUEST_KEYWORDS: Record<string, string[]> = {
  brochure: ['brochure', 'catalog', 'catalogue', 'booklet', 'pamphlet'],
  price_sheet: ['price', 'pricing', 'cost', 'rates', 'price list', 'fees'],
  floor_plan: ['floor plan', 'layout', 'blueprint', 'plan', 'floorplan'],
  video_tour: ['video', 'tour', 'walkthrough', 'virtual tour', 'video tour'],
  gallery_image: [
    'photo',
    'picture',
    'image',
    'gallery',
    'pics',
    'photos',
    'pictures',
  ],
  map: ['location', 'map', 'where', 'address', 'directions'],
  specification_sheet: [
    'specifications',
    'specs',
    'technical',
    'features',
    'amenities',
  ],
};

@Injectable()
export class InteractiveMessageService {
  private readonly logger = new Logger(InteractiveMessageService.name);

  constructor(
    private readonly dynamicCTAGenerator: DynamicCTAGeneratorService,
  ) {}

  /**
   * Analyze conversation to determine funnel position
   */
  async analyzeFunnelPosition(
    chatId: string,
    conversationContext?: string,
  ): Promise<FunnelAnalysis> {
    try {
      // Get recent messages for analysis
      const recentMessages = await db.query.messages.findMany({
        where: eq(messages.chatId, chatId),
        orderBy: [desc(messages.timestamp)],
        limit: 20,
      });

      // Get chat info
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      const signals: string[] = [];
      let detectedStage: FunnelStage = 'awareness';
      let confidence = 0.5;

      // Count interactions
      const inboundCount = recentMessages.filter(
        (m) => m.direction === 'inbound',
      ).length;
      const outboundCount = recentMessages.filter(
        (m) => m.direction === 'outbound',
      ).length;
      const interactionCount = recentMessages.length;

      // Analyze message content for stage signals
      const inboundMessages = recentMessages
        .filter((m) => m.direction === 'inbound' && m.text)
        .map((m) => m.text!.toLowerCase());

      const allText = inboundMessages.join(' ');

      // Check for stage keywords with priority (later stages override earlier)
      const stageScores: Record<FunnelStage, number> = {
        awareness: 0,
        interest: 0,
        consideration: 0,
        intent: 0,
        evaluation: 0,
        purchase: 0,
      };

      for (const [stage, keywords] of Object.entries(
        STAGE_DETECTION_KEYWORDS,
      )) {
        for (const keyword of keywords) {
          if (allText.includes(keyword)) {
            stageScores[stage as FunnelStage]++;
            signals.push(`Found "${keyword}" indicating ${stage}`);
          }
        }
      }

      // Determine stage based on highest score
      let maxScore = 0;
      for (const [stage, score] of Object.entries(stageScores)) {
        if (score > maxScore) {
          maxScore = score;
          detectedStage = stage as FunnelStage;
        }
      }

      // Adjust based on interaction count
      if (interactionCount <= 2) {
        // Very early conversation - likely awareness
        if (detectedStage === 'awareness' || maxScore < 2) {
          detectedStage = 'awareness';
          signals.push('New conversation (<=2 messages)');
        }
      } else if (interactionCount >= 10) {
        // Longer conversation - likely past awareness
        if (detectedStage === 'awareness') {
          detectedStage = 'interest';
          signals.push('Longer conversation (>=10 messages)');
        }
      }

      // Check if media was already sent
      const mediaSent = recentMessages.filter(
        (m) =>
          m.direction === 'outbound' &&
          (m.type === 'media' || (m.attachments as any[])?.length > 0),
      );
      if (mediaSent.length > 0) {
        signals.push(`${mediaSent.length} media messages sent`);
        if (detectedStage === 'awareness') {
          detectedStage = 'interest';
        }
      }

      // Check for scheduling-related keywords (strong intent signal)
      const schedulingKeywords = [
        'schedule',
        'appointment',
        'visit',
        'viewing',
        'call',
        'meet',
      ];
      for (const keyword of schedulingKeywords) {
        if (allText.includes(keyword)) {
          if (
            detectedStage !== 'intent' &&
            detectedStage !== 'evaluation' &&
            detectedStage !== 'purchase'
          ) {
            detectedStage = 'intent';
            signals.push(`Scheduling keyword "${keyword}" detected`);
          }
          break;
        }
      }

      // Calculate confidence based on signal count
      if (signals.length >= 5) {
        confidence = 0.9;
      } else if (signals.length >= 3) {
        confidence = 0.75;
      } else if (signals.length >= 1) {
        confidence = 0.6;
      }

      // Get recommended CTAs for this stage
      const stageConfig = DEFAULT_FUNNEL_CONFIG.find(
        (c) => c.stage === detectedStage,
      );
      const recommendedCTAs = FUNNEL_CTA_REGISTRY.filter((cta) =>
        cta.appropriateStages.includes(detectedStage),
      )
        .sort((a, b) => b.priority - a.priority)
        .slice(0, stageConfig?.maxButtons || 3);

      return {
        currentStage: detectedStage,
        confidence,
        signals,
        recommendedCTAs,
        interactionCount,
      };
    } catch (error) {
      this.logger.error(`Error analyzing funnel position: ${error.message}`);
      // Return default awareness stage on error
      return {
        currentStage: 'awareness',
        confidence: 0.3,
        signals: ['Error during analysis - defaulting to awareness'],
        recommendedCTAs: FUNNEL_CTA_REGISTRY.filter((cta) =>
          cta.appropriateStages.includes('awareness'),
        ).slice(0, 3),
        interactionCount: 0,
      };
    }
  }

  /**
   * Generate interactive CTAs based on conversation context
   *
   * Supports two modes:
   * 1. DYNAMIC (preferred): AI-generated contextual CTAs based on response content
   *    - Enabled when aiResponseText is provided
   *    - Like ChatGPT's follow-up suggestions
   *
   * 2. STATIC (fallback): Predefined funnel-based CTAs
   *    - Used when aiResponseText is not provided
   *    - Or when dynamic generation fails
   *
   * IMPORTANT: Interactive messages can ONLY be sent within 24 hours of customer's last message.
   */
  async generateInteractiveCTAs(
    options: GenerateInteractiveCTAsOptions,
  ): Promise<GeneratedInteractiveCTAs> {
    const {
      chatId,
      overrideFunnelStage,
      maxCTAs = MAX_REPLY_BUTTONS,
      availableMediaRoles = [],
      conversationContext,
      includeMediaCTAs = true,
      // Dynamic CTA options
      aiResponseText,
      customerMessage,
      useDynamicCTAs,
      hasMediaAttachment,
      mediaType,
      businessContext,
    } = options;

    // CRITICAL: Check conversation window first
    // Interactive messages can ONLY be sent within 24 hours of customer's last message
    const isWithinWindow = await this.checkConversationWindow(chatId);
    if (!isWithinWindow) {
      this.logger.warn(
        `Cannot generate interactive CTAs for chat ${chatId}: Outside 24-hour conversation window`,
      );
      return {
        funnelAnalysis: {
          currentStage: 'awareness',
          confidence: 0,
          signals: [
            'Outside 24-hour conversation window - interactive messages not allowed',
          ],
          recommendedCTAs: [],
          interactionCount: 0,
        },
        buttons: [],
        format: 'none',
        reasoning:
          'Interactive messages cannot be sent outside the 24-hour conversation window. Use a template message to re-engage the customer.',
      };
    }

    // Determine if we should use dynamic CTAs
    // Default to dynamic if aiResponseText is provided
    const shouldUseDynamic =
      useDynamicCTAs !== false && aiResponseText && aiResponseText.length > 0;

    if (shouldUseDynamic) {
      return this.generateDynamicCTAs({
        chatId,
        aiResponseText: aiResponseText!,
        customerMessage,
        conversationContext,
        hasMediaAttachment,
        mediaType,
        businessContext,
        maxCTAs,
      });
    }

    // Fall back to static funnel-based CTAs
    return this.generateStaticCTAs({
      chatId,
      overrideFunnelStage,
      maxCTAs,
      availableMediaRoles,
      conversationContext,
      includeMediaCTAs,
    });
  }

  /**
   * Generate dynamic CTAs using AI based on the response content
   *
   * This is the preferred mode - generates contextual follow-up suggestions
   * based on what the AI just said, like ChatGPT does after every response.
   */
  private async generateDynamicCTAs(options: {
    chatId: string;
    aiResponseText: string;
    customerMessage?: string;
    conversationContext?: string;
    hasMediaAttachment?: boolean;
    mediaType?: string;
    businessContext?: string;
    maxCTAs: number;
  }): Promise<GeneratedInteractiveCTAs> {
    const {
      chatId,
      aiResponseText,
      customerMessage,
      conversationContext,
      hasMediaAttachment,
      mediaType,
      businessContext,
      maxCTAs,
    } = options;

    try {
      // Extract information gaps from the AI response
      const informationGaps =
        this.dynamicCTAGenerator.extractInformationGaps(aiResponseText);

      // Extract mentioned topics
      const mentionedTopics =
        this.dynamicCTAGenerator.extractMentionedTopics(aiResponseText);

      // Build context for dynamic CTA generation
      const ctaContext: DynamicCTAContext = {
        aiResponse: aiResponseText,
        customerMessage: customerMessage || '',
        conversationHistory: conversationContext,
        mentionedTopics,
        hasMediaAttachment,
        mediaType,
        informationGaps:
          informationGaps.length > 0 ? informationGaps : undefined,
        businessContext: businessContext || 'real estate',
      };

      // Generate dynamic CTAs
      const dynamicResult =
        await this.dynamicCTAGenerator.generateDynamicCTAs(ctaContext);

      // Convert dynamic CTAs to InteractiveButtons
      const buttons: InteractiveButton[] = dynamicResult.ctas
        .slice(0, Math.min(maxCTAs, MAX_REPLY_BUTTONS))
        .map((cta) => ({
          id: cta.id,
          title: cta.title,
        }));

      // Build minimal funnel analysis for compatibility
      const funnelAnalysis: FunnelAnalysis = {
        currentStage: 'interest', // Default stage for dynamic CTAs
        confidence: 0.8,
        signals: ['Dynamic CTAs generated based on AI response content'],
        recommendedCTAs: [],
        interactionCount: 0,
      };

      const format = buttons.length === 0 ? 'none' : 'button';

      this.logger.debug(
        `Generated ${buttons.length} dynamic CTAs for chat ${chatId}: ${buttons.map((b) => b.title).join(', ')}`,
      );

      return {
        funnelAnalysis,
        buttons,
        format,
        reasoning: dynamicResult.reasoning || 'AI-generated contextual CTAs',
        footerText: dynamicResult.footerText,
        usedDynamicCTAs: true,
        usedFallback: dynamicResult.usedFallback,
      };
    } catch (error) {
      this.logger.warn(
        `Dynamic CTA generation failed, falling back to static: ${error.message}`,
      );

      // Fall back to static CTAs
      return this.generateStaticCTAs({
        chatId,
        maxCTAs,
        conversationContext,
        includeMediaCTAs: true,
      });
    }
  }

  /**
   * Generate static funnel-based CTAs (fallback mode)
   *
   * Uses the predefined FUNNEL_CTA_REGISTRY based on detected funnel stage.
   * This is the legacy mode used when:
   * - AI response text is not provided
   * - Dynamic CTA generation fails
   */
  private async generateStaticCTAs(options: {
    chatId: string;
    overrideFunnelStage?: FunnelStage;
    maxCTAs: number;
    availableMediaRoles?: string[];
    conversationContext?: string;
    includeMediaCTAs?: boolean;
  }): Promise<GeneratedInteractiveCTAs> {
    const {
      chatId,
      overrideFunnelStage,
      maxCTAs,
      availableMediaRoles = [],
      conversationContext,
      includeMediaCTAs = true,
    } = options;

    // Analyze funnel position
    const funnelAnalysis = overrideFunnelStage
      ? {
          currentStage: overrideFunnelStage,
          confidence: 1,
          signals: ['Stage manually overridden'],
          recommendedCTAs: FUNNEL_CTA_REGISTRY.filter((cta) =>
            cta.appropriateStages.includes(overrideFunnelStage),
          )
            .sort((a, b) => b.priority - a.priority)
            .slice(0, maxCTAs),
          interactionCount: 0,
        }
      : await this.analyzeFunnelPosition(chatId, conversationContext);

    // Filter CTAs based on available media
    let eligibleCTAs = funnelAnalysis.recommendedCTAs;

    if (!includeMediaCTAs) {
      eligibleCTAs = eligibleCTAs.filter((cta) => !cta.requiresMedia);
    } else if (availableMediaRoles.length > 0) {
      eligibleCTAs = eligibleCTAs.filter((cta) => {
        if (!cta.requiresMedia) return true;
        if (!cta.mediaRoles) return false;
        return cta.mediaRoles.some((role) =>
          availableMediaRoles.includes(role),
        );
      });
    }

    // Ensure we have at least some CTAs
    if (eligibleCTAs.length === 0) {
      eligibleCTAs = FUNNEL_CTA_REGISTRY.filter(
        (cta) =>
          !cta.requiresMedia &&
          cta.appropriateStages.includes(funnelAnalysis.currentStage),
      ).slice(0, maxCTAs);
    }

    // Take top CTAs based on priority (enforce max buttons limit from Meta)
    const selectedCTAs = eligibleCTAs.slice(
      0,
      Math.min(maxCTAs, MAX_REPLY_BUTTONS),
    );

    // Generate buttons with proper sanitization
    const buttons: InteractiveButton[] = selectedCTAs.map((cta) => ({
      id: cta.action,
      title: sanitizeButtonTitle(cta.label),
    }));

    // Determine format based on number of options
    const format = buttons.length === 0 ? 'none' : 'button';

    const reasoning =
      `[Static Mode] Stage: ${funnelAnalysis.currentStage} (${Math.round(funnelAnalysis.confidence * 100)}% confidence). ` +
      `Selected ${buttons.length} CTAs based on ${funnelAnalysis.signals.length} signals. ` +
      `Signals: ${funnelAnalysis.signals.slice(0, 3).join(', ')}`;

    return {
      funnelAnalysis,
      buttons,
      format,
      reasoning,
      footerText: this.generateFooterText(funnelAnalysis.currentStage),
      usedDynamicCTAs: false,
    };
  }

  /**
   * Check if the conversation is within the 24-hour window
   * Interactive messages can ONLY be sent within this window.
   *
   * @param chatId - The chat ID to check
   * @returns true if within window, false otherwise
   */
  private async checkConversationWindow(chatId: string): Promise<boolean> {
    try {
      // Find the most recent inbound message
      const lastInbound = await db.query.messages.findFirst({
        where: and(
          eq(messages.chatId, chatId),
          eq(messages.direction, 'inbound'),
        ),
        orderBy: [desc(messages.timestamp)],
      });

      if (!lastInbound) {
        // No inbound messages - cannot send interactive messages
        return false;
      }

      const lastInboundTime = new Date(lastInbound.timestamp).getTime();
      const now = Date.now();
      const timeSinceLastInbound = now - lastInboundTime;

      // Check if within effective window (includes safety margin)
      return timeSinceLastInbound < EFFECTIVE_WINDOW_MS;
    } catch (error) {
      this.logger.error(`Error checking conversation window: ${error.message}`);
      // Fail closed - don't allow interactive messages if we can't verify
      return false;
    }
  }

  /**
   * Parse an interactive response from webhook
   */
  parseInteractiveResponse(
    interactiveData: any,
    messageContext?: {
      messageId: string;
      chatId: string;
      timestamp: Date;
    },
  ): ParsedInteractiveResponse | null {
    if (!interactiveData) return null;

    const type = interactiveData.type;

    if (type === 'button_reply' && interactiveData.button_reply) {
      const reply = interactiveData.button_reply;
      const ctaAction = this.matchCTAAction(reply.id);

      return {
        type: 'button_reply',
        selectedId: reply.id,
        selectedTitle: reply.title,
        ctaAction,
        messageContext,
      };
    }

    if (type === 'list_reply' && interactiveData.list_reply) {
      const reply = interactiveData.list_reply;
      const ctaAction = this.matchCTAAction(reply.id);

      return {
        type: 'list_reply',
        selectedId: reply.id,
        selectedTitle: reply.title,
        selectedDescription: reply.description,
        ctaAction,
        messageContext,
      };
    }

    return null;
  }

  /**
   * Get the appropriate response action for a CTA
   */
  getCTAResponseAction(ctaAction: CTAAction): {
    type: 'send_media' | 'send_text' | 'handoff' | 'schedule';
    mediaRoles?: string[];
    message?: string;
  } {
    switch (ctaAction) {
      // Media-sending CTAs
      case 'send_brochure':
        return { type: 'send_media', mediaRoles: ['brochure'] };
      case 'send_price_sheet':
        return { type: 'send_media', mediaRoles: ['price_sheet'] };
      case 'send_photos':
        return {
          type: 'send_media',
          mediaRoles: ['hero_image', 'gallery_image'],
        };
      case 'send_video_tour':
        return {
          type: 'send_media',
          mediaRoles: ['video_tour', 'promotional_video'],
        };
      case 'send_floor_plan':
        return { type: 'send_media', mediaRoles: ['floor_plan'] };
      case 'send_specifications':
        return { type: 'send_media', mediaRoles: ['specification_sheet'] };
      case 'send_overview':
        return { type: 'send_media', mediaRoles: ['brochure', 'hero_image'] };
      case 'send_location_info':
        return { type: 'send_media', mediaRoles: ['map', 'gallery_image'] };
      case 'send_proposal':
        return {
          type: 'send_media',
          mediaRoles: ['brochure', 'specification_sheet'],
        };
      case 'send_contract':
        return { type: 'send_media', mediaRoles: ['legal_document'] };

      // Scheduling CTAs
      case 'schedule_viewing':
        return {
          type: 'schedule',
          message:
            "Great! I'd love to schedule a property viewing for you. What dates and times work best for you?",
        };
      case 'schedule_call':
        return {
          type: 'schedule',
          message:
            "I'll arrange a call with our team. What's the best time to reach you?",
        };
      case 'schedule_signing':
        return {
          type: 'schedule',
          message:
            "Excellent! Let's schedule the contract signing. What dates work for you?",
        };

      // Handoff CTAs
      case 'talk_to_agent':
        return {
          type: 'handoff',
          message:
            "I'll connect you with one of our sales representatives right away. They'll be with you shortly.",
        };

      // Text response CTAs
      case 'compare_options':
        return {
          type: 'send_text',
          message:
            "I'd be happy to help you compare our available options. What specific aspects would you like to compare? (e.g., price, size, location, amenities)",
        };
      case 'answer_questions':
        return {
          type: 'send_text',
          message:
            "Of course! What questions do you have? I'm here to help with any details about our properties.",
        };
      case 'request_callback':
        return {
          type: 'schedule',
          message:
            "I'll arrange for someone to call you back. What's your preferred contact number and the best time to reach you?",
        };
      case 'get_more_info':
        return {
          type: 'send_text',
          message:
            'What specific information would you like to know more about?',
        };
      case 'ask_question':
        return {
          type: 'send_text',
          message:
            "Sure, go ahead and ask your question. I'll do my best to help!",
        };

      default:
        return {
          type: 'send_text',
          message: 'Thank you for your interest! How can I assist you further?',
        };
    }
  }

  /**
   * Detect if user's message indicates they want specific media
   */
  detectMediaRequest(messageText: string): string[] | null {
    if (!messageText) return null;

    const lowerText = messageText.toLowerCase();
    const detectedRoles: string[] = [];

    for (const [role, keywords] of Object.entries(MEDIA_REQUEST_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          detectedRoles.push(role);
          break; // Only add role once
        }
      }
    }

    return detectedRoles.length > 0 ? detectedRoles : null;
  }

  /**
   * Match a button/list ID to a CTA action
   */
  private matchCTAAction(id: string): CTAAction | undefined {
    const cta = FUNNEL_CTA_REGISTRY.find((c) => c.action === id);
    return cta?.action;
  }

  /**
   * Generate a footer text for interactive messages
   */
  generateFooterText(stage: FunnelStage): string {
    const footers: Record<FunnelStage, string> = {
      awareness: 'Tap to learn more',
      interest: 'Choose an option below',
      consideration: 'What would you like?',
      intent: 'Ready when you are',
      evaluation: 'How can we help?',
      purchase: "Let's finalize your purchase",
    };
    return footers[stage] || 'Choose an option';
  }
}
