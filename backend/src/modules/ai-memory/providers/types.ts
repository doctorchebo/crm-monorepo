/**
 * LLM Provider Types
 *
 * Provider-agnostic interfaces for embedding and LLM services.
 * Allows easy switching between providers (OpenAI, Anthropic, Cohere, etc.)
 */

/**
 * Result from an embedding operation
 */
export interface EmbeddingVector {
  values: number[];
  dimensions: number;
}

/**
 * Request for generating embeddings
 */
export interface EmbedRequest {
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Response from embedding generation
 */
export interface EmbedResponse {
  embedding: EmbeddingVector;
  tokenCount?: number;
  model: string;
}

/**
 * Batch embedding request
 */
export interface BatchEmbedRequest {
  contents: Array<{
    id: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Batch embedding response
 */
export interface BatchEmbedResponse {
  embeddings: Array<{
    id: string;
    embedding: EmbeddingVector;
    tokenCount?: number;
  }>;
  model: string;
  totalTokens: number;
}

/**
 * Message for chat/completion requests
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Request for chat/completion
 */
export interface ChatCompletionRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

/**
 * Response from chat/completion
 */
export interface ChatCompletionResponse {
  content: string;
  model: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
}

/**
 * Request for image description/analysis
 */
export interface ImageAnalysisRequest {
  imageUrl: string;
  prompt?: string;
  maxTokens?: number;
}

/**
 * Response from image analysis
 */
export interface ImageAnalysisResponse {
  description: string;
  model: string;
  tokensUsed?: number;
}

/**
 * Request for audio transcription
 */
export interface TranscriptionRequest {
  audioUrl: string;
  language?: string;
  format?: 'mp3' | 'wav' | 'webm' | 'ogg' | 'm4a';
}

/**
 * Response from audio transcription
 */
export interface TranscriptionResponse {
  text: string;
  language?: string;
  duration?: number;
  model: string;
}

/**
 * Provider capabilities - what each provider supports
 */
export interface ProviderCapabilities {
  embeddings: boolean;
  chat: boolean;
  imageAnalysis: boolean;
  transcription: boolean;
  maxEmbeddingTokens: number;
  embeddingDimensions: number;
  supportsBatching: boolean;
  maxBatchSize: number;
}

/**
 * Base interface for all LLM providers
 */
export interface LLMProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  /**
   * Initialize the provider
   */
  initialize(): Promise<void>;

  /**
   * Check if provider is ready
   */
  isReady(): boolean;

  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Interface for embedding providers
 */
export interface EmbeddingProvider extends LLMProvider {
  /**
   * Generate embedding for a single text
   */
  embed(request: EmbedRequest): Promise<EmbedResponse>;

  /**
   * Generate embeddings for multiple texts
   */
  embedBatch(request: BatchEmbedRequest): Promise<BatchEmbedResponse>;

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number;
}

/**
 * Interface for chat/completion providers
 */
export interface ChatProvider extends LLMProvider {
  /**
   * Generate a chat completion
   */
  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}

/**
 * Interface for vision/image analysis providers
 */
export interface VisionProvider extends LLMProvider {
  /**
   * Analyze/describe an image
   */
  analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysisResponse>;
}

/**
 * Interface for audio transcription providers
 */
export interface TranscriptionProvider extends LLMProvider {
  /**
   * Transcribe audio to text
   */
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse>;
}

/**
 * Combined provider interface for providers that support multiple capabilities
 */
export interface MultiModalProvider
  extends
    EmbeddingProvider,
    ChatProvider,
    VisionProvider,
    TranscriptionProvider {}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  type: 'openai' | 'anthropic' | 'cohere' | 'huggingface' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  modelOverrides?: {
    embedding?: string;
    chat?: string;
    vision?: string;
    transcription?: string;
  };
  options?: Record<string, unknown>;
}

/**
 * Error codes for provider errors
 */
export enum ProviderErrorCode {
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_REQUEST = 'INVALID_REQUEST',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  CONTENT_FILTERED = 'CONTENT_FILTERED',
  TIMEOUT = 'TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Provider error class
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: ProviderErrorCode,
    public readonly provider: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
