/**
 * Dynamic CTA Generator Service
 *
 * Generates contextual, dynamic call-to-action buttons based on the AI's response
 * and conversation context. Unlike static funnel-based CTAs, these are generated
 * in real-time to be relevant to what was just discussed.
 *
 * This mimics ChatGPT's follow-up suggestions that appear after every response,
 * keeping the conversation flowing naturally.
 */

import {
  MAX_BUTTON_TITLE_LENGTH,
  MAX_REPLY_BUTTONS,
  sanitizeButtonTitle,
} from '@modules/whatsapp/constants';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

// ============================================================================
// Types
// ============================================================================

/**
 * A dynamically generated CTA suggestion
 */
export interface DynamicCTA {
  /** Unique identifier for this CTA */
  id: string;
  /** Button text (will be truncated to MAX_BUTTON_TITLE_LENGTH) */
  title: string;
  /** The intent behind this CTA (for analytics/handling) */
  intent: DynamicCTAIntent;
  /** Why this CTA was suggested */
  reasoning?: string;
}

/**
 * Intent categories for dynamic CTAs
 * These help the system understand what action to take when clicked
 */
export type DynamicCTAIntent =
  // Information seeking
  | 'request_more_info' // User wants more details about the topic
  | 'request_specific_detail' // User wants a specific piece of information
  | 'request_clarification' // User wants clarification on something
  | 'request_comparison' // User wants to compare options
  | 'request_alternatives' // User wants to see other options
  // Media requests
  | 'request_photos' // User wants photos
  | 'request_video' // User wants video/tour
  | 'request_documents' // User wants documents/brochures
  | 'request_pricing' // User wants pricing information
  | 'request_floor_plans' // User wants floor plans/layouts
  // Action intents
  | 'schedule_viewing' // User wants to schedule a visit
  | 'schedule_call' // User wants to schedule a call
  | 'contact_agent' // User wants to talk to a person
  | 'get_location' // User wants location/directions
  // Conversation flow
  | 'ask_question' // User wants to ask something specific
  | 'explore_topic' // User wants to explore a mentioned topic
  | 'confirm_interest' // User confirms interest
  | 'express_concern' // User has concerns to address
  // Fallback
  | 'general_followup'; // General conversation continuation

/**
 * Context for generating dynamic CTAs
 */
export interface DynamicCTAContext {
  /** The AI's response that was just generated */
  aiResponse: string;
  /** The customer's last message */
  customerMessage: string;
  /** Recent conversation history */
  conversationHistory?: string;
  /** Topics/entities mentioned in the conversation */
  mentionedTopics?: string[];
  /** Whether media was included in the response */
  hasMediaAttachment?: boolean;
  /** Type of media if attached */
  mediaType?: string;
  /** Information that was NOT available (gaps) */
  informationGaps?: string[];
  /** Current funnel stage if known */
  funnelStage?: string;
  /** Business context (e.g., "real estate", "e-commerce") */
  businessContext?: string;
}

/**
 * Result of dynamic CTA generation
 */
export interface DynamicCTAResult {
  /** Generated CTAs (max 3 for WhatsApp) */
  ctas: DynamicCTA[];
  /** Whether generation was successful */
  success: boolean;
  /** Footer text for the message */
  footerText?: string;
  /** Explanation of why these CTAs were chosen */
  reasoning?: string;
  /** Whether fallback CTAs were used */
  usedFallback?: boolean;
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class DynamicCTAGeneratorService {
  private readonly logger = new Logger(DynamicCTAGeneratorService.name);
  private readonly openai: OpenAI | null = null;
  private readonly model: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.enabled = true;
    } else {
      this.logger.warn(
        'OpenAI API key not configured - dynamic CTAs will use fallback only',
      );
      this.enabled = false;
    }

