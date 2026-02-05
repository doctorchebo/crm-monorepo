import { IsBoolean, IsOptional } from 'class-validator';

/**
 * DTO for updating WhatsApp Commerce Settings
 *
 * Commerce settings control catalog visibility and cart functionality
 * for a specific WhatsApp phone number. These settings are synced
 * with Meta's WhatsApp Commerce Settings API.
 *
 * @see https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account-to-number-current-status/whatsapp_commerce_settings/
 */
export class UpdateCommerceSettingsDto {
  /**
   * Whether the catalog is visible to users chatting with this number
   * When enabled, users can browse products in the catalog
   */
  @IsBoolean()
  @IsOptional()
  isCatalogVisible?: boolean;

  /**
   * Whether the shopping cart is enabled for this number
   * When enabled, users can add products to cart and checkout
   */
  @IsBoolean()
  @IsOptional()
  isCartEnabled?: boolean;
}

/**
 * Response DTO for commerce settings
 */
export class CommerceSettingsResponseDto {
  /**
   * Whether the catalog is currently visible
   */
  isCatalogEnabled: boolean;

  /**
   * Whether the cart is currently enabled
   */
  isCartEnabled: boolean;

  /**
   * The ID of the linked catalog (if any)
   */
  linkedCatalogId: string | null;

  /**
   * When the settings were last synced with Meta
   */
  commerceSettingsSyncedAt: Date | null;

  /**
   * Whether commerce features are available
   * (requires a linked catalog)
   */
  isCommerceAvailable: boolean;
}
