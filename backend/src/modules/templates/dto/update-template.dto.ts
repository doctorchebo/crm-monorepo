/**
 * DTO for updating an existing template
 *
 * All fields are optional - only provided fields will be updated.
 * If displayName is updated and name is not provided, the name
 * will be auto-regenerated from the new displayName.
 */
export class UpdateTemplateDto {
  /**
   * User-friendly display name (e.g., "Order Confirmation")
   * This is what users see in the UI
   */
  displayName?: string;

  /**
   * Meta-compliant template name (e.g., "order_confirmation")
   * Must follow Meta's naming rules: lowercase, underscores, no special chars
   */
  name?: string;

  /**
   * Optional description of the template's purpose
   */
  description?: string;

  /**
   * Whether the template is visible in the UI (chat template selector)
   */
  isVisible?: boolean;

  /**
   * Soft delete flag - false means template is "deleted"
   */
  isActive?: boolean;
}