    // Use a fast, cheap model for CTA generation
    this.model = this.configService.get<string>(
      'DYNAMIC_CTA_MODEL',
      'gpt-4o-mini',
    );
  }

  /**
   * Generate dynamic CTAs based on the AI response and conversation context
   *
   * This is the main entry point. It will:
   * 1. Analyze the AI's response for natural follow-up opportunities
   * 2. Consider what information was/wasn't provided
   * 3. Generate contextually relevant CTAs
   * 4. Fall back to smart defaults if LLM call fails
   */
  async generateDynamicCTAs(
    context: DynamicCTAContext,
  ): Promise<DynamicCTAResult> {
    try {
      // If OpenAI is not configured, use intelligent fallbacks
      if (!this.openai || !this.enabled) {
        return this.generateFallbackCTAs(context);
      }

      // Try LLM-based generation
      const llmResult = await this.generateWithLLM(context);

      // Validate and sanitize the result
      if (llmResult.ctas.length > 0) {
        return {
          ...llmResult,
          ctas: this.sanitizeCTAs(llmResult.ctas),
        };
      }

      // Fall back if LLM returned empty
      return this.generateFallbackCTAs(context);
    } catch (error) {
      this.logger.warn(
        `Dynamic CTA generation failed, using fallback: ${error.message}`,
      );
      return this.generateFallbackCTAs(context);
    }
  }

  /**
   * Generate CTAs using the LLM
   */
  private async generateWithLLM(
    context: DynamicCTAContext,
  ): Promise<DynamicCTAResult> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userPrompt = this.buildUserPrompt(context);

    const response = await this.openai!.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7, // Some creativity for varied suggestions
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in LLM response');
    }

    const parsed = JSON.parse(content);
    return this.parseAndValidateLLMResponse(parsed);
  }

  /**
   * Build the system prompt for CTA generation
   */
  private buildSystemPrompt(context: DynamicCTAContext): string {
    return `You are a conversation flow assistant. Your job is to suggest 2-3 natural follow-up options that a customer might want after receiving a message from a business.

Think like a helpful assistant that anticipates what the customer might want to do or ask next. The suggestions should:
1. Be relevant to what was just discussed
2. Help move the conversation forward
3. Be action-oriented and specific (not vague)
4. Feel natural, not pushy or sales-y

CRITICAL CONSTRAINTS:
- Generate exactly 2-3 suggestions (never more than ${MAX_REPLY_BUTTONS})
- Each suggestion title MUST be ${MAX_BUTTON_TITLE_LENGTH} characters or less
- Titles should be concise action phrases (e.g., "See floor plans", "Get pricing", "Ask about amenities")
- Use natural, conversational language

${context.businessContext ? `Business context: ${context.businessContext}` : 'This is a customer service conversation.'}

Respond with JSON in this exact format:
{
  "ctas": [
    {
      "id": "unique_id_1",
      "title": "Short action text",
      "intent": "one of the valid intents",
      "reasoning": "Why this is relevant"
    }
  ],
  "footerText": "Short prompt like 'What would you like to explore?'",
  "reasoning": "Overall reasoning for these suggestions"
}

Valid intents: request_more_info, request_specific_detail, request_clarification, request_comparison, request_alternatives, request_photos, request_video, request_documents, request_pricing, request_floor_plans, schedule_viewing, schedule_call, contact_agent, get_location, ask_question, explore_topic, confirm_interest, express_concern, general_followup`;
  }

  /**
   * Build the user prompt with conversation context
   */
  private buildUserPrompt(context: DynamicCTAContext): string {
    let prompt = `The AI assistant just sent this message to the customer:\n\n"${context.aiResponse}"\n\n`;

    if (context.customerMessage) {
      prompt += `The customer's previous message was:\n"${context.customerMessage}"\n\n`;
    }

    if (context.conversationHistory) {
      prompt += `Recent conversation context:\n${context.conversationHistory}\n\n`;
    }

    if (context.hasMediaAttachment) {
      prompt += `Note: The AI's message included a ${context.mediaType || 'media'} attachment.\n\n`;
    }

    if (context.informationGaps && context.informationGaps.length > 0) {
      prompt += `The AI mentioned it doesn't have: ${context.informationGaps.join(', ')}\n\n`;
    }

    if (context.mentionedTopics && context.mentionedTopics.length > 0) {
      prompt += `Topics mentioned: ${context.mentionedTopics.join(', ')}\n\n`;
    }

    prompt += `Based on this context, suggest 2-3 natural follow-up options the customer might want. Remember: titles must be ${MAX_BUTTON_TITLE_LENGTH} characters or less.`;

    return prompt;
  }

  /**
   * Parse and validate the LLM response
   */
  private parseAndValidateLLMResponse(parsed: any): DynamicCTAResult {
    if (!parsed.ctas || !Array.isArray(parsed.ctas)) {
      throw new Error('Invalid LLM response structure');
    }

    const ctas: DynamicCTA[] = parsed.ctas
      .slice(0, MAX_REPLY_BUTTONS)
      .map((cta: any, index: number) => ({
        id: cta.id || `dynamic_cta_${index}_${Date.now()}`,
        title: String(cta.title || 'Learn more').substring(
          0,
          MAX_BUTTON_TITLE_LENGTH,
        ),
        intent: this.validateIntent(cta.intent),
        reasoning: cta.reasoning,
      }));

    return {
      success: true,
      ctas,
      footerText: parsed.footerText
        ? String(parsed.footerText).substring(0, 60)
        : 'What would you like to know?',
      reasoning: parsed.reasoning,
      usedFallback: false,
    };
  }

  /**
   * Validate intent is one of our known types
   */
  private validateIntent(intent: string): DynamicCTAIntent {
    const validIntents: DynamicCTAIntent[] = [
      'request_more_info',
      'request_specific_detail',
      'request_clarification',
      'request_comparison',
      'request_alternatives',
      'request_photos',
      'request_video',
      'request_documents',
      'request_pricing',
      'request_floor_plans',
      'schedule_viewing',
      'schedule_call',
      'contact_agent',
      'get_location',
      'ask_question',
      'explore_topic',
      'confirm_interest',
      'express_concern',
      'general_followup',
    ];

    if (validIntents.includes(intent as DynamicCTAIntent)) {
      return intent as DynamicCTAIntent;
    }

    return 'general_followup';
  }

  /**
   * Generate intelligent fallback CTAs based on context analysis
   *
   * This is used when:
   * 1. OpenAI is not configured
   * 2. LLM call fails
   * 3. LLM returns empty/invalid response
   */
  private generateFallbackCTAs(context: DynamicCTAContext): DynamicCTAResult {
    const ctas: DynamicCTA[] = [];

    // Analyze the AI response for gaps and opportunities
    const responseAnalysis = this.analyzeResponseForCTAs(context.aiResponse);

    // Priority 1: If there are information gaps, offer to get more info
    if (
      context.informationGaps &&
      context.informationGaps.length > 0 &&
      ctas.length < MAX_REPLY_BUTTONS
    ) {
      ctas.push({
        id: 'fallback_more_info',
        title: 'Get more details',
        intent: 'request_more_info',
        reasoning: 'AI mentioned missing information',
      });
    }

    // Priority 2: Based on response analysis
    if (responseAnalysis.mentionsProperty && ctas.length < MAX_REPLY_BUTTONS) {
      if (!context.hasMediaAttachment) {
        ctas.push({
          id: 'fallback_see_photos',
          title: 'See photos',
          intent: 'request_photos',
          reasoning: 'Property mentioned but no media sent',
        });
      }
    }

    if (responseAnalysis.mentionsPricing && ctas.length < MAX_REPLY_BUTTONS) {
      ctas.push({
        id: 'fallback_get_pricing',
        title: 'Get pricing info',
        intent: 'request_pricing',
        reasoning: 'Pricing was discussed',
      });
    }

    if (responseAnalysis.mentionsAmenities && ctas.length < MAX_REPLY_BUTTONS) {
      ctas.push({
        id: 'fallback_amenities',
        title: 'Tell me about amenities',
        intent: 'request_specific_detail',
        reasoning: 'Amenities were mentioned',
      });
    }

    if (responseAnalysis.mentionsLocation && ctas.length < MAX_REPLY_BUTTONS) {
      ctas.push({
        id: 'fallback_location',
        title: 'See location',
        intent: 'get_location',
        reasoning: 'Location was discussed',
      });
    }

    // Priority 3: Always offer to ask a question if space allows
    if (ctas.length < MAX_REPLY_BUTTONS) {
      ctas.push({
        id: 'fallback_ask_question',
        title: 'Ask a question',
        intent: 'ask_question',
        reasoning: 'General conversation continuation',
      });
    }

    // Priority 4: Offer to talk to agent if space allows
    if (ctas.length < MAX_REPLY_BUTTONS) {
      ctas.push({
        id: 'fallback_contact_agent',
        title: 'Talk to an agent',
        intent: 'contact_agent',
        reasoning: 'Escalation option',
      });
    }

    // Priority 5: Schedule viewing for real estate context
    if (
      context.businessContext?.includes('real estate') &&
      ctas.length < MAX_REPLY_BUTTONS
    ) {
      ctas.push({
        id: 'fallback_schedule',
        title: 'Schedule a viewing',
        intent: 'schedule_viewing',
        reasoning: 'Real estate context - offer viewing',
      });
    }

    // Ensure we have at least 2 CTAs
    if (ctas.length === 0) {
      ctas.push(
        {
          id: 'fallback_default_1',
          title: 'Tell me more',
          intent: 'request_more_info',
          reasoning: 'Default fallback',
        },
        {
          id: 'fallback_default_2',
          title: 'Ask a question',
          intent: 'ask_question',
          reasoning: 'Default fallback',
        },
      );
    }

    return {
      success: true,
      ctas: this.sanitizeCTAs(ctas.slice(0, MAX_REPLY_BUTTONS)),
      footerText: 'How can I help?',
      reasoning: 'Generated from context analysis (fallback)',
      usedFallback: true,
    };
  }

  /**
   * Analyze the AI response to detect topics and opportunities for CTAs
   */
  private analyzeResponseForCTAs(response: string): {
    mentionsProperty: boolean;
    mentionsPricing: boolean;
    mentionsAmenities: boolean;
    mentionsLocation: boolean;
    mentionsScheduling: boolean;
    mentionsMissingInfo: boolean;
    topics: string[];
  } {
    const lowerResponse = response.toLowerCase();

    const topics: string[] = [];

    // Check for property-related content
    const mentionsProperty =
      /property|unit|apartment|condo|studio|bedroom|living|home|residence/i.test(
        response,
      );
    if (mentionsProperty) topics.push('property');

    // Check for pricing mentions
    const mentionsPricing =
      /price|cost|\$|pricing|payment|financing|fee|rent/i.test(response);
    if (mentionsPricing) topics.push('pricing');

    // Check for amenities
    const mentionsAmenities =
      /amenities|spa|gym|pool|fitness|parking|facilities|features/i.test(
        response,
      );
    if (mentionsAmenities) topics.push('amenities');

    // Check for location
    const mentionsLocation =
      /location|address|area|neighborhood|nearby|close to|minutes from/i.test(
        response,
      );
    if (mentionsLocation) topics.push('location');

    // Check for scheduling mentions
    const mentionsScheduling =
      /schedule|appointment|visit|viewing|tour|meet|call/i.test(response);
    if (mentionsScheduling) topics.push('scheduling');

    // Check for missing information indicators
    const mentionsMissingInfo =
      /don't have|not available|currently don't|no .* available|unable to provide/i.test(
        response,
      );
    if (mentionsMissingInfo) topics.push('missing_info');

    return {
      mentionsProperty,
      mentionsPricing,
      mentionsAmenities,
      mentionsLocation,
      mentionsScheduling,
      mentionsMissingInfo,
      topics,
    };
  }

  /**
   * Extract information gaps from the AI response
   *
   * Useful for detecting what the AI couldn't provide
   */
  extractInformationGaps(aiResponse: string): string[] {
    const gaps: string[] = [];

    // Patterns that indicate missing information
    const missingPatterns = [
      { pattern: /don't have (?:any )?photos?/i, gap: 'photos' },
      { pattern: /no (?:photos?|images?) available/i, gap: 'photos' },
      { pattern: /don't have (?:pricing|price)/i, gap: 'pricing' },
      { pattern: /no (?:pricing|price) information/i, gap: 'pricing' },
      { pattern: /don't have (?:the )?floor plans?/i, gap: 'floor plans' },
      { pattern: /no floor plans? available/i, gap: 'floor plans' },
      { pattern: /don't have (?:the )?video/i, gap: 'video' },
      { pattern: /no video available/i, gap: 'video' },
      { pattern: /don't have (?:specific )?details/i, gap: 'specific details' },
      { pattern: /currently don't have/i, gap: 'requested information' },
    ];

    for (const { pattern, gap } of missingPatterns) {
      if (pattern.test(aiResponse)) {
        gaps.push(gap);
      }
    }

    return [...new Set(gaps)]; // Remove duplicates
  }

  /**
   * Extract topics mentioned in text
   */
  extractMentionedTopics(text: string): string[] {
    const analysis = this.analyzeResponseForCTAs(text);
    return analysis.topics;
  }

  /**
   * Sanitize CTAs to ensure they meet WhatsApp requirements
   */
  private sanitizeCTAs(ctas: DynamicCTA[]): DynamicCTA[] {
    const seenIds = new Set<string>();

    return ctas
      .slice(0, MAX_REPLY_BUTTONS)
      .map((cta, index) => {
        // Ensure unique ID
        let id = cta.id;
        if (seenIds.has(id)) {
          id = `${id}_${index}`;
        }
        seenIds.add(id);

        return {
          ...cta,
          id,
          title: sanitizeButtonTitle(cta.title),
        };
      })
      .filter((cta) => cta.title.length > 0);
  }
}
