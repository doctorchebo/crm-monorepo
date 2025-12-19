import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaCloudApiProvider } from './meta-cloud-api.provider';
import {
  IMessagingProvider,
  IMessagingProviderFactory,
} from './provider.interface';
import { TwilioProviderAdapter } from './twilio.provider';

/**
 * Messaging Provider Factory
 * Creates and manages instances of messaging providers
 * Allows easy switching between providers (Meta Cloud API, Twilio, etc.)
 */
@Injectable()
export class MessagingProviderFactory implements IMessagingProviderFactory {
  private readonly logger = new Logger(MessagingProviderFactory.name);
  private readonly providers: Map<string, IMessagingProvider> = new Map();

  constructor(
    private configService: ConfigService,
    private metaProvider: MetaCloudApiProvider,
    private twilioProvider: TwilioProviderAdapter,
  ) {
    this.registerProviders();
  }

  /**
   * Register all available providers
   */
  private registerProviders(): void {
    this.providers.set('meta', this.metaProvider);
    this.providers.set('twilio', this.twilioProvider);

    this.logger.log(`Registered ${this.providers.size} messaging providers`);
  }

  /**
   * Get a provider by name
   */
  getProvider(providerName: string): IMessagingProvider {
    const provider = this.providers.get(providerName.toLowerCase());

    if (!provider) {
      throw new Error(
        `Unknown provider: ${providerName}. Available providers: ${this.getAvailableProviders().join(', ')}`,
      );
    }

    if (!provider.isConfigured()) {
      this.logger.warn(`Provider '${providerName}' is not fully configured`);
    }

    return provider;
  }

  /**
   * Get the default/primary provider
   * Prefers Meta Cloud API if configured, falls back to Twilio
   */
  getDefaultProvider(): IMessagingProvider {
    const preferredProvider = this.configService.get(
      'DEFAULT_MESSAGING_PROVIDER',
      'meta',
    );

    // Try preferred provider first
    const preferred = this.providers.get(preferredProvider);
    if (preferred?.isConfigured()) {
      return preferred;
    }

    // Fall back to Meta if configured
    if (this.metaProvider.isConfigured()) {
      return this.metaProvider;
    }

    // Fall back to Twilio
    if (this.twilioProvider.isConfigured()) {
      return this.twilioProvider;
    }

    // Return Meta even if not configured (will fail gracefully with clear error)
    this.logger.warn('No messaging provider is fully configured');
    return this.metaProvider;
  }

  /**
   * Get names of all available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get names of all configured (ready to use) providers
   */
  getConfiguredProviders(): string[] {
    return Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isConfigured())
      .map(([name]) => name);
  }

  /**
   * Check if a specific provider is configured
   */
  isProviderConfigured(providerName: string): boolean {
    const provider = this.providers.get(providerName.toLowerCase());
    return provider?.isConfigured() ?? false;
  }
}
