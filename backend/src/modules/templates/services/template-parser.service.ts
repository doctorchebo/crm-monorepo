import { Injectable } from '@nestjs/common';

/**
 * Template parsing service for extracting and managing variables
 * Supports friendly placeholder syntax: {{variable_name}}
 */
@Injectable()
export class TemplateParserService {
  /**
   * Extract all variables from template body using regex pattern
   * Matches {{variable_name}} syntax
   */
  extractVariables(body: string): string[] {
    const regex = /\{\{([^}]+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = regex.exec(body)) !== null) {
      const varName = match[1].trim();
      if (!variables.includes(varName)) {
        variables.push(varName);
      }
    }

    return variables;
  }

  /**
   * Check if variables are positioned correctly according to WhatsApp/Meta rules
   * Variables cannot appear at the beginning or end of the message
   */
  validateVariablePositioning(body: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const trimmedBody = body.trim();

    // Check if message starts with a variable
    if (/^\s*\{\{/.test(trimmedBody)) {
      errors.push('Variables cannot appear at the beginning of the message');
    }

    // Check if message ends with a variable
    if (/\}\}\s*$/.test(trimmedBody)) {
      errors.push('Variables cannot appear at the end of the message');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Escape special regex characters in a string so it can be used
   * as a literal match inside `new RegExp(...)`.
   *
   * Important for variable names that contain dots (e.g. `customer.first_name`):
   * without escaping, the dot is treated as "any character" and can match
   * similarly-named variables like `customer_first_name`.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Convert friendly template to provider format
   * Replaces {{variable_name}} with {{1}}, {{2}}, etc.
   * Returns mapping for reference
   */
  convertToProviderFormat(body: string): {
    providerBody: string;
    variableMapping: Array<{ name: string; index: number }>;
  } {
    const variables = this.extractVariables(body);
    const variableMapping: Array<{ name: string; index: number }> = [];
    let providerBody = body;

    // Build mapping and replace in order of appearance.
    // Variable names are regex-escaped so that dots, brackets, etc.
    // are matched literally (not as wildcards).
    variables.forEach((varName, index) => {
      const escapedPlaceholder = this.escapeRegex(`{{${varName}}}`);
      const providerPlaceholder = `{{${index + 1}}}`;
      providerBody = providerBody.replace(
        new RegExp(escapedPlaceholder, 'g'),
        providerPlaceholder,
      );
      variableMapping.push({ name: varName, index: index + 1 });
    });

    return {
      providerBody,
      variableMapping,
    };
  }

  /**
   * Render template with variables using simple string interpolation.
   * Handles the friendly {{variable_name}} syntax.
   *
   * Variable names are regex-escaped so dots (e.g. `customer.first_name`)
   * match literally and don't act as wildcards.
   */
  renderTemplate(body: string, variables: Record<string, any>): string {
    let rendered = body;

    Object.entries(variables).forEach(([key, value]) => {
      const escapedKey = this.escapeRegex(key);
      const placeholder = new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g');
      rendered = rendered.replace(placeholder, String(value ?? ''));
    });

    return rendered;
  }

  /**
   * Truncate template text for preview
   */
  truncateTemplate(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  }
}
