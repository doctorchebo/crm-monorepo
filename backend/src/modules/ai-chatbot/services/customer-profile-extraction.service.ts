/**
 * Customer Profile Extraction Service
 *
 * Extracts personal information from customer messages using LLM.
 * This service analyzes customer messages and extracts structured data
 * like name, email, phone numbers, and other important details.
 *
 * The extraction is designed to be:
 * - Non-intrusive: Runs asynchronously after AI response
 * - Smart: Only extracts when customer explicitly provides information
 * - Careful with phone numbers: Distinguishes between existing and new numbers
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Represents extracted profile data from a customer message
 */
export interface ExtractedProfileData {
  /** First name if explicitly mentioned */
  firstName?: string;
  /** Last name if explicitly mentioned */
  lastName?: string;
  /** Email address if provided */
  email?: string;
  /** Phone number if explicitly provided (different from chat phone) */
  alternatePhone?: string;
  /** Preferred language if mentioned */
  preferredLanguage?: string;
  /** Custom fields extracted from the message */
  customFields?: Record<string, string>;
  /** Whether any meaningful data was extracted */
  hasData: boolean;
  /** Confidence score (0-1) for the extraction */
  confidence: number;
}

/**
 * Context for profile extraction
 */
export interface ExtractionContext {
  /** The customer's chat phone number (to avoid duplicating) */
  existingPhoneNumber: string;
  /** Current customer name from the chat */
  existingName?: string;
  /** Recent conversation for context */
  recentMessages?: Array<{ role: 'customer' | 'agent'; content: string }>;
}

const EXTRACTION_SYSTEM_PROMPT = `You are a data extraction assistant. Your job is to extract personal information that a customer has explicitly provided in their message.

IMPORTANT RULES:
1. Only extract information that the customer has EXPLICITLY stated. Do not infer or assume.
2. For names: Extract first name and last name separately if provided. Names like "I'm Carlos" → firstName: "Carlos"
3. For email: Only extract valid email addresses (must contain @ and domain)
4. For phone: Only extract if the customer provides a DIFFERENT phone number than they're chatting from
5. For custom fields: Extract things like:
   - Preferred dates/times
   - Budget or price preferences
   - Special requests or requirements
   - Company or organization names
   - Addresses or locations
   - Number of people/rooms/units
   - Any other specific preferences mentioned

DO NOT extract:
- The phone number they're chatting from (it's already known)
- Vague preferences without specifics
- Information from the agent's messages
- Rhetorical or hypothetical information

Return ONLY valid JSON. No explanation or markdown.`;

