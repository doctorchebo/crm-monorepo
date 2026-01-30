/**
 * Workflow-Aware AI Response Generator
 * Enhanced AI response generation that respects workflow configurations
 *
 * This service extends the base AI response generation with:
 * - Workflow context awareness
 * - Node-specific AI instructions
 * - Knowledge base filtering based on workflow
 * - Escalation trigger detection
 * - Response validation against workflow rules
 */

import { db } from '@database/db.connection';
import { messages } from '@database/schema';
import { RetrievalService } from '@modules/knowledge-base/services';
import { Injectable, Logger } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type {
  AIResponseGenerationContext,
  ResolvedWorkflowAIInstructions,
  WorkflowAIContext,
} from '../../types/workflow-ai-context.types';
import type { MediaPreCheckResult } from '../../types/workflow-engine.types';
import { ClassificationResult, LLMService } from '../llm.service';
import { StageService } from '../stage.service';
import { WorkflowContextProviderService } from '../workflow-context-provider.service';
import {
  buildConversationContextForRetrieval,
  getMediaTypeLabel,
} from './workflow-utils';

// ============================================================================
// Types
// ============================================================================

export interface WorkflowAwareAIResponseOptions {
  /** Chat ID */
  chatId: string;
  /** User ID */
  userId: number;
  /** Customer's message */
  customerMessage: string;
  /** Message classification */
  classification: ClassificationResult;
  /** Media context (if media will be attached) */
  mediaContext?: MediaPreCheckResult;
  /** Force skip workflow context (for testing) */
  skipWorkflowContext?: boolean;
  /** Additional context for debugging */
  debugMode?: boolean;
}

