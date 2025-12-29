import { db } from '@database/db.connection';
import { contactAttributes, contacts } from '@database/schema';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  BulkUpsertAttributesDto,
  CreateContactAttributeDto,
  UpdateContactAttributeDto,
} from './dto/contact-attribute.dto';

/**
 * Contact Attributes Service
 * Manages custom key-value profile fields for contacts
 *
 * Attributes are chat-specific: each chat can have its own set of attributes
 * for the same contact. This allows different order IDs, tracking numbers, etc.
 * for the same customer when chatting with different business phone numbers.
 */
@Injectable()
export class ContactAttributesService {
  private readonly logger = new Logger(ContactAttributesService.name);

  /**
   * Get all attributes for a contact in a specific chat
   * If chatId is not provided, returns only attributes without a chatId (legacy/global)
   */
  async getAttributes(contactId: string, chatId?: string) {
    // Verify contact exists
    const contact = await db.query.contacts.findFirst({
      where: and(
        eq(contacts.contactId, contactId),
        eq(contacts.isActive, true),
      ),
    });

    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`);
    }

    // Build the where clause based on chatId
    const whereClause = chatId
      ? and(
          eq(contactAttributes.contactId, contactId),
          eq(contactAttributes.chatId, chatId),
        )
      : and(
          eq(contactAttributes.contactId, contactId),
          isNull(contactAttributes.chatId),
        );

    return await db.query.contactAttributes.findMany({
      where: whereClause,
      orderBy: (attrs, { asc }) => [asc(attrs.key)],
    });
  }

  /**
   * Get a single attribute by key for a specific chat
   */
  async getAttribute(contactId: string, key: string, chatId?: string) {
    const whereClause = chatId
      ? and(
          eq(contactAttributes.contactId, contactId),
          eq(contactAttributes.key, key),
          eq(contactAttributes.chatId, chatId),
        )
      : and(
          eq(contactAttributes.contactId, contactId),
          eq(contactAttributes.key, key),
          isNull(contactAttributes.chatId),
        );

    const attribute = await db.query.contactAttributes.findFirst({
      where: whereClause,
    });

    if (!attribute) {
      throw new NotFoundException(
        `Attribute '${key}' not found for contact ${contactId}${chatId ? ` in chat ${chatId}` : ''}`,
      );
    }

    return attribute;
  }

  /**
   * Create or update a single attribute for a specific chat
   */
  async upsertAttribute(contactId: string, dto: CreateContactAttributeDto) {
    // Verify contact exists
    const contact = await db.query.contacts.findFirst({
      where: and(
        eq(contacts.contactId, contactId),
        eq(contacts.isActive, true),
      ),
    });

    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`);
    }

    const chatId = dto.chatId || null;

    // Check if attribute exists for this contact+chat combination
    const whereClause = chatId
      ? and(
          eq(contactAttributes.contactId, contactId),
          eq(contactAttributes.key, dto.key),
          eq(contactAttributes.chatId, chatId),
        )
      : and(
          eq(contactAttributes.contactId, contactId),
          eq(contactAttributes.key, dto.key),
          isNull(contactAttributes.chatId),
        );

    const existing = await db.query.contactAttributes.findFirst({
      where: whereClause,
    });

    if (existing) {
      // Update existing
      const [updated] = await db
        .update(contactAttributes)
        .set({
          value: dto.value,
          valueType: dto.valueType || existing.valueType,
          updatedAt: new Date(),
        })
        .where(eq(contactAttributes.id, existing.id))
        .returning();

      this.logger.log(
        `Updated attribute '${dto.key}' for contact ${contactId}${chatId ? ` in chat ${chatId}` : ''}`,
      );
      return updated;
    }

    // Create new
    const [created] = await db
      .insert(contactAttributes)
      .values({
        contactId,
        chatId,
        key: dto.key,
        value: dto.value,
        valueType: dto.valueType || 'string',
      })
      .returning();

    this.logger.log(
      `Created attribute '${dto.key}' for contact ${contactId}${chatId ? ` in chat ${chatId}` : ''}`,
    );
    return created;
  }

  /**
   * Update an attribute value for a specific chat
   */
  async updateAttribute(
    contactId: string,
    key: string,
    dto: UpdateContactAttributeDto,
  ) {
    const chatId = dto.chatId || null;

    const whereClause = chatId
      ? and(
          eq(contactAttributes.contactId, contactId),
          eq(contactAttributes.key, key),
          eq(contactAttributes.chatId, chatId),
        )
      : and(
          eq(contactAttributes.contactId, contactId),
          eq(contactAttributes.key, key),
          isNull(contactAttributes.chatId),
        );

    const existing = await db.query.contactAttributes.findFirst({
      where: whereClause,
    });

    if (!existing) {
      throw new NotFoundException(
        `Attribute '${key}' not found for contact ${contactId}${chatId ? ` in chat ${chatId}` : ''}`,
      );
    }

    const [updated] = await db
      .update(contactAttributes)
      .set({
        value: dto.value ?? existing.value,
        valueType: dto.valueType ?? existing.valueType,
        updatedAt: new Date(),
      })
      .where(eq(contactAttributes.id, existing.id))
      .returning();

    this.logger.log(
      `Updated attribute '${key}' for contact ${contactId}${chatId ? ` in chat ${chatId}` : ''}`,
    );
    return updated;
  }

  /**
   * Delete an attribute for a specific chat
   */
  async deleteAttribute(contactId: string, key: string, chatId?: string) {
    const whereClause = chatId
      ? and(
          eq(contactAttributes.contactId, contactId),
          eq(contactAttributes.key, key),
          eq(contactAttributes.chatId, chatId),
        )
      : and(
          eq(contactAttributes.contactId, contactId),
          eq(contactAttributes.key, key),
          isNull(contactAttributes.chatId),
        );

    const existing = await db.query.contactAttributes.findFirst({
      where: whereClause,
    });

    if (!existing) {
      throw new NotFoundException(
        `Attribute '${key}' not found for contact ${contactId}${chatId ? ` in chat ${chatId}` : ''}`,
      );
    }

    await db
      .delete(contactAttributes)
      .where(eq(contactAttributes.id, existing.id));

    this.logger.log(
      `Deleted attribute '${key}' for contact ${contactId}${chatId ? ` in chat ${chatId}` : ''}`,
    );
    return { success: true };
  }

  /**
   * Bulk upsert attributes for a contact in a specific chat
   * Creates or updates multiple attributes in a single operation
   */
  async bulkUpsertAttributes(contactId: string, dto: BulkUpsertAttributesDto) {
    // Verify contact exists
    const contact = await db.query.contacts.findFirst({
      where: and(
        eq(contacts.contactId, contactId),
        eq(contacts.isActive, true),
      ),
    });

    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`);
    }

    if (!dto.attributes || dto.attributes.length === 0) {
      return [];
    }

    const results: Awaited<ReturnType<typeof this.upsertAttribute>>[] = [];

    for (const attr of dto.attributes) {
      const result = await this.upsertAttribute(contactId, {
        key: attr.key,
        value: attr.value,
        valueType: attr.valueType,
        chatId: dto.chatId,
      });
      results.push(result);
    }

    this.logger.log(
      `Bulk upserted ${results.length} attributes for contact ${contactId}${dto.chatId ? ` in chat ${dto.chatId}` : ''}`,
    );
    return results;
  }

  /**
   * Delete multiple attributes by keys for a specific chat
   */
  async bulkDeleteAttributes(
    contactId: string,
    keys: string[],
    chatId?: string,
  ) {
    if (keys.length === 0) {
      return { deleted: 0 };
    }

    const whereClause = chatId
      ? and(
          eq(contactAttributes.contactId, contactId),
          inArray(contactAttributes.key, keys),
          eq(contactAttributes.chatId, chatId),
        )
      : and(
          eq(contactAttributes.contactId, contactId),
          inArray(contactAttributes.key, keys),
          isNull(contactAttributes.chatId),
        );

    await db.delete(contactAttributes).where(whereClause);

    this.logger.log(
      `Bulk deleted attributes [${keys.join(', ')}] for contact ${contactId}${chatId ? ` in chat ${chatId}` : ''}`,
    );
    return { deleted: keys.length };
  }

  /**
   * Get attributes as a key-value map for easy template variable resolution
   */
  async getAttributesMap(
    contactId: string,
    chatId?: string,
  ): Promise<Record<string, string | null>> {
    const attributes = await this.getAttributes(contactId, chatId);
    return attributes.reduce(
      (map, attr) => {
        map[attr.key] = attr.value;
        return map;
      },
      {} as Record<string, string | null>,
    );
  }
}
