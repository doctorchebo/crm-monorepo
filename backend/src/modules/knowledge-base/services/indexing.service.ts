/**
 * Knowledge Base Indexing Service
 *
 * Handles chunking and embedding of knowledge objects for vector search.
 * Processes objects in the pending queue and creates searchable chunks.
 */

import {
  KbObject,
  KbObjectFieldValue,
  KbObjectMedia,
  KbTemplateField,
} from '@database/knowledge-base.schema';
import { EmbeddingService } from '@modules/ai-memory/services/embedding.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { KnowledgeBaseRepository } from '../repositories/knowledge-base.repository';

interface ChunkData {
  content: string;
  chunkType: string;
  sourceFieldIds: string[];
  sourceMediaId?: string;
}

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);
  private readonly maxChunkSize: number;
  private readonly chunkOverlap: number;

  constructor(
    private readonly repository: KnowledgeBaseRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly configService: ConfigService,
  ) {
    this.maxChunkSize = this.configService.get<number>(
      'KNOWLEDGE_BASE_MAX_CHUNK_SIZE',
      2000,
    );
    this.chunkOverlap = this.configService.get<number>(
      'KNOWLEDGE_BASE_CHUNK_OVERLAP',
      200,
    );
  }

  /**
   * Process pending objects in the queue
   */
  async processPendingObjects(batchSize: number = 10): Promise<void> {
    const { objects } = await this.repository.getObjectsByUser(0, {
      status: 'pending',
      pageSize: batchSize,
    });

    // Get all pending objects across all users
    // This is a simplified version - in production you'd want a proper queue

    this.logger.log(
      `Processing ${objects.length} pending objects for indexing`,
    );

    for (const object of objects) {
      try {
        await this.indexObject(object.id);
      } catch (error) {
        this.logger.error(
          `Failed to index object ${object.id}: ${error.message}`,
        );
        await this.repository.updateObjectStatus(
          object.id,
          'error',
          error.message,
        );
      }
    }
  }

  /**
   * Index a single object
   */
  async indexObject(objectId: string): Promise<void> {
    this.logger.log(`Starting indexing for object ${objectId}`);

    const object = await this.repository.getObjectById(objectId);
    if (!object) {
      throw new Error(`Object ${objectId} not found`);
    }

    // Update status to indexing
    await this.repository.updateObjectStatus(objectId, 'indexing');

    try {
      // Get template fields
      const fields = await this.repository.getTemplateFields(object.templateId);

      // Get template for context
      const template = await this.repository.getTemplateById(object.templateId);

      // Get field values
      const fieldValues =
        await this.repository.getFieldValuesByObject(objectId);

      // Get media with extracted content
      const media = await this.repository.getMediaByObject(objectId);

      // Generate chunks
      const chunks = await this.generateChunks(
        object,
        template,
        fields,
        fieldValues,
        media,
      );

      // Delete existing chunks
      await this.repository.deleteChunksByObject(objectId);

      // Create and embed chunks
      let successCount = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          // Prepend object context to improve semantic matching
          // This ensures queries about "flow project" match chunks from "Flow Project"
          const contextPrefix = `[${template?.displayName || 'Knowledge Base Item'}: ${object.name}]\n`;
          const embeddingContent = contextPrefix + chunk.content;

          // Generate embedding with compatible metadata type
          const embeddingResult = await this.embeddingService.embed({
            id: `${objectId}-${i}`,
            content: embeddingContent,
            metadata: {
              userId: object.userId,
              contentType: 'document' as const,
              processingMethod: 'extraction' as const,
              tags: [chunk.chunkType],
            },
          });

          // Create chunk with embedding
          // Store the enhanced content (with context prefix) for better retrieval display
          await this.repository.createChunk({
            objectId,
            chunkIndex: i,
            chunkType: chunk.chunkType,
            content: embeddingContent,
            contentHash: this.generateContentHash(embeddingContent),
            tokenCount: embeddingResult.tokensUsed,
            sourceFieldIds: chunk.sourceFieldIds,
            sourceMediaId: chunk.sourceMediaId,
            embedding: embeddingResult.vector,
            status: 'embedded',
          });

          successCount++;
        } catch (error) {
          this.logger.error(
            `Failed to embed chunk ${i} for object ${objectId}: ${error.message}`,
          );
          // Create chunk without embedding
          await this.repository.createChunk({
            objectId,
            chunkIndex: i,
            chunkType: chunk.chunkType,
            content: chunk.content,
            contentHash: this.generateContentHash(chunk.content),
            sourceFieldIds: chunk.sourceFieldIds,
            sourceMediaId: chunk.sourceMediaId,
            status: 'error',
            errorMessage: error.message,
          });
        }
      }

      // Update object status
      if (successCount === chunks.length) {
        await this.repository.updateObject(objectId, {
          status: 'indexed',
          chunkCount: successCount,
          lastIndexedAt: new Date(),
          indexingError: null,
        });
        this.logger.log(
          `Successfully indexed object ${objectId} with ${successCount} chunks`,
        );
      } else {
        await this.repository.updateObject(objectId, {
          status: 'error',
          chunkCount: successCount,
          indexingError: `Only ${successCount}/${chunks.length} chunks embedded successfully`,
        });
      }
    } catch (error) {
      await this.repository.updateObjectStatus(
        objectId,
        'error',
        error.message,
      );
      throw error;
    }
  }

  /**
   * Generate chunks from object data
   * Creates a comprehensive data chunk with ALL field values for AI retrieval
   */
  private async generateChunks(
    object: KbObject,
    template: any,
    fields: KbTemplateField[],
    fieldValues: KbObjectFieldValue[],
    media: KbObjectMedia[],
  ): Promise<ChunkData[]> {
    const chunks: ChunkData[] = [];

    // Create field map for easy lookup
    const fieldMap = new Map(fields.map((f) => [f.id, f]));
    const valueMap = new Map(fieldValues.map((v) => [v.fieldId, v]));

    // 1. Create comprehensive data chunk with ALL field values
    // This is the primary chunk for AI retrieval - includes everything
    const dataChunk = this.createComprehensiveDataChunk(
      object,
      template,
      fields,
      fieldValues,
      fieldMap,
      valueMap,
    );
    if (dataChunk) {
      chunks.push(dataChunk);
    }

    // 2. Create field chunks for long text fields that might exceed the summary
    const fieldChunks = this.createFieldChunks(
      fields,
      fieldValues,
      fieldMap,
      valueMap,
    );
    chunks.push(...fieldChunks);

    // 3. Create media chunks for extracted content
    const mediaChunks = this.createMediaChunks(media);
    chunks.push(...mediaChunks);

    return chunks;
  }

  /**
   * Create a comprehensive data chunk with ALL field values
   * This ensures the AI has access to complete product/object information
   */
  private createComprehensiveDataChunk(
    object: KbObject,
    template: any,
    fields: KbTemplateField[],
    fieldValues: KbObjectFieldValue[],
    fieldMap: Map<string, KbTemplateField>,
    valueMap: Map<string, KbObjectFieldValue>,
  ): ChunkData | null {
    const parts: string[] = [];
    const includedFieldIds: string[] = [];

    // Header with object identification
    parts.push(`# ${template?.displayName || 'Item'}: ${object.name}`);
    parts.push('');

    // Group fields by category for better organization
    const groupedFields = this.groupFieldsByCategory(fields);

    for (const [category, categoryFields] of Object.entries(groupedFields)) {
      const categoryParts: string[] = [];

      for (const field of categoryFields) {
        const value = valueMap.get(field.id);
        if (value && value.value !== null && value.value !== undefined) {
          const formattedValue = this.formatFieldValue(
            value.value,
            field.fieldType,
            field.fieldConfig,
          );
          if (formattedValue) {
            categoryParts.push(`- ${field.displayName}: ${formattedValue}`);
            includedFieldIds.push(field.id);
          }
        } else if (value?.textValue) {
          // Include text values for long_text/rich_text fields (truncated)
          const truncatedText =
            value.textValue.length > 500
              ? value.textValue.substring(0, 500) + '...'
              : value.textValue;
          categoryParts.push(`- ${field.displayName}: ${truncatedText}`);
          includedFieldIds.push(field.id);
        }
      }

      if (categoryParts.length > 0) {
        if (category !== 'default') {
          parts.push(`## ${category}`);
        }
        parts.push(...categoryParts);
        parts.push('');
      }
    }

    // Add AI usage hints if present
    if (template?.aiUsageHints) {
      parts.push(`Note: ${template.aiUsageHints}`);
    }

    // Only create chunk if we have actual content
    if (includedFieldIds.length === 0) {
      return null;
    }

    return {
      content: parts.join('\n'),
      chunkType: 'summary',
      sourceFieldIds: includedFieldIds,
    };
  }

  /**
   * Group fields by their groupName for organized output
   * Uses the schema's groupName property (not 'category')
   */
  private groupFieldsByCategory(
    fields: KbTemplateField[],
  ): Record<string, KbTemplateField[]> {
    const groups: Record<string, KbTemplateField[]> = {};

    for (const field of fields) {
      // Use groupName from schema, fallback to 'default'
      const groupName = field.groupName || 'default';
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(field);
    }

    // Sort fields within each group by their sortOrder
    for (const groupName of Object.keys(groups)) {
      groups[groupName].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    }

    return groups;
  }

  /**
   * Legacy: Create summary chunk with key fields only
   * @deprecated Use createComprehensiveDataChunk instead
   */
  private createSummaryChunk(
    object: KbObject,
    template: any,
    fields: KbTemplateField[],
    fieldValues: KbObjectFieldValue[],
    fieldMap: Map<string, KbTemplateField>,
    valueMap: Map<string, KbObjectFieldValue>,
  ): ChunkData | null {
    const parts: string[] = [];

    // Add object name and type
    parts.push(`${template?.displayName || 'Item'}: ${object.name}`);
    parts.push('');

    // Add ALL fields that have values (not just high/critical relevance)
    const includedFieldIds: string[] = [];

    for (const field of fields) {
      const value = valueMap.get(field.id);
      if (value && value.value !== null && value.value !== undefined) {
        const formattedValue = this.formatFieldValue(
          value.value,
          field.fieldType,
          field.fieldConfig,
        );
        if (formattedValue) {
          parts.push(`${field.displayName}: ${formattedValue}`);
          includedFieldIds.push(field.id);
        }
      }
    }

    // Add AI hints if present
    if (template?.aiUsageHints) {
      parts.push('');
      parts.push(`Usage context: ${template.aiUsageHints}`);
    }

    if (parts.length <= 2) {
      return null;
    }

    return {
      content: parts.join('\n'),
      chunkType: 'summary',
      sourceFieldIds: includedFieldIds,
    };
  }

  /**
   * Create chunks for individual fields
   */
  private createFieldChunks(
    fields: KbTemplateField[],
    fieldValues: KbObjectFieldValue[],
    fieldMap: Map<string, KbTemplateField>,
    valueMap: Map<string, KbObjectFieldValue>,
  ): ChunkData[] {
    const chunks: ChunkData[] = [];

    // Process text fields that need their own chunks
    const textFields = fields.filter(
      (f) =>
        (f.fieldType === 'long_text' || f.fieldType === 'rich_text') &&
        f.aiIncludeInEmbedding,
    );

    for (const field of textFields) {
      const value = valueMap.get(field.id);
      if (!value || !value.textValue) continue;

      const text = value.textValue;

      // If text is short enough, create single chunk
      if (text.length <= this.maxChunkSize) {
        chunks.push({
          content: `${field.displayName}:\n${text}`,
          chunkType: 'field',
          sourceFieldIds: [field.id],
        });
      } else {
        // Split into multiple chunks with overlap
        const textChunks = this.splitTextIntoChunks(text);
        for (let i = 0; i < textChunks.length; i++) {
          chunks.push({
            content: `${field.displayName} (part ${i + 1}/${textChunks.length}):\n${textChunks[i]}`,
            chunkType: 'field',
            sourceFieldIds: [field.id],
          });
        }
      }
    }

    return chunks;
  }

  /**
   * Create chunks for media with extracted content
   */
  private createMediaChunks(media: KbObjectMedia[]): ChunkData[] {
    const chunks: ChunkData[] = [];

    const mediaWithContent = media.filter(
      (m) => m.extractedContent && m.extractionStatus === 'completed',
    );

    for (const item of mediaWithContent) {
      const content = item.extractedContent!;
      const prefix = `[${item.mediaType.toUpperCase()}: ${item.fileName}]\n`;

      if (content.length <= this.maxChunkSize - prefix.length) {
        chunks.push({
          content: prefix + content,
          chunkType: 'media',
          sourceFieldIds: item.fieldId ? [item.fieldId] : [],
          sourceMediaId: item.id,
        });
      } else {
        const textChunks = this.splitTextIntoChunks(content);
        for (let i = 0; i < textChunks.length; i++) {
          chunks.push({
            content: `${prefix}(part ${i + 1}/${textChunks.length}):\n${textChunks[i]}`,
            chunkType: 'media',
            sourceFieldIds: item.fieldId ? [item.fieldId] : [],
            sourceMediaId: item.id,
          });
        }
      }
    }

    return chunks;
  }

  /**
   * Split long text into chunks with overlap
   */
  private splitTextIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);

    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > this.maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        // Start new chunk with overlap
        const overlapStart = Math.max(
          0,
          currentChunk.length - this.chunkOverlap,
        );
        currentChunk = currentChunk.substring(overlapStart) + ' ' + sentence;
      } else {
        currentChunk += ' ' + sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Format field value for embedding
   * Handles all field types and formats them into human-readable strings
   *
   * @param value - The raw field value (can be any type depending on fieldType)
   * @param fieldType - The type of field (e.g., 'price', 'number', 'location')
   * @param fieldConfig - Optional field configuration containing type-specific settings
   */
  private formatFieldValue(
    value: any,
    fieldType: string,
    fieldConfig?: Record<string, any> | null,
  ): string | null {
    if (value === null || value === undefined) return null;

    switch (fieldType) {
      case 'short_text':
      case 'long_text':
      case 'rich_text':
        return typeof value === 'string' ? value : null;

      case 'number':
        if (typeof value === 'number') {
          const config = fieldConfig as {
            prefix?: string;
            suffix?: string;
          } | null;
          const prefix = config?.prefix || '';
          const suffix = config?.suffix || '';
          return `${prefix}${value}${suffix}`;
        }
        return null;

      case 'price':
        // Handle multiple formats: plain number, string number, or object with amount
        const priceConfig = fieldConfig as { currency?: string } | null;
        const currencySymbol = this.getCurrencySymbol(
          priceConfig?.currency || 'USD',
        );

        if (typeof value === 'number') {
          // Plain number format (e.g., 500000)
          return `${currencySymbol}${this.formatPriceNumber(value)}`;
        }
        if (typeof value === 'string') {
          // String number format (e.g., "500000")
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            return `${currencySymbol}${this.formatPriceNumber(numValue)}`;
          }
          return value; // Return as-is if not a valid number
        }
        if (typeof value === 'object' && 'amount' in value) {
          // Object format (e.g., { amount: 500000, currency: 'USD' })
          const currency = value.currency || priceConfig?.currency || 'USD';
          return `${this.getCurrencySymbol(currency)}${this.formatPriceNumber(value.amount)}`;
        }
        return null;

      case 'boolean':
        return typeof value === 'boolean' ? (value ? 'Yes' : 'No') : null;

      case 'tags':
        return Array.isArray(value) ? value.join(', ') : null;

      case 'date':
        return typeof value === 'string' ? value : null;

      case 'date_range':
        if (typeof value === 'object' && 'start' in value) {
          const start = value.start || 'Open';
          const end = value.end || 'Open';
          return `${start} to ${end}`;
        }
        return null;

      case 'location':
        return this.formatLocation(value);

      case 'key_value':
        if (Array.isArray(value)) {
          return value
            .map((kv: { key: string; value: any }) => `${kv.key}: ${kv.value}`)
            .join('; ');
        }
        return null;

      default:
        return typeof value === 'string' ? value : JSON.stringify(value);
    }
  }

  /**
   * Get currency symbol from currency code
   */
  private getCurrencySymbol(currencyCode: string): string {
    const symbols: Record<string, string> = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      JPY: '¥',
      CNY: '¥',
      KRW: '₩',
      INR: '₹',
      BRL: 'R$',
      MXN: '$',
      CAD: 'C$',
      AUD: 'A$',
      CHF: 'CHF ',
      BOB: 'Bs.',
    };
    return symbols[currencyCode.toUpperCase()] || `${currencyCode} `;
  }

  /**
   * Format price number with proper thousand separators
   */
  private formatPriceNumber(amount: number): string {
    // Use standard number formatting with thousand separators
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Format location value - handles both GPS coordinates and address formats
   * GPS format: { lat: number, lng: number }
   * Address format: { formattedAddress?, address?, city?, state?, country? }
   */
  private formatLocation(value: unknown): string | null {
    if (!value || typeof value !== 'object') {
      // Handle string values (e.g., plain address text)
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      return null;
    }

    const location = value as Record<string, unknown>;

    // Check for GPS coordinates format { lat, lng }
    const hasLat =
      'lat' in location && location.lat !== null && location.lat !== undefined;
    const hasLng =
      'lng' in location && location.lng !== null && location.lng !== undefined;

    if (hasLat && hasLng) {
      const lat =
        typeof location.lat === 'string'
          ? parseFloat(location.lat)
          : Number(location.lat);
      const lng =
        typeof location.lng === 'string'
          ? parseFloat(location.lng)
          : Number(location.lng);

      if (!isNaN(lat) && !isNaN(lng)) {
        // Format GPS coordinates with 6 decimal places for precision
        return `GPS Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
    }

    // Check for address format { formattedAddress, address, city, state, country }
    const addressParts: string[] = [];

    if (
      location.formattedAddress &&
      typeof location.formattedAddress === 'string'
    ) {
      return location.formattedAddress;
    }

    if (location.address && typeof location.address === 'string') {
      addressParts.push(location.address);
    }
    if (location.city && typeof location.city === 'string') {
      addressParts.push(location.city);
    }
    if (location.state && typeof location.state === 'string') {
      addressParts.push(location.state);
    }
    if (location.country && typeof location.country === 'string') {
      addressParts.push(location.country);
    }

    if (addressParts.length > 0) {
      return addressParts.join(', ');
    }

    // Fallback: try to extract any string values from the object
    const stringValues = Object.values(location)
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim());

    if (stringValues.length > 0) {
      return stringValues.join(', ');
    }

    return null;
  }

  /**
   * Generate content hash
   */
  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
