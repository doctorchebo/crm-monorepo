import { Injectable } from '@nestjs/common';
import { TemplateParserService } from './template-parser.service';

export interface RenderedTemplate {
  header?: string;
  body: string;
  footer?: string;
}

/**
 * Template rendering service for preview and test
 * Uses simple string interpolation (safe, no code execution)
 */
@Injectable()
export class TemplateRenderService {
  constructor(private parserService: TemplateParserService) {}

  /**
   * Render complete template with variables
   */
  render(
    template: {
      header?: string;
      body: string;
      footer?: string;
    },
    variables: Record<string, any>,
  ): RenderedTemplate {
    return {
      header: template.header
        ? this.parserService.renderTemplate(template.header, variables)
        : undefined,
      body: this.parserService.renderTemplate(template.body, variables),
      footer: template.footer
        ? this.parserService.renderTemplate(template.footer, variables)
        : undefined,
    };
  }

  /**
   * Render with validation - ensures all required variables are provided
   */
  renderWithValidation(
    template: {
      header?: string;
      body: string;
      footer?: string;
    },
    variables: Record<string, any>,
  ): {
    success: boolean;
    rendered?: RenderedTemplate;
    errors?: string[];
  } {
    const requiredVars = this.parserService.extractVariables(template.body);
    const missingVars = requiredVars.filter((v) => !(v in variables));

    if (missingVars.length > 0) {
      return {
        success: false,
        errors: missingVars.map((v) => `Missing required variable: ${v}`),
      };
    }

    return {
      success: true,
      rendered: this.render(template, variables),
    };
  }

  /**
   * Get formatted text for preview (as it would appear to user)
   */
  getFormattedPreview(rendered: RenderedTemplate): string {
    const parts: string[] = [];

    if (rendered.header) {
      parts.push(`📌 ${rendered.header}`);
    }

    parts.push(rendered.body);

    if (rendered.footer) {
      parts.push(`---\n${rendered.footer}`);
    }

    return parts.join('\n\n');
  }
}
