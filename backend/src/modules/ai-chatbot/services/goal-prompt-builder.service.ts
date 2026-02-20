/**
 * Goal Prompt Builder Service
 *
 * Builds system prompts for AI responses based on the user's configured
 * goal type (answer_faq, qualify_lead, book_appointment, handle_support, custom).
 *
 * Replaces the old stage-based prompt building with a simpler goal-based approach.
 *
 * Features:
 * - Goal-based conversation guidance (from database or fallback defaults)
 * - Automatic customer profile data collection awareness
 * - Knowledge base integration
 * - Media attachment support
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  GoalPromptParams,
  GoalType,
  MediaContext,
} from '../types/ai-chatbot.types';
import { getMediaTypeLabel } from '../utils/ai-chatbot.utils';
import { SystemAiPromptsService } from './system-ai-prompts.service';

/**
 * Profile data collection instructions for the AI
 * These instructions tell the AI how to naturally collect and acknowledge customer information
 */
const PROFILE_DATA_COLLECTION_INSTRUCTIONS = `
==========================================================================
CUSTOMER DATA COLLECTION - IMPORTANT
==========================================================================

When customers share personal information, acknowledge it naturally and continue the conversation.
The system will automatically save this information to their profile.

TYPES OF DATA TO LOOK FOR:
1. Name: When customers introduce themselves (e.g., "I'm Carlos", "My name is María García")
   - Acknowledge: "Nice to meet you, Carlos!" or naturally use their name
2. Email: When shared for confirmation or follow-up (e.g., "my email is john@example.com")
   - Acknowledge: "I've noted your email. You'll receive confirmation there."
3. Phone: When customers provide an ADDITIONAL contact number
   - Acknowledge: "I have that number noted for follow-up."
4. Preferences: Dates, times, budget, requirements, locations
   - Acknowledge: "I've noted your preference for [what they mentioned]."

DATA HANDLING RULES:
- Always confirm you've "noted" or "saved" important information
- Use the customer's name naturally after they provide it
- Don't ask for information they've already given
- If they correct information (e.g., "Actually, it's María, not Maria"), acknowledge the correction
- Never read back sensitive data like full email or phone out loud

EXAMPLE INTERACTIONS:
Customer: "Hi, I'm Carlos Mendoza and I'm interested in the Flow House"
AI: "Hello Carlos! It's great to hear from you. I'd be happy to help you with information about Flow House..."

Customer: "You can reach me at carlos@email.com for the booking confirmation"
AI: "I've noted your email address. You'll receive the booking confirmation there. Now, regarding the visit..."

Customer: "My wife's number is +59178901234 in case I'm unavailable"
AI: "Thank you for providing an alternative contact number. I've saved it for our records..."
`;

/**
 * Compact version of profile collection instructions (for when context window is limited)
 */
const PROFILE_DATA_COLLECTION_COMPACT = `
DATA COLLECTION: When customers share personal info (name, email, phone, preferences):
- Acknowledge naturally: "Thanks, Carlos!" / "I've noted your email"
- Use their name after they share it
- Don't re-ask for info they've given
`;

@Injectable()
export class GoalPromptBuilderService {
  private readonly logger = new Logger(GoalPromptBuilderService.name);

  constructor(
    private readonly systemAiPromptsService: SystemAiPromptsService,
  ) {}

  /**
   * Build the complete system prompt for an AI response
   */
  async buildPrompt(params: GoalPromptParams): Promise<string> {
    const {
      goalType,
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
      mediaContext,
      customerName,
      conversationContext,
    } = params;

    const parts: string[] = [];

    // 1. Base role + goal instructions (fetch from DB)
    parts.push(await this.buildGoalBlock(goalType, goalDescription));

    // 2. Customer info
    if (customerName) {
      parts.push(this.buildCustomerBlock(customerName));
    }

    // 3. Conversation context (if available from resumption)
    if (conversationContext) {
      parts.push(this.buildConversationContextBlock(conversationContext));
    }

    // 4. Style directives
    parts.push(
      this.buildStyleBlock(
        tone,
        style,
        formalityLevel,
        languagePreference,
        maxResponseLength,
      ),
    );

    // 5. Custom instructions from admin
    if (customInstructions) {
      parts.push(
        `\nADDITIONAL INSTRUCTIONS FROM ADMIN:\n${customInstructions}`,
      );
    }

    // 6. Topics to avoid
    if (avoidTopics && avoidTopics.length > 0) {
      parts.push(
        `\nTOPICS TO AVOID (never discuss these):\n- ${avoidTopics.join('\n- ')}`,
      );
    }

    // 7. Profile data collection instructions
    // Use compact version when KB context is present to save tokens
    parts.push(
      hasKnowledgeBase
        ? PROFILE_DATA_COLLECTION_COMPACT
        : PROFILE_DATA_COLLECTION_INSTRUCTIONS,
    );

    // 8. Media context
    if (mediaContext?.willHaveMedia && mediaContext.mediaType) {
      parts.push(this.buildMediaBlock(mediaContext));
    }

    // 9. Knowledge base context
    if (hasKnowledgeBase && knowledgeContext) {
      parts.push(this.buildKnowledgeBaseBlock(knowledgeContext));
    } else {
      parts.push(this.buildNoKnowledgeBaseBlock(mediaContext));
    }

    return parts.join('\n');
  }

