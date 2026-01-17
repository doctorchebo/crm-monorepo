/**
 * AI Response Generator
 * Handles AI response generation, classification, and prompt building
 */

import { db } from '@database/db.connection';
import { messages } from '@database/schema';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { RetrievalService } from '@modules/knowledge-base/services';
import { LLMService, ClassificationResult } from '../llm.service';
import { StageService } from '../stage.service';
import {
  buildConversationContextForRetrieval,
  getMediaTypeLabel,
} from './workflow-utils';
import type { MediaPreCheckResult } from '../../types/workflow-engine.types';

@Injectable()
export class AiResponseGenerator {
  private readonly logger = new Logger(AiResponseGenerator.name);

  constructor(
    private readonly llmService: LLMService,
    private readonly stageService: StageService,
    private readonly retrievalService: RetrievalService,
  ) {}

  /**
   * Classify a message using AI
   */
  async classifyMessage(
    content: string,
    userId: number,
  ): Promise<ClassificationResult> {
    try {
      const result = await this.llmService.classifyMessage(
        content,
        {},
        { userId },
      );
      return result;
    } catch (error) {
      this.logger.warn('Failed to classify message, using defaults');
      return {
        category: 'general',
        sentiment: 'neutral',
        sentimentScore: 0,
        keywords: [],
        confidence: 50,
        requiresHandoff: false,
      };
    }
  }

  /**
   * Generate AI response based on context
   * Includes Knowledge Base retrieval for relevant information
   * Now includes media context so AI knows when media will be attached
   */
  async generateAIResponse(
    chatId: string,
    customerMessage: string,
    classification: ClassificationResult,
    userId: number,
    mediaContext?: MediaPreCheckResult,
  ): Promise<string> {
    // Get conversation history
    const recentMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp))
      .limit(10);

    // Get current stage for context
    const stageAssignment = await this.stageService.getChatStage(chatId);
    let stageName = 'New';
    if (stageAssignment?.stageId) {
      const stage = await this.stageService.getStageById(
        stageAssignment.stageId,
      );
      stageName = stage?.name || 'Unknown';
    }

    // Build conversation context for KB retrieval
    // This helps match generic queries like "what's the price?" to specific KB items
    const conversationContext =
      buildConversationContextForRetrieval(recentMessages);

    // Retrieve relevant knowledge from KB
    let knowledgeContext = '';
    let hasKnowledgeBase = false;
    try {
      const kbResponse = await this.retrievalService.retrieveByObject(
        userId,
        customerMessage,
        {
          topK: 5,
          minSimilarity: 0.15, // Lower threshold for text-embedding-3-large with 1536 dims
          conversationContext, // Include conversation context for better matching
        },
      );

      if (kbResponse.results.length > 0) {
        hasKnowledgeBase = true;
        this.logger.log(
          `[KB Retrieval] Found ${kbResponse.results.length} relevant KB results for query: "${customerMessage.substring(0, 50)}..."`,
        );

        // Format KB results into structured context with clear data sections
        const kbContextParts = kbResponse.results.map((result, index) => {
          // Log each result for debugging
          this.logger.debug(
            `[KB Result ${index + 1}] ${result.objectName} (similarity: ${result.similarity.toFixed(3)}): ${result.content.substring(0, 100)}...`,
          );
          return `### ${result.templateName}: ${result.objectName}\n${result.content}`;
        });

        knowledgeContext = `

==========================================================================
KNOWLEDGE BASE DATA - USE THIS INFORMATION TO ANSWER THE CUSTOMER
==========================================================================

${kbContextParts.join('\n\n---\n\n')}

==========================================================================
END OF KNOWLEDGE BASE DATA
==========================================================================`;
      } else {
        this.logger.debug(
          `[KB Retrieval] No KB results found for query: "${customerMessage.substring(0, 50)}..."`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `[KB Retrieval] Failed to retrieve KB context: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Continue without KB context - don't fail the response
    }

    // Build system prompt with explicit instructions for KB data usage and media context
    const systemPrompt = this.buildSystemPrompt(
      stageName,
      classification,
      knowledgeContext,
      hasKnowledgeBase,
      mediaContext,
    );

    // Build context messages
    const chatMessages = [
      {
        role: 'system' as const,
        content: systemPrompt,
      },
      ...recentMessages.reverse().map((msg) => ({
        role: (msg.direction === 'outbound' ? 'assistant' : 'user') as
          | 'assistant'
          | 'user',
        content: msg.text || '',
      })),
      {
        role: 'user' as const,
        content: customerMessage,
      },
    ];

    const response = await this.llmService.chat({
      userId,
      chatId,
      operationType: 'chat',
      messages: chatMessages,
      maxTokens: 512, // Increased to allow for more detailed responses with KB data
      temperature: 0.7,
    });

    return response.content;
  }

  /**
   * Build the system prompt for AI responses
   * Includes specific instructions based on whether KB data and media are available
   */
  private buildSystemPrompt(
    stageName: string,
    classification: ClassificationResult,
    knowledgeContext: string,
    hasKnowledgeBase: boolean,
    mediaContext?: MediaPreCheckResult,
  ): string {
    const basePrompt = `You are a friendly and professional sales assistant.
The customer is in the "${stageName}" stage of the process.
Message classification: category=${classification.category}, intent=${classification.intent || 'unknown'}, sentiment=${classification.sentiment}.`;

    // Build media context instructions if media will be attached
    let mediaInstructions = '';
    if (mediaContext?.willHaveMedia && mediaContext.mediaType) {
      const mediaTypeLabel = getMediaTypeLabel(mediaContext.mediaType);

      // Include AI instructions if available
      const aiGuidance = mediaContext.aiInstructions
        ? `\nWHEN TO SEND THIS MEDIA: ${mediaContext.aiInstructions}`
        : '';

      mediaInstructions = `

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
   - "Take a look at this ${mediaTypeLabel}..."
5. Keep your text response concise since the ${mediaTypeLabel} provides visual context.${
        mediaContext.aiInstructions
          ? `
6. Follow the "WHEN TO SEND THIS MEDIA" guidance above to determine if this media is appropriate for the current conversation context.`
          : ''
      }
==========================================================================`;
    }

    if (hasKnowledgeBase) {
      return `${basePrompt}
${mediaInstructions}

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

    // No KB data available
    return `${basePrompt}
${mediaInstructions}

INSTRUCTIONS:
1. No specific product/service information is available in the knowledge base for this query.
2. Provide a helpful general response.
${!mediaContext?.willHaveMedia ? "3. If the customer is asking for specific details you don't have, let them know an agent will contact them shortly with more information." : "3. Use the attached media to help answer the customer's query."}
4. Keep responses friendly and professional.`;
  }
}
