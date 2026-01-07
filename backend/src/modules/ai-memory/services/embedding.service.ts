import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderRegistry } from '../providers';
import {
  EmbeddingProvider,
  ProviderError,
  ProviderErrorCode,
} from '../providers/types';
import {
  AiMemoryError,
  AiMemoryErrorCode,
  BatchEmbeddingRequest,
  BatchEmbeddingResponse,
  EmbeddingContent,
  EmbeddingResult,
  TokenEstimate,
} from '../types';

/**
 * Embedding Service
 *
 * Provider-agnostic embedding service that delegates to the configured LLM provider.
 * Handles batching, retries, and token estimation.
 *
 * Supports any embedding provider registered in the ProviderRegistry:
 * - OpenAI (text-embedding-3-large, text-embedding-3-small, ada-002)
 * - Cohere (embed-english-v3.0, embed-multilingual-v3.0)
 * - HuggingFace (various sentence transformers)
 * - Custom providers
 */
@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly dimensions: number;
  private readonly maxInputTokens: number;
  private readonly batchSize: number;
  private readonly maxRetries: number = 3;
  private readonly retryDelayMs: number = 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly providerRegistry: ProviderRegistry,
  ) {
    this.dimensions = this.configService.get<number>(
      'aiMemory.embedding.dimensions',
      1536,
    );
    this.maxInputTokens = this.configService.get<number>(
      'aiMemory.embedding.maxInputTokens',
      8191,
    );
    this.batchSize = this.configService.get<number>(
      'aiMemory.embedding.batchSize',
      100,
    );
  }

  async onModuleInit() {
    // Provider initialization is handled by ProviderRegistry
    this.logger.log('Embedding service initialized');
  }

  /**
   * Get the current embedding provider
   */
  private getProvider(): EmbeddingProvider {
    const provider = this.providerRegistry.getEmbeddingProvider();
    if (!provider) {
      throw new AiMemoryError(
        'No embedding provider configured',
        AiMemoryErrorCode.CONFIG_MISSING,
      );
    }
    return provider;
  }

  /**
   * Check if embedding service is ready
   */
  isReady(): boolean {
    return this.providerRegistry.hasEmbeddingProvider();
  }

  /**
   * Get configured dimensions
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * Get the model name from the provider
   */
  getModelName(): string {
    const provider = this.providerRegistry.getEmbeddingProvider();
    return provider?.name || 'unknown';
  }

  /**
   * Generate embedding for a single text
   */
  async embed(content: EmbeddingContent): Promise<EmbeddingResult> {
    const provider = this.getProvider();
    const truncatedContent = this.truncateToTokenLimit(content.content);

    try {
      const response = await this.withRetry(async () => {
        return provider.embed({
          content: truncatedContent.text,
          metadata: content.metadata as unknown as
            | Record<string, unknown>
            | undefined,
        });
      });

      return {
        id: content.id,
        vector: response.embedding.values,
        tokensUsed: response.tokenCount || truncatedContent.estimatedTokens,
      };
    } catch (error) {
      if (error instanceof ProviderError) {
        throw this.mapProviderError(error);
      }
      throw new AiMemoryError(
        `Embedding failed: ${error.message}`,
        AiMemoryErrorCode.EMBEDDING_FAILED,
        { error: error.message },
      );
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(
    request: BatchEmbeddingRequest,
  ): Promise<BatchEmbeddingResponse> {
    const provider = this.getProvider();

    // Prepare contents with truncation
    const preparedContents = request.contents.map((item) => {
      const truncated = this.truncateToTokenLimit(item.content);
      return {
        id: item.id,
        content: truncated.text,
        estimatedTokens: truncated.estimatedTokens,
        metadata: item.metadata,
      };
    });

    // Split into batches
    const batches: (typeof preparedContents)[] = [];
    for (let i = 0; i < preparedContents.length; i += this.batchSize) {
      batches.push(preparedContents.slice(i, i + this.batchSize));
    }

    const results: EmbeddingResult[] = [];
    const failedIds: string[] = [];
    const errors: Array<{ id: string; error: string }> = [];
    let totalTokensUsed = 0;

    for (const batch of batches) {
      try {
        const response = await this.withRetry(async () => {
          return provider.embedBatch({
            contents: batch.map((b) => ({
              id: b.id,
              content: b.content,
              metadata: b.metadata as unknown as
                | Record<string, unknown>
                | undefined,
            })),
          });
        });

        totalTokensUsed += response.totalTokens;

        for (const item of response.embeddings) {
          results.push({
            id: item.id,
            vector: item.embedding.values,
            tokensUsed: item.tokenCount || 0,
          });
        }
      } catch (error) {
        this.logger.error(`Batch embedding failed: ${error.message}`);
        // Mark all items in batch as failed
        for (const item of batch) {
          failedIds.push(item.id);
          errors.push({ id: item.id, error: error.message });
        }
      }
    }

    return {
      results,
      totalTokensUsed,
      failedIds,
      errors,
    };
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): TokenEstimate {
    const provider = this.providerRegistry.getEmbeddingProvider();
    const estimatedTokens = provider
      ? provider.estimateTokens(text)
      : Math.ceil(text.length / 4);

    const truncated = estimatedTokens > this.maxInputTokens;

    return {
      tokens: Math.min(estimatedTokens, this.maxInputTokens),
      truncated,
      originalLength: text.length,
      truncatedLength: truncated
        ? Math.floor(this.maxInputTokens * 4)
        : undefined,
    };
  }

  /**
   * Truncate text to fit within token limits
   */
  private truncateToTokenLimit(text: string): {
    text: string;
    estimatedTokens: number;
    wasTruncated: boolean;
  } {
    const estimate = this.estimateTokens(text);

    if (!estimate.truncated) {
      return {
        text,
        estimatedTokens: estimate.tokens,
        wasTruncated: false,
      };
    }

    // Truncate to ~90% of max to leave room for tokenizer differences
    const targetTokens = Math.floor(this.maxInputTokens * 0.9);
    const targetChars = targetTokens * 4; // Rough estimate
    const truncatedText = text.substring(0, targetChars) + '...';

    return {
      text: truncatedText,
      estimatedTokens: targetTokens,
      wasTruncated: true,
    };
  }

  /**
   * Retry wrapper with exponential backoff
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Don't retry on authentication or config errors
        if (error instanceof ProviderError) {
          if (
            error.code === ProviderErrorCode.AUTHENTICATION_FAILED ||
            error.code === ProviderErrorCode.NOT_INITIALIZED
          ) {
            throw error;
          }

          // For rate limiting, use retry-after if available
          if (error.code === ProviderErrorCode.RATE_LIMITED) {
            const retryAfter = (error.details?.retryAfter as number) || 60;
            await this.delay(retryAfter * 1000);
            continue;
          }
        }

        // Exponential backoff
        const delay = this.retryDelayMs * Math.pow(2, attempt);
        this.logger.warn(
          `Embedding attempt ${attempt + 1} failed, retrying in ${delay}ms`,
        );
        await this.delay(delay);
      }
    }

    throw lastError;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Map provider errors to AiMemoryError
   */
  private mapProviderError(error: ProviderError): AiMemoryError {
    switch (error.code) {
      case ProviderErrorCode.NOT_INITIALIZED:
        return new AiMemoryError(
          error.message,
          AiMemoryErrorCode.CONFIG_MISSING,
          error.details,
        );
      case ProviderErrorCode.RATE_LIMITED:
        return new AiMemoryError(
          error.message,
          AiMemoryErrorCode.EMBEDDING_FAILED,
          { ...error.details, rateLimited: true },
        );
      case ProviderErrorCode.AUTHENTICATION_FAILED:
        return new AiMemoryError(
          error.message,
          AiMemoryErrorCode.CONFIG_MISSING,
          error.details,
        );
      default:
        return new AiMemoryError(
          error.message,
          AiMemoryErrorCode.EMBEDDING_FAILED,
          error.details,
        );
    }
  }
}
