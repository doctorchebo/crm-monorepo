import { Logger } from '@nestjs/common';
import {
  BatchEmbedRequest,
  BatchEmbedResponse,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatProvider,
  EmbeddingProvider,
  EmbedRequest,
  EmbedResponse,
  ImageAnalysisRequest,
  ImageAnalysisResponse,
  ProviderCapabilities,
  ProviderError,
  ProviderErrorCode,
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResponse,
  VisionProvider,
} from './types';

/**
 * OpenAI Provider Configuration
 */
export interface OpenAIProviderConfig {
  apiKey: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  chatModel?: string;
  visionModel?: string;
  transcriptionModel?: string;
  baseUrl?: string;
  maxRetries?: number;
}

/**
 * OpenAI Provider
 *
 * Implements embedding, chat, vision, and transcription using OpenAI APIs
 * via LangChain for standardized interfaces.
 */
export class OpenAIProvider
  implements
    EmbeddingProvider,
    ChatProvider,
    VisionProvider,
    TranscriptionProvider
{
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);
  private embeddings: any = null;
  private chatModel: any = null;
  private openaiClient: any = null;
  private initialized = false;

  readonly capabilities: ProviderCapabilities = {
    embeddings: true,
    chat: true,
    imageAnalysis: true,
    transcription: true,
    maxEmbeddingTokens: 8191,
    // Using 1536 dimensions with text-embedding-3-large's native dimension reduction
    // This enables pgvector HNSW indexing (max 2000 dims) while maintaining quality
    embeddingDimensions: 1536,
    supportsBatching: true,
    maxBatchSize: 2048,
  };

  constructor(private readonly config: OpenAIProviderConfig) {
    // Update dimensions if specified
    if (config.embeddingDimensions) {
      this.capabilities.embeddingDimensions = config.embeddingDimensions;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize LangChain OpenAI embeddings
      const { OpenAIEmbeddings } = await import('@langchain/openai');
      this.embeddings = new OpenAIEmbeddings({
        openAIApiKey: this.config.apiKey,
        modelName: this.config.embeddingModel || 'text-embedding-3-large',
        // Using 1536 dimensions enables pgvector HNSW indexing while maintaining quality
        dimensions: this.config.embeddingDimensions || 1536,
        maxRetries: this.config.maxRetries || 3,
      });

      // Initialize LangChain OpenAI chat model
      const { ChatOpenAI } = await import('@langchain/openai');
      this.chatModel = new ChatOpenAI({
        openAIApiKey: this.config.apiKey,
        modelName: this.config.chatModel || 'gpt-4o-mini',
        maxRetries: this.config.maxRetries || 3,
      });

      // Initialize raw OpenAI client for vision and transcription
      const { default: OpenAI } = await import('openai');
      this.openaiClient = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl,
      });

      this.initialized = true;
      this.logger.log('OpenAI provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize OpenAI provider:', error);
      throw new ProviderError(
        'Failed to initialize OpenAI provider',
        ProviderErrorCode.NOT_INITIALIZED,
        this.name,
        { error: error.message },
      );
    }
  }

  isReady(): boolean {
    return this.initialized && this.embeddings !== null;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isReady()) {
      this.logger.warn(
        'Health check failed: Provider not ready (not initialized or embeddings is null)',
      );
      return false;
    }

    try {
      // Simple embedding test
      await this.embeddings!.embedQuery('health check');
      return true;
    } catch (error) {
      this.logger.error(`Health check failed with error: ${error.message}`);
      return false;
    }
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    if (!this.isReady()) {
      throw new ProviderError(
        'Provider not initialized',
        ProviderErrorCode.NOT_INITIALIZED,
        this.name,
      );
    }

    try {
      const values = await this.embeddings!.embedQuery(request.content);
      const tokenCount = this.estimateTokens(request.content);

      return {
        embedding: {
          values,
          dimensions: values.length,
        },
        tokenCount,
        model: this.config.embeddingModel || 'text-embedding-3-large',
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async embedBatch(request: BatchEmbedRequest): Promise<BatchEmbedResponse> {
    if (!this.isReady()) {
      throw new ProviderError(
        'Provider not initialized',
        ProviderErrorCode.NOT_INITIALIZED,
        this.name,
      );
    }

    try {
      const texts = request.contents.map((c) => c.content);
      const vectors = await this.embeddings!.embedDocuments(texts);
      let totalTokens = 0;

      const embeddings = request.contents.map((content, index) => {
        const tokenCount = this.estimateTokens(content.content);
        totalTokens += tokenCount;

        return {
          id: content.id,
          embedding: {
            values: vectors[index],
            dimensions: vectors[index].length,
          },
          tokenCount,
        };
      });

      return {
        embeddings,
        model: this.config.embeddingModel || 'text-embedding-3-large',
        totalTokens,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English
    // More accurate would require tiktoken, but this is good enough for estimation
    return Math.ceil(text.length / 4);
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.openaiClient) {
      throw new ProviderError(
        'OpenAI client not initialized',
        ProviderErrorCode.NOT_INITIALIZED,
        this.name,
      );
    }

    try {
      // Use raw OpenAI client for chat to avoid LangChain type complexity
      const response = await this.openaiClient.chat.completions.create({
        model: this.config.chatModel || 'gpt-4o-mini',
        messages: request.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        stop: request.stopSequences,
      });

      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage || {};

      return {
        content,
        model: this.config.chatModel || 'gpt-4o-mini',
        tokensUsed: {
          prompt: usage.prompt_tokens || 0,
          completion: usage.completion_tokens || 0,
          total: usage.total_tokens || 0,
        },
        finishReason: (response.choices[0]?.finish_reason as any) || 'stop',
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async analyzeImage(
    request: ImageAnalysisRequest,
  ): Promise<ImageAnalysisResponse> {
    if (!this.openaiClient) {
      throw new ProviderError(
        'OpenAI client not initialized',
        ProviderErrorCode.NOT_INITIALIZED,
        this.name,
      );
    }

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: this.config.visionModel || 'gpt-4o-mini',
        max_tokens: request.maxTokens || 500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  request.prompt ||
                  'Describe this image in detail. Include any text visible in the image.',
              },
              {
                type: 'image_url',
                image_url: { url: request.imageUrl },
              },
            ],
          },
        ],
      });

      return {
        description: response.choices[0]?.message?.content || '',
        model: this.config.visionModel || 'gpt-4o-mini',
        tokensUsed: response.usage?.total_tokens,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async transcribe(
    request: TranscriptionRequest,
  ): Promise<TranscriptionResponse> {
    if (!this.openaiClient) {
      throw new ProviderError(
        'OpenAI client not initialized',
        ProviderErrorCode.NOT_INITIALIZED,
        this.name,
      );
    }

    try {
      // Fetch the audio file
      const response = await fetch(request.audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Create a File-like object for the API
      const file = new File([buffer], `audio.${request.format || 'mp3'}`, {
        type: `audio/${request.format || 'mp3'}`,
      });

      const transcription = await this.openaiClient.audio.transcriptions.create(
        {
          file,
          model: this.config.transcriptionModel || 'whisper-1',
          language: request.language,
        },
      );

      return {
        text: transcription.text,
        language: request.language,
        model: this.config.transcriptionModel || 'whisper-1',
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: any): ProviderError {
    // Handle rate limiting
    if (error.status === 429) {
      return new ProviderError(
        'Rate limit exceeded',
        ProviderErrorCode.RATE_LIMITED,
        this.name,
        { retryAfter: error.headers?.['retry-after'] },
      );
    }

    // Handle authentication
    if (error.status === 401) {
      return new ProviderError(
        'Authentication failed',
        ProviderErrorCode.AUTHENTICATION_FAILED,
        this.name,
      );
    }

    // Handle content filter
    if (error.code === 'content_filter') {
      return new ProviderError(
        'Content filtered',
        ProviderErrorCode.CONTENT_FILTERED,
        this.name,
      );
    }

    // Default error
    return new ProviderError(
      error.message || 'Unknown error',
      ProviderErrorCode.UNKNOWN,
      this.name,
      { originalError: error },
    );
  }
}
