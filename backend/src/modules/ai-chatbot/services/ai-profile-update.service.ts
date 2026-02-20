/**
 * AI Profile Update Service
 *
 * Handles automatic updates to customer profiles based on information
 * extracted from chat messages. This service is responsible for:
 *
 * 1. Updating core contact fields (firstName, lastName, email)
 * 2. Saving alternate phone numbers as custom attributes (never replacing existing)
 * 3. Saving other extracted information as contact attributes
 *
 * Design principles:
 * - Non-destructive: Never overwrite existing data unless empty/null
 * - Phone-safe: Alternate phones saved as attributes, not replacing contact phone
 * - Audit-friendly: All changes are logged
 * - Chat-specific: Custom attributes are tied to the chat context
 */

import { db } from '@database/db.connection';
import { chats, contactAttributes, contacts } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, eq, like } from 'drizzle-orm';
import type { ExtractedProfileData } from './customer-profile-extraction.service';

/**
 * Result of a profile update operation
 */
export interface ProfileUpdateResult {
  success: boolean;
  contactId: string | null;
  updatedFields: string[];
  createdAttributes: string[];
  errors: string[];
}

/**
 * Context required for profile update
 */
export interface ProfileUpdateContext {
  chatId: string;
  userId: number;
  /** Whether to only update empty fields or overwrite existing */
  updateMode: 'fill_empty' | 'overwrite';
}

@Injectable()
export class AiProfileUpdateService {
  private readonly logger = new Logger(AiProfileUpdateService.name);

