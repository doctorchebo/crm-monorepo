import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { HeaderFormat, TEMPLATE_LIMITS } from '../types';

/**
 * DTO for template header component
 * Supports text, image, video, document, and location formats
 */
export class TemplateHeaderDto {
  @IsEnum(HeaderFormat, {
    message: `Header format must be one of: ${Object.values(HeaderFormat).join(', ')}`,
  })
  @IsNotEmpty()
  format: HeaderFormat;

  /**
   * Text content for TEXT format headers
   * Max 60 characters, can contain one variable {{1}}
   */
  @ValidateIf((o) => o.format === HeaderFormat.TEXT)
  @IsString()
  @IsNotEmpty({ message: 'Text is required for text headers' })
  @MaxLength(TEMPLATE_LIMITS.HEADER_TEXT_MAX_LENGTH, {
    message: `Header text cannot exceed ${TEMPLATE_LIMITS.HEADER_TEXT_MAX_LENGTH} characters`,
  })
  text?: string;

  /**
   * Example value for header variable (if text contains {{1}})
   */
  @ValidateIf((o) => o.format === HeaderFormat.TEXT)
  @IsOptional()
  @IsString()
  example?: string;

  /**
   * Asset handle from Meta Resumable Upload API
   * Required for IMAGE, VIDEO, DOCUMENT at template creation
   */
  @ValidateIf((o) =>
    [HeaderFormat.IMAGE, HeaderFormat.VIDEO, HeaderFormat.DOCUMENT].includes(
      o.format,
    ),
  )
  @IsOptional()
  @IsString()
  assetHandle?: string;

  /**
   * Direct media URL (alternative to assetHandle)
   * Used when sending template messages
   */
  @ValidateIf((o) =>
    [HeaderFormat.IMAGE, HeaderFormat.VIDEO, HeaderFormat.DOCUMENT].includes(
      o.format,
    ),
  )
  @IsOptional()
  @IsString()
  link?: string;

  /**
   * Filename for document headers
   */
  @ValidateIf((o) => o.format === HeaderFormat.DOCUMENT)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;

  // ── Location header fields ─────────────────────────────────────────
  // Stored at template creation time so they pre-populate the send modal.
  // At send time the values are passed as header parameters to Meta.

  /**
   * Latitude in decimal degrees (e.g. 37.4421)
   */
  @ValidateIf((o) => o.format === HeaderFormat.LOCATION)
  @IsOptional()
  latitude?: number;

  /**
   * Longitude in decimal degrees (e.g. -122.1616)
   */
  @ValidateIf((o) => o.format === HeaderFormat.LOCATION)
  @IsOptional()
  longitude?: number;

  /**
   * Human-readable location name (e.g. "Philz Coffee")
   */
  @ValidateIf((o) => o.format === HeaderFormat.LOCATION)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  /**
   * Street address (e.g. "101 Forest Ave, Palo Alto, CA 94301")
   */
  @ValidateIf((o) => o.format === HeaderFormat.LOCATION)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}