  /**
   * Build the goal-specific instruction block
   */
  private async buildGoalBlock(
    goalType: GoalType,
    goalDescription?: string | null,
  ): Promise<string> {
    const goalInstructions = await this.getGoalInstructions(goalType);

    let block = `You are a friendly and professional AI assistant.\n\nYOUR GOAL: ${goalInstructions}`;

    if (goalDescription) {
      block += `\n\nADDITIONAL GOAL CONTEXT:\n${goalDescription}`;
    }

    return block;
  }

  /**
   * Get base instructions for each goal type
   * Fetches from database if available, otherwise falls back to hardcoded defaults
   */
  private async getGoalInstructions(goalType: GoalType): Promise<string> {
    try {
      // Try to get the prompt from the database
      const dbPrompt =
        await this.systemAiPromptsService.getPromptTemplate(goalType);
      if (dbPrompt) {
        return dbPrompt;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch goal prompt from database for ${goalType}, using default: ${(error as Error).message}`,
      );
    }

    // Fallback to hardcoded defaults
    return this.getDefaultGoalInstructions(goalType);
  }

  /**
   * Get default hardcoded instructions for each goal type (fallback)
   */
  private getDefaultGoalInstructions(goalType: GoalType): string {
    switch (goalType) {
      case 'answer_faq':
        return (
          'Answer customer questions accurately using the available knowledge base. ' +
          'Provide specific details (prices, features, availability) when available. ' +
          "If you don't have the information, let them know an agent will follow up. " +
          'When customers share their name or details, acknowledge naturally and use their name in future responses.'
        );

      case 'qualify_lead':
        return (
          'Qualify incoming leads by understanding their needs and budget. ' +
          'Ask relevant discovery questions (timeline, budget, requirements, decision makers). ' +
          'When customers share their name, contact info, or preferences, acknowledge this information naturally ' +
          '(e.g., "Thanks for sharing that, [Name]" or "I\'ve noted your budget of X"). ' +
          'Share relevant information from the knowledge base to keep them engaged. ' +
          'When a lead is qualified, suggest connecting with an agent for next steps.'
        );

      case 'book_appointment':
        return (
          'Help customers schedule appointments or meetings. ' +
          'Collect necessary information: preferred date/time, type of service, contact details. ' +
          "When customers provide their name, email, or preferences, confirm you've noted the information " +
          '(e.g., "I have you down as [Name] for [date/time]" or "I\'ll send confirmation to [email]"). ' +
          'Provide available options from the knowledge base when possible. ' +
          'Confirm all details before finalizing.'
        );

      case 'handle_support':
        return (
          'Provide customer support by troubleshooting issues and answering questions. ' +
          'Be empathetic and patient. When customers introduce themselves, use their name to personalize the interaction. ' +
          'If they share contact details for follow-up, acknowledge receipt. ' +
          'Search the knowledge base for solutions. ' +
          'If the issue requires human intervention, offer to connect with a support agent. ' +
          "Always acknowledge the customer's frustration and provide clear next steps."
        );

      case 'custom':
        return (
          'Assist the customer based on the additional context provided below. ' +
          'Be helpful, accurate, and professional in all interactions. ' +
          'When customers share personal information, acknowledge it naturally.'
        );

      default:
        return (
          'Assist the customer with their inquiry using available information. ' +
          'When customers share their name or contact details, acknowledge naturally.'
        );
    }
  }

  /**
   * Build customer information block
   */
  private buildCustomerBlock(customerName: string): string {
    return `
==========================================================================
CUSTOMER INFORMATION
==========================================================================

Customer Name: ${customerName}

IMPORTANT: Use the customer's actual name when addressing them. Never use placeholders like "[Customer's Name]".`;
  }

  /**
   * Build conversation context block
   * This provides the AI with a summary of previous conversation state
   */
  private buildConversationContextBlock(conversationContext: string): string {
    return `
==========================================================================
CONVERSATION CONTEXT (Previous Discussion Summary)
==========================================================================
${conversationContext}

IMPORTANT: Use this context to maintain conversation continuity. Address any pending items or follow up on previous topics naturally.`;
  }

  /**
   * Build style directives block
   */
  private buildStyleBlock(
    tone: string,
    style: string,
    formalityLevel: string,
    languagePreference?: string | null,
    maxResponseLength?: number,
  ): string {
    const parts = [
      `\nRESPONSE STYLE:`,
      `- Tone: ${tone}`,
      `- Style: ${style}`,
      `- Formality: ${formalityLevel}`,
    ];

    if (languagePreference) {
      parts.push(`- Language: Respond in ${languagePreference}`);
    }

    if (maxResponseLength) {
      parts.push(
        `- Maximum response length: approximately ${maxResponseLength} characters`,
      );
    }

    return parts.join('\n');
  }

  /**
   * Build media attachment context block
   */
  private buildMediaBlock(mediaContext: MediaContext): string {
    const mediaTypeLabel = getMediaTypeLabel(mediaContext.mediaType!);
    const aiGuidance = mediaContext.aiInstructions
      ? `\nWHEN TO SEND THIS MEDIA: ${mediaContext.aiInstructions}`
      : '';

    return `
==========================================================================
MEDIA ATTACHMENT - IMPORTANT
==========================================================================

A ${mediaTypeLabel} WILL be automatically attached to your response.
Media: "${mediaContext.mediaDescription || mediaContext.mediaFileName}"${aiGuidance}

CRITICAL INSTRUCTIONS FOR MEDIA:
1. DO NOT say you "cannot provide images" or "cannot send attachments" - YOU ARE SENDING ONE.
2. DO NOT say "I'll have an agent send you an image" - YOU ARE SENDING IT NOW.
3. Reference the attached ${mediaTypeLabel} naturally in your response.
4. Examples of good responses with ${mediaTypeLabel}:
   - "Here's the ${mediaTypeLabel} you requested..."
   - "I'm sharing a ${mediaTypeLabel} that shows..."
   - "Please see the attached ${mediaTypeLabel} for..."
5. Keep your text response concise since the ${mediaTypeLabel} provides visual context.
==========================================================================`;
  }

  /**
   * Build knowledge base context block (when KB data is available)
   */
  private buildKnowledgeBaseBlock(knowledgeContext: string): string {
    return `

CRITICAL INSTRUCTIONS - READ CAREFULLY:
1. KNOWLEDGE BASE DATA IS PROVIDED BELOW. You MUST use this data to answer the customer's question.
2. Include SPECIFIC details from the knowledge base: prices, locations, features, amenities, areas, etc.
3. DO NOT say "I cannot provide specific details" if the data is in the knowledge base below.
4. DO NOT say "an agent will provide more details" if the information is already available below.
5. Format your response clearly with the actual data values from the knowledge base.
6. If asked about price, location, bedrooms, amenities, or features - QUOTE THE EXACT VALUES from the data.
7. Be helpful and comprehensive - share all relevant information the customer might need.

RESPONSE FORMAT:
- Be conversational but informative
- Include specific numbers, prices, locations when available
- If multiple properties/items match, briefly mention each with key details

${knowledgeContext}`;
  }

  /**
   * Build fallback block when no KB data is available
   */
  private buildNoKnowledgeBaseBlock(mediaContext?: MediaContext): string {
    const hasMedia = mediaContext?.willHaveMedia;

    return `

INSTRUCTIONS:
1. No specific product/service information is available in the knowledge base for this query.
2. Provide a helpful general response.
${!hasMedia ? "3. If the customer is asking for specific details you don't have, let them know an agent will contact them shortly with more information." : "3. Use the attached media to help answer the customer's query."}
4. Keep responses friendly and professional.`;
  }
}