export interface WorkflowAwareAIResponse {
  /** Generated response content */
  content: string;
  /** Whether response should be sent */
  shouldSend: boolean;
  /** Whether handoff was triggered by escalation */
  escalationTriggered: boolean;
  /** Escalation reason if triggered */
  escalationReason?: string;
  /** Debug context (if debugMode was true) */
  debugContext?: AIResponseGenerationContext;
  /** Warnings generated during response */
  warnings: string[];
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class WorkflowAwareAIResponseGenerator {
  private readonly logger = new Logger(WorkflowAwareAIResponseGenerator.name);

  constructor(
    private readonly llmService: LLMService,
    private readonly stageService: StageService,
    private readonly retrievalService: RetrievalService,
    private readonly workflowContextProvider: WorkflowContextProviderService,
  ) {}

  /**
   * Generate AI response with full workflow context awareness
   */
  async generateResponse(
    options: WorkflowAwareAIResponseOptions,
  ): Promise<WorkflowAwareAIResponse> {
    const {
      chatId,
      userId,
      customerMessage,
      classification,
      mediaContext,
      skipWorkflowContext = false,
      debugMode = false,
    } = options;

    const warnings: string[] = [];
    let escalationTriggered = false;
    let escalationReason: string | undefined;

    // Step 1: Get workflow context
    let context: WorkflowAIContext;
    let instructions: ResolvedWorkflowAIInstructions;

    if (!skipWorkflowContext) {
      const aiContext = await this.workflowContextProvider.getAIContext(
        chatId,
        userId,
      );
      context = aiContext.context;
      instructions = aiContext.instructions;

      // Add validation warnings
      for (const warning of aiContext.validation.warnings) {
        warnings.push(`${warning.code}: ${warning.message}`);
      }

      // Check if AI is disabled by workflow
      if (!context.aiEnabled) {
        return {
          content: '',
          shouldSend: false,
          escalationTriggered: false,
          warnings: [`AI disabled: ${context.aiDisabledReason}`],
        };
      }
    } else {
      // Use defaults when skipping workflow context
      context = this.getDefaultContext();
      instructions = this.getDefaultInstructions();
    }

    // Step 2: Check escalation triggers
    const escalationCheck = this.checkEscalationTriggers(
      customerMessage,
      classification,
      instructions.escalationTriggers,
    );
    if (escalationCheck.triggered) {
      escalationTriggered = true;
      escalationReason = escalationCheck.reason;
      this.logger.log(
        `[Workflow AI] Escalation triggered for chat ${chatId}: ${escalationReason}`,
      );
    }

    // Step 3: Get conversation history
    const recentMessages = await this.getRecentMessages(chatId);

    // Step 4: Get knowledge base context (filtered by workflow if applicable)
    const { knowledgeContext, hasKnowledgeBase } =
      await this.getKnowledgeBaseContext(
        userId,
        customerMessage,
        recentMessages,
        instructions.allowedKbTemplates,
      );

    // Step 5: Build the system prompt
    const systemPrompt = this.buildWorkflowAwareSystemPrompt(
      context,
      instructions,
      classification,
      knowledgeContext,
      hasKnowledgeBase,
      mediaContext,
    );

    // Step 6: Build messages for LLM
    const chatMessages = this.buildChatMessages(
      systemPrompt,
      recentMessages,
      customerMessage,
    );

    // Step 7: Generate response
    const response = await this.llmService.chat({
      userId,
      chatId,
      operationType: 'chat',
      messages: chatMessages,
      maxTokens: instructions.maxResponseLength || 512,
      temperature: (instructions.temperature || 70) / 100,
    });

    // Step 8: Validate response length
    let finalContent = response.content;
    if (
      instructions.maxResponseLength &&
      finalContent.length > instructions.maxResponseLength
    ) {
      warnings.push(
        `Response truncated from ${finalContent.length} to ${instructions.maxResponseLength} characters`,
      );
      finalContent = this.truncateResponse(
        finalContent,
        instructions.maxResponseLength,
      );
    }

    // Step 9: Check for avoided topics in response
    const avoidedTopicCheck = this.checkAvoidedTopics(
      finalContent,
      instructions.avoidTopics,
    );
    if (avoidedTopicCheck.found) {
      warnings.push(
        `Response may contain avoided topics: ${avoidedTopicCheck.topics.join(', ')}`,
      );
    }

    // Build debug context if requested
    let debugContext: AIResponseGenerationContext | undefined;
    if (debugMode) {
      debugContext = {
        chatId,
        userId,
        customerMessage,
        workflowContext: context,
        resolvedInstructions: instructions,
        validation: {
          canProceed: true,
          errors: [],
          warnings: warnings.map((w) => ({ code: 'WARNING', message: w })),
          recommendations: [],
        },
        finalSystemPrompt: systemPrompt,
        knowledgeBaseContext: knowledgeContext || null,
        mediaContext: mediaContext
          ? {
              willHaveMedia: mediaContext.willHaveMedia,
              mediaType: mediaContext.mediaType,
              mediaDescription: mediaContext.mediaDescription,
            }
          : null,
        timestamp: new Date(),
      };
    }

    return {
      content: finalContent,
      shouldSend: !escalationTriggered || instructions.allowFreeTextReplies,
      escalationTriggered,
      escalationReason,
      debugContext,
      warnings,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async getRecentMessages(chatId: string) {
    return db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp))
      .limit(10);
  }

  private async getKnowledgeBaseContext(
    userId: number,
    customerMessage: string,
    recentMessages: any[],
    allowedTemplates: string[],
  ): Promise<{ knowledgeContext: string; hasKnowledgeBase: boolean }> {
    try {
      const conversationContext =
        buildConversationContextForRetrieval(recentMessages);

      const kbResponse = await this.retrievalService.retrieveByObject(
        userId,
        customerMessage,
        {
          topK: 5,
          minSimilarity: 0.15,
          conversationContext,
        },
      );

      if (kbResponse.results.length === 0) {
        return { knowledgeContext: '', hasKnowledgeBase: false };
      }

      // Filter by allowed templates if specified
      let filteredResults = kbResponse.results;
      if (allowedTemplates.length > 0) {
        filteredResults = kbResponse.results.filter((r) =>
          allowedTemplates.includes(r.templateId),
        );

        if (filteredResults.length < kbResponse.results.length) {
          this.logger.debug(
            `[KB Filter] Filtered ${kbResponse.results.length - filteredResults.length} results by allowed templates`,
          );
        }
      }

      if (filteredResults.length === 0) {
        return { knowledgeContext: '', hasKnowledgeBase: false };
      }

      const kbContextParts = filteredResults.map(
        (result) =>
          `### ${result.templateName}: ${result.objectName}\n${result.content}`,
      );

      const knowledgeContext = `

==========================================================================
KNOWLEDGE BASE DATA - USE THIS INFORMATION TO ANSWER THE CUSTOMER
==========================================================================

${kbContextParts.join('\n\n---\n\n')}

==========================================================================
END OF KNOWLEDGE BASE DATA
==========================================================================`;

      return { knowledgeContext, hasKnowledgeBase: true };
    } catch (error) {
      this.logger.warn(
        `[KB Retrieval] Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { knowledgeContext: '', hasKnowledgeBase: false };
    }
  }

  private buildWorkflowAwareSystemPrompt(
    context: WorkflowAIContext,
    instructions: ResolvedWorkflowAIInstructions,
    classification: ClassificationResult,
    knowledgeContext: string,
    hasKnowledgeBase: boolean,
    mediaContext?: MediaPreCheckResult,
  ): string {
    const parts: string[] = [];

    // Base role and context
    parts.push(`You are a helpful assistant.`);

    // Add workflow context
    if (context.assignment.isAssigned) {
      parts.push(`
==========================================================================
WORKFLOW CONTEXT
==========================================================================

Active Workflow: "${context.assignment.workflowName || 'Active Workflow'}"
${context.currentStage ? `Current Stage: "${context.currentStage.name}"` : ''}
${instructions.goal ? `\nYour Primary Goal: ${instructions.goal}` : ''}
`);
    }

    // Add stage context
    if (context.currentStage) {
      parts.push(`Customer Stage: "${context.currentStage.name}"
${context.currentStage.description ? `Stage Description: ${context.currentStage.description}` : ''}`);
    }

    // Add message classification
    parts.push(`
Message Analysis:
- Category: ${classification.category}
- Intent: ${classification.intent || 'general'}
- Sentiment: ${classification.sentiment} (${classification.sentimentScore > 0 ? '+' : ''}${classification.sentimentScore})
`);

    // Add workflow-specific instructions
    if (instructions.systemPromptAddition) {
      parts.push(`
==========================================================================
SPECIFIC INSTRUCTIONS FOR THIS CONVERSATION
==========================================================================

${instructions.systemPromptAddition}
`);
    }

    // Add communication style
    parts.push(`
==========================================================================
COMMUNICATION STYLE
==========================================================================

Tone: ${instructions.tone}
Formality Level: ${instructions.formalityLevel}
${instructions.languagePreference ? `Preferred Language: ${instructions.languagePreference}` : ''}
Maximum Response Length: ${instructions.maxResponseLength} characters
`);

    // Add topics to avoid
    if (instructions.avoidTopics.length > 0) {
      parts.push(`
==========================================================================
TOPICS TO AVOID
==========================================================================

Do NOT discuss or mention the following topics:
${instructions.avoidTopics.map((t) => `- ${t}`).join('\n')}
`);
    }

    // Add escalation triggers
    if (instructions.escalationTriggers.length > 0) {
      parts.push(`
==========================================================================
ESCALATION TRIGGERS
==========================================================================

If the customer mentions any of the following, acknowledge their concern and inform them a specialist will assist:
${instructions.escalationTriggers.map((t) => `- ${t}`).join('\n')}
`);
    }

    // Add media context
    if (mediaContext?.willHaveMedia && mediaContext.mediaType) {
      const mediaTypeLabel = getMediaTypeLabel(mediaContext.mediaType);
      parts.push(`
==========================================================================
MEDIA ATTACHMENT
==========================================================================

A ${mediaTypeLabel} WILL be automatically attached to your response.
Media: "${mediaContext.mediaDescription || mediaContext.mediaFileName}"
${mediaContext.aiInstructions ? `Instructions: ${mediaContext.aiInstructions}` : ''}

Reference the attached ${mediaTypeLabel} naturally in your response.
`);
    }

    // Add knowledge base context
    if (hasKnowledgeBase) {
      parts.push(`
==========================================================================
KNOWLEDGE BASE INSTRUCTIONS
==========================================================================

CRITICAL: Use the knowledge base data below to answer the customer's question.
Include SPECIFIC details: prices, features, locations, etc.
DO NOT say "I don't have that information" if it's in the knowledge base.
${knowledgeContext}
`);
    } else {
      parts.push(`
==========================================================================
RESPONSE GUIDANCE
==========================================================================

No specific product/service data is available for this query.
Provide a helpful general response based on the conversation context.
If specific details are needed, let the customer know an agent will follow up.
`);
    }

    return parts.join('\n');
  }

  private buildChatMessages(
    systemPrompt: string,
    recentMessages: any[],
    customerMessage: string,
  ) {
    return [
      { role: 'system' as const, content: systemPrompt },
      ...recentMessages.reverse().map((msg) => ({
        role: (msg.direction === 'outbound' ? 'assistant' : 'user') as
          | 'assistant'
          | 'user',
        content: msg.text || '',
      })),
      { role: 'user' as const, content: customerMessage },
    ];
  }

  private checkEscalationTriggers(
    message: string,
    classification: ClassificationResult,
    triggers: string[],
  ): { triggered: boolean; reason?: string } {
    const lowerMessage = message.toLowerCase();

    // Check explicit triggers
    for (const trigger of triggers) {
      if (lowerMessage.includes(trigger.toLowerCase())) {
        return { triggered: true, reason: `Trigger matched: "${trigger}"` };
      }
    }

    // Check classification-based triggers
    const escalationCategories = ['complaint', 'urgent', 'legal', 'refund'];
    if (
      classification.category &&
      escalationCategories.includes(classification.category.toLowerCase())
    ) {
      return {
        triggered: true,
        reason: `High-priority category: ${classification.category}`,
      };
    }

    // Check sentiment-based triggers
    if (
      classification.sentiment === 'negative' &&
      classification.sentimentScore < -50
    ) {
      return {
        triggered: true,
        reason: `Strong negative sentiment: ${classification.sentimentScore}`,
      };
    }

    return { triggered: false };
  }

  private checkAvoidedTopics(
    response: string,
    avoidTopics: string[],
  ): { found: boolean; topics: string[] } {
    const lowerResponse = response.toLowerCase();
    const foundTopics: string[] = [];

    for (const topic of avoidTopics) {
      if (lowerResponse.includes(topic.toLowerCase())) {
        foundTopics.push(topic);
      }
    }

    return { found: foundTopics.length > 0, topics: foundTopics };
  }

  private truncateResponse(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Try to truncate at a sentence boundary
    const truncated = content.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?'),
    );

    if (lastSentenceEnd > maxLength * 0.7) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }

    // Fall back to word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  private getDefaultContext(): WorkflowAIContext {
    return {
      assignment: {
        isAssigned: false,
        workflowId: null,
        workflowName: null,
        workflowVersion: null,
        executionId: null,
        assignedAt: null,
        assignmentSource: null,
      },
      nodeInstructions: null,
      triggerContext: null,
      currentStage: null,
      workflowVariables: {},
      aiEnabled: true,
      aiDisabledReason: null,
    };
  }

  private getDefaultInstructions(): ResolvedWorkflowAIInstructions {
    return {
      systemPromptAddition: '',
      tone: 'friendly',
      goal: null,
      formalityLevel: 'balanced',
      maxResponseLength: 500,
      temperature: 70,
      avoidTopics: [],
      allowedKbTemplates: [],
      languagePreference: null,
      allowFreeTextReplies: true,
      useTemplatesOnly: false,
      escalationTriggers: [],
      sources: {
        systemPromptAddition: {
          type: 'system',
          priority: 0,
          sourceId: null,
          description: 'Default',
        },
        tone: {
          type: 'system',
          priority: 0,
          sourceId: null,
          description: 'Default',
        },
        goal: null,
        formalityLevel: {
          type: 'system',
          priority: 0,
          sourceId: null,
          description: 'Default',
        },
        maxResponseLength: {
          type: 'system',
          priority: 0,
          sourceId: null,
          description: 'Default',
        },
        temperature: {
          type: 'system',
          priority: 0,
          sourceId: null,
          description: 'Default',
        },
        allowedKbTemplates: {
          type: 'system',
          priority: 0,
          sourceId: null,
          description: 'Default',
        },
      },
    };
  }
}
