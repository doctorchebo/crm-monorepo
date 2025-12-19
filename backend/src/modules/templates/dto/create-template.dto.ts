/**
 * DTO for creating a new template
 *
 * The displayName is user-friendly and shown in the UI.
 * The name (Meta-compliant) will be auto-generated from displayName
 * if not provided, following Meta's naming rules:
 * - Lowercase only
 * - Underscores instead of spaces
 * - No special characters
 */
export class CreateTemplateDto {
  /**
   * User-friendly display name (e.g., "Order Confirmation")
   * This is what users see in the UI
   */
  displayName: string;

  /**
   * Meta-compliant template name (e.g., "order_confirmation")
   * If not provided, will be auto-generated from displayName
   * Must follow Meta's naming rules: lowercase, underscores, no special chars
   */
  name?: string;

  /**
   * Optional description of the template's purpose
   */
  description?: string;

  /**
   * Platforms to enable for this template (default: ['whatsapp'])
   */
  platforms?: string[];
}
