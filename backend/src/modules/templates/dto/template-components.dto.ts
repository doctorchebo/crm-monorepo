import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TEMPLATE_LIMITS } from '../types';
import { TemplateBodyDto } from './template-body.dto';
import { TemplateButtonDto } from './template-button.dto';
import { TemplateFooterDto } from './template-footer.dto';
import { TemplateHeaderDto } from './template-header.dto';

/**
 * DTO for limited time offer configuration
 * Only valid for MARKETING templates
 */
export class LimitedTimeOfferDto {
  @IsBoolean()
  hasExpiration: boolean;

  /**
   * Expiration timestamp in milliseconds
   * Required if hasExpiration is true
   */
  @IsOptional()
  @IsNumber()
  expirationTimeMs?: number;
}

/**
 * DTO for authentication template configuration
 * Only valid for AUTHENTICATION templates
 */
export class AuthenticationConfigDto {
  /**
   * Whether to add security recommendation text
   * "For your security, do not share this code"
   */
  @IsOptional()
  @IsBoolean()
  addSecurityRecommendation?: boolean;

  /**
   * Code expiration time in minutes (1-90)
   * Adds "This code expires in X minutes" text
   */
  @IsOptional()
  @IsInt()
  @Min(TEMPLATE_LIMITS.AUTH_EXPIRATION_MIN_MINUTES, {
    message: `Code expiration must be at least ${TEMPLATE_LIMITS.AUTH_EXPIRATION_MIN_MINUTES} minute`,
  })
  @Max(TEMPLATE_LIMITS.AUTH_EXPIRATION_MAX_MINUTES, {
    message: `Code expiration cannot exceed ${TEMPLATE_LIMITS.AUTH_EXPIRATION_MAX_MINUTES} minutes`,
  })
  codeExpirationMinutes?: number;
}

/**
 * DTO for carousel card (marketing templates)
 */
export class CarouselCardDto {
  @ValidateNested()
  @Type(() => TemplateHeaderDto)
  header: TemplateHeaderDto;

  @ValidateNested()
  @Type(() => TemplateBodyDto)
  body: TemplateBodyDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TEMPLATE_LIMITS.MAX_BUTTONS_PER_CARD, {
    message: `Carousel cards can have at most ${TEMPLATE_LIMITS.MAX_BUTTONS_PER_CARD} buttons`,
  })
  @ValidateNested({ each: true })
  @Type(() => TemplateButtonDto)
  buttons?: TemplateButtonDto[];
}

/**
 * Complete template components DTO
 * This is the main structure for creating/updating templates
 */
export class TemplateComponentsDto {
  /**
   * Optional header component
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateHeaderDto)
  header?: TemplateHeaderDto;

  /**
   * Required body component
   */
  @ValidateNested()
  @Type(() => TemplateBodyDto)
  body: TemplateBodyDto;

  /**
   * Optional footer component
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateFooterDto)
  footer?: TemplateFooterDto;

  /**
   * Optional buttons (max 10 total)
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TEMPLATE_LIMITS.MAX_BUTTONS_TOTAL, {
    message: `Cannot have more than ${TEMPLATE_LIMITS.MAX_BUTTONS_TOTAL} buttons`,
  })
  @ValidateNested({ each: true })
  @Type(() => TemplateButtonDto)
  buttons?: TemplateButtonDto[];

  /**
   * Limited time offer configuration (marketing only)
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => LimitedTimeOfferDto)
  limitedTimeOffer?: LimitedTimeOfferDto;

  /**
   * Carousel cards (marketing only, up to 10)
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TEMPLATE_LIMITS.MAX_CAROUSEL_CARDS, {
    message: `Cannot have more than ${TEMPLATE_LIMITS.MAX_CAROUSEL_CARDS} carousel cards`,
  })
  @ValidateNested({ each: true })
  @Type(() => CarouselCardDto)
  carousel?: CarouselCardDto[];

  /**
   * Authentication configuration (authentication only)
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => AuthenticationConfigDto)
  authentication?: AuthenticationConfigDto;
}
