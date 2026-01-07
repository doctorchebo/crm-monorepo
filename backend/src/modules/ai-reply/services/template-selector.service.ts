/**
 * Template Selector Service
 * AI-powered template selection based on conversation context
 *
 * Selects the most appropriate template when:
 * - Outside 24-hour window (required by Meta)
 * - User explicitly requests a template
 * - AI determines a template is more appropriate
 */

import { db } from '@database/db.connection';
import {
  templateLocales,
  templates,
  templateVariables,
} from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { TemplateSelectionCriteria, TemplateSelectionResult } from '../types';

/**
 * A template ready for selection with its locale data
 */
interface SelectableTemplate {
  templateId: string;
  templateName: string;
  displayName: string;
  description: string | null;
  localeId: string;
  locale: string;
  body: string;
  header: string | null;
  footer: string | null;
  category: string;
  approvalStatus: string;
  variables: string[];
}

@Injectable()
export class TemplateSelectorService {
  private readonly logger = new Logger(TemplateSelectorService.name);

  /**
   * Select the best template for a given context
   * Uses keyword matching and language preference
   */
  async selectTemplate(
    ownerId: number,
    criteria: TemplateSelectionCriteria,
  ): Promise<TemplateSelectionResult> {
    try {
      // Get all approved templates for this owner
      const availableTemplates = await this.getApprovedTemplates(ownerId);

      if (availableTemplates.length === 0) {
        return {
          found: false,
          reason: 'No approved templates available',
        };
      }

      // Filter by language if specified
      let candidates = availableTemplates;
      if (criteria.language) {
        const langMatches = candidates.filter(
          (t) =>
            t.locale === criteria.language ||
            t.locale.startsWith(criteria.language + '_'),
        );
        if (langMatches.length > 0) {
          candidates = langMatches;
        }
        // If no language match, continue with all templates
      }

      // Filter by category if specified
      if (criteria.category) {
        const categoryMatches = candidates.filter(
          (t) => t.category === criteria.category,
        );
        if (categoryMatches.length > 0) {
          candidates = categoryMatches;
        }
      }

      // Filter by required variables
      if (criteria.requireVariables && criteria.requireVariables.length > 0) {
        candidates = candidates.filter((t) =>
          criteria.requireVariables!.every((v) => t.variables.includes(v)),
        );
      }

      // Score templates by keyword relevance
      if (criteria.contextKeywords && criteria.contextKeywords.length > 0) {
        const scoredTemplates = candidates.map((t) => ({
          template: t,
          score: this.scoreTemplateRelevance(t, criteria.contextKeywords!),
        }));

        // Sort by score descending
        scoredTemplates.sort((a, b) => b.score - a.score);

        if (scoredTemplates[0]?.score > 0) {
          const best = scoredTemplates[0];
          return {
            found: true,
            localeId: best.template.localeId,
            templateId: best.template.templateId,
            templateName: best.template.templateName,
            templateBody: best.template.body,
            requiredVariables: best.template.variables,
            matchScore: best.score,
            reason: `Matched keywords with score ${best.score.toFixed(2)}`,
          };
        }
      }

      // If no keyword match, return the first utility template
      const utilityTemplate = candidates.find((t) => t.category === 'utility');
      const selectedTemplate = utilityTemplate || candidates[0];

      if (selectedTemplate) {
        return {
          found: true,
          localeId: selectedTemplate.localeId,
          templateId: selectedTemplate.templateId,
          templateName: selectedTemplate.templateName,
          templateBody: selectedTemplate.body,
          requiredVariables: selectedTemplate.variables,
          matchScore: 0.5, // Default score
          reason: 'Selected based on availability and category',
        };
      }

      return {
        found: false,
        reason: 'No suitable template found for criteria',
      };
    } catch (error) {
      this.logger.error(`Failed to select template: ${error.message}`);
      return {
        found: false,
        reason: `Error selecting template: ${error.message}`,
      };
    }
  }