  /**
   * Update customer profile with extracted data
   *
   * @param extractedData - Data extracted from customer message
   * @param context - Update context including chatId and userId
   * @returns Result of the update operation
   */
  async updateProfile(
    extractedData: ExtractedProfileData,
    context: ProfileUpdateContext,
  ): Promise<ProfileUpdateResult> {
    const result: ProfileUpdateResult = {
      success: false,
      contactId: null,
      updatedFields: [],
      createdAttributes: [],
      errors: [],
    };

    if (!extractedData.hasData) {
      result.success = true;
      return result;
    }

    try {
      // Get the chat to find the participant phone
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, context.chatId),
      });

      if (!chat) {
        result.errors.push(`Chat ${context.chatId} not found`);
        return result;
      }

      // Find the contact by participant phone
      const contact = await this.findContactByPhone(chat.participantPhone);

      if (!contact) {
        // Create a new contact if one doesn't exist
        const contactId = await this.createContactFromExtractedData(
          extractedData,
          chat.participantPhone,
        );
        if (contactId) {
          result.contactId = contactId;
          result.updatedFields.push('new_contact_created');
          result.success = true;
        } else {
          result.errors.push('Failed to create new contact');
        }
        return result;
      }

      result.contactId = contact.contactId;

      // Update core contact fields
      const coreUpdates = await this.updateCoreFields(
        contact,
        extractedData,
        context.updateMode,
      );
      result.updatedFields.push(...coreUpdates);

      // Handle alternate phone number
      if (extractedData.alternatePhone) {
        const phoneAttrKey = await this.saveAlternatePhone(
          contact.contactId,
          context.chatId,
          extractedData.alternatePhone,
        );
        if (phoneAttrKey) {
          result.createdAttributes.push(phoneAttrKey);
        }
      }

      // Handle preferred language
      if (extractedData.preferredLanguage) {
        await this.updateLanguagePreference(
          contact.contactId,
          extractedData.preferredLanguage,
          context.updateMode,
        );
        result.updatedFields.push('language');
      }

      // Handle custom fields
      if (extractedData.customFields) {
        const savedAttrs = await this.saveCustomFields(
          contact.contactId,
          context.chatId,
          extractedData.customFields,
        );
        result.createdAttributes.push(...savedAttrs);
      }

      result.success = true;
      this.logger.log(
        `[Profile Update] Contact ${contact.contactId}: Updated ${result.updatedFields.length} fields, created ${result.createdAttributes.length} attributes`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(errorMessage);
      this.logger.error(`[Profile Update] Error: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Find contact by phone number (handles various formats)
   */
  private async findContactByPhone(
    phoneNumber: string,
  ): Promise<typeof contacts.$inferSelect | null> {
    // Normalize phone number
    const normalizedPhone = phoneNumber.startsWith('+')
      ? phoneNumber
      : `+${phoneNumber}`;
    const phoneWithoutPlus = phoneNumber.replace(/^\+/, '');

    // Try with + prefix first
    let contact = await db.query.contacts.findFirst({
      where: and(
        eq(contacts.phoneNumber, normalizedPhone),
        eq(contacts.isActive, true),
      ),
    });

    // Try without + if not found
    if (!contact) {
      contact = await db.query.contacts.findFirst({
        where: and(
          eq(contacts.phoneNumber, phoneWithoutPlus),
          eq(contacts.isActive, true),
        ),
      });
    }

    return contact ?? null;
  }

  /**
   * Create a new contact from extracted data
   */
  private async createContactFromExtractedData(
    data: ExtractedProfileData,
    phoneNumber: string,
  ): Promise<string | null> {
    try {
      // Extract country code from phone number (first 1-4 digits after +)
      const normalizedPhone = phoneNumber.startsWith('+')
        ? phoneNumber
        : `+${phoneNumber}`;

      // Simple country code extraction (take first 1-3 digits after +)
      const phoneDigits = normalizedPhone.replace(/[^\d]/g, '');
      let countryCode = '+1'; // Default to US

      // Common country codes
      if (phoneDigits.startsWith('591'))
        countryCode = '+591'; // Bolivia
      else if (phoneDigits.startsWith('54'))
        countryCode = '+54'; // Argentina
      else if (phoneDigits.startsWith('55'))
        countryCode = '+55'; // Brazil
      else if (phoneDigits.startsWith('52'))
        countryCode = '+52'; // Mexico
      else if (phoneDigits.startsWith('34'))
        countryCode = '+34'; // Spain
      else if (phoneDigits.startsWith('1'))
        countryCode = '+1'; // US/Canada
      else if (phoneDigits.startsWith('44')) countryCode = '+44'; // UK

      const [contact] = await db
        .insert(contacts)
        .values({
          firstName: data.firstName || 'Unknown',
          lastName: data.lastName || null,
          email: data.email || null,
          phoneNumber: normalizedPhone,
          countryCode,
          language: data.preferredLanguage || null,
          source: 'AI_EXTRACTED',
          isActive: true,
        })
        .returning();

      return contact?.contactId ?? null;
    } catch (error) {
      this.logger.error(`[Create Contact] Error: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Update core contact fields (firstName, lastName, email)
   */
  private async updateCoreFields(
    contact: typeof contacts.$inferSelect,
    data: ExtractedProfileData,
    updateMode: 'fill_empty' | 'overwrite',
  ): Promise<string[]> {
    const updates: Record<string, unknown> = {};
    const updatedFields: string[] = [];

    // First name - only update if empty or overwrite mode
    if (data.firstName) {
      const shouldUpdate =
        updateMode === 'overwrite' ||
        !contact.firstName ||
        contact.firstName === 'Unknown';
      if (shouldUpdate) {
        updates.firstName = data.firstName;
        updatedFields.push('firstName');
      }
    }

    // Last name - only update if empty or overwrite mode
    if (data.lastName) {
      const shouldUpdate = updateMode === 'overwrite' || !contact.lastName;
      if (shouldUpdate) {
        updates.lastName = data.lastName;
        updatedFields.push('lastName');
      }
    }

    // Email - only update if empty or overwrite mode
    if (data.email) {
      const shouldUpdate = updateMode === 'overwrite' || !contact.email;
      if (shouldUpdate) {
        updates.email = data.email;
        updatedFields.push('email');
      }
    }

    // Apply updates if there are any
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db
        .update(contacts)
        .set(updates)
        .where(eq(contacts.contactId, contact.contactId));
    }

    return updatedFields;
  }

  /**
   * Save alternate phone number as a contact attribute
   * Uses incrementing keys: alternate_phone_1, alternate_phone_2, etc.
   */
  private async saveAlternatePhone(
    contactId: string,
    chatId: string,
    phoneNumber: string,
  ): Promise<string | null> {
    try {
      // Check if this phone number already exists as an attribute
      const existingWithSameNumber = await db.query.contactAttributes.findFirst(
        {
          where: and(
            eq(contactAttributes.contactId, contactId),
            eq(contactAttributes.value, phoneNumber),
            like(contactAttributes.key, 'alternate_phone_%'),
          ),
        },
      );

      if (existingWithSameNumber) {
        // Phone number already saved, skip
        return null;
      }

      // Find the next available alternate phone key
      const existingPhones = await db.query.contactAttributes.findMany({
        where: and(
          eq(contactAttributes.contactId, contactId),
          like(contactAttributes.key, 'alternate_phone_%'),
        ),
      });

      const nextIndex = existingPhones.length + 1;
      const key = `alternate_phone_${nextIndex}`;

      // Create the attribute
      await db.insert(contactAttributes).values({
        contactId,
        chatId,
        key,
        value: phoneNumber,
        valueType: 'phone',
      });

      this.logger.log(
        `[Alternate Phone] Saved ${phoneNumber} as ${key} for contact ${contactId}`,
      );

      return key;
    } catch (error) {
      this.logger.error(`[Alternate Phone] Error: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Update language preference on the contact
   */
  private async updateLanguagePreference(
    contactId: string,
    language: string,
    updateMode: 'fill_empty' | 'overwrite',
  ): Promise<void> {
    try {
      const contact = await db.query.contacts.findFirst({
        where: eq(contacts.contactId, contactId),
      });

      if (!contact) return;

      const shouldUpdate = updateMode === 'overwrite' || !contact.language;

      if (shouldUpdate) {
        await db
          .update(contacts)
          .set({
            language,
            updatedAt: new Date(),
          })
          .where(eq(contacts.contactId, contactId));
      }
    } catch (error) {
      this.logger.error(
        `[Language Preference] Error: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Save custom fields as contact attributes
   */
  private async saveCustomFields(
    contactId: string,
    chatId: string,
    customFields: Record<string, string>,
  ): Promise<string[]> {
    const savedKeys: string[] = [];

    for (const [key, value] of Object.entries(customFields)) {
      try {
        // Upsert the attribute
        const existing = await db.query.contactAttributes.findFirst({
          where: and(
            eq(contactAttributes.contactId, contactId),
            eq(contactAttributes.chatId, chatId),
            eq(contactAttributes.key, key),
          ),
        });

        if (existing) {
          // Update existing
          await db
            .update(contactAttributes)
            .set({
              value,
              updatedAt: new Date(),
            })
            .where(eq(contactAttributes.id, existing.id));
        } else {
          // Create new
          await db.insert(contactAttributes).values({
            contactId,
            chatId,
            key,
            value,
            valueType: this.inferValueType(value),
          });
        }

        savedKeys.push(key);
      } catch (error) {
        this.logger.error(
          `[Custom Field] Error saving '${key}': ${(error as Error).message}`,
        );
      }
    }

    return savedKeys;
  }

  /**
   * Infer the value type from the value content
   */
  private inferValueType(value: string): string {
    // Check for email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'email';
    }

    // Check for phone-like value
    if (/^\+?[\d\s()-]{8,}$/.test(value)) {
      return 'phone';
    }

    // Check for date-like value
    if (
      /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(value) ||
      /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(value)
    ) {
      return 'date';
    }

    // Check for number
    if (/^[\d.,]+$/.test(value) && !isNaN(parseFloat(value))) {
      return 'number';
    }

    return 'string';
  }

  /**
   * Get all profile data for a contact in a chat (core fields + attributes)
   */
  async getFullProfile(
    chatId: string,
  ): Promise<{
    contact: typeof contacts.$inferSelect | null;
    attributes: Array<typeof contactAttributes.$inferSelect>;
  } | null> {
    try {
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      if (!chat) return null;

      const contact = await this.findContactByPhone(chat.participantPhone);

      if (!contact) return null;

      const attrs = await db.query.contactAttributes.findMany({
        where: eq(contactAttributes.contactId, contact.contactId),
        orderBy: (attrs, { asc }) => [asc(attrs.key)],
      });

      return { contact, attributes: attrs };
    } catch (error) {
      this.logger.error(`[Get Profile] Error: ${(error as Error).message}`);
      return null;
    }
  }
}
