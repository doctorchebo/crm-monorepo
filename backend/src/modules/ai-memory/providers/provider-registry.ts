import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIProvider, OpenAIProviderConfig } from './openai.provider';
import {
  ChatProvider,
  EmbeddingProvider,
  TranscriptionProvider,
  VisionProvider,
} from './types';

/**
 * Supported provider types
 */
export type ProviderType = 'openai' | 'anthropic' | 'cohere' | 'huggingface';

/**
 * Provider Registry
 *
 * Manages LLM provider instances and provides a unified interface
 * for accessing embedding, chat, vision, and transcription capabilities.
 *
 * Supports runtime provider switching and fallback chains.
 */
@Injectable()
export class ProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(ProviderRegistry.name);

  // Provider instances by type
  private embeddingProviders: Map<string, EmbeddingProvider> = new Map();
  private chatProviders: Map<string, ChatProvider> = new Map();
  private visionProviders: Map<string, VisionProvider> = new Map();
  private transcriptionProviders: Map<string, TranscriptionProvider> =
    new Map();

  // Default providers
  private defaultEmbeddingProvider: string | null = null;
  private defaultChatProvider: string | null = null;
  private defaultVisionProvider: string | null = null;
  private defaultTranscriptionProvider: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.initializeProviders();
  }

  /**
   * Initialize configured providers
   */
  private async initializeProviders(): Promise<void> {
    // Get provider configuration
    const providerType = this.configService.get<string>(
      'aiMemory.provider.type',
      'openai',
    );

    this.logger.log(`Initializing LLM providers with type: ${providerType}`);

    try {
      switch (providerType) {
        case 'openai':
          await this.initializeOpenAI();
          break;
        // Future providers can be added here
        // case 'anthropic':
        //   await this.initializeAnthropic();
        //   break;
        // case 'cohere':
        //   await this.initializeCohere();
        //   break;
        default:
          this.logger.warn(
            `Unknown provider type: ${providerType}, falling back to OpenAI`,
          );
          await this.initializeOpenAI();
      }
    } catch (error) {
      this.logger.error(`Failed to initialize providers: ${error.message}`);
      // Don't throw - allow app to start without providers
    }
  }

  /**
   * Initialize OpenAI provider
   */
  private async initializeOpenAI(): Promise<void> {
    const apiKeyFromConfig = this.configService.get<string>(
      'aiMemory.provider.apiKey',
    );
    const apiKeyFromEnv = this.configService.get<string>('OPENAI_API_KEY');
    const apiKeyFromMemoryEnv = this.configService.get<string>(
      'AI_MEMORY_PROVIDER_API_KEY',
    );

    // Use LOG level instead of debug so we can see what's happening
    this.logger.log(
      `[API Key Check] From config (aiMemory.provider.apiKey): ${apiKeyFromConfig ? `${apiKeyFromConfig.substring(0, 15)}... (${apiKeyFromConfig.length} chars)` : 'NOT SET'}`,
    );
    this.logger.log(
      `[API Key Check] From env (OPENAI_API_KEY): ${apiKeyFromEnv ? `${apiKeyFromEnv.substring(0, 15)}... (${apiKeyFromEnv.length} chars)` : 'NOT SET'}`,
    );
    this.logger.log(
      `[API Key Check] From env (AI_MEMORY_PROVIDER_API_KEY): ${apiKeyFromMemoryEnv ? `${apiKeyFromMemoryEnv.substring(0, 15)}... (${apiKeyFromMemoryEnv.length} chars)` : 'NOT SET'}`,
    );

    // Support multiple API key sources for flexibility
    const apiKey = apiKeyFromConfig || apiKeyFromEnv || apiKeyFromMemoryEnv;

    // Log which source was selected
    const source = apiKeyFromConfig
      ? 'config'
      : apiKeyFromEnv
        ? 'OPENAI_API_KEY'
        : apiKeyFromMemoryEnv
          ? 'AI_MEMORY_PROVIDER_API_KEY'
          : 'none';
    this.logger.log(`[API Key Check] Selected source: ${source}`);

    if (!apiKey || apiKey.trim() === '') {
      this.logger.warn(
        'OpenAI API key not configured (checked aiMemory.provider.apiKey, OPENAI_API_KEY, and AI_MEMORY_PROVIDER_API_KEY) - AI features will be disabled',
      );
      return;
    }

    // Basic validation - OpenAI keys start with 'sk-'
    if (!apiKey.startsWith('sk-')) {
      this.logger.warn(
        `OpenAI API key appears invalid (should start with "sk-", got "${apiKey.substring(0, 5)}...") - AI memory features will be disabled`,
      );
      return;
    }

    this.logger.log(
      `[API Key Check] API key validated, proceeding with initialization...`,
    );

    const config: OpenAIProviderConfig = {
      apiKey,
      embeddingModel: this.configService.get<string>(
        'aiMemory.provider.embeddingModel',
        'text-embedding-3-large',
      ),
      embeddingDimensions: this.configService.get<number>(
        'aiMemory.embedding.dimensions',
        3072,
      ),
      chatModel: this.configService.get<string>(
        'aiMemory.provider.chatModel',
        'gpt-4o-mini',
      ),
      visionModel: this.configService.get<string>(
        'aiMemory.provider.visionModel',
        'gpt-4o-mini',
      ),
      transcriptionModel: this.configService.get<string>(
        'aiMemory.provider.transcriptionModel',
        'whisper-1',
      ),
      baseUrl: this.configService.get<string>('aiMemory.provider.baseUrl'),
      maxRetries: 3,
    };

    try {
      this.logger.log('[Provider Init] Creating OpenAI provider instance...');
      const provider = new OpenAIProvider(config);

      this.logger.log('[Provider Init] Initializing OpenAI provider...');
      await provider.initialize();

      // Verify the provider actually works with a health check
      this.logger.log('[Provider Init] Running health check...');
      const isHealthy = await provider.healthCheck();
      if (!isHealthy) {
        this.logger.warn(
          'OpenAI provider health check failed - API key may be invalid or rate limited. AI memory features will be disabled.',
        );
        return;
      }

      // Register as all capability providers
      this.logger.log(
        '[Provider Init] Health check passed! Registering providers...',
      );
      this.registerEmbeddingProvider('openai', provider, true);
      this.registerChatProvider('openai', provider, true);
      this.registerVisionProvider('openai', provider, true);
      this.registerTranscriptionProvider('openai', provider, true);

      this.logger.log('OpenAI provider registered for all capabilities');
    } catch (error) {
      this.logger.warn(
        `Failed to initialize OpenAI provider: ${error.message}. AI memory features will be disabled.`,
      );
    }
  }

  /**
   * Register an embedding provider
   */
  registerEmbeddingProvider(
    name: string,
    provider: EmbeddingProvider,
    setAsDefault = false,
  ): void {
    this.embeddingProviders.set(name, provider);
    if (setAsDefault || !this.defaultEmbeddingProvider) {
      this.defaultEmbeddingProvider = name;
    }
  }

  /**
   * Register a chat provider
   */
  registerChatProvider(
    name: string,
    provider: ChatProvider,
    setAsDefault = false,
  ): void {
    this.chatProviders.set(name, provider);
    if (setAsDefault || !this.defaultChatProvider) {
      this.defaultChatProvider = name;
    }
  }

  /**
   * Register a vision provider
   */
  registerVisionProvider(
    name: string,
    provider: VisionProvider,
    setAsDefault = false,
  ): void {
    this.visionProviders.set(name, provider);
    if (setAsDefault || !this.defaultVisionProvider) {
      this.defaultVisionProvider = name;
    }
  }

  /**
   * Register a transcription provider
   */
  registerTranscriptionProvider(
    name: string,
    provider: TranscriptionProvider,
    setAsDefault = false,
  ): void {
    this.transcriptionProviders.set(name, provider);
    if (setAsDefault || !this.defaultTranscriptionProvider) {
      this.defaultTranscriptionProvider = name;
    }
  }

  /**
   * Get the default embedding provider
   */
  getEmbeddingProvider(name?: string): EmbeddingProvider | null {
    const providerName = name || this.defaultEmbeddingProvider;
    if (!providerName) return null;
    return this.embeddingProviders.get(providerName) || null;
  }

  /**
   * Get the default chat provider
   */
  getChatProvider(name?: string): ChatProvider | null {
    const providerName = name || this.defaultChatProvider;
    if (!providerName) return null;
    return this.chatProviders.get(providerName) || null;
  }

  /**
   * Get the default vision provider
   */
  getVisionProvider(name?: string): VisionProvider | null {
    const providerName = name || this.defaultVisionProvider;
    if (!providerName) return null;
    return this.visionProviders.get(providerName) || null;
  }

  /**
   * Get the default transcription provider
   */
  getTranscriptionProvider(name?: string): TranscriptionProvider | null {
    const providerName = name || this.defaultTranscriptionProvider;
    if (!providerName) return null;
    return this.transcriptionProviders.get(providerName) || null;
  }

  /**
   * Check if any embedding provider is available
   */
  hasEmbeddingProvider(): boolean {
    return this.defaultEmbeddingProvider !== null;
  }

  /**
   * Check if any chat provider is available
   */
  hasChatProvider(): boolean {
    return this.defaultChatProvider !== null;
  }

  /**
   * Check if any vision provider is available
   */
  hasVisionProvider(): boolean {
    return this.defaultVisionProvider !== null;
  }

  /**
   * Check if any transcription provider is available
   */
  hasTranscriptionProvider(): boolean {
    return this.defaultTranscriptionProvider !== null;
  }

  /**
   * Get all registered provider names
   */
  getRegisteredProviders(): {
    embedding: string[];
    chat: string[];
    vision: string[];
    transcription: string[];
  } {
    return {
      embedding: Array.from(this.embeddingProviders.keys()),
      chat: Array.from(this.chatProviders.keys()),
      vision: Array.from(this.visionProviders.keys()),
      transcription: Array.from(this.transcriptionProviders.keys()),
    };
  }

  /**
   * Health check all providers
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    providers: Record<string, boolean>;
  }> {
    const results: Record<string, boolean> = {};
    let allHealthy = true;

    // Check embedding providers
    for (const [name, provider] of this.embeddingProviders) {
      try {
        results[`embedding:${name}`] = await provider.healthCheck();
      } catch {
        results[`embedding:${name}`] = false;
        allHealthy = false;
      }
    }

    // Check chat providers
    for (const [name, provider] of this.chatProviders) {
      try {
        results[`chat:${name}`] = await provider.healthCheck();
      } catch {
        results[`chat:${name}`] = false;
        allHealthy = false;
      }
    }

    return {
      healthy: allHealthy,
      providers: results,
    };
  }
}
