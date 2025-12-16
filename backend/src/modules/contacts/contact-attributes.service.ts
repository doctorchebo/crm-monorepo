import { db } from '@database/db.connection';
import { contactAttributes, contacts } from '@database/schema';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import {
  BulkUpsertAttributesDto,
  CreateContactAttributeDto,
  UpdateContactAttributeDto,
} from './dto/contact-attribute.dto';

/**
 * Contact Attributes Service
 * Manages custom key-value profile fields for contacts
 */
@Injectable()
export class ContactAttributesService {
  private readonly logger = new Logger(ContactAttributesService.name);

  /**
   * Get all attributes for a contact
   */
  async getAttributes(contactId: string) {
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

    return await db.query.contactAttributes.findMany({
      where: eq(contactAttributes.contactId, contactId),
      orderBy: (attrs, { asc }) => [asc(attrs.key)],
    });
  }

  /**
   * Get a single attribute by key
   */
  async getAttribute(contactId: string, key: string) {
    const attribute = await db.query.contactAttributes.findFirst({
      where: and(
        eq(contactAttributes.contactId, contactId),
        eq(contactAttributes.key, key),
      ),
    });

    if (!attribute) {
      throw new NotFoundException(
        `Attribute '${key}' not found for contact ${contactId}`,
      );
    }

    return attribute;
  }

  /**
   * Create or update a single attribute
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

    // Check if attribute exists
    const existing = await db.query.contactAttributes.findFirst({
      where: and(
        eq(contactAttributes.contactId, contactId),
        eq(contactAttributes.key, dto.key),
      ),
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
        `Updated attribute '${dto.key}' for contact ${contactId}`,
      );
      return updated;
    }

    // Create new
    const [created] = await db
      .insert(contactAttributes)
      .values({
        contactId,
        key: dto.key,
        value: dto.value,
        valueType: dto.valueType || 'string',
      })
      .returning();

    this.logger.log(`Created attribute '${dto.key}' for contact ${contactId}`);
    return created;
  }

  /**
   * Update an attribute value
   */
  async updateAttribute(
    contactId: string,
    key: string,
    dto: UpdateContactAttributeDto,
  ) {
    const existing = await db.query.contactAttributes.findFirst({
      where: and(
        eq(contactAttributes.contactId, contactId),
        eq(contactAttributes.key, key),
      ),
    });

    if (!existing) {
      throw new NotFoundException(
        `Attribute '${key}' not found for contact ${contactId}`,
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

    this.logger.log(`Updated attribute '${key}' for contact ${contactId}`);
    return updated;
  }

  /**
   * Delete an attribute
   */
  async deleteAttribute(contactId: string, key: string) {
    const existing = await db.query.contactAttributes.findFirst({
      where: and(
        eq(contactAttributes.contactId, contactId),
        eq(contactAttributes.key, key),
      ),
    });

    if (!existing) {
      throw new NotFoundException(
        `Attribute '${key}' not found for contact ${contactId}`,
      );
    }

    await db
      .delete(contactAttributes)
      .where(eq(contactAttributes.id, existing.id));

    this.logger.log(`Deleted attribute '${key}' for contact ${contactId}`);
    return { success: true };
  }

  /**
   * Bulk upsert attributes for a contact
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
      });
      results.push(result);
    }

    this.logger.log(
      `Bulk upserted ${results.length} attributes for contact ${contactId}`,
    );
    return results;
  }

  /**
   * Delete multiple attributes by keys
   */
  async bulkDeleteAttributes(contactId: string, keys: string[]) {
    if (keys.length === 0) {
      return { deleted: 0 };
    }

    const result = await db
      .delete(contactAttributes)
      .where(
        and(
          eq(contactAttributes.contactId, contactId),
          inArray(contactAttributes.key, keys),
        ),
      );

    this.logger.log(
      `Bulk deleted attributes [${keys.join(', ')}] for contact ${contactId}`,
    );
    return { deleted: keys.length };
  }

  /**
   * Get attributes as a key-value map for easy template variable resolution
   */
  async getAttributesMap(
    contactId: string,
  ): Promise<Record<string, string | null>> {
    const attributes = await this.getAttributes(contactId);
    return attributes.reduce(
      (map, attr) => {
        map[attr.key] = attr.value;
        return map;
      },
      {} as Record<string, string | null>,
    );
  }
}
