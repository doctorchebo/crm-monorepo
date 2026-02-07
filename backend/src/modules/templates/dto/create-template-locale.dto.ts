import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TEMPLATE_LIMITS, TemplateCategory } from '../types';
import { TemplateComponentsDto } from './template-components.dto';

/**
 * DTO for creating a template locale with full component support
 *
 * Supports two modes:
 * 1. Legacy mode: Using header/body/footer strings (backward compatible)
 * 2. Enhanced mode: Using components object (new full-featured mode)
 *
 * When components is provided, it takes precedence over legacy fields.
 */
export class CreateTemplateLocaleDto {
  /**
   * Language code for this locale
   * Must be a valid WhatsApp Business API language code
   */
  @IsString()
  @IsNotEmpty({ message: 'Locale is required' })
  @MaxLength(10)
  locale: string;

  /**
   * Template category - determines which features are available
   */
  @IsOptional()
  @IsEnum(TemplateCategory, {
    message: `Category must be one of: ${Object.values(TemplateCategory).join(', ')}`,
  })
  category?: TemplateCategory;

  // =========================================================================
  // ENHANCED MODE: Full component support
  // =========================================================================

  /**
   * Complete template components structure
   * When provided, this takes precedence over legacy fields (header, body, footer)
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateComponentsDto)
  components?: TemplateComponentsDto;

  // =========================================================================
  // LEGACY MODE: Simple text-only fields (backward compatible)
  // =========================================================================

  /**
   * @deprecated Use components.header instead
   * Legacy header text or media URL
   */
  @ValidateIf((o) => !o.components)
  @IsOptional()
  @IsString()
  @MaxLength(TEMPLATE_LIMITS.HEADER_TEXT_MAX_LENGTH)
  header?: string;

  /**
   * @deprecated Use components.body instead
   * Legacy body text with {{placeholder}} syntax
   */
  @ValidateIf((o) => !o.components)
  @IsString()
  @IsNotEmpty({ message: 'Body is required when not using components' })
  @MaxLength(TEMPLATE_LIMITS.BODY_MAX_LENGTH)
  body?: string;

  /**
   * @deprecated Use components.footer instead
   * Legacy footer text
   */
  @ValidateIf((o) => !o.components)
  @IsOptional()
  @IsString()
  @MaxLength(TEMPLATE_LIMITS.FOOTER_MAX_LENGTH)
  footer?: string;

  /**
   * Example variable values for template preview
   * Maps variable names to example values
   */
  @IsOptional()
  @IsObject()
  exampleVars?: Record<string, string>;

  /**
   * @deprecated Inferred from components.header.format
   * Legacy type field
   */
  @IsOptional()
  @IsString()
  type?: string;
}
