import { Injectable } from '@nestjs/common';
import { TemplateParserService } from './template-parser.service';

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Template validator service
 * Enforces WhatsApp/Meta Business template rules and constraints
 *
 * Reference: https://www.twilio.com/docs/whatsapp/tutorial/message-template-approvals-statuses
 */
@Injectable()
export class TemplateValidatorService {
  constructor(private parserService: TemplateParserService) {}

  /**
   * Validate complete template locale
   */
  validate(body: string, header?: string, footer?: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate body
    const bodyErrors = this.validateBody(body);
    errors.push(...bodyErrors);

    // Validate header if provided
    if (header) {
      const headerErrors = this.validateHeader(header);
      errors.push(...headerErrors);
    }

    // Validate footer if provided
    if (footer) {
      const footerErrors = this.validateFooter(footer);
      errors.push(...footerErrors);
    }

    return errors;
  }

  private validateBody(body: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check empty body
    if (!body || body.trim().length === 0) {
      errors.push({
        field: 'body',
        message: 'Template body cannot be empty',
        severity: 'error',
      });
      return errors;
    }

    // Check body length (Meta: ~1000 chars for body, practical limit ~500)
    if (body.length > 1000) {
      errors.push({
        field: 'body',
        message: 'Template body exceeds maximum length of 1000 characters',
        severity: 'error',
      });
    }

    // Check variable positioning (cannot be at start/end)
    const positionCheck = this.parserService.validateVariablePositioning(body);
    if (!positionCheck.isValid) {
      positionCheck.errors.forEach((msg) => {
        errors.push({
          field: 'body',
          message: msg,
          severity: 'error',
        });
      });
    }

    // Check number of variables (Meta: typically up to 10)
    const variables = this.parserService.extractVariables(body);
    if (variables.length > 10) {
      errors.push({
        field: 'body',
        message: `Too many variables: found ${variables.length}, maximum is 10`,
        severity: 'error',
      });
    }

    // Check for duplicate variables in same placeholder (warning - should be handled)
    const uniqueVars = new Set(variables);
    if (uniqueVars.size < variables.length) {
      errors.push({
        field: 'body',
        message:
          'Duplicate variables detected. Each variable should appear once or be intentionally repeated.',
        severity: 'warning',
      });
    }

    // Check for markdown formatting patterns (actual usage, not just presence of characters)
    // Only warn if characters are used for formatting: **bold**, __italic__, ~~strikethrough~~
    // Exclude single backticks and single underscores as they're common in regular text
    const markdownPatterns = /\*\*[^\*]+\*\*|__[^_]+__|~~[^~]+~~/;
    if (markdownPatterns.test(body)) {
      errors.push({
        field: 'body',
        message:
          'Template contains markdown formatting. These may be interpreted as formatting by WhatsApp.',
        severity: 'warning',
      });
    }

    return errors;
  }

  private validateHeader(header: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!header || header.trim().length === 0) {
      return errors; // Header is optional
    }

    // Check if header is URL (for media)
    const isUrl = /^https?:\/\//.test(header.trim());

    if (isUrl) {
      // Validate media URL format
      try {
        new URL(header.trim());
      } catch {
        errors.push({
          field: 'header',
          message: 'Invalid media URL format',
          severity: 'error',
        });
      }

      // Check for disallowed protocols
      if (!/^https?:\/\//.test(header.trim())) {
        errors.push({
          field: 'header',
          message: 'Media URLs must use HTTP or HTTPS protocol',
          severity: 'error',
        });
      }
    } else {
      // Text header - check length
      if (header.length > 60) {
        errors.push({
          field: 'header',
          message: 'Text header exceeds maximum length of 60 characters',
          severity: 'error',
        });
      }

      // Text header cannot contain variables (Meta restriction)
      const hasVariables = /\{\{/.test(header);
      if (hasVariables) {
        errors.push({
          field: 'header',
          message: 'Header text cannot contain variables',
          severity: 'error',
        });
      }
    }

    return errors;
  }

  private validateFooter(footer: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!footer || footer.trim().length === 0) {
      return errors; // Footer is optional
    }

    // Check footer length (typically 60 chars)
    if (footer.length > 60) {
      errors.push({
        field: 'footer',
        message: 'Footer exceeds maximum length of 60 characters',
        severity: 'error',
      });
    }

    // Footer cannot contain variables
    const hasVariables = /\{\{/.test(footer);
    if (hasVariables) {
      errors.push({
        field: 'footer',
        message: 'Footer cannot contain variables',
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Check if template has critical errors (vs. just warnings)
   */
  hasCriticalErrors(errors: ValidationError[]): boolean {
    return errors.some((e) => e.severity === 'error');
  }

  /**
   * Get only errors (not warnings)
   */
  getErrorsOnly(errors: ValidationError[]): ValidationError[] {
    return errors.filter((e) => e.severity === 'error');
  }

  /**
   * Get only warnings
   */
  getWarningsOnly(errors: ValidationError[]): ValidationError[] {
    return errors.filter((e) => e.severity === 'warning');
  }
}
