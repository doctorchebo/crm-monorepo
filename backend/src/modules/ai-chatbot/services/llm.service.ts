/**
 * LLM Service
 * Provider-agnostic interface for LLM operations with usage tracking
 *
 * Features:
 * - Unified interface for chat, classification, and embedding
 * - Automatic usage logging for billing
 * - Support for multiple providers (OpenAI, Anthropic, etc.)
 * - Cost calculation and tracking
 * - AI configuration awareness (tone, style, limits)
 */

import { db } from '@database/db.connection';
import { llmUsageLogs } from '@database/schema';
import { ProviderRegistry } from '@modules/ai-memory/providers';
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from '@modules/ai-memory/providers/types';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiConfigurationService,
  ResolvedAiConfig,
} from './ai-configuration.service';

// ============================================================================
// Types
// ============================================================================

export interface LLMRequest {
  userId?: number;
  chatId?: string;
  operationType:
    | 'chat'
    | 'classification'
    | 'embedding'
    | 'transcription'
    | 'summary';
  messages?: ChatMessage[];
  content?: string;
  maxTokens?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
  /** Skip AI configuration application (for internal/system messages) */
  skipConfigEnhancement?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  cost: {
    input: string;
    output: string;
    total: string;
  };
  latencyMs: number;
  logId: string;
}

export interface ClassificationResult {
  category: string;
  subcategory?: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  intent?: string;
  keywords: string[];
  confidence: number;
  requiresHandoff: boolean;
  handoffReason?: string;
}

// Cost per 1M tokens for different models (approximate, update as needed)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
};

/**
 * LLM Service
 */
