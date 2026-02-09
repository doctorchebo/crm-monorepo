import { Injectable } from '@nestjs/common';
import { TemplateParserService } from './template-parser.service';
import { VARIABLE_PREFIXES } from './variable-resolution.service';

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  code?: string; // Error code for programmatic handling
}

/**
 * Meta-specific validation rules and constraints
 * Reference: https://developers.facebook.com/docs/whatsapp/message-templates/guidelines/
 */
export const META_TEMPLATE_RULES = {
  // Name constraints
  NAME_MAX_LENGTH: 512,
  NAME_PATTERN: /^[a-z][a-z0-9_]*$/, // lowercase alphanumeric and underscores, must start with letter

  // Body constraints
  BODY_MAX_LENGTH: 1024,
  BODY_MIN_LENGTH: 1,

  // Header constraints
  HEADER_TEXT_MAX_LENGTH: 60,
  HEADER_NO_VARIABLES: true, // Text headers cannot have variables (media can)

  // Footer constraints
  FOOTER_MAX_LENGTH: 60,
  FOOTER_NO_VARIABLES: true,

  // Variable constraints
  MAX_VARIABLES: 10,
  VARIABLE_PATTERN: /^\{\{[a-z_][a-z0-9_.]*\}\}$/i, // Named format
  POSITIONAL_VARIABLE_PATTERN: /^\{\{[1-9][0-9]*\}\}$/, // Positional format

  // Categories
  VALID_CATEGORIES: ['authentication', 'marketing', 'utility'] as const,

  // Content restrictions
  PROHIBITED_CONTENT: [
    // Spam indicators
    /free\s+money/i,
    /winner/i,
    /congratulations.*won/i,
    // Adult content indicators
    /18\+/i,
    // Illegal content indicators
    /buy\s+now.*limited/i,
  ],

  // URL restrictions
  URL_SHORTENERS_BLOCKED: [
    'bit.ly',
    'tinyurl',
    't.co',
    'goo.gl',
    'ow.ly',
    'is.gd',
    'buff.ly',
  ],
};

