/**
 * Knowledge Base Retrieval Service
 *
 * Handles semantic search and retrieval of knowledge objects.
 * Used by the AI system to find relevant information for responses.
 */

import { EmbeddingService } from '@modules/ai-memory/services/embedding.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KnowledgeBaseRepository } from '../repositories/knowledge-base.repository';
import {
  RetrievalOptions,
  RetrievalResponse,
  RetrievalResult,
  TestQueryResponse,
} from '../types';

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly defaultTopK: number;
  private readonly defaultMinSimilarity: number;

  constructor(
    private readonly repository: KnowledgeBaseRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly configService: ConfigService,
  ) {
    this.defaultTopK = this.configService.get<number>(
      'KNOWLEDGE_BASE_DEFAULT_TOP_K',
      5,
    );
    // Note: text-embedding-3-large with 1536 dimensions (native dimension reduction)
    // produces notably lower similarity scores than older models or full 3072 dims.
    // We use a lower threshold (0.15) to ensure we catch relevant results.
    // The AI model is smart enough to filter out truly irrelevant results.
    this.defaultMinSimilarity = this.configService.get<number>(
      'KNOWLEDGE_BASE_DEFAULT_MIN_SIMILARITY',
      0.15,
    );
  }

  /**
   * Retrieve relevant knowledge objects for a query
   *
   * Supports conversation context enhancement: when the current query is generic
   * (e.g., "what's the price?"), conversation context helps identify the relevant KB items.
   */
  async retrieve(
    userId: number,
    query: string,
    options: RetrievalOptions = {},
  ): Promise<RetrievalResponse> {
    const startTime = Date.now();

    const {
      topK = this.defaultTopK,
      minSimilarity = this.defaultMinSimilarity,
      templateIds,
      objectIds,
      excludeObjectIds,
      chunkTypes,
      conversationContext,
    } = options;

    // Enhance query with conversation context if provided
    // This helps match generic queries like "what's the price?" to specific KB items
    const enhancedQuery = this.buildEnhancedQuery(query, conversationContext);

    this.logger.debug(
      `[KB Retrieve] Query: "${query.substring(0, 50)}...", userId: ${userId}, minSimilarity: ${minSimilarity}` +
        (conversationContext ? `, with conversation context` : ''),
    );

    // Generate embedding for the enhanced query
    const embeddingResult = await this.embeddingService.embed({
      id: 'query',
      content: enhancedQuery,
      metadata: {
        userId,
        chatId: '',
        messageId: '',
        timestamp: new Date().toISOString(),
        source: 'message' as const,
        contentType: 'text' as const,
        direction: 'inbound' as const,
        importanceScore: 1,
      },
    });

    // Search for similar chunks
    const searchResults = await this.repository.searchChunksByVector(
      userId,
      embeddingResult.vector,
      {
        topK,
        minScore: minSimilarity,
        templateIds,
        objectIds,
        excludeObjectIds,
        chunkTypes,
      },
    );

    // If no results, log diagnostic info to help debug
    if (searchResults.length === 0) {
      try {
        const kbStatus = await this.repository.getKBStatusForUser(userId);
        this.logger.warn(
          `[KB Retrieve] No results found. KB Status for user ${userId}: ` +
            `Objects: ${kbStatus.totalObjects} total, ${kbStatus.indexedObjects} indexed (${JSON.stringify(kbStatus.objectsByStatus)}), ` +
            `Chunks: ${kbStatus.totalChunks} total, ${kbStatus.embeddedChunks} embedded (${JSON.stringify(kbStatus.chunksByStatus)})`,
        );
      } catch (error) {
        this.logger.warn(
          `[KB Retrieve] Failed to get KB status: ${error.message}`,
        );
      }
    }

    // Transform results
    const results: RetrievalResult[] = searchResults.map((result) => ({
      objectId: result.objectId,
      objectName: result.metadata.objectName as string,
      templateId: result.metadata.templateId as string,
      templateName: (result.metadata.templateName as string) || 'Unknown',
      chunkId: result.id,
      content: result.content,
      similarity: result.similarity,
      metadata: {
        objectId: result.objectId,
        objectName: result.metadata.objectName as string,
        templateId: result.metadata.templateId as string,
        templateName: (result.metadata.templateName as string) || 'Unknown',
        chunkType: result.metadata.chunkType as string,
        chunkIndex: result.metadata.chunkIndex as number,
      },
    }));

    const latencyMs = Date.now() - startTime;

    // Log retrieval for analytics
    try {
      await this.repository.createRetrievalLog({
        userId,
        queryText: query,
        retrievedObjectIds: [...new Set(results.map((r) => r.objectId))],
        retrievedChunkIds: results.map((r) => r.chunkId),
        similarityScores: results.map((r) => r.similarity),
        topK,
        minSimilarity: Math.round(minSimilarity * 100),
        filterTemplateIds: templateIds,
        latencyMs,
        totalResults: results.length,
      });
    } catch (error) {
      this.logger.warn(`Failed to log retrieval: ${error.message}`);
    }

    this.logger.debug(`Retrieved ${results.length} results in ${latencyMs}ms`);

    return {
      query,
      results,
      totalResults: results.length,
      latencyMs,
    };
  }

  /**
   * Retrieve and deduplicate by object (get best chunk per object)
   */
  async retrieveByObject(
    userId: number,
    query: string,
    options: RetrievalOptions = {},
  ): Promise<RetrievalResponse> {
    // Get more results to ensure we have enough unique objects
    const response = await this.retrieve(userId, query, {
      ...options,
      topK: (options.topK || this.defaultTopK) * 3,
    });

    // Deduplicate by object, keeping highest similarity per object
    const objectMap = new Map<string, RetrievalResult>();

    for (const result of response.results) {
      const existing = objectMap.get(result.objectId);
      if (!existing || result.similarity > existing.similarity) {
        objectMap.set(result.objectId, result);
      }
    }

    // Sort by similarity and limit
    const deduplicatedResults = Array.from(objectMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.topK || this.defaultTopK);

    return {
      query: response.query,
      results: deduplicatedResults,
      totalResults: deduplicatedResults.length,
      latencyMs: response.latencyMs,
    };
  }

  /**
   * Get context string for AI prompt injection
   */
  async getContextForPrompt(
    userId: number,
    query: string,
    options: RetrievalOptions = {},
  ): Promise<string> {
    const response = await this.retrieveByObject(userId, query, options);

    if (response.results.length === 0) {
      return '';
    }

    const contextParts: string[] = [
      '--- KNOWLEDGE BASE CONTEXT ---',
      'The following information is from the knowledge base and should be prioritized over general knowledge:',
      '',
    ];

    for (const result of response.results) {
      contextParts.push(`[${result.templateName}: ${result.objectName}]`);
      contextParts.push(result.content);
      contextParts.push('');
    }

    contextParts.push('--- END KNOWLEDGE BASE CONTEXT ---');
    contextParts.push('');

    return contextParts.join('\n');
  }

  /**
   * Test query and generate mock AI response
   */
  async testQuery(
    userId: number,
    query: string,
    options: RetrievalOptions = {},
  ): Promise<TestQueryResponse> {
    const startTime = Date.now();

    // Retrieve relevant content
    const response = await this.retrieveByObject(userId, query, options);

    // Build context for "mock" AI response
    const retrievedObjects = response.results.map((r) => ({
      objectId: r.objectId,
      objectName: r.objectName,
      templateName: r.templateName,
      relevantContent: r.content,
      similarity: r.similarity,
    }));

    // Generate a simple mock response based on retrieved content
    let mockResponse: string;

    if (response.results.length === 0) {
      mockResponse =
        'No relevant information found in the knowledge base for this query. ' +
        'The AI would need to rely on general knowledge or ask for clarification.';
    } else {
      const topResult = response.results[0];
      mockResponse =
        `Based on the knowledge base, here's what I found:\n\n` +
        `From "${topResult.objectName}" (${topResult.templateName}):\n` +
        `${topResult.content.substring(0, 500)}${topResult.content.length > 500 ? '...' : ''}\n\n` +
        `[This is a preview response. In production, the AI would synthesize information ` +
        `from ${response.results.length} retrieved objects to provide a comprehensive answer.]`;
    }

    const latencyMs = Date.now() - startTime;

    return {
      query,
      response: mockResponse,
      retrievedObjects,
      latencyMs,
    };
  }

  /**
   * Update feedback for a retrieval log
   */
  async updateRetrievalFeedback(
    logId: string,
    wasHelpful: boolean,
  ): Promise<void> {
    await this.repository.updateRetrievalLogFeedback(logId, wasHelpful);
  }

  /**
   * Get retrieval statistics for a user
   */
  async getRetrievalStats(userId: number): Promise<{
    totalQueries: number;
    avgLatencyMs: number;
    avgResultsPerQuery: number;
    helpfulFeedbackRate: number;
  }> {
    const logs = await this.repository.getRetrievalLogsByUser(userId, {
      pageSize: 1000,
    });

    if (logs.length === 0) {
      return {
        totalQueries: 0,
        avgLatencyMs: 0,
        avgResultsPerQuery: 0,
        helpfulFeedbackRate: 0,
      };
    }

    const totalLatency = logs.reduce((sum, l) => sum + (l.latencyMs || 0), 0);
    const totalResults = logs.reduce(
      (sum, l) => sum + (l.totalResults || 0),
      0,
    );
    const feedbackLogs = logs.filter((l) => l.wasHelpful !== null);
    const helpfulLogs = feedbackLogs.filter((l) => l.wasHelpful === true);

    return {
      totalQueries: logs.length,
      avgLatencyMs: Math.round(totalLatency / logs.length),
      avgResultsPerQuery: Math.round(totalResults / logs.length),
      helpfulFeedbackRate:
        feedbackLogs.length > 0
          ? Math.round((helpfulLogs.length / feedbackLogs.length) * 100)
          : 0,
    };
  }

  /**
   * Build an enhanced query by combining the current query with conversation context.
   * This improves retrieval accuracy when the current query is generic
   * (e.g., "what's the price?" without mentioning what item).
   *
   * The conversation context helps the embedding model understand what
   * specific KB items the user is asking about.
   */
  private buildEnhancedQuery(
    query: string,
    conversationContext?: string,
  ): string {
    if (!conversationContext || conversationContext.trim().length === 0) {
      return query;
    }

    // Extract key information from conversation context
    // Keep it concise to avoid diluting the query's semantic focus
    const contextSummary = this.extractRelevantContext(conversationContext);

    if (!contextSummary) {
      return query;
    }

    // Combine query with context - the current query takes precedence
    // but context provides additional semantic grounding
    return `${query}\n\nContext from conversation:\n${contextSummary}`;
  }

  /**
   * Extract relevant context from conversation history.
   * Focuses on extracting entity mentions (names, products, projects)
   * that help identify what KB items the user is discussing.
   */
  private extractRelevantContext(conversationContext: string): string {
    // Split into lines and filter out empty/short lines
    const lines = conversationContext
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 10);

    if (lines.length === 0) {
      return '';
    }

    // Take the most recent relevant lines (up to 5)
    // Focus on lines that might contain entity names or specific information
    const relevantLines = lines.slice(-5).filter(
      (line) =>
        // Filter out generic greetings and short responses
        !line.toLowerCase().match(/^(hi|hello|thanks|ok|yes|no|sure)\b/) &&
        // Keep lines with potential entity mentions (capitalized words, numbers, etc.)
        (line.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/) || // Multi-word proper nouns
          line.match(/\$[\d,]+/) || // Prices
          line.match(/\d+\s*(bedroom|bathroom|sqft|sq\s*ft)/i) || // Property details
          line.match(/project|property|apartment|house|condo/i)), // Common KB entity types
    );

    return relevantLines.join('\n');
  }
}
