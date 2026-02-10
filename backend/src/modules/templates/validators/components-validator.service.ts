import { Injectable } from '@nestjs/common';
import { TemplateComponentsDto } from '../dto';
import { TEMPLATE_LIMITS, TemplateCategory } from '../types';
import { ButtonValidatorService } from './button-validator.service';
import { HeaderValidatorService } from './header-validator.service';
import {
  createValidationResult,
  validateVariablePositions,
  ValidationError,
  ValidationResult,
} from './validation-error.interface';

/**
 * Main validator service for template components
 * Orchestrates validation of all component types
 */
@Injectable()
export class ComponentsValidatorService {
  constructor(
    private readonly headerValidator: HeaderValidatorService,
    private readonly buttonValidator: ButtonValidatorService,
  ) {}

  /**
   * Validate complete template components
   * Returns a ValidationResult with errors and warnings
   */
  validate(
    components: TemplateComponentsDto,
    category: TemplateCategory = TemplateCategory.UTILITY,
  ): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate header
    if (components.header) {
      errors.push(
        ...this.headerValidator.validate(components.header, category),
      );
    }

    // Validate body (required)
    errors.push(...this.validateBody(components, category));

    // Validate footer
    if (components.footer) {
      errors.push(...this.validateFooter(components));
    }

    // Validate buttons
    if (components.buttons && components.buttons.length > 0) {
      errors.push(
        ...this.buttonValidator.validate(components.buttons, category),
      );
    }

    // Validate category-specific components
    errors.push(
      ...this.validateCategorySpecificComponents(components, category),
    );

    // Validate carousel
    if (components.carousel && components.carousel.length > 0) {
      errors.push(...this.validateCarousel(components, category));
    }