/**
 * Template validator service
 * Enforces WhatsApp/Meta Business template rules and constraints
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/message-templates/guidelines/
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

    // Validate variable naming convention (prefix.field format)
    const variableNamingErrors = this.validateVariableNames(variables);
    errors.push(...variableNamingErrors);

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
   * Validate variable names follow a flexible naming convention.
   *
   * FLEXIBLE APPROACH: Users can define any variable in "prefix.field" format.
   * This allows custom business variables like "promotion.end_date", "order.discount", etc.
   *
   * Validation rules:
   * - Must follow prefix.field format (two parts separated by a dot)
   * - Prefix must be lowercase letters and underscores, starting with a letter
   * - Field must be lowercase letters, numbers, and underscores, starting with a letter
   *
   * Variable resolution happens at SEND TIME, where:
   * - Known prefixes (customer, chat, sender, system) resolve from system data
   * - Unknown prefixes resolve from contact custom attributes
   * - Users are warned about unresolved variables but can still send
   */
  private validateVariableNames(variables: string[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const validPrefixes = Object.values(VARIABLE_PREFIXES);

    for (const varName of variables) {
      const parts = varName.split('.');

      // Must have exactly 2 parts (prefix.field)
      if (parts.length !== 2) {
        errors.push({
          field: 'body',
          message: `Invalid variable format "${varName}". Use prefix.field format (e.g., customer.first_name, promotion.end_date)`,
          severity: 'error',
        });
        continue;
      }

      const [prefix, field] = parts;

      // Validate prefix format (lowercase letters and underscores, starting with letter)
      if (!/^[a-z][a-z_]*$/.test(prefix)) {
        errors.push({
          field: 'body',
          message: `Invalid variable prefix format "${prefix}" in "${varName}". Prefix must be lowercase letters starting with a letter (e.g., customer, order, promotion)`,
          severity: 'error',
        });
        continue;
      }

      // Validate field format (lowercase letters, numbers, underscores, starting with letter)
      if (!/^[a-z][a-z0-9_]*$/.test(field)) {
        errors.push({
          field: 'body',
          message: `Invalid field name "${field}" in "${varName}". Use lowercase letters, numbers, and underscores (must start with a letter)`,
          severity: 'error',
        });
        continue;
      }

      // Provide helpful warnings for unknown prefixes (not errors!)
      // This helps users understand that their variable will resolve from custom attributes
      if (!validPrefixes.includes(prefix as any)) {
        errors.push({
          field: 'body',
          message: `Custom variable "${varName}" will be resolved from contact attributes. Make sure to set a "${varName}" attribute on contacts before sending.`,
          severity: 'warning',
        });
      }
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

  // ==================== Meta-Specific Validation ====================

  /**
   * Validate template name against Meta's requirements
   * - Max 512 characters
   * - Lowercase alphanumeric and underscores only
   * - Must start with a letter
   */
  validateTemplateName(name: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!name || name.trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Template name is required',
        severity: 'error',
        code: 'NAME_REQUIRED',
      });
      return errors;
    }

    if (name.length > META_TEMPLATE_RULES.NAME_MAX_LENGTH) {
      errors.push({
        field: 'name',
        message: `Template name exceeds maximum length of ${META_TEMPLATE_RULES.NAME_MAX_LENGTH} characters`,
        severity: 'error',
        code: 'NAME_TOO_LONG',
      });
    }

    if (!META_TEMPLATE_RULES.NAME_PATTERN.test(name)) {
      errors.push({
        field: 'name',
        message:
          'Template name must contain only lowercase letters, numbers, and underscores, and must start with a letter',
        severity: 'error',
        code: 'NAME_INVALID_FORMAT',
      });
    }

    return errors;
  }

  /**
   * Validate template category
   */
  validateCategory(category: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!category) {
      errors.push({
        field: 'category',
        message: 'Template category is required',
        severity: 'error',
        code: 'CATEGORY_REQUIRED',
      });
      return errors;
    }

    const validCategories =
      META_TEMPLATE_RULES.VALID_CATEGORIES as readonly string[];
    if (!validCategories.includes(category.toLowerCase())) {
      errors.push({
        field: 'category',
        message: `Invalid category "${category}". Must be one of: ${validCategories.join(', ')}`,
        severity: 'error',
        code: 'CATEGORY_INVALID',
      });
    }

    return errors;
  }

  /**
   * Validate template content for prohibited patterns
   * (spam, adult content, etc.)
   */
  validateProhibitedContent(
    body: string,
    header?: string,
    footer?: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const fullContent = [body, header, footer].filter(Boolean).join(' ');

    // Check for prohibited content patterns
    for (const pattern of META_TEMPLATE_RULES.PROHIBITED_CONTENT) {
      if (pattern.test(fullContent)) {
        errors.push({
          field: 'body',
          message:
            "Template contains content that may violate Meta's guidelines and could be rejected",
          severity: 'warning',
          code: 'PROHIBITED_CONTENT',
        });
        break; // Only show one warning
      }
    }

    // Check for URL shorteners
    for (const shortener of META_TEMPLATE_RULES.URL_SHORTENERS_BLOCKED) {
      if (fullContent.toLowerCase().includes(shortener)) {
        errors.push({
          field: 'body',
          message: `URL shorteners like ${shortener} are not allowed in templates. Use full URLs instead.`,
          severity: 'error',
          code: 'URL_SHORTENER_BLOCKED',
        });
      }
    }

    return errors;
  }

  /**
   * Validate example variables are provided for all placeholders
   * Required by Meta for template approval
   */
  validateExampleVariables(
    body: string,
    exampleVars: Record<string, string> | null | undefined,
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const variables = this.parserService.extractVariables(body);

    if (variables.length === 0) {
      return errors; // No variables, no examples needed
    }

    if (!exampleVars || Object.keys(exampleVars).length === 0) {
      errors.push({
        field: 'exampleVars',
        message:
          'Example values are required for all template variables for Meta approval',
        severity: 'error',
        code: 'EXAMPLES_REQUIRED',
      });
      return errors;
    }

    // Check each variable has an example
    for (const varName of variables) {
      if (!exampleVars[varName] || exampleVars[varName].trim().length === 0) {
        errors.push({
          field: 'exampleVars',
          message: `Missing example value for variable "{{${varName}}}"`,
          severity: 'error',
          code: 'EXAMPLE_MISSING',
        });
      }
    }

    return errors;
  }

  /**
   * Full Meta approval validation
   * Combines all Meta-specific validations
   */
  validateForMetaApproval(
    templateName: string,
    body: string,
    category: string,
    exampleVars: Record<string, string> | null | undefined,
    header?: string,
    footer?: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate template name
    errors.push(...this.validateTemplateName(templateName));

    // Validate category
    errors.push(...this.validateCategory(category));

    // Validate body, header, footer (existing validation)
    errors.push(...this.validate(body, header, footer));

    // Validate prohibited content
    errors.push(...this.validateProhibitedContent(body, header, footer));

    // Validate example variables
    errors.push(...this.validateExampleVariables(body, exampleVars));

    return errors;
  }

  /**
   * Check if template is ready for Meta approval submission
   */
  isReadyForApproval(errors: ValidationError[]): boolean {
    // Template is ready if there are no errors (warnings are OK)
    return !this.hasCriticalErrors(errors);
  }

  /**
   * Get a summary of validation results
   */
  getValidationSummary(errors: ValidationError[]): {
    isValid: boolean;
    errorCount: number;
    warningCount: number;
    errors: ValidationError[];
    warnings: ValidationError[];
    canSubmit: boolean;
  } {
    const criticalErrors = this.getErrorsOnly(errors);
    const warnings = this.getWarningsOnly(errors);

    return {
      isValid: criticalErrors.length === 0,
      errorCount: criticalErrors.length,
      warningCount: warnings.length,
      errors: criticalErrors,
      warnings,
      canSubmit: criticalErrors.length === 0,
    };
  }
}