@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly defaultModel: string;

  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => AiConfigurationService))
    private readonly aiConfigService: AiConfigurationService,
  ) {
    this.defaultModel = this.configService.get<string>(
      'AI_REPLY_MODEL',
      'gpt-4o-mini',
    );
  }

  /**
   * Execute a chat completion with usage tracking
   */
  async chat(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const provider = this.providerRegistry.getChatProvider();

    if (!provider) {
      throw new Error('No chat provider available');
    }

    // Apply AI configuration if available and not skipped
    let enhancedMessages = request.messages || [];
    let aiConfig: ResolvedAiConfig | null = null;

    if (
      !request.skipConfigEnhancement &&
      request.userId &&
      request.operationType === 'chat'
    ) {
      try {
        aiConfig = await this.aiConfigService.resolveConfiguration(
          request.userId,
          request.chatId,
        );

        this.logger.log(
          `[LLM Config] Chat ${request.chatId}: aiEnabled=${aiConfig.aiEnabled}, hasOverride=${aiConfig.source.hasChatOverride}`,
        );

        // Check if AI is enabled for this context
        if (!aiConfig.aiEnabled) {
          this.logger.log(
            `[LLM Config] AI is disabled for chat ${request.chatId}, throwing AI_DISABLED_FOR_CHAT`,
          );
          throw new Error('AI_DISABLED_FOR_CHAT');
        }

        // Enhance messages with configuration
        enhancedMessages = this.applyConfigToMessages(
          enhancedMessages,
          aiConfig,
        );
      } catch (error) {
        if (error.message === 'AI_DISABLED_FOR_CHAT') {
          throw error;
        }
        // Log but don't fail if config resolution fails
        this.logger.warn(
          `Failed to resolve AI config for user ${request.userId}: ${error.message}`,
        );
      }
    }

    // Apply temperature from config if available
    const temperature =
      request.temperature ??
      (aiConfig ? aiConfig.temperature / 100 : undefined);

    const chatRequest: ChatCompletionRequest = {
      messages: enhancedMessages,
      maxTokens: request.maxTokens ?? aiConfig?.maxResponseLength,
      temperature,
    };

    let response: ChatCompletionResponse | undefined;
    let status = 'success';
    let errorCode: string | undefined;
    let errorMessage: string | undefined;

    try {
      response = await provider.chat(chatRequest);
    } catch (error) {
      status = 'failed';
      errorCode = error.code || 'UNKNOWN';
      errorMessage = error.message;

      // Log failed request
      const latencyMs = Date.now() - startTime;
      await this.logUsage({
        userId: request.userId,
        chatId: request.chatId,
        provider: provider.name,
        model: this.defaultModel,
        operationType: request.operationType,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        latencyMs,
        status,
        errorCode,
        errorMessage,
        requestMetadata: request.metadata,
        responseMetadata: undefined,
      });

      throw error;
    }

    // Success path - log and return
    const latencyMs = Date.now() - startTime;
    const logId = await this.logUsage({
      userId: request.userId,
      chatId: request.chatId,
      provider: provider.name,
      model: response.model || this.defaultModel,
      operationType: request.operationType,
      inputTokens: response.tokensUsed?.prompt || 0,
      outputTokens: response.tokensUsed?.completion || 0,
      totalTokens: response.tokensUsed?.total || 0,
      latencyMs,
      status,
      errorCode,
      errorMessage,
      requestMetadata: request.metadata,
      responseMetadata: { finishReason: response.finishReason },
    });

    const cost = this.calculateCost(
      response.model,
      response.tokensUsed.prompt,
      response.tokensUsed.completion,
    );

    return {
      content: response.content,
      model: response.model,
      provider: provider.name,
      tokensUsed: {
        input: response.tokensUsed.prompt,
        output: response.tokensUsed.completion,
        total: response.tokensUsed.total,
      },
      cost,
      latencyMs,
      logId,
    };
  }

  /**
   * Apply AI configuration to messages
   * Enhances the system prompt with tone, style, and other configuration
   */
  private applyConfigToMessages(
    messages: ChatMessage[],
    config: ResolvedAiConfig,
  ): ChatMessage[] {
    const configInstructions =
      this.aiConfigService.buildPromptInstructions(config);

    if (!configInstructions) {
      return messages;
    }

    // Find and enhance system message, or add one
    const hasSystemMessage = messages.some((m) => m.role === 'system');

    if (hasSystemMessage) {
      return messages.map((m) =>
        m.role === 'system'
          ? {
              ...m,
              content: `${m.content}\n\n--- Communication Guidelines ---\n${configInstructions}`,
            }
          : m,
      );
    }

    // Add system message at the beginning
    return [
      {
        role: 'system' as const,
        content: `--- Communication Guidelines ---\n${configInstructions}`,
      },
      ...messages,
    ];
  }

  /**
   * Generate a chat response with full configuration awareness
   * This is the main method for generating contextual AI responses
   */
  async generateConfiguredResponse(params: {
    userId: number;
    chatId: string;
    userMessage: string;
    conversationHistory?: ChatMessage[];
    additionalContext?: string;
  }): Promise<{
    response: LLMResponse;
    config: ResolvedAiConfig;
    blocked: boolean;
    blockReason?: string;
  }> {
    // Get resolved configuration
    const config = await this.aiConfigService.resolveConfiguration(
      params.userId,
      params.chatId,
    );

    // Check if AI is enabled
    if (!config.aiEnabled) {
      return {
        response: {
          content: '',
          model: '',
          provider: '',
          tokensUsed: { input: 0, output: 0, total: 0 },
          cost: { input: '0', output: '0', total: '0' },
          latencyMs: 0,
          logId: '',
        },
        config,
        blocked: true,
        blockReason: 'AI is disabled for this chat',
      };
    }

    // Check if templates only mode
    if (config.useTemplatesOnly) {
      return {
        response: {
          content: '',
          model: '',
          provider: '',
          tokensUsed: { input: 0, output: 0, total: 0 },
          cost: { input: '0', output: '0', total: '0' },
          latencyMs: 0,
          logId: '',
        },
        config,
        blocked: true,
        blockReason: 'Only templates are allowed for this context',
      };
    }

    // Build messages
    const messages: ChatMessage[] = [];

    // Add system context
    let systemContent =
      'You are a helpful assistant for a WhatsApp business CRM.';

    if (params.additionalContext) {
      systemContent += `\n\n${params.additionalContext}`;
    }

    messages.push({ role: 'system', content: systemContent });

    // Add conversation history if provided
    if (params.conversationHistory?.length) {
      messages.push(...params.conversationHistory);
    }

    // Add the current user message
    messages.push({ role: 'user', content: params.userMessage });

    // Execute with configuration (will be applied in chat method)
    const response = await this.chat({
      userId: params.userId,
      chatId: params.chatId,
      operationType: 'chat',
      messages,
      maxTokens: config.maxResponseLength,
      temperature: config.temperature / 100,
      metadata: {
        configSource: config.source,
        tone: config.tone,
        style: config.style,
      },
    });

    return {
      response,
      config,
      blocked: false,
    };
  }

  /**
   * Classify a message using AI
   */
  async classifyMessage(
    messageText: string,
    context?: {
      recentMessages?: Array<{
        role: 'customer' | 'business';
        text: string;
      }>;
      customerName?: string;
      currentStageName?: string;
      availableStages?: string[];
    },
    options?: {
      userId?: number;
      chatId?: string;
    },
  ): Promise<ClassificationResult> {
    const systemPrompt = this.buildClassificationPrompt(context);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: messageText },
    ];

    const response = await this.chat({
      userId: options?.userId,
      chatId: options?.chatId,
      operationType: 'classification',
      messages,
      temperature: 0.1, // Low temperature for consistent classification
      maxTokens: 500,
      metadata: {
        messageLength: messageText.length,
        hasContext: !!context,
      },
    });

    return this.parseClassificationResponse(response.content);
  }

  /**
   * Classify a message into one of the provided categories using AI.
   * Used for categories-based message classification.
   */
  async classifyWithCategories(
    messageText: string,
    categories: string[],
    systemPrompt?: string,
    options?: {
      userId?: number;
      chatId?: string;
    },
  ): Promise<ClassificationResult> {
    const defaultSystemPrompt = `You are a message classifier. Analyze the message and classify it into ONE of these categories: ${categories.join(', ')}.

Respond with ONLY the category name. Nothing else.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt || defaultSystemPrompt },
      { role: 'user', content: messageText },
    ];

    try {
      const response = await this.chat({
        userId: options?.userId,
        chatId: options?.chatId,
        operationType: 'classification',
        messages,
        temperature: 0.1, // Low temperature for consistent classification
        maxTokens: 50, // Only need category name
        metadata: {
          messageLength: messageText.length,
          categories,
        },
      });

      // Extract the category from the response
      const rawCategory = response.content.trim().toLowerCase();

      // Find the best matching category
      const normalizedCategories = categories.map((c) => c.toLowerCase());
      let matchedCategory = rawCategory;

      // Direct match
      if (normalizedCategories.includes(rawCategory)) {
        matchedCategory = categories[normalizedCategories.indexOf(rawCategory)];
      } else {
        // Fuzzy match - check if response contains any category
        for (let i = 0; i < normalizedCategories.length; i++) {
          if (
            rawCategory.includes(normalizedCategories[i]) ||
            normalizedCategories[i].includes(rawCategory)
          ) {
            matchedCategory = categories[i];
            break;
          }
        }
      }

      this.logger.debug(
        `[LLM Classification] Raw: "${rawCategory}" → Matched: "${matchedCategory}"`,
      );

      return {
        category: matchedCategory.toLowerCase(),
        sentiment: 'neutral',
        sentimentScore: 0,
        keywords: [],
        confidence: 85, // Default confidence for category match
        requiresHandoff: false,
      };
    } catch (error) {
      this.logger.error(
        `[LLM Classification] Error classifying: ${error.message}`,
      );

      // Return first category as fallback
      return {
        category: categories[0]?.toLowerCase() || 'default',
        sentiment: 'neutral',
        sentimentScore: 0,
        keywords: [],
        confidence: 0,
        requiresHandoff: false,
      };
    }
  }

  /**
   * Build classification system prompt
   */
  private buildClassificationPrompt(context?: {
    recentMessages?: Array<{ role: 'customer' | 'business'; text: string }>;
    customerName?: string;
    currentStageName?: string;
    availableStages?: string[];
  }): string {
    let prompt = `You are a message classification AI for a WhatsApp CRM system.
Analyze the customer message and respond with a JSON object containing:

{
  "category": "one of: inquiry, complaint, support, purchase_intent, feedback, greeting, farewell, pricing, availability, shipping, returns, technical, general",
  "subcategory": "optional more specific category",
  "sentiment": "positive, negative, or neutral",
  "sentimentScore": -100 to 100 (negative to positive),
  "intent": "the customer's likely intent",
  "keywords": ["array", "of", "key", "words"],
  "confidence": 0-100,
  "requiresHandoff": true/false (whether human intervention is needed),
  "handoffReason": "reason if handoff is required"
}

Guidelines:
- Set requiresHandoff to true for: complex complaints, pricing negotiations, legal issues, angry customers, or requests beyond AI capability
- Be accurate with sentiment - consider context and tone
- Extract meaningful keywords that could be useful for routing`;

    if (context?.availableStages?.length) {
      prompt += `\n\nAvailable pipeline stages: ${context.availableStages.join(', ')}`;
    }

    if (context?.currentStageName) {
      prompt += `\nCurrent stage: ${context.currentStageName}`;
    }

    if (context?.customerName) {
      prompt += `\nCustomer name: ${context.customerName}`;
    }

    if (context?.recentMessages?.length) {
      prompt += '\n\nRecent conversation context:';
      for (const msg of context.recentMessages.slice(-5)) {
        prompt += `\n${msg.role === 'customer' ? 'Customer' : 'Business'}: ${msg.text}`;
      }
    }

    prompt +=
      '\n\nRespond ONLY with the JSON object, no markdown or explanation.';

    return prompt;
  }

  /**
   * Parse classification response from LLM
   */
  private parseClassificationResponse(content: string): ClassificationResult {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '');
      }

      const parsed = JSON.parse(jsonStr);

      return {
        category: parsed.category || 'general',
        subcategory: parsed.subcategory,
        sentiment: parsed.sentiment || 'neutral',
        sentimentScore: Number(parsed.sentimentScore) || 0,
        intent: parsed.intent,
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        confidence: Number(parsed.confidence) || 50,
        requiresHandoff: Boolean(parsed.requiresHandoff),
        handoffReason: parsed.handoffReason,
      };
    } catch (error) {
      this.logger.warn(`Failed to parse classification response: ${content}`);
      return {
        category: 'general',
        sentiment: 'neutral',
        sentimentScore: 0,
        keywords: [],
        confidence: 0,
        requiresHandoff: false,
      };
    }
  }

  /**
   * Calculate cost for token usage
   */
  private calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): { input: string; output: string; total: string } {
    const costs = MODEL_COSTS[model] || { input: 0.15, output: 0.6 }; // Default to gpt-4o-mini

    const inputCost = (inputTokens / 1_000_000) * costs.input;
    const outputCost = (outputTokens / 1_000_000) * costs.output;
    const totalCost = inputCost + outputCost;

    return {
      input: inputCost.toFixed(6),
      output: outputCost.toFixed(6),
      total: totalCost.toFixed(6),
    };
  }

  /**
   * Log LLM usage to database
   */
  private async logUsage(data: {
    userId?: number;
    chatId?: string;
    provider: string;
    model: string;
    operationType: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    latencyMs: number;
    status: string;
    errorCode?: string;
    errorMessage?: string;
    requestMetadata?: Record<string, unknown>;
    responseMetadata?: Record<string, unknown>;
  }): Promise<string> {
    const cost = this.calculateCost(
      data.model,
      data.inputTokens,
      data.outputTokens,
    );

    try {
      const [log] = await db
        .insert(llmUsageLogs)
        .values({
          userId: data.userId,
          chatId: data.chatId,
          provider: data.provider,
          model: data.model,
          operationType: data.operationType,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          totalTokens: data.totalTokens,
          inputCost: cost.input,
          outputCost: cost.output,
          totalCost: cost.total,
          latencyMs: data.latencyMs,
          status: data.status,
          errorCode: data.errorCode,
          errorMessage: data.errorMessage,
          requestMetadata: data.requestMetadata || {},
          responseMetadata: data.responseMetadata || {},
        })
        .returning({ id: llmUsageLogs.id });

      return log.id;
    } catch (error) {
      this.logger.error(`Failed to log LLM usage: ${error.message}`);
      return 'log-failed';
    }
  }

  /**
   * Get usage statistics for a user
   */
  async getUsageStats(
    userId: number,
    options?: {
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<{
    totalRequests: number;
    totalTokens: number;
    totalCostUsd: number;
    byProvider: Record<
      string,
      { requests: number; tokens: number; cost: number }
    >;
    byOperationType: Record<
      string,
      { requests: number; tokens: number; cost: number }
    >;
  }> {
    const { startDate, endDate } = options || {};

    // Build query
    let query = db.select().from(llmUsageLogs);

    // Note: In production, add proper date filtering with drizzle-orm
    // This is a simplified version

    const logs = await query;

    const stats = {
      totalRequests: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      byProvider: {} as Record<
        string,
        { requests: number; tokens: number; cost: number }
      >,
      byOperationType: {} as Record<
        string,
        { requests: number; tokens: number; cost: number }
      >,
    };

    for (const log of logs) {
      if (log.userId !== userId) continue;
      if (startDate && log.createdAt && log.createdAt < startDate) continue;
      if (endDate && log.createdAt && log.createdAt > endDate) continue;

      stats.totalRequests++;
      stats.totalTokens += log.totalTokens || 0;
      stats.totalCostUsd += parseFloat(log.totalCost || '0');

      // By provider
      if (!stats.byProvider[log.provider]) {
        stats.byProvider[log.provider] = { requests: 0, tokens: 0, cost: 0 };
      }
      stats.byProvider[log.provider].requests++;
      stats.byProvider[log.provider].tokens += log.totalTokens || 0;
      stats.byProvider[log.provider].cost += parseFloat(log.totalCost || '0');

      // By operation type
      if (!stats.byOperationType[log.operationType]) {
        stats.byOperationType[log.operationType] = {
          requests: 0,
          tokens: 0,
          cost: 0,
        };
      }
      stats.byOperationType[log.operationType].requests++;
      stats.byOperationType[log.operationType].tokens += log.totalTokens || 0;
      stats.byOperationType[log.operationType].cost += parseFloat(
        log.totalCost || '0',
      );
    }

    return stats;
  }
}
