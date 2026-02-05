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
   * Get the underlying ConfigService for accessing environment variables
   */
  getConfigService(): ConfigService {
    return this.configService;
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
   * Always includes appsecret_proof if app secret is configured
   * @param path - The path after version (e.g., "123456/phone_numbers" or "media-id")
   * @returns Complete URL with base, version, path, and appsecret_proof
   */
  buildEndpoint(path: string): string {
    const baseUrl = `${this.baseUrl}/${this.apiVersion}/${path}`;

    // Always include appsecret_proof if app secret is configured
    const appSecretProof = this.getAppSecretProof();
    if (appSecretProof) {
      return `${baseUrl}?appsecret_proof=${appSecretProof}`;
    }

    return baseUrl;
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
    // Build base URL without any query params
    const baseUrl = `${this.baseUrl}/${this.apiVersion}/${path}`;

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
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
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
       * Get base URL for building custom endpoints
       * Use buildEndpoint() for most cases, this is for special cases
       */
      baseUrl: `${this.baseUrl}/${this.apiVersion}`,

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

      // ==================== Commerce Settings ====================

      /**
       * Get commerce settings for a phone number
       * GET https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/whatsapp_commerce_settings
       */
      getCommerceSettings: (phoneNumberId: string) =>
        this.buildEndpointWithParams(
          `${phoneNumberId}/whatsapp_commerce_settings`,
          {
            access_token: this.accessToken,
          },
        ),

      /**
       * Update commerce settings for a phone number
       * POST https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/whatsapp_commerce_settings
       * Supports: is_cart_enabled, is_catalog_visible
       */
      updateCommerceSettings: (phoneNumberId: string) =>
        this.buildEndpointWithParams(
          `${phoneNumberId}/whatsapp_commerce_settings`,
          {
            access_token: this.accessToken,
          },
        ),

      // ==================== WABA Catalog Connection ====================

      /**
       * Get product catalogs connected to WABA
       * GET https://graph.facebook.com/v20.0/{WABA_ID}/product_catalogs
       */
      getWabaCatalogs: (wabaId: string) =>
        this.buildEndpointWithParams(`${wabaId}/product_catalogs`, {
          access_token: this.accessToken,
        }),

      /**
       * Connect a catalog to WABA
       * POST https://graph.facebook.com/v20.0/{WABA_ID}/product_catalogs?catalog_id=xxx
       * This is required before enabling catalog visibility on phone numbers
       */
      connectCatalogToWaba: (wabaId: string) =>
        this.buildEndpointWithParams(`${wabaId}/product_catalogs`, {
          access_token: this.accessToken,
        }),

      /**
       * Disconnect a catalog from WABA
       * DELETE https://graph.facebook.com/v20.0/{WABA_ID}/product_catalogs?catalog_id=xxx
       * This is required before deleting a catalog that's linked to WABA
       */
      disconnectCatalogFromWaba: (wabaId: string, catalogId: string) =>
        this.buildEndpointWithParams(`${wabaId}/product_catalogs`, {
          access_token: this.accessToken,
          catalog_id: catalogId,
        }),

      // ==================== Catalog Management (Marketing API) ====================

      /**
       * Get all product catalogs owned by a business
       * GET https://graph.facebook.com/v20.0/{BUSINESS_ID}/owned_product_catalogs
       */
      getBusinessCatalogs: (businessId: string) =>
        this.buildEndpointWithParams(`${businessId}/owned_product_catalogs`, {
          access_token: this.accessToken,
          fields: 'id,name,vertical,product_count,feed_count',
        }),

      /**
       * Create a new product catalog
       * POST https://graph.facebook.com/v20.0/{BUSINESS_ID}/owned_product_catalogs
       */
      createCatalog: (businessId: string) =>
        this.buildEndpointWithParams(`${businessId}/owned_product_catalogs`, {
          access_token: this.accessToken,
        }),

      /**
       * Get catalog details
       * GET https://graph.facebook.com/v20.0/{CATALOG_ID}
       */
      getCatalog: (catalogId: string) =>
        this.buildEndpointWithParams(catalogId, {
          access_token: this.accessToken,
          fields: 'id,name,vertical,product_count,feed_count,business',
        }),

      /**
       * Update catalog
       * POST https://graph.facebook.com/v20.0/{CATALOG_ID}
       */
      updateCatalog: (catalogId: string) =>
        this.buildEndpointWithParams(catalogId, {
          access_token: this.accessToken,
        }),

      /**
       * Delete catalog
       * DELETE https://graph.facebook.com/v20.0/{CATALOG_ID}
       */
      deleteCatalog: (catalogId: string) =>
        this.buildEndpointWithParams(catalogId, {
          access_token: this.accessToken,
        }),

      // ==================== Catalog Permission Management ====================

      /**
       * Get users assigned to a catalog with their permissions
       * GET https://graph.facebook.com/v20.0/{CATALOG_ID}/assigned_users
       *
       * Query parameters:
       * - business: The business ID to filter by
       *
       * Returns: List of users with their tasks (MANAGE, ADVERTISE)
       */
      getCatalogAssignedUsers: (catalogId: string, businessId: string) =>
        this.buildEndpointWithParams(`${catalogId}/assigned_users`, {
          access_token: this.accessToken,
          business: businessId,
        }),

      /**
       * Assign a user to a catalog with specific tasks
       * POST https://graph.facebook.com/v20.0/{CATALOG_ID}/assigned_users
       *
       * Body parameters (form-encoded):
       * - user: BUSINESS_SCOPED_USER_ID
       * - business: BUSINESS_ID
       * - tasks: ['ADVERTISE', 'MANAGE']
       *
       * Required permission: catalog_management
       */
      assignCatalogUser: (catalogId: string) =>
        this.buildEndpointWithParams(`${catalogId}/assigned_users`, {
          access_token: this.accessToken,
        }),

      /**
       * Remove a user from a catalog
       * DELETE https://graph.facebook.com/v20.0/{CATALOG_ID}/assigned_users
       *
       * Body parameters (form-encoded):
       * - user: BUSINESS_SCOPED_USER_ID
       * - business: BUSINESS_ID
       */
      removeCatalogUser: (catalogId: string) =>
        this.buildEndpointWithParams(`${catalogId}/assigned_users`, {
          access_token: this.accessToken,
        }),

      /**
       * Get user info (for retrieving current user ID)
       * GET https://graph.facebook.com/v20.0/me
       *
       * Returns the ID of the user or system user associated with the access token
       */
      getCurrentUser: () =>
        this.buildEndpointWithParams('me', {
          access_token: this.accessToken,
          fields: 'id,name',
        }),

      /**
       * Get business users for a business
       * GET https://graph.facebook.com/v20.0/{BUSINESS_ID}/business_users
       *
       * Returns list of users who are members of the business
       */
      getBusinessUsers: (businessId: string) =>
        this.buildEndpointWithParams(`${businessId}/business_users`, {
          access_token: this.accessToken,
          fields: 'id,name,email,role',
        }),

      /**
       * Get system users for a business
       * GET https://graph.facebook.com/v20.0/{BUSINESS_ID}/system_users
       *
       * Returns list of system users in the business
       */
      getBusinessSystemUsers: (businessId: string) =>
        this.buildEndpointWithParams(`${businessId}/system_users`, {
          access_token: this.accessToken,
          fields: 'id,name,role',
        }),

      /**
       * Get products in a catalog
       * GET https://graph.facebook.com/v20.0/{CATALOG_ID}/products
       */
      getCatalogProducts: (catalogId: string) =>
        this.buildEndpointWithParams(`${catalogId}/products`, {
          access_token: this.accessToken,
          fields:
            'id,retailer_id,name,description,price,currency,availability,condition,image_url,url',
        }),

      /**
       * Batch create/update/delete products in a catalog
       * POST https://graph.facebook.com/v20.0/{CATALOG_ID}/items_batch
       */
      catalogItemsBatch: (catalogId: string) =>
        this.buildEndpointWithParams(`${catalogId}/items_batch`, {
          access_token: this.accessToken,
        }),

      /**
       * Get product sets in a catalog
       * GET https://graph.facebook.com/v20.0/{CATALOG_ID}/product_sets
       */
      getCatalogProductSets: (catalogId: string) =>
        this.buildEndpointWithParams(`${catalogId}/product_sets`, {
          access_token: this.accessToken,
          fields: 'id,name,filter,product_count',
        }),

      /**
       * Create product set in a catalog
       * POST https://graph.facebook.com/v20.0/{CATALOG_ID}/product_sets
       */
      createProductSet: (catalogId: string) =>
        this.buildEndpointWithParams(`${catalogId}/product_sets`, {
          access_token: this.accessToken,
        }),

      /**
       * Update product set
       * POST https://graph.facebook.com/v20.0/{PRODUCT_SET_ID}
       */
      updateProductSet: (productSetId: string) =>
        this.buildEndpointWithParams(productSetId, {
          access_token: this.accessToken,
        }),

      /**
       * Delete product set
       * DELETE https://graph.facebook.com/v20.0/{PRODUCT_SET_ID}
       */
      deleteProductSet: (productSetId: string) =>
        this.buildEndpointWithParams(productSetId, {
          access_token: this.accessToken,
        }),
    };
  }
}
