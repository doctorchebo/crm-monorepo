/**
 * Meta Cloud API Configuration Service
 * Centralizes all Meta Graph API endpoints, versions, and configuration
 * This ensures consistency and makes it easy to update API versions across the codebase
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface MetaCloudAPIConfig {
  baseUrl: string;
  apiVersion: string;
  accessToken: string;
}

/**
 * Service to manage Meta Cloud API configuration
 * Provides centralized access to Graph API endpoints and configuration
 */
@Injectable()
export class MetaCloudAPIConfigService {
  private readonly baseUrl = 'https://graph.facebook.com';
  private readonly apiVersion = 'v20.0';
  private readonly accessToken: string;
  private readonly appSecret: string | undefined;

  constructor(private configService: ConfigService) {
    this.accessToken =
      this.configService.getOrThrow<string>('META_ACCESS_TOKEN');
    this.appSecret = this.configService.get<string>('META_APP_SECRET');
  }

  /**
   * Get the base URL for Meta Graph API
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Get the API version being used
   */
  getApiVersion(): string {
    return this.apiVersion;
  }

  /**
   * Get the access token
   */
  getAccessToken(): string {
    return this.accessToken;
  }

  /**
   * Generate appsecret_proof for secure API calls
   * This is an HMAC-SHA256 hash of the access token using the app secret
   * Required when "Require App Secret" is enabled in Meta App settings
   */
  getAppSecretProof(): string | undefined {
    if (!this.appSecret) {
      return undefined;
    }
    return crypto
      .createHmac('sha256', this.appSecret)
      .update(this.accessToken)
      .digest('hex');
  }

  /**
   * Build a complete Graph API endpoint URL
   * @param path - The path after version (e.g., "123456/phone_numbers" or "media-id")
   * @returns Complete URL with base, version, and path
   */
  buildEndpoint(path: string): string {
    return `${this.baseUrl}/${this.apiVersion}/${path}`;
  }

  /**
   * Build a URL with query parameters
   * @param path - The path after version
   * @param params - Optional query parameters object
   * @returns Complete URL with query parameters (includes appsecret_proof if configured)
   */
  buildEndpointWithParams(
    path: string,
    params?: Record<string, string | number>,
  ): string {
    const url = this.buildEndpoint(path);

    const queryParams = new URLSearchParams();

    // Add appsecret_proof if app secret is configured
    const appSecretProof = this.getAppSecretProof();
    if (appSecretProof) {
      queryParams.append('appsecret_proof', appSecretProof);
    }

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        queryParams.append(key, String(value));
      });
    }

    const queryString = queryParams.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  /**
   * Get default headers for API requests
   * Includes authorization token
   */
  getDefaultHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get specific endpoints - these can be updated in one place
   */
  getEndpoints() {
    return {
      /**
       * Get media URL for inbound media from WhatsApp
       * POST https://graph.facebook.com/v20.0/{MEDIA_ID}
       * This endpoint returns metadata about the media including the download URL
       */
      getMediaMetadata: (mediaId: string) =>
        this.buildEndpointWithParams(mediaId, {
          access_token: this.accessToken,
        }),

      /**
       * Get WABA phone numbers
       * GET https://graph.facebook.com/v20.0/{WABA_ID}/phone_numbers
       */
      getPhoneNumbers: (wabaId: string) =>
        this.buildEndpointWithParams(`${wabaId}/phone_numbers`, {
          access_token: this.accessToken,
          fields:
            'id,verified_name,display_phone_number,quality_rating,code_verification_status,name_status,is_official_business_account,certificate,messaging_limit_tier,account_mode,last_onboarded_time',
        }),

      /**
       * Get single phone number details
       * GET https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}
       */
      getPhoneNumberDetails: (phoneNumberId: string) =>
        this.buildEndpointWithParams(phoneNumberId, {
          access_token: this.accessToken,
          fields:
            'id,verified_name,display_phone_number,quality_rating,code_verification_status,name_status,is_official_business_account,certificate,messaging_limit_tier,account_mode,last_onboarded_time',
        }),

      /**
       * Send message via WhatsApp Cloud API
       * POST https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages
       */
      sendMessage: (phoneNumberId: string) =>
        this.buildEndpointWithParams(`${phoneNumberId}/messages`, {
          access_token: this.accessToken,
        }),

      /**
       * Upload media to WhatsApp Cloud API
       * POST https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/media
       */
      uploadMedia: (phoneNumberId: string) =>
        this.buildEndpointWithParams(`${phoneNumberId}/media`, {
          access_token: this.accessToken,
        }),

      /**
       * Get message status
       * GET https://graph.facebook.com/v20.0/{MESSAGE_ID}
       */
      getMessageStatus: (messageId: string) =>
        this.buildEndpointWithParams(messageId, {
          access_token: this.accessToken,
        }),

      /**
       * Edit a message (within 15 minutes of sending)
       * POST https://graph.facebook.com/v20.0/{MESSAGE_ID}
       * With a body containing the new text
       */
      editMessage: (messageId: string) =>
        this.buildEndpointWithParams(messageId, {
          access_token: this.accessToken,
        }),

      /**
       * Delete a message
       * DELETE https://graph.facebook.com/v20.0/{MESSAGE_ID}
       */
      deleteMessage: (messageId: string) =>
        this.buildEndpointWithParams(messageId, {
          access_token: this.accessToken,
        }),
    };
  }
}