@Injectable()
export class CustomerProfileExtractionService {
  private readonly logger = new Logger(CustomerProfileExtractionService.name);
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
    // Use a smaller, faster model for extraction
    this.model = this.configService.get<string>(
      'AI_EXTRACTION_MODEL',
      'gpt-4o-mini',
    );
  }

  /**
   * Extract profile data from a customer message
   *
   * @param customerMessage - The message content from the customer
   * @param context - Context including existing customer data
   * @returns Extracted profile data
   */
  async extractProfileData(
    customerMessage: string,
    context: ExtractionContext,
  ): Promise<ExtractedProfileData> {
    // Skip extraction for very short messages (unlikely to have profile data)
    if (customerMessage.length < 10) {
      return { hasData: false, confidence: 1.0 };
    }

    // Skip if message is just a greeting or simple response
    const simplePatterns =
      /^(hi|hello|hey|ok|okay|yes|no|sure|thanks|gracias|hola|bueno|sí|si|claro|vale|perfecto)\.?$/i;
    if (simplePatterns.test(customerMessage.trim())) {
      return { hasData: false, confidence: 1.0 };
    }

    try {
      const userPrompt = this.buildExtractionPrompt(customerMessage, context);

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1, // Low temperature for consistent extraction
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      const extracted = this.parseExtractionResponse(responseText, context);

      this.logger.debug(
        `[Profile Extraction] Message: "${customerMessage.substring(0, 50)}..." → ${JSON.stringify(extracted)}`,
      );

      return extracted;
    } catch (error) {
      this.logger.warn(
        `[Profile Extraction] Error: ${(error as Error).message}`,
      );
      return { hasData: false, confidence: 0 };
    }
  }

  /**
   * Build the extraction prompt with context
   */
  private buildExtractionPrompt(
    customerMessage: string,
    context: ExtractionContext,
  ): string {
    const parts = [
      'Extract personal information from this customer message.',
      '',
      `Customer's existing chat phone: ${context.existingPhoneNumber} (DO NOT extract this number)`,
    ];

    if (context.existingName) {
      parts.push(`Customer's known name: ${context.existingName}`);
    }

    if (context.recentMessages && context.recentMessages.length > 0) {
      parts.push('');
      parts.push('Recent conversation context:');
      for (const msg of context.recentMessages.slice(-3)) {
        parts.push(
          `${msg.role === 'customer' ? 'Customer' : 'Agent'}: ${msg.content}`,
        );
      }
    }

    parts.push('');
    parts.push('CUSTOMER MESSAGE TO ANALYZE:');
    parts.push(customerMessage);
    parts.push('');
    parts.push(
      'Return JSON with these fields (only include fields with actual data):',
    );
    parts.push('{');
    parts.push('  "firstName": "string or null",');
    parts.push('  "lastName": "string or null",');
    parts.push('  "email": "string or null",');
    parts.push(
      '  "alternatePhone": "string or null (only if different from ' +
        context.existingPhoneNumber +
        ')",',
    );
    parts.push('  "preferredLanguage": "string or null",');
    parts.push('  "customFields": { "fieldName": "value" } or null');
    parts.push('}');

    return parts.join('\n');
  }

  /**
   * Parse and validate the LLM extraction response
   */
  private parseExtractionResponse(
    responseText: string,
    context: ExtractionContext,
  ): ExtractedProfileData {
    try {
      const data = JSON.parse(responseText);
      const result: ExtractedProfileData = {
        hasData: false,
        confidence: 0.85, // Default confidence for successful extraction
      };

      // Validate and add first name
      if (data.firstName && typeof data.firstName === 'string') {
        const name = data.firstName.trim();
        if (name.length > 0 && name.length < 50) {
          result.firstName = this.capitalizeFirstLetter(name);
          result.hasData = true;
        }
      }

      // Validate and add last name
      if (data.lastName && typeof data.lastName === 'string') {
        const name = data.lastName.trim();
        if (name.length > 0 && name.length < 50) {
          result.lastName = this.capitalizeFirstLetter(name);
          result.hasData = true;
        }
      }

      // Validate email
      if (data.email && typeof data.email === 'string') {
        const email = data.email.trim().toLowerCase();
        if (this.isValidEmail(email)) {
          result.email = email;
          result.hasData = true;
        }
      }

      // Validate alternate phone (must be different from existing)
      if (data.alternatePhone && typeof data.alternatePhone === 'string') {
        const phone = this.normalizePhoneNumber(data.alternatePhone);
        const existingNormalized = this.normalizePhoneNumber(
          context.existingPhoneNumber,
        );

        if (phone && phone !== existingNormalized) {
          result.alternatePhone = phone;
          result.hasData = true;
        }
      }

      // Validate preferred language
      if (
        data.preferredLanguage &&
        typeof data.preferredLanguage === 'string'
      ) {
        const lang = data.preferredLanguage.trim().toLowerCase();
        if (lang.length >= 2 && lang.length <= 20) {
          result.preferredLanguage = lang;
          result.hasData = true;
        }
      }

      // Validate custom fields
      if (data.customFields && typeof data.customFields === 'object') {
        const validFields: Record<string, string> = {};
        for (const [key, value] of Object.entries(data.customFields)) {
          if (
            typeof key === 'string' &&
            typeof value === 'string' &&
            key.length > 0 &&
            value.length > 0 &&
            key.length < 50 &&
            value.length < 500
          ) {
            validFields[this.normalizeFieldKey(key)] = value.trim();
          }
        }
        if (Object.keys(validFields).length > 0) {
          result.customFields = validFields;
          result.hasData = true;
        }
      }

      return result;
    } catch {
      return { hasData: false, confidence: 0 };
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Normalize phone number to E.164 format
   */
  private normalizePhoneNumber(phone: string): string | null {
    // Remove all non-digit characters except leading +
    const cleaned = phone.replace(/[^\d+]/g, '');

    // Must have at least 8 digits
    const digitsOnly = cleaned.replace(/\+/g, '');
    if (digitsOnly.length < 8 || digitsOnly.length > 15) {
      return null;
    }

    // Ensure it starts with +
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  /**
   * Normalize field key to snake_case
   */
  private normalizeFieldKey(key: string): string {
    return key
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Capitalize first letter of a string
   */
  private capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
}
