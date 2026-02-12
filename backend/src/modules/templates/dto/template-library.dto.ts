import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  TemplateLibraryIndustry,
  TemplateLibraryTopic,
  TemplateLibraryUseCase,
} from '../providers/provider.interface';

/**
 * DTO for browsing the Meta Template Library with optional filters
 * All fields are optional — without filters, all library templates are returned.
 */
export class TemplateLibraryFiltersDto {
  /**
   * Free-text search across template name, body, header, and footer
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /**
   * Filter by template topic (e.g., ORDER_MANAGEMENT, PAYMENTS)
   */
  @IsOptional()
  @IsEnum(TemplateLibraryTopic, {
    message: `topic must be one of: ${Object.values(TemplateLibraryTopic).join(', ')}`,
  })
  topic?: TemplateLibraryTopic;

  /**
   * Filter by use case (e.g., DELIVERY_UPDATE, PAYMENT_CONFIRMATION)
   */
  @IsOptional()
  @IsEnum(TemplateLibraryUseCase, {
    message: `usecase must be one of: ${Object.values(TemplateLibraryUseCase).join(', ')}`,
  })
  usecase?: TemplateLibraryUseCase;

  /**
   * Filter by industry (e.g., E_COMMERCE, FINANCIAL_SERVICES)
   */
  @IsOptional()
  @IsEnum(TemplateLibraryIndustry, {
    message: `industry must be one of: ${Object.values(TemplateLibraryIndustry).join(', ')}`,
  })
  industry?: TemplateLibraryIndustry;

  /**
   * Filter by language locale code (e.g., 'en_US', 'es')
   */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

/**
 * Button input configuration for adopting a library template.
 * Required when the library template has URL or phone buttons.
 */
export class LibraryTemplateButtonInputDto {
  @IsString()
  @IsNotEmpty()
  type: string; // 'URL', 'PHONE_NUMBER', 'OTP', etc.

  @IsOptional()
  @IsObject()
  url?: {
    base_url: string;
    url_suffix_example?: string;
  };

  @IsOptional()
  @IsString()
  phone_number?: string;

  @IsOptional()
  @IsString()
  otp_type?: string;

  @IsOptional()
  @IsBoolean()
  zero_tap_terms_accepted?: boolean;

  @IsOptional()
  @IsArray()
  supported_apps?: Array<{
    package_name: string;
    signature_hash: string;
  }>;
}

/**
 * Optional body input flags for adopting a library template.
 * These add extra content to the template body.
 */
export class LibraryTemplateBodyInputDto {
  @IsOptional()
  @IsBoolean()
  add_contact_number?: boolean;

  @IsOptional()
  @IsBoolean()
  add_learn_more_link?: boolean;

  @IsOptional()
  @IsBoolean()
  add_security_recommendation?: boolean;

  @IsOptional()
  @IsBoolean()
  add_track_package_link?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  code_expiration_minutes?: number;
}

/**
 * DTO for adopting a template from Meta's Template Library.
 *
 * This creates a real template in the system that is instantly APPROVED.
 * No Meta review is needed — library templates are pre-approved.
 */
export class AdoptLibraryTemplateDto {
  /**
   * User-chosen display name for the template (e.g., "My Delivery Update")
   * A Meta-compliant slug name will be auto-generated from this.
   */
  @IsString()
  @IsNotEmpty({ message: 'Display name is required' })
  @MaxLength(256)
  displayName: string;

  /**
   * Language code in Meta format (e.g., 'en_US', 'es_ES')
   * Must match one of the languages the library template is available in.
   */
  @IsString()
  @IsNotEmpty({ message: 'Language is required' })
  @MaxLength(10)
  language: string;

  /**
   * Exact name of the library template to adopt (e.g., 'delivery_update_1')
   * This must match a template name from the Template Library catalog.
   */
  @IsString()
  @IsNotEmpty({ message: 'Library template name is required' })
  @MaxLength(512)
  libraryTemplateName: string;

  /**
   * Button configuration — required if the library template has URL or phone buttons.
   * Each entry configures one button with its type-specific data.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LibraryTemplateButtonInputDto)
  buttonInputs?: LibraryTemplateButtonInputDto[];

  /**
   * Optional body configuration flags.
   * These add extra information to the template body (e.g., contact number, security recommendation).
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => LibraryTemplateBodyInputDto)
  bodyInputs?: LibraryTemplateBodyInputDto;
}