    return createValidationResult(errors);
  }

  /**
   * Quick check if components are valid without full error details
   */
  isValid(
    components: TemplateComponentsDto,
    category: TemplateCategory = TemplateCategory.UTILITY,
  ): boolean {
    return this.validate(components, category).isValid;
  }

  private validateBody(
    components: TemplateComponentsDto,
    category: TemplateCategory,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!components.body) {
      errors.push({
        field: 'body',
        message: 'Body is required',
        severity: 'error',
        code: 'BODY_REQUIRED',
      });
      return errors;
    }

    if (!components.body.text || components.body.text.trim().length === 0) {
      errors.push({
        field: 'body.text',
        message: 'Body text is required',
        severity: 'error',
        code: 'BODY_TEXT_REQUIRED',
      });
      return errors;
    }

    // Check body length
    if (components.body.text.length > TEMPLATE_LIMITS.BODY_MAX_LENGTH) {
      errors.push({
        field: 'body.text',
        message: `Body text cannot exceed ${TEMPLATE_LIMITS.BODY_MAX_LENGTH} characters`,
        severity: 'error',
        code: 'BODY_TEXT_TOO_LONG',
      });
    }

    // Check variable positions (Meta API doesn't allow variables at start/end)
    errors.push(
      ...validateVariablePositions(components.body.text, 'body.text', 'Body'),
    );

    // Count variables
    const variables = components.body.text.match(/\{\{[^}]+\}\}/g) || [];
    if (variables.length > TEMPLATE_LIMITS.BODY_MAX_VARIABLES) {
      errors.push({
        field: 'body.text',
        message: `Body cannot have more than ${TEMPLATE_LIMITS.BODY_MAX_VARIABLES} variables. Found ${variables.length}.`,
        severity: 'error',
        code: 'BODY_TOO_MANY_VARIABLES',
      });
    }

    // Authentication templates have specific requirements
    if (category === TemplateCategory.AUTHENTICATION) {
      // Must contain the OTP code placeholder
      if (!components.body.text.includes('{{')) {
        errors.push({
          field: 'body.text',
          message:
            'Authentication template body must contain a variable for the OTP code',
          severity: 'error',
          code: 'AUTH_BODY_MISSING_OTP_PLACEHOLDER',
        });
      }

      // Cannot contain URLs
      if (/https?:\/\//.test(components.body.text)) {
        errors.push({
          field: 'body.text',
          message: 'Authentication templates cannot contain URLs',
          severity: 'error',
          code: 'AUTH_BODY_NO_URLS',
        });
      }

      // Cannot contain emojis
      if (/[\u{1F600}-\u{1F64F}]/u.test(components.body.text)) {
        errors.push({
          field: 'body.text',
          message: 'Authentication templates cannot contain emojis',
          severity: 'error',
          code: 'AUTH_BODY_NO_EMOJIS',
        });
      }
    }

    // Check example values are provided for variables
    if (variables.length > 0) {
      const uniqueVars = new Set(
        variables.map((v) => v.replace(/\{\{|\}\}/g, '')),
      );
      const examples = components.body.examples || {};
      const missingExamples: string[] = [];

      uniqueVars.forEach((varName) => {
        if (!examples[varName]) {
          missingExamples.push(varName);
        }
      });

      if (missingExamples.length > 0) {
        errors.push({
          field: 'body.examples',
          message: `Missing example values for variables: ${missingExamples.join(', ')}`,
          severity: 'warning',
          code: 'BODY_MISSING_EXAMPLES',
        });
      }
    }

    return errors;
  }

  private validateFooter(components: TemplateComponentsDto): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!components.footer) {
      return errors;
    }

    // Check footer length
    if (components.footer.text.length > TEMPLATE_LIMITS.FOOTER_MAX_LENGTH) {
      errors.push({
        field: 'footer.text',
        message: `Footer text cannot exceed ${TEMPLATE_LIMITS.FOOTER_MAX_LENGTH} characters`,
        severity: 'error',
        code: 'FOOTER_TEXT_TOO_LONG',
      });
    }

    // Footer cannot have variables
    if (/\{\{[^}]+\}\}/.test(components.footer.text)) {
      errors.push({
        field: 'footer.text',
        message: 'Footer cannot contain variables',
        severity: 'error',
        code: 'FOOTER_NO_VARIABLES',
      });
    }

    return errors;
  }

  private validateCategorySpecificComponents(
    components: TemplateComponentsDto,
    category: TemplateCategory,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Limited time offer only for marketing
    if (
      components.limitedTimeOffer &&
      category !== TemplateCategory.MARKETING
    ) {
      errors.push({
        field: 'limitedTimeOffer',
        message: 'Limited time offers are only allowed in marketing templates',
        severity: 'error',
        code: 'LTO_MARKETING_ONLY',
      });
    }

    // Validate LTO configuration
    if (components.limitedTimeOffer?.hasExpiration) {
      if (!components.limitedTimeOffer.expirationTimeMs) {
        errors.push({
          field: 'limitedTimeOffer.expirationTimeMs',
          message: 'Expiration time is required when hasExpiration is true',
          severity: 'error',
          code: 'LTO_EXPIRATION_REQUIRED',
        });
      } else if (components.limitedTimeOffer.expirationTimeMs < Date.now()) {
        errors.push({
          field: 'limitedTimeOffer.expirationTimeMs',
          message: 'Expiration time must be in the future',
          severity: 'error',
          code: 'LTO_EXPIRATION_IN_PAST',
        });
      }
    }

    // Carousel only for marketing
    if (components.carousel && category !== TemplateCategory.MARKETING) {
      errors.push({
        field: 'carousel',
        message: 'Carousels are only allowed in marketing templates',
        severity: 'error',
        code: 'CAROUSEL_MARKETING_ONLY',
      });
    }

    // Authentication config only for authentication
    if (
      components.authentication &&
      category !== TemplateCategory.AUTHENTICATION
    ) {
      errors.push({
        field: 'authentication',
        message:
          'Authentication configuration is only allowed in authentication templates',
        severity: 'error',
        code: 'AUTH_CONFIG_AUTH_ONLY',
      });
    }

    // Validate authentication config
    if (
      components.authentication &&
      category === TemplateCategory.AUTHENTICATION
    ) {
      if (components.authentication.codeExpirationMinutes !== undefined) {
        if (
          components.authentication.codeExpirationMinutes <
          TEMPLATE_LIMITS.AUTH_EXPIRATION_MIN_MINUTES
        ) {
          errors.push({
            field: 'authentication.codeExpirationMinutes',
            message: `Code expiration must be at least ${TEMPLATE_LIMITS.AUTH_EXPIRATION_MIN_MINUTES} minute`,
            severity: 'error',
            code: 'AUTH_EXPIRATION_TOO_SHORT',
          });
        }
        if (
          components.authentication.codeExpirationMinutes >
          TEMPLATE_LIMITS.AUTH_EXPIRATION_MAX_MINUTES
        ) {
          errors.push({
            field: 'authentication.codeExpirationMinutes',
            message: `Code expiration cannot exceed ${TEMPLATE_LIMITS.AUTH_EXPIRATION_MAX_MINUTES} minutes`,
            severity: 'error',
            code: 'AUTH_EXPIRATION_TOO_LONG',
          });
        }
      }
    }

    return errors;
  }

  private validateCarousel(
    components: TemplateComponentsDto,
    category: TemplateCategory,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!components.carousel) {
      return errors;
    }

    if (components.carousel.length > TEMPLATE_LIMITS.MAX_CAROUSEL_CARDS) {
      errors.push({
        field: 'carousel',
        message: `Cannot have more than ${TEMPLATE_LIMITS.MAX_CAROUSEL_CARDS} carousel cards`,
        severity: 'error',
        code: 'CAROUSEL_TOO_MANY_CARDS',
      });
    }

    // Validate each card
    for (let i = 0; i < components.carousel.length; i++) {
      const card = components.carousel[i];
      const cardPrefix = `carousel[${i}]`;

      // Card header is required and must be media
      if (!card.header) {
        errors.push({
          field: `${cardPrefix}.header`,
          message: 'Carousel card header is required',
          severity: 'error',
          code: 'CAROUSEL_CARD_HEADER_REQUIRED',
        });
      } else {
        // Validate card header
        errors.push(
          ...this.headerValidator.validate(card.header, category).map((e) => ({
            ...e,
            field: `${cardPrefix}.${e.field}`,
          })),
        );
      }

      // Card body is required
      if (!card.body || !card.body.text) {
        errors.push({
          field: `${cardPrefix}.body`,
          message: 'Carousel card body is required',
          severity: 'error',
          code: 'CAROUSEL_CARD_BODY_REQUIRED',
        });
      }

      // Validate card buttons
      if (card.buttons && card.buttons.length > 0) {
        if (card.buttons.length > TEMPLATE_LIMITS.MAX_BUTTONS_PER_CARD) {
          errors.push({
            field: `${cardPrefix}.buttons`,
            message: `Carousel cards can have at most ${TEMPLATE_LIMITS.MAX_BUTTONS_PER_CARD} buttons`,
            severity: 'error',
            code: 'CAROUSEL_CARD_TOO_MANY_BUTTONS',
          });
        }

        errors.push(
          ...this.buttonValidator.validate(card.buttons, category).map((e) => ({
            ...e,
            field: `${cardPrefix}.${e.field}`,
          })),
        );
      }
    }

    return errors;
  }
}
