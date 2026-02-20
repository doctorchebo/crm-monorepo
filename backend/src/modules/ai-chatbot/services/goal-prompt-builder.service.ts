/**
 * Goal Prompt Builder Service
 *
 * Builds system prompts for AI responses based on the user's configured
 * goal type (answer_faq, qualify_lead, book_appointment, handle_support, custom).
 *
 * Replaces the old stage-based prompt building with a simpler goal-based approach.
 */

import { Injectable } from '@nestjs/common';
import type {
  GoalPromptParams,
  GoalType,
  MediaContext,
} from '../types/ai-chatbot.types';
import { getMediaTypeLabel } from '../utils/ai-chatbot.utils';

@Injectable()
export class GoalPromptBuilderService {
  /**
   * Build the complete system prompt for an AI response
   */
  buildPrompt(params: GoalPromptParams): string {
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
    } = params;

    const parts: string[] = [];

    // 1. Base role + goal instructions
    parts.push(this.buildGoalBlock(goalType, goalDescription));

    // 2. Customer info
    if (customerName) {
      parts.push(this.buildCustomerBlock(customerName));
    }

    // 3. Style directives
    parts.push(
      this.buildStyleBlock(
        tone,
        style,
        formalityLevel,
        languagePreference,
        maxResponseLength,
      ),
    );

    // 4. Custom instructions from admin
    if (customInstructions) {
      parts.push(
        `\nADDITIONAL INSTRUCTIONS FROM ADMIN:\n${customInstructions}`,
      );
    }

    // 5. Topics to avoid
    if (avoidTopics && avoidTopics.length > 0) {
      parts.push(
        `\nTOPICS TO AVOID (never discuss these):\n- ${avoidTopics.join('\n- ')}`,
      );
    }

    // 6. Media context
    if (mediaContext?.willHaveMedia && mediaContext.mediaType) {
      parts.push(this.buildMediaBlock(mediaContext));
    }

    // 7. Knowledge base context
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
  private buildGoalBlock(
    goalType: GoalType,
    goalDescription?: string | null,
  ): string {
    const goalInstructions = this.getGoalInstructions(goalType);

    let block = `You are a friendly and professional AI assistant.\n\nYOUR GOAL: ${goalInstructions}`;

    if (goalDescription) {
      block += `\n\nADDITIONAL GOAL CONTEXT:\n${goalDescription}`;
    }

    return block;
  }

  /**
   * Get base instructions for each goal type
   */
  private getGoalInstructions(goalType: GoalType): string {
    switch (goalType) {
      case 'answer_faq':
        return (
          'Answer customer questions accurately using the available knowledge base. ' +
          'Provide specific details (prices, features, availability) when available. ' +
          "If you don't have the information, let the customer know an agent will follow up."
        );

      case 'qualify_lead':
        return (
          'Qualify incoming leads by understanding their needs and budget. ' +
          'Ask relevant discovery questions (timeline, budget, requirements, decision makers). ' +
          'Share relevant information from the knowledge base to keep them engaged. ' +
          'When a lead is qualified, suggest connecting with an agent for next steps.'
        );

      case 'book_appointment':
        return (
          'Help customers schedule appointments or meetings. ' +
          'Collect necessary information: preferred date/time, type of service, contact details. ' +
          'Provide available options from the knowledge base when possible. ' +
          'Confirm all details before finalizing.'
        );

      case 'handle_support':
        return (
          'Provide customer support by troubleshooting issues and answering questions. ' +
          'Be empathetic and patient. Search the knowledge base for solutions. ' +
          'If the issue requires human intervention, offer to connect with a support agent. ' +
          "Always acknowledge the customer's frustration and provide clear next steps."
        );

      case 'custom':
        return (
          'Assist the customer based on the additional context provided below. ' +
          'Be helpful, accurate, and professional in all interactions.'
        );

      default:
        return 'Assist the customer with their inquiry using available information.';
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
