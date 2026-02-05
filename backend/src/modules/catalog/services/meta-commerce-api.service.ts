/**
 * Meta Commerce API Service
 *
 * Handles all communication with Meta's Commerce Catalog API:
 * - Submit products to Meta catalog (items_batch endpoint)
 * - Fetch product status and review state
 * - Sync product information
 *
 * API Documentation:
 * - Items Batch: https://developers.facebook.com/docs/marketing-api/reference/product-catalog/items_batch/
 * - Products: https://developers.facebook.com/docs/marketing-api/reference/product-catalog/products/
 * - Product Item: https://developers.facebook.com/docs/marketing-api/reference/product-item/
 *
 * Key concepts:
 * - retailer_id: YOUR unique identifier for the product (SKU)
 * - id (meta_product_id): Meta's internal ID for the product
 * - review_status: pending | approved | rejected | outdated
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaCloudAPIConfigService } from '@shared/services/meta-cloud-api.config';

/**
 * Product data structure for submitting to Meta
 */
export interface MetaProductData {
  /** Your unique identifier for this product (SKU) */
  retailer_id: string;
  /** Product name/title */
  name: string;
  /** Product description */
  description: string;
  /** Availability status */
  availability:
    | 'in stock'
    | 'out of stock'
    | 'preorder'
    | 'available for order';
  /** Product condition */
  condition: 'new' | 'refurbished' | 'used';
  /** Price with currency (e.g., "9.99 USD") */
  price: string;
  /** Sale price with currency (optional) */
  sale_price?: string;
  /** URL to product page */
  url: string;
  /** URL to main product image */
  image_url: string;
  /** Additional image URLs (max 10) */
  additional_image_urls?: string[];
  /** Brand name */
  brand?: string;
  /** Google product category ID */
  google_product_category?: string;
  /** Country of origin (ISO 3166-1 alpha-2) */
  origin_country?: string;
}

/**
 * Response from items_batch endpoint
 */
export interface MetaBatchResponse {
  handles: string[];
  validation_status: Array<{
    retailer_id: string;
    errors: Array<{ message: string }>;
    warnings: Array<{ message: string }>;
  }>;
}

/**
 * Product item returned from Meta's API
 */
export interface MetaProductItem {
  id: string;
  retailer_id: string;
  name: string;
  description?: string;
  availability: string;
  condition: string;
  price: string;
  currency: string;
  image_url?: string;
  url?: string;
  brand?: string;
  review_status: 'pending' | 'approved' | 'rejected' | 'outdated' | '';
  review_rejection_reasons?: string[];
  errors?: Array<{
    error_type: string;
    error_priority: string;
    title: string;
    description: string;
  }>;
}

/**
 * Result of checking batch request status
 */
export interface MetaBatchStatusResponse {
  data: Array<{
    handle: string;
    status: 'finished' | 'in progress' | 'error';
    ids_of_invalid_requests?: string[];
    num_failed?: number;
    num_total?: number;
  }>;
}

/**
 * Configuration for Meta Commerce API
 */
export interface MetaCommerceConfig {
  enabled: boolean;
  catalogId: string | null;
  businessId: string | null;
}

/**
 * Catalog vertical/type from Meta
 *
 * Different catalog types have different APIs and data structures:
 * - commerce: E-commerce products (required for WhatsApp product messages)
 * - home_listings: Real estate listings
 * - hotels: Hotel listings
 * - flights: Flight deals
 * - destinations: Travel destinations
 * - vehicles: Vehicle listings
 * - offline_commerce: Offline commerce products
 *
 * IMPORTANT: Only "commerce" catalogs support WhatsApp product messages.
 */
export type MetaCatalogVertical =
  | 'commerce'
  | 'home_listings'
  | 'hotels'
  | 'flights'
  | 'destinations'
  | 'vehicles'
  | 'offline_commerce'
  | string; // Allow unknown verticals for forward compatibility

/**
 * Catalog information from Meta API
 */
export interface MetaCatalogInfo {
  id: string;
  name: string;
  vertical: MetaCatalogVertical;
  productCount?: number;
  feedCount?: number;
  businessId?: string;
  businessName?: string;
}

/**
 * Error when catalog type is incompatible
 */
export class CatalogTypeError extends Error {
  constructor(
    message: string,
    public readonly catalogId: string,
    public readonly actualVertical: string,
    public readonly expectedVertical: string = 'commerce',
  ) {
    super(message);
    this.name = 'CatalogTypeError';
  }
}

/**
 * Options for catalog creation
 */
export interface CreateCatalogOptions {
  /**
   * Whether to automatically assign permissions after creation.
   * When true, the catalog will be accessible immediately without
   * manual configuration in Business Manager.
   * @default true
   */
  autoAssignPermissions?: boolean;

  /**
   * Whether to assign permissions to all business admins.
   * Only used when autoAssignPermissions is true.
   * @default true
   */
  assignToAdmins?: boolean;
}

@Injectable()
export class MetaCommerceApiService {
  private readonly logger = new Logger(MetaCommerceApiService.name);
  private readonly baseUrl = 'https://graph.facebook.com';
  private readonly apiVersion = 'v20.0';
  private readonly accessToken: string;
  private readonly appSecretProof: string | undefined;
  private readonly catalogId: string | null;
  private readonly businessId: string | null;
  private readonly enabled: boolean;

  constructor(
    private configService: ConfigService,
    private metaConfig: MetaCloudAPIConfigService,
  ) {
    this.accessToken = this.metaConfig.getAccessToken();
    this.appSecretProof = this.metaConfig.getAppSecretProof();
    this.catalogId = this.configService.get<string>('META_CATALOG_ID') || null;
    this.businessId =
      this.configService.get<string>('META_BUSINESS_ID') || null;

    // Commerce API is enabled only if catalog ID is configured
    this.enabled = !!this.catalogId;

    if (this.enabled) {
      this.logger.log(
        `Meta Commerce API initialized with catalog: ${this.catalogId}`,
      );
      if (!this.appSecretProof) {
        this.logger.warn(
          'META_APP_SECRET not configured - API calls may fail with "appsecret_proof required" error',
        );
      }
    } else {
      this.logger.warn(
        'Meta Commerce API disabled: META_CATALOG_ID not configured. ' +
          'Running in simulation mode.',
      );
    }
  }