  /**
   * Get a specific template by ID with its locale
   */
  async getTemplateForSending(
    templateId: string,
    locale: string,
  ): Promise<SelectableTemplate | null> {
    const template = await db.query.templates.findFirst({
      where: and(eq(templates.id, templateId), eq(templates.isActive, true)),
      with: {
        locales: {
          where: and(
            eq(templateLocales.locale, locale),
            eq(templateLocales.approvalStatus, 'approved'),
          ),
        },
      },
    });

    if (!template || !template.locales || template.locales.length === 0) {
      return null;
    }

    const localeData = template.locales[0];
    const variables = await this.getTemplateVariables(localeData.id);

    return {
      templateId: template.id,
      templateName: template.name,
      displayName: template.displayName,
      description: template.description,
      localeId: localeData.id,
      locale: localeData.locale,
      body: localeData.body,
      header: localeData.header,
      footer: localeData.footer,
      category: localeData.category || 'utility',
      approvalStatus: localeData.approvalStatus || 'draft',
      variables,
    };
  }

  /**
   * Get all approved templates for an owner
   */
  async getApprovedTemplates(ownerId: number): Promise<SelectableTemplate[]> {
    const allTemplates = await db.query.templates.findMany({
      where: and(
        eq(templates.ownerId, ownerId),
        eq(templates.isActive, true),
        eq(templates.isVisible, true),
      ),
      with: {
        locales: true,
      },
    });

    const result: SelectableTemplate[] = [];

    for (const template of allTemplates) {
      if (!template.locales) continue;

      for (const locale of template.locales) {
        // Only include approved locales
        if (locale.approvalStatus !== 'approved') continue;

        const variables = await this.getTemplateVariables(locale.id);

        result.push({
          templateId: template.id,
          templateName: template.name,
          displayName: template.displayName,
          description: template.description,
          localeId: locale.id,
          locale: locale.locale,
          body: locale.body,
          header: locale.header,
          footer: locale.footer,
          category: locale.category || 'utility',
          approvalStatus: locale.approvalStatus,
          variables,
        });
      }
    }

    return result;
  }

  /**
   * Get template variable names for a locale
   */
  private async getTemplateVariables(localeId: string): Promise<string[]> {
    const vars = await db.query.templateVariables.findMany({
      where: eq(templateVariables.localeId, localeId),
    });
    return vars.map((v) => v.varName);
  }

  /**
   * Score template relevance based on keywords
   * Returns a score between 0 and 1
   */
  private scoreTemplateRelevance(
    template: SelectableTemplate,
    keywords: string[],
  ): number {
    const searchText = [
      template.displayName,
      template.description,
      template.body,
      template.header,
      template.footer,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    let matchCount = 0;
    for (const keyword of keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }

    return matchCount / keywords.length;
  }

  /**
   * Check if a specific template is approved and ready to send
   */
  async isTemplateApproved(
    templateId: string,
    locale: string,
  ): Promise<boolean> {
    const localeData = await db.query.templateLocales.findFirst({
      where: and(
        eq(templateLocales.templateId, templateId),
        eq(templateLocales.locale, locale),
      ),
    });

    return localeData?.approvalStatus === 'approved';
  }

  /**
   * Get the best locale for a template based on customer language
   */
  async getBestLocale(
    templateId: string,
    preferredLanguage?: string,
  ): Promise<string | null> {
    const locales = await db.query.templateLocales.findMany({
      where: and(
        eq(templateLocales.templateId, templateId),
        eq(templateLocales.approvalStatus, 'approved'),
      ),
    });

    if (locales.length === 0) return null;

    // Try exact match first
    if (preferredLanguage) {
      const exact = locales.find((l) => l.locale === preferredLanguage);
      if (exact) return exact.locale;

      // Try prefix match (e.g., 'en' matches 'en_US')
      const prefix = locales.find((l) =>
        l.locale.startsWith(preferredLanguage + '_'),
      );
      if (prefix) return prefix.locale;
    }

    // Default to English if available, otherwise first locale
    const english = locales.find(
      (l) => l.locale === 'en' || l.locale.startsWith('en_'),
    );
    return english?.locale || locales[0].locale;
  }
}