  /**
   * Check if Meta Commerce API is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current configuration status
   */
  getConfig(): MetaCommerceConfig {
    return {
      enabled: this.enabled,
      catalogId: this.catalogId,
      businessId: this.businessId,
    };
  }

  /**
   * Get catalog information from Meta API
   *
   * Fetches catalog details including the catalog vertical (type).
   * This is crucial for validating that the catalog is compatible with
   * WhatsApp product messages (which require "commerce" vertical).
   *
   * GET /{catalog_id}?fields=id,name,vertical,product_count,feed_count,business
   *
   * @param catalogId - Optional catalog ID (defaults to configured catalog)
   * @returns Catalog information including vertical
   * @throws Error if catalog not found or API error
   */
  async getCatalogInfo(catalogId?: string): Promise<MetaCatalogInfo> {
    const targetCatalogId = catalogId || this.catalogId;

    if (!targetCatalogId) {
      throw new Error('No catalog ID provided or configured');
    }

    const fields = 'id,name,vertical,product_count,feed_count,business';
    const url = this.buildUrl(`${targetCatalogId}?fields=${fields}`);

    try {
      const response = await this.makeRequest<{
        id: string;
        name: string;
        vertical: string;
        product_count?: number;
        feed_count?: number;
        business?: {
          id: string;
          name: string;
        };
      }>(url, { method: 'GET' });

      this.logger.log(
        `Catalog ${targetCatalogId} info: vertical=${response.vertical}, name="${response.name}"`,
      );

      return {
        id: response.id,
        name: response.name,
        vertical: response.vertical as MetaCatalogVertical,
        productCount: response.product_count,
        feedCount: response.feed_count,
        businessId: response.business?.id,
        businessName: response.business?.name,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get catalog info for ${targetCatalogId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Validate that the catalog is compatible with WhatsApp product messages
   *
   * WhatsApp product messages ONLY work with "commerce" type catalogs.
   * Other catalog types (home_listings, hotels, flights, etc.) use different
   * API endpoints and data structures.
   *
   * @param catalogId - Optional catalog ID (defaults to configured catalog)
   * @returns Catalog info if valid
   * @throws CatalogTypeError if catalog is not commerce type
   */
  async validateCatalogForWhatsApp(
    catalogId?: string,
  ): Promise<MetaCatalogInfo> {
    const targetCatalogId = catalogId || this.catalogId;

    if (!targetCatalogId) {
      throw new Error('No catalog ID provided or configured');
    }

    const catalogInfo = await this.getCatalogInfo(targetCatalogId);

    if (catalogInfo.vertical !== 'commerce') {
      const errorMessage =
        `Catalog "${catalogInfo.name}" (${catalogInfo.id}) is a "${catalogInfo.vertical}" catalog, ` +
        'but WhatsApp product messages require a "commerce" catalog. ' +
        'Please create a new E-Commerce catalog in Meta Commerce Manager and link it to your WhatsApp Business Account.';

      this.logger.error(errorMessage);

      throw new CatalogTypeError(
        errorMessage,
        catalogInfo.id,
        catalogInfo.vertical,
        'commerce',
      );
    }

    this.logger.log(
      `Catalog ${catalogInfo.id} is valid for WhatsApp product messages (type: commerce)`,
    );

    return catalogInfo;
  }

  /**
   * Build API endpoint URL with appsecret_proof
   * Meta requires appsecret_proof for server-to-server API calls
   *
   * @param path - API path (may include existing query params like "products?filter=...")
   * @param extraParams - Additional query params to add
   */
  private buildUrl(path: string, extraParams?: Record<string, string>): string {
    // Parse existing query params if path contains "?"
    let basePath = path;
    const existingParams = new URLSearchParams();

    const queryIndex = path.indexOf('?');
    if (queryIndex !== -1) {
      basePath = path.substring(0, queryIndex);
      const existingQuery = path.substring(queryIndex + 1);
      const parsed = new URLSearchParams(existingQuery);
      parsed.forEach((value, key) => existingParams.set(key, value));
    }

    const baseUrl = `${this.baseUrl}/${this.apiVersion}/${basePath}`;

    // Build final params: existing + appsecret_proof + extra
    const params = new URLSearchParams(existingParams);

    // Always include appsecret_proof if available
    if (this.appSecretProof) {
      params.set('appsecret_proof', this.appSecretProof);
    }

    // Add any extra params
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        params.set(key, value);
      }
    }

    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }

  /**
   * Make authenticated request to Meta Graph API
   */
  private async makeRequest<T>(
    url: string,
    options: {
      method: 'GET' | 'POST' | 'DELETE';
      body?: unknown;
    } = { method: 'GET' },
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };

    const fetchOptions: RequestInit = {
      method: options.method,
      headers,
    };

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    this.logger.debug(`Meta API Request: ${options.method} ${url}`);

    try {
      const response = await fetch(url, fetchOptions);
      const data = await response.json();

      if (!response.ok) {
        const errorMessage =
          data.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`;
        this.logger.error(`Meta API Error: ${errorMessage}`, data);
        throw new Error(errorMessage);
      }

      // Log successful response summary for debugging
      this.logger.debug(
        `Meta API Response: ${options.method} ${url.split('?')[0]} - Status: ${response.status}`,
      );

      return data as T;
    } catch (error) {
      this.logger.error(`Meta API request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Submit products to Meta catalog using items_batch endpoint
   *
   * POST /{catalog_id}/items_batch
   *
   * @param products - Array of products to submit
   * @param catalogId - Optional catalog ID (uses environment catalog ID if not provided)
   * @returns Batch response with handles and validation status
   */
  async submitProducts(
    products: MetaProductData[],
    catalogId?: string,
  ): Promise<MetaBatchResponse> {
    const targetCatalogId = catalogId || this.catalogId;

    if (!targetCatalogId) {
      this.logger.warn(
        'No catalog ID provided and META_CATALOG_ID not configured, simulating submission',
      );
      return this.simulateSubmission(products);
    }

    const url = this.buildUrl(`${targetCatalogId}/items_batch`);

    // Build requests array per Meta API spec
    // item_type is required - "PRODUCT_ITEM" for commerce catalog items
    const requests = products.map((product) => ({
      method: 'CREATE',
      data: {
        id: product.retailer_id,
        title: product.name,
        description: product.description,
        availability: product.availability,
        condition: product.condition,
        price: product.price,
        sale_price: product.sale_price,
        link: product.url,
        image_link: product.image_url,
        additional_image_link: product.additional_image_urls?.join(','),
        brand: product.brand,
        google_product_category: product.google_product_category,
        origin_country: product.origin_country,
      },
    }));

    // item_type is required at the top level of the request body
    const requestBody = {
      item_type: 'PRODUCT_ITEM',
      requests,
    };

    try {
      const response = await this.makeRequest<MetaBatchResponse>(url, {
        method: 'POST',
        body: requestBody,
      });

      this.logger.log(
        `Submitted ${products.length} products to Meta catalog. Handles: ${response.handles?.length || 0}`,
      );

      return response;
    } catch (error) {
      // Handle catalog type mismatch (real estate, hotels, etc. vs commerce)
      // Error code 3, subcode 1798083: "Endpoint not supported for this vertical"
      if (
        error.message?.includes('Endpoint not supported for this vertical') ||
        error.message?.includes('Unknown method') ||
        error.message?.includes("type 'commerce'")
      ) {
        this.logger.error(
          `Catalog ID ${targetCatalogId} is not a commerce catalog. ` +
            'WhatsApp product messages only work with e-commerce catalogs. ' +
            'Please create a Commerce catalog in Meta Commerce Manager.',
        );
        throw new CatalogTypeError(
          'This catalog is not a commerce catalog. WhatsApp product messages require an e-commerce catalog. ' +
            'Please create a new E-Commerce catalog in Meta Commerce Manager.',
          targetCatalogId,
          'unknown',
          'commerce',
        );
      }

      // Handle invalid catalog ID or permission errors gracefully
      if (
        error.message?.includes('does not exist') ||
        error.message?.includes('missing permissions') ||
        error.message?.includes('does not support this operation')
      ) {
        this.logger.warn(
          `Catalog ID ${targetCatalogId} is invalid or inaccessible. ` +
            'Falling back to simulation mode.',
        );
        return this.simulateSubmission(products);
      }
      throw error;
    }
  }

  /**
   * Update existing products in Meta catalog
   *
   * @param products - Array of products to update (must include retailer_id)
   * @param catalogId - Optional catalog ID (uses environment catalog ID if not provided)
   * @returns Batch response with handles and validation status
   */
  async updateProducts(
    products: MetaProductData[],
    catalogId?: string,
  ): Promise<MetaBatchResponse> {
    const targetCatalogId = catalogId || this.catalogId;

    if (!targetCatalogId) {
      this.logger.warn(
        'No catalog ID provided and META_CATALOG_ID not configured, simulating update',
      );
      return this.simulateSubmission(products);
    }

    const url = this.buildUrl(`${targetCatalogId}/items_batch`);

    const requests = products.map((product) => ({
      method: 'UPDATE',
      data: {
        id: product.retailer_id,
        title: product.name,
        description: product.description,
        availability: product.availability,
        condition: product.condition,
        price: product.price,
        sale_price: product.sale_price,
        link: product.url,
        image_link: product.image_url,
        additional_image_link: product.additional_image_urls?.join(','),
        brand: product.brand,
        google_product_category: product.google_product_category,
        origin_country: product.origin_country,
      },
    }));

    return this.makeRequest<MetaBatchResponse>(url, {
      method: 'POST',
      body: { item_type: 'PRODUCT_ITEM', requests },
    });
  }

  /**
   * Delete products from Meta catalog
   *
   * @param retailerIds - Array of retailer IDs to delete
   * @param catalogId - Optional catalog ID (uses environment catalog ID if not provided)
   * @returns Batch response
   */
  async deleteProducts(
    retailerIds: string[],
    catalogId?: string,
  ): Promise<MetaBatchResponse> {
    const targetCatalogId = catalogId || this.catalogId;

    if (!targetCatalogId) {
      this.logger.warn(
        'No catalog ID provided and META_CATALOG_ID not configured, simulating deletion',
      );
      return {
        handles: retailerIds.map((id) => `delete_handle_${id}`),
        validation_status: [],
      };
    }

    const url = this.buildUrl(`${targetCatalogId}/items_batch`);

    const requests = retailerIds.map((id) => ({
      method: 'DELETE',
      data: { id },
    }));

    return this.makeRequest<MetaBatchResponse>(url, {
      method: 'POST',
      body: { requests },
    });
  }

  /**
   * Get product by retailer ID
   *
   * GET /{catalog_id}/products?filter={'retailer_id':{'eq':'SKU123'}}
   *
   * @param retailerId - Your product identifier
   * @param catalogId - Optional catalog ID (uses environment catalog ID if not provided)
   * @returns Product item with review status
   */
  async getProductByRetailerId(
    retailerId: string,
    catalogId?: string,
  ): Promise<MetaProductItem | null> {
    const targetCatalogId = catalogId || this.catalogId;

    if (!targetCatalogId) {
      this.logger.warn(
        'No catalog ID provided and META_CATALOG_ID not configured, simulating product fetch',
      );
      return this.simulateProductFetch(retailerId);
    }

    const filter = JSON.stringify({ retailer_id: { eq: retailerId } });
    const fields = [
      'id',
      'retailer_id',
      'name',
      'description',
      'availability',
      'condition',
      'price',
      'currency',
      'image_url',
      'url',
      'brand',
      'review_status',
      'review_rejection_reasons',
      'errors',
    ].join(',');

    const url = this.buildUrl(
      `${targetCatalogId}/products?filter=${encodeURIComponent(filter)}&fields=${fields}`,
    );

    try {
      const response = await this.makeRequest<{ data: MetaProductItem[] }>(
        url,
        {
          method: 'GET',
        },
      );

      // Log the full response for debugging
      this.logger.debug(
        `Meta API Response for retailer_id="${retailerId}" in catalog ${targetCatalogId}: ` +
          `Found ${response.data?.length || 0} product(s)`,
      );

      if (response.data && response.data.length > 0) {
        const product = response.data[0];
        this.logger.log(
          `Product status for retailer_id="${retailerId}": ` +
            `review_status="${product.review_status || 'not set'}", ` +
            `meta_id="${product.id}", ` +
            `name="${product.name}"` +
            (product.review_rejection_reasons?.length
              ? `, rejection_reasons="${product.review_rejection_reasons.join('; ')}"`
              : '') +
            (product.errors?.length
              ? `, errors="${product.errors.map((e) => e.title).join('; ')}"`
              : ''),
        );
        return product;
      }

      this.logger.warn(
        `No product found in Meta catalog ${targetCatalogId} for retailer_id="${retailerId}"`,
      );
      return null;
    } catch (error) {
      // Handle catalog type mismatch (real estate, hotels, etc. vs commerce)
      // Error code 3, subcode 1798083: "Endpoint not supported for this vertical"
      if (
        error.message?.includes('Endpoint not supported for this vertical') ||
        error.message?.includes('Unknown method') ||
        error.message?.includes("type 'commerce'")
      ) {
        this.logger.error(
          `Catalog ID ${targetCatalogId} is not a commerce catalog. ` +
            'WhatsApp product messages only work with e-commerce catalogs. ' +
            'Please create a Commerce catalog in Meta Commerce Manager.',
        );
        throw new CatalogTypeError(
          'This catalog is not a commerce catalog. WhatsApp product messages require an e-commerce catalog. ' +
            'Please create a new E-Commerce catalog in Meta Commerce Manager.',
          targetCatalogId,
          'unknown', // We don't know the actual type from this error
          'commerce',
        );
      }

      // Handle invalid catalog ID or permission errors gracefully
      if (
        error.message?.includes('does not exist') ||
        error.message?.includes('missing permissions') ||
        error.message?.includes('does not support this operation')
      ) {
        this.logger.warn(
          `Catalog ID ${targetCatalogId} is invalid or inaccessible. ` +
            'Falling back to simulation mode.',
        );
        return this.simulateProductFetch(retailerId);
      }
      throw error;
    }
  }

  /**
   * Get multiple products by retailer IDs
   *
   * @param retailerIds - Array of retailer IDs
   * @param retailerIds - Array of retailer IDs
   * @param catalogId - Optional catalog ID (uses environment catalog ID if not provided)
   * @returns Map of retailer ID to product item
   */
  async getProductsByRetailerIds(
    retailerIds: string[],
    catalogId?: string,
  ): Promise<Map<string, MetaProductItem>> {
    const targetCatalogId = catalogId || this.catalogId;

    if (!targetCatalogId) {
      this.logger.warn(
        'No catalog ID provided and META_CATALOG_ID not configured, simulating bulk product fetch',
      );
      return this.simulateBulkProductFetch(retailerIds);
    }

    const results = new Map<string, MetaProductItem>();

    // Meta doesn't support IN filter, so we need to fetch individually or use pagination
    // For efficiency, we'll fetch all products and filter client-side for small catalogs
    // For large catalogs, consider implementing pagination

    const fields = [
      'id',
      'retailer_id',
      'name',
      'review_status',
      'review_rejection_reasons',
      'errors',
    ].join(',');

    const retailerIdSet = new Set(retailerIds);
    let url = this.buildUrl(
      `${targetCatalogId}/products?fields=${fields}&limit=500`,
    );
    let hasMore = true;

    try {
      while (hasMore && results.size < retailerIds.length) {
        const response = await this.makeRequest<{
          data: MetaProductItem[];
          paging?: { next?: string };
        }>(url, { method: 'GET' });

        for (const product of response.data) {
          if (retailerIdSet.has(product.retailer_id)) {
            results.set(product.retailer_id, product);
          }
        }

        if (response.paging?.next) {
          url = response.paging.next;
        } else {
          hasMore = false;
        }
      }

      return results;
    } catch (error) {
      // Handle catalog type mismatch (real estate, hotels, etc. vs commerce)
      if (
        error.message?.includes('Endpoint not supported for this vertical') ||
        error.message?.includes('Unknown method') ||
        error.message?.includes("type 'commerce'")
      ) {
        this.logger.error(
          `Catalog ID ${targetCatalogId} is not a commerce catalog. ` +
            'WhatsApp product messages only work with e-commerce catalogs.',
        );
        throw new CatalogTypeError(
          'This catalog is not a commerce catalog. WhatsApp product messages require an e-commerce catalog. ' +
            'Please create a new E-Commerce catalog in Meta Commerce Manager.',
          targetCatalogId,
          'unknown',
          'commerce',
        );
      }

      // Handle invalid catalog ID or permission errors gracefully
      if (
        error.message?.includes('does not exist') ||
        error.message?.includes('missing permissions') ||
        error.message?.includes('does not support this operation')
      ) {
        this.logger.warn(
          `Catalog ID ${targetCatalogId} is invalid or inaccessible. ` +
            'Falling back to simulation mode.',
        );
        return this.simulateBulkProductFetch(retailerIds);
      }
      throw error;
    }
  }

  /**
   * Get product directly by Meta's product ID
   *
   * GET /{product_id}
   *
   * @param metaProductId - Meta's internal product ID
   * @returns Product item with full details
   */
  async getProductByMetaId(
    metaProductId: string,
  ): Promise<MetaProductItem | null> {
    if (!this.enabled) {
      this.logger.warn('Meta Commerce API not enabled, returning null');
      return null;
    }

    const fields = [
      'id',
      'retailer_id',
      'name',
      'description',
      'availability',
      'condition',
      'price',
      'currency',
      'image_url',
      'url',
      'brand',
      'review_status',
      'review_rejection_reasons',
      'errors',
    ].join(',');

    const url = this.buildUrl(`${metaProductId}?fields=${fields}`);

    try {
      return await this.makeRequest<MetaProductItem>(url, { method: 'GET' });
    } catch (error) {
      if (error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check batch request status
   *
   * GET /{catalog_id}/check_batch_request_status?handle=xxx
   *
   * @param handles - Array of batch handles to check
   * @param catalogId - Optional catalog ID (uses environment catalog ID if not provided)
   * @returns Status of each batch request
   */
  async checkBatchStatus(
    handles: string[],
    catalogId?: string,
  ): Promise<MetaBatchStatusResponse> {
    const targetCatalogId = catalogId || this.catalogId;

    if (!targetCatalogId) {
      return {
        data: handles.map((handle) => ({
          handle,
          status: 'finished' as const,
        })),
      };
    }

    const url = this.buildUrl(
      `${targetCatalogId}/check_batch_request_status?handle=${handles.join(',')}`,
    );

    return this.makeRequest<MetaBatchStatusResponse>(url, { method: 'GET' });
  }

  // ==================== Simulation Methods (Development Mode) ====================

  /**
   * Simulate product submission for development
   */
  private simulateSubmission(products: MetaProductData[]): MetaBatchResponse {
    return {
      handles: products.map((p) => `sim_handle_${p.retailer_id}_${Date.now()}`),
      validation_status: products.map((p) => ({
        retailer_id: p.retailer_id,
        errors: [],
        warnings: [],
      })),
    };
  }

  /**
   * Simulate single product fetch for development
   * Used when META_CATALOG_ID is not configured
   */
  private simulateProductFetch(retailerId: string): MetaProductItem | null {
    // Return a simulated product that's been "submitted" but pending review
    return {
      id: `sim_meta_id_${retailerId}`,
      retailer_id: retailerId,
      name: 'Simulated Product',
      availability: 'in stock',
      condition: 'new',
      price: '0.00 USD',
      currency: 'USD',
      review_status: 'pending',
    };
  }

  /**
   * Simulate bulk product fetch for development
   */
  private simulateBulkProductFetch(
    retailerIds: string[],
  ): Map<string, MetaProductItem> {
    const results = new Map<string, MetaProductItem>();

    for (const retailerId of retailerIds) {
      results.set(retailerId, {
        id: `sim_meta_id_${retailerId}`,
        retailer_id: retailerId,
        name: 'Simulated Product',
        availability: 'in stock',
        condition: 'new',
        price: '0.00 USD',
        currency: 'USD',
        review_status: 'pending',
      });
    }

    return results;
  }

  /**
   * Simulate status check for development mode
   * Used when Meta Commerce API is not configured
   *
   * Simulates Meta's approval process:
   * - Items pending < 5 seconds stay pending
   * - Items pending 5-10 seconds have 50% approval chance
   * - Items pending 10-30 seconds have 80% approval chance
   * - Items pending > 30 seconds have 95% approval chance
   *
   * @param itemId - The item ID for logging
   * @param submittedAt - When the item was submitted
   * @returns Simulated status and message
   */
  async simulateStatusCheck(
    itemId: string,
    submittedAt: Date | null,
  ): Promise<{ status: string; message: string }> {
    const submissionTime = submittedAt || new Date();
    const secondsSinceSubmission =
      (Date.now() - submissionTime.getTime()) / 1000;

    // Items pending < 5 seconds stay pending
    if (secondsSinceSubmission < 5) {
      return {
        status: 'PENDING_APPROVAL',
        message: 'Under review by Meta (simulated)',
      };
    }

    // Calculate approval probability based on time
    let approvalProbability = 0.5;
    if (secondsSinceSubmission > 10) {
      approvalProbability = 0.8;
    }
    if (secondsSinceSubmission > 30) {
      approvalProbability = 0.95;
    }

    const random = Math.random();

    if (random < approvalProbability) {
      this.logger.debug(
        `[Simulation] Item ${itemId} approved after ${secondsSinceSubmission.toFixed(1)}s`,
      );
      return {
        status: 'APPROVED',
        message: 'Approved by Meta (simulated)',
      };
    } else if (random < approvalProbability + 0.1) {
      this.logger.debug(
        `[Simulation] Item ${itemId} rejected after ${secondsSinceSubmission.toFixed(1)}s`,
      );
      return {
        status: 'REJECTED',
        message:
          'Rejected: Item does not meet Meta Commerce guidelines (simulated)',
      };
    } else {
      return {
        status: 'PENDING_APPROVAL',
        message: 'Still under review by Meta (simulated)',
      };
    }
  }

  /**
   * Map Meta's review_status to our CatalogItemStatus
   */
  mapReviewStatusToCatalogStatus(
    reviewStatus: string | null | undefined,
    hasErrors: boolean = false,
  ): 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'NEEDS_UPDATE' {
    if (hasErrors) {
      return 'NEEDS_UPDATE';
    }

    switch (reviewStatus) {
      case 'approved':
        return 'APPROVED';
      case 'rejected':
        return 'REJECTED';
      case 'outdated':
        return 'NEEDS_UPDATE';
      case 'pending':
      case '':
      case null:
      case undefined:
      default:
        return 'PENDING_APPROVAL';
    }
  }

  // ==================== Catalog Management ====================

  /**
   * List all product catalogs owned by the business
   *
   * GET /{business_id}/owned_product_catalogs
   *
   * @returns Array of catalog summaries
   */
  async listBusinessCatalogs(): Promise<MetaCatalogInfo[]> {
    if (!this.businessId) {
      throw new Error(
        'META_BUSINESS_ID is not configured. Cannot list catalogs.',
      );
    }

    const url = this.metaConfig
      .getEndpoints()
      .getBusinessCatalogs(this.businessId);

    try {
      const response = await this.makeRequest<{
        data: Array<{
          id: string;
          name: string;
          vertical: string;
          product_count?: number;
          feed_count?: number;
        }>;
      }>(url, { method: 'GET' });

      this.logger.log(
        `Listed ${response.data.length} catalogs for business ${this.businessId}`,
      );

      return response.data.map((catalog) => ({
        id: catalog.id,
        name: catalog.name,
        vertical: catalog.vertical as MetaCatalogVertical,
        productCount: catalog.product_count,
        feedCount: catalog.feed_count,
        businessId: this.businessId!,
      }));
    } catch (error) {
      this.logger.error(`Failed to list business catalogs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new product catalog on Meta
   *
   * POST /{business_id}/owned_product_catalogs
   *
   * This method creates a catalog and optionally assigns permissions
   * to the current user and business admins, ensuring immediate access
   * without manual Business Manager configuration.
   *
   * @param name - Name for the catalog
   * @param vertical - Type of catalog (commerce, home_listings, etc.)
   * @param options - Optional configuration for catalog creation
   * @returns The created catalog info with permission assignment results
   */
  async createCatalog(
    name: string,
    vertical: MetaCatalogVertical = 'commerce',
    options: CreateCatalogOptions = {},
  ): Promise<
    MetaCatalogInfo & {
      permissionAssignment?: {
        currentUser: { id: string; success: boolean } | null;
        admins: Array<{ id: string; name: string; success: boolean }>;
        errors: string[];
      };
    }
  > {
    const { autoAssignPermissions = true, assignToAdmins = true } = options;

    if (!this.businessId) {
      throw new Error(
        'META_BUSINESS_ID is not configured. Cannot create catalog.',
      );
    }

    const url = this.metaConfig.getEndpoints().createCatalog(this.businessId);

    try {
      // Meta API requires form-encoded params for catalog creation
      const formData = new URLSearchParams();
      formData.set('name', name);
      formData.set('vertical', vertical);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage =
          data.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`;
        this.logger.error(`Failed to create catalog: ${errorMessage}`, data);
        throw new Error(errorMessage);
      }

      this.logger.log(`Created catalog ${data.id} with name "${name}"`);

      // Fetch the full catalog info
      const catalogInfo = await this.getCatalogInfo(data.id);

      // Auto-assign permissions if enabled
      let permissionAssignment:
        | {
            currentUser: { id: string; success: boolean } | null;
            admins: Array<{ id: string; name: string; success: boolean }>;
            errors: string[];
          }
        | undefined;

      if (autoAssignPermissions) {
        this.logger.log(`Auto-assigning permissions for catalog ${data.id}...`);
        try {
          permissionAssignment = await this.autoAssignCatalogPermissions(
            data.id,
            {
              assignToCurrentUser: true,
              assignToAdmins,
              tasks: ['MANAGE', 'ADVERTISE'],
            },
          );

          if (permissionAssignment.errors.length > 0) {
            this.logger.warn(
              `Some permission assignments failed: ${permissionAssignment.errors.join('; ')}`,
            );
          } else {
            this.logger.log(
              `Successfully assigned permissions for catalog ${data.id}`,
            );
          }
        } catch (error) {
          // Don't fail catalog creation if permission assignment fails
          this.logger.error(
            `Failed to auto-assign permissions (catalog was created): ${error.message}`,
          );
          permissionAssignment = {
            currentUser: null,
            admins: [],
            errors: [error.message],
          };
        }
      }

      return {
        ...catalogInfo,
        permissionAssignment,
      };
    } catch (error) {
      this.logger.error(`Failed to create catalog: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a product catalog from Meta
   *
   * DELETE /{catalog_id}
   *
   * @param catalogId - The catalog ID to delete
   * @returns Success status
   */
  async deleteCatalog(catalogId: string): Promise<boolean> {
    const url = this.metaConfig.getEndpoints().deleteCatalog(catalogId);

    try {
      const response = await this.makeRequest<{ success: boolean }>(url, {
        method: 'DELETE',
      });

      this.logger.log(`Deleted catalog ${catalogId}`);
      return response.success === true;
    } catch (error) {
      this.logger.error(
        `Failed to delete catalog ${catalogId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get catalogs connected to a WhatsApp Business Account
   *
   * GET /{waba_id}/product_catalogs
   *
   * @param wabaId - The WABA ID
   * @returns Array of connected catalogs
   */
  async getWabaCatalogs(
    wabaId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const url = this.metaConfig.getEndpoints().getWabaCatalogs(wabaId);

    try {
      const response = await this.makeRequest<{
        data: Array<{ id: string; name: string }>;
      }>(url, { method: 'GET' });

      this.logger.log(
        `Found ${response.data?.length || 0} catalogs connected to WABA ${wabaId}`,
      );
      return response.data || [];
    } catch (error) {
      this.logger.error(
        `Failed to get WABA catalogs for ${wabaId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Disconnect a catalog from a WhatsApp Business Account
   *
   * DELETE /{waba_id}/product_catalogs?catalog_id=xxx
   *
   * This MUST be called before deleting a catalog that's linked to WABA.
   * The error "This product catalog is currently linked to a WhatsApp Business Account"
   * means you need to call this method first.
   *
   * @param wabaId - The WABA ID
   * @param catalogId - The catalog ID to disconnect
   * @returns Success status
   */
  async disconnectCatalogFromWaba(
    wabaId: string,
    catalogId: string,
  ): Promise<boolean> {
    const url = this.metaConfig
      .getEndpoints()
      .disconnectCatalogFromWaba(wabaId, catalogId);

    try {
      this.logger.log(
        `Disconnecting catalog ${catalogId} from WABA ${wabaId}...`,
      );

      const response = await this.makeRequest<{ success: boolean }>(url, {
        method: 'DELETE',
      });

      this.logger.log(
        `Successfully disconnected catalog ${catalogId} from WABA ${wabaId}`,
      );
      return response.success === true;
    } catch (error) {
      this.logger.error(
        `Failed to disconnect catalog ${catalogId} from WABA ${wabaId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Fully delete a catalog (disconnect from WABA first, then delete)
   *
   * This is a convenience method that handles the common case where
   * a catalog is linked to WABA and needs to be unlinked before deletion.
   *
   * @param catalogId - The catalog ID to delete
   * @param wabaId - Optional WABA ID (uses environment WABA_ID if not provided)
   * @returns Success status
   */
  async forceDeleteCatalog(
    catalogId: string,
    wabaId?: string,
  ): Promise<{ disconnected: boolean; deleted: boolean }> {
    const targetWabaId =
      wabaId || this.metaConfig.getConfigService().get('META_WABA_ID');

    if (!targetWabaId) {
      throw new Error('META_WABA_ID not configured');
    }

    let disconnected = false;
    let deleted = false;

    // Step 1: Try to disconnect from WABA
    try {
      this.logger.log(
        `Step 1: Attempting to disconnect catalog ${catalogId} from WABA ${targetWabaId}`,
      );
      disconnected = await this.disconnectCatalogFromWaba(
        targetWabaId,
        catalogId,
      );
    } catch (error) {
      // If disconnect fails, it might already be disconnected or not linked
      this.logger.warn(
        `Disconnect failed (may already be disconnected): ${error.message}`,
      );
      disconnected = false;
    }

    // Step 2: Delete the catalog
    try {
      this.logger.log(`Step 2: Attempting to delete catalog ${catalogId}`);
      deleted = await this.deleteCatalog(catalogId);
    } catch (error) {
      this.logger.error(`Failed to delete catalog: ${error.message}`);
      throw error;
    }

    return { disconnected, deleted };
  }

  // ==================== Catalog Permission Management ====================

  /**
   * Available catalog permission tasks
   *
   * MANAGE: Full control over catalog - can create, edit, delete items
   * ADVERTISE: Can use catalog items in ads
   */
  static readonly CATALOG_TASKS = {
    MANAGE: 'MANAGE',
    ADVERTISE: 'ADVERTISE',
  } as const;

  /**
   * Get the current user/app information
   *
   * GET /me
   *
   * Returns the ID of the user or system user associated with the access token.
   * This ID can be used to assign catalog permissions.
   *
   * @returns User information including ID and name
   */
  async getCurrentUser(): Promise<{
    id: string;
    name?: string;
  }> {
    const url = this.metaConfig.getEndpoints().getCurrentUser();

    try {
      const response = await this.makeRequest<{
        id: string;
        name?: string;
      }>(url, { method: 'GET' });

      this.logger.log(`Current user/app ID: ${response.id}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to get current user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get users assigned to a catalog
   *
   * GET /{catalog_id}/assigned_users
   *
   * @param catalogId - The catalog ID
   * @param businessId - Optional business ID to filter by (defaults to configured business)
   * @returns List of assigned users with their tasks
   */
  async getCatalogAssignedUsers(
    catalogId: string,
    businessId?: string,
  ): Promise<
    Array<{
      id: string;
      name?: string;
      tasks: string[];
      permitted_tasks?: string[];
    }>
  > {
    const targetBusinessId = businessId || this.businessId;

    if (!targetBusinessId) {
      throw new Error('Business ID is required to get catalog assigned users');
    }

    const url = this.metaConfig
      .getEndpoints()
      .getCatalogAssignedUsers(catalogId, targetBusinessId);

    try {
      const response = await this.makeRequest<{
        data: Array<{
          id: string;
          name?: string;
          tasks: string[];
          permitted_tasks?: string[];
        }>;
      }>(url, { method: 'GET' });

      this.logger.log(
        `Found ${response.data?.length || 0} users assigned to catalog ${catalogId}`,
      );
      return response.data || [];
    } catch (error) {
      this.logger.error(
        `Failed to get assigned users for catalog ${catalogId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Assign a user to a catalog with specific tasks
   *
   * POST /{catalog_id}/assigned_users
   *
   * This grants the specified user permission to access the catalog
   * with the given tasks (MANAGE and/or ADVERTISE).
   *
   * @param catalogId - The catalog ID
   * @param userId - The business-scoped user ID (from /me or business_users endpoint)
   * @param tasks - Array of tasks to assign (MANAGE, ADVERTISE)
   * @param businessId - Optional business ID (defaults to configured business)
   * @returns Success status
   */
  async assignUserToCatalog(
    catalogId: string,
    userId: string,
    tasks: Array<'MANAGE' | 'ADVERTISE'> = ['MANAGE', 'ADVERTISE'],
    businessId?: string,
  ): Promise<boolean> {
    const targetBusinessId = businessId || this.businessId;

    if (!targetBusinessId) {
      throw new Error('Business ID is required to assign catalog users');
    }

    const url = this.metaConfig.getEndpoints().assignCatalogUser(catalogId);

    try {
      // Meta API requires form-encoded params for user assignment
      const formData = new URLSearchParams();
      formData.set('user', userId);
      formData.set('business', targetBusinessId);
      formData.set('tasks', JSON.stringify(tasks));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage =
          data.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`;
        this.logger.error(
          `Failed to assign user ${userId} to catalog ${catalogId}: ${errorMessage}`,
          data,
        );
        throw new Error(errorMessage);
      }

      this.logger.log(
        `Successfully assigned user ${userId} to catalog ${catalogId} with tasks: ${tasks.join(', ')}`,
      );
      return data.success === true;
    } catch (error) {
      this.logger.error(
        `Failed to assign user to catalog ${catalogId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Remove a user from a catalog
   *
   * DELETE /{catalog_id}/assigned_users
   *
   * @param catalogId - The catalog ID
   * @param userId - The business-scoped user ID
   * @param businessId - Optional business ID (defaults to configured business)
   * @returns Success status
   */
  async removeUserFromCatalog(
    catalogId: string,
    userId: string,
    businessId?: string,
  ): Promise<boolean> {
    const targetBusinessId = businessId || this.businessId;

    if (!targetBusinessId) {
      throw new Error('Business ID is required to remove catalog users');
    }

    const url = this.metaConfig.getEndpoints().removeCatalogUser(catalogId);

    try {
      // Meta API requires form-encoded params for user removal
      const formData = new URLSearchParams();
      formData.set('user', userId);
      formData.set('business', targetBusinessId);

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage =
          data.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`;
        this.logger.error(
          `Failed to remove user ${userId} from catalog ${catalogId}: ${errorMessage}`,
          data,
        );
        throw new Error(errorMessage);
      }

      this.logger.log(
        `Successfully removed user ${userId} from catalog ${catalogId}`,
      );
      return data.success === true;
    } catch (error) {
      this.logger.error(
        `Failed to remove user from catalog ${catalogId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get all business users for the configured business
   *
   * GET /{business_id}/business_users
   *
   * @param businessId - Optional business ID (defaults to configured business)
   * @returns List of business users
   */
  async getBusinessUsers(businessId?: string): Promise<
    Array<{
      id: string;
      name: string;
      email?: string;
      role: string;
    }>
  > {
    const targetBusinessId = businessId || this.businessId;

    if (!targetBusinessId) {
      throw new Error('Business ID is required to get business users');
    }

    const url = this.metaConfig
      .getEndpoints()
      .getBusinessUsers(targetBusinessId);

    try {
      const response = await this.makeRequest<{
        data: Array<{
          id: string;
          name: string;
          email?: string;
          role: string;
        }>;
      }>(url, { method: 'GET' });

      this.logger.log(
        `Found ${response.data?.length || 0} business users for business ${targetBusinessId}`,
      );
      return response.data || [];
    } catch (error) {
      this.logger.error(`Failed to get business users: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all system users for the configured business
   *
   * GET /{business_id}/system_users
   *
   * @param businessId - Optional business ID (defaults to configured business)
   * @returns List of system users
   */
  async getBusinessSystemUsers(businessId?: string): Promise<
    Array<{
      id: string;
      name: string;
      role: string;
    }>
  > {
    const targetBusinessId = businessId || this.businessId;

    if (!targetBusinessId) {
      throw new Error('Business ID is required to get system users');
    }

    const url = this.metaConfig
      .getEndpoints()
      .getBusinessSystemUsers(targetBusinessId);

    try {
      const response = await this.makeRequest<{
        data: Array<{
          id: string;
          name: string;
          role: string;
        }>;
      }>(url, { method: 'GET' });

      this.logger.log(
        `Found ${response.data?.length || 0} system users for business ${targetBusinessId}`,
      );
      return response.data || [];
    } catch (error) {
      this.logger.error(`Failed to get system users: ${error.message}`);
      throw error;
    }
  }

  /**
   * Assign catalog permissions to the current user/app and all business admins
   *
   * This is a high-level method that automatically:
   * 1. Gets the current user/app ID from the access token
   * 2. Assigns MANAGE and ADVERTISE permissions to that user
   * 3. Optionally assigns permissions to all business admins
   *
   * This is called automatically after catalog creation to ensure
   * the catalog is immediately accessible without manual Business Manager configuration.
   *
   * @param catalogId - The catalog ID to assign permissions to
   * @param options - Configuration options
   * @param options.assignToCurrentUser - Whether to assign to current user (default: true)
   * @param options.assignToAdmins - Whether to assign to all business admins (default: true)
   * @param options.tasks - Tasks to assign (default: ['MANAGE', 'ADVERTISE'])
   * @returns Summary of assignments made
   */
  async autoAssignCatalogPermissions(
    catalogId: string,
    options: {
      assignToCurrentUser?: boolean;
      assignToAdmins?: boolean;
      tasks?: Array<'MANAGE' | 'ADVERTISE'>;
    } = {},
  ): Promise<{
    currentUser: { id: string; success: boolean } | null;
    admins: Array<{ id: string; name: string; success: boolean }>;
    errors: string[];
  }> {
    const {
      assignToCurrentUser = true,
      assignToAdmins = true,
      tasks = ['MANAGE', 'ADVERTISE'],
    } = options;

    const result: {
      currentUser: { id: string; success: boolean } | null;
      admins: Array<{ id: string; name: string; success: boolean }>;
      errors: string[];
    } = {
      currentUser: null,
      admins: [],
      errors: [],
    };

    // Step 1: Assign to current user (the one making the API call)
    if (assignToCurrentUser) {
      try {
        const currentUser = await this.getCurrentUser();
        this.logger.log(
          `Assigning catalog ${catalogId} to current user ${currentUser.id}`,
        );

        const success = await this.assignUserToCatalog(
          catalogId,
          currentUser.id,
          tasks,
        );
        result.currentUser = { id: currentUser.id, success };
      } catch (error) {
        const errorMsg = `Failed to assign to current user: ${error.message}`;
        this.logger.warn(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    // Step 2: Assign to business admins
    if (assignToAdmins && this.businessId) {
      try {
        const businessUsers = await this.getBusinessUsers();
        const admins = businessUsers.filter(
          (user) => user.role === 'ADMIN' || user.role === 'OWNER',
        );

        for (const admin of admins) {
          // Skip if this is the same as current user
          if (result.currentUser && admin.id === result.currentUser.id) {
            continue;
          }

          try {
            const success = await this.assignUserToCatalog(
              catalogId,
              admin.id,
              tasks,
            );
            result.admins.push({ id: admin.id, name: admin.name, success });
          } catch (error) {
            const errorMsg = `Failed to assign to admin ${admin.name}: ${error.message}`;
            this.logger.warn(errorMsg);
            result.errors.push(errorMsg);
            result.admins.push({
              id: admin.id,
              name: admin.name,
              success: false,
            });
          }
        }
      } catch (error) {
        const errorMsg = `Failed to get business users: ${error.message}`;
        this.logger.warn(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    // Log summary
    const successCount =
      (result.currentUser?.success ? 1 : 0) +
      result.admins.filter((a) => a.success).length;
    this.logger.log(
      `Catalog permission assignment complete: ${successCount} successful, ${result.errors.length} errors`,
    );

    return result;
  }

  /**
   * Get products from a catalog
   *
   * GET /{catalog_id}/products
   *
   * @param catalogId - The catalog ID
   * @param limit - Max number of products to return
   * @param after - Cursor for pagination
   * @returns Products and pagination info
   */
  async getCatalogProducts(
    catalogId: string,
    limit = 100,
    after?: string,
  ): Promise<{
    products: MetaProductItem[];
    paging?: { cursors?: { after?: string }; next?: string };
  }> {
    let url = this.metaConfig.getEndpoints().getCatalogProducts(catalogId);
    url += `&limit=${limit}`;
    if (after) {
      url += `&after=${encodeURIComponent(after)}`;
    }

    try {
      const response = await this.makeRequest<{
        data: MetaProductItem[];
        paging?: { cursors?: { after?: string }; next?: string };
      }>(url, { method: 'GET' });

      return {
        products: response.data,
        paging: response.paging,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get products for catalog ${catalogId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Create a product set (collection) in a catalog
   *
   * POST /{catalog_id}/product_sets
   *
   * @param catalogId - The catalog ID
   * @param name - Name for the product set
   * @param filter - Optional filter rules for dynamic sets
   * @returns The created product set info
   */
  async createProductSet(
    catalogId: string,
    name: string,
    filter?: object,
  ): Promise<{ id: string; name: string }> {
    const url = this.metaConfig.getEndpoints().createProductSet(catalogId);

    try {
      const formData = new URLSearchParams();
      formData.set('name', name);
      if (filter) {
        formData.set('filter', JSON.stringify(filter));
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage =
          data.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      this.logger.log(`Created product set ${data.id} in catalog ${catalogId}`);

      return {
        id: data.id,
        name,
      };
    } catch (error) {
      this.logger.error(`Failed to create product set: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get product sets in a catalog
   *
   * GET /{catalog_id}/product_sets
   *
   * @param catalogId - The catalog ID
   * @returns Array of product sets
   */
  async getCatalogProductSets(
    catalogId: string,
  ): Promise<Array<{ id: string; name: string; productCount?: number }>> {
    const url = this.metaConfig.getEndpoints().getCatalogProductSets(catalogId);

    try {
      const response = await this.makeRequest<{
        data: Array<{
          id: string;
          name: string;
          product_count?: number;
        }>;
      }>(url, { method: 'GET' });

      return response.data.map((set) => ({
        id: set.id,
        name: set.name,
        productCount: set.product_count,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to get product sets for catalog ${catalogId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Delete a product set
   *
   * DELETE /{product_set_id}
   *
   * @param productSetId - The product set ID
   * @returns Success status
   */
  async deleteProductSet(productSetId: string): Promise<boolean> {
    const url = this.metaConfig.getEndpoints().deleteProductSet(productSetId);

    try {
      const response = await this.makeRequest<{ success: boolean }>(url, {
        method: 'DELETE',
      });

      this.logger.log(`Deleted product set ${productSetId}`);
      return response.success === true;
    } catch (error) {
      this.logger.error(
        `Failed to delete product set ${productSetId}: ${error.message}`,
      );
      throw error;
    }
  }
}
