/**
 * Media Vectorization Service
 *
 * Handles embedding generation for media metadata.
 * Creates vector embeddings from:
 * - Caption (primary semantic signal)
 * - Alt text
 * - Media role
 * - Parent KB object name
 * - Relevant field values
 * - AI-generated summary (if available)
 */

import { db } from '@database/db.connection';
import {
  kbObjectChunks,
  kbObjectFieldValues,
  kbObjectMedia,
  kbObjects,
  kbObjectTemplates,
  kbTemplateFields,
  NewKbObjectChunk,
} from '@database/knowledge-base.schema';
import { EmbeddingService } from '@modules/ai-memory/services/embedding.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { getMediaRoleMetadata, MediaRole } from '../types/media.types';

export interface MediaEmbeddingContent {
  mediaId: string;
  objectId: string;
  objectName: string;
  templateName: string;
  mediaRole: MediaRole;
  caption: string | null;
  altText: string | null;
  extractedContent: string | null;
  relevantFieldValues: Array<{
    fieldName: string;
    value: string;
  }>;
}

@Injectable()
export class MediaVectorizationService {
  private readonly logger = new Logger(MediaVectorizationService.name);
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly configService: ConfigService,
  ) {
    this.chunkSize = this.configService.get<number>(
      'MEDIA_EMBEDDING_CHUNK_SIZE',
      1000,
    );
    this.chunkOverlap = this.configService.get<number>(
      'MEDIA_EMBEDDING_CHUNK_OVERLAP',
      200,
    );
  }

  /**
   * Generate embeddings for a media item
   *
   * Creates one or more chunks in kb_object_chunks linked to the media.
   * The embedding is derived from text content, not the media file itself.
   */
  async vectorizeMedia(mediaId: string): Promise<void> {
    this.logger.debug(`Vectorizing media ${mediaId}`);

    // Get media with all context
    const content = await this.getMediaEmbeddingContent(mediaId);

    if (!content) {
      this.logger.warn(`Media ${mediaId} not found for vectorization`);
      return;
    }

    // Check if caption exists (required for meaningful embedding)
    if (!content.caption || content.caption.trim().length < 10) {
      this.logger.debug(
        `Media ${mediaId} has no caption - skipping vectorization`,
      );
      return;
    }

    // Build text content for embedding
    const embeddingText = this.buildEmbeddingText(content);

    if (!embeddingText || embeddingText.length < 20) {
      this.logger.debug(`Media ${mediaId} has insufficient text for embedding`);
      return;
    }

    // Calculate content hash
    const contentHash = this.hashContent(embeddingText);

    // Check if already embedded with same content
    const existingChunk = await this.findExistingMediaChunk(
      mediaId,
      contentHash,
    );

    if (existingChunk) {
      this.logger.debug(
        `Media ${mediaId} already vectorized with same content`,
      );
      return;
    }

    // Delete old chunks for this media
    await this.deleteMediaChunks(mediaId);

    // Generate embedding
    const embeddingResult = await this.embeddingService.embed({
      id: mediaId,
      content: embeddingText,
      metadata: {
        userId: 0, // Not user-specific
        chatId: '',
        messageId: '',
        timestamp: new Date().toISOString(),
        source: 'message' as const,
        contentType: 'text' as const,
        direction: 'inbound' as const,
        importanceScore: 1,
      },
    });

    // Create chunk record
    const chunk: NewKbObjectChunk = {
      objectId: content.objectId,
      chunkIndex: 0,
      chunkType: 'media',
      content: embeddingText,
      contentHash,
      tokenCount: Math.ceil(embeddingText.length / 4), // Rough estimate
      embedding: embeddingResult.vector,
      sourceFieldIds: [],
      sourceMediaId: mediaId,
      status: 'embedded',
      embeddingModel: 'text-embedding-3-large',
      embeddingDimensions: 1536,
      embeddedAt: new Date(),
    };

    await db.insert(kbObjectChunks).values(chunk);

    // Update media extraction status
    await db
      .update(kbObjectMedia)
      .set({
        extractionStatus: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(kbObjectMedia.id, mediaId));

    this.logger.log(
      `Vectorized media ${mediaId} - ${embeddingText.length} chars`,
    );
  }

  /**
   * Vectorize all media for an object
   */
  async vectorizeObjectMedia(objectId: string): Promise<number> {
    const mediaItems = await db
      .select({ id: kbObjectMedia.id })
      .from(kbObjectMedia)
      .where(eq(kbObjectMedia.objectId, objectId));

    let vectorizedCount = 0;

    for (const media of mediaItems) {
      try {
        await this.vectorizeMedia(media.id);
        vectorizedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to vectorize media ${media.id}: ${error.message}`,
        );
      }
    }

    return vectorizedCount;
  }

  /**
   * Get all content needed for media embedding
   */
  private async getMediaEmbeddingContent(
    mediaId: string,
  ): Promise<MediaEmbeddingContent | null> {
    // Get media with object and template info
    const result = await db
      .select({
        media: {
          id: kbObjectMedia.id,
          objectId: kbObjectMedia.objectId,
          mediaType: kbObjectMedia.mediaType,
          caption: kbObjectMedia.caption,
          altText: kbObjectMedia.altText,
          extractedContent: kbObjectMedia.extractedContent,
        },
        object: {
          name: kbObjects.name,
          templateId: kbObjects.templateId,
        },
        template: {
          displayName: kbObjectTemplates.displayName,
        },
      })
      .from(kbObjectMedia)
      .innerJoin(kbObjects, eq(kbObjectMedia.objectId, kbObjects.id))
      .leftJoin(
        kbObjectTemplates,
        eq(kbObjects.templateId, kbObjectTemplates.id),
      )
      .where(eq(kbObjectMedia.id, mediaId))
      .limit(1);

    if (!result[0]) {
      return null;
    }

    const { media, object, template } = result[0];

    // Get relevant field values for context
    const fieldValues = await this.getRelevantFieldValues(media.objectId);

    return {
      mediaId: media.id,
      objectId: media.objectId,
      objectName: object.name,
      templateName: template?.displayName || 'Unknown',
      mediaRole: media.mediaType as MediaRole,
      caption: media.caption,
      altText: media.altText,
      extractedContent: media.extractedContent,
      relevantFieldValues: fieldValues,
    };
  }

  /**
   * Get field values relevant for embedding context
   */
  private async getRelevantFieldValues(
    objectId: string,
  ): Promise<Array<{ fieldName: string; value: string }>> {
    const values = await db
      .select({
        fieldName: kbTemplateFields.displayName,
        fieldType: kbTemplateFields.fieldType,
        aiIncludeInEmbedding: kbTemplateFields.aiIncludeInEmbedding,
        textValue: kbObjectFieldValues.textValue,
        value: kbObjectFieldValues.value,
      })
      .from(kbObjectFieldValues)
      .innerJoin(
        kbTemplateFields,
        eq(kbObjectFieldValues.fieldId, kbTemplateFields.id),
      )
      .where(eq(kbObjectFieldValues.objectId, objectId));

    const result: Array<{ fieldName: string; value: string }> = [];

    for (const v of values) {
      // Only include fields marked for embedding
      if (!v.aiIncludeInEmbedding) continue;

      // Skip media/file fields (handled separately)
      if (v.fieldType === 'media' || v.fieldType === 'file') continue;

      // Get string value
      let stringValue = v.textValue;
      if (!stringValue && v.value) {
        if (typeof v.value === 'string') {
          stringValue = v.value;
        } else if (typeof v.value === 'number') {
          stringValue = String(v.value);
        } else if (Array.isArray(v.value)) {
          stringValue = v.value.join(', ');
        } else if (typeof v.value === 'object') {
          // Handle complex values like price, location
          stringValue = JSON.stringify(v.value);
        }
      }

      if (stringValue && stringValue.trim().length > 0) {
        result.push({
          fieldName: v.fieldName,
          value: stringValue.trim(),
        });
      }
    }

    return result;
  }

  /**
   * Build the text content for embedding
   *
   * Structure:
   * [Template]: [Object Name]
   * [Media Role]: [Caption]
   * Description: [Alt Text]
   * Context: [Relevant Field Values]
   * Content: [Extracted Content Summary]
   */
  private buildEmbeddingText(content: MediaEmbeddingContent): string {
    const parts: string[] = [];

    // Template and object context
    parts.push(`${content.templateName}: ${content.objectName}`);

    // Media role with label
    const roleMetadata = getMediaRoleMetadata(content.mediaRole);
    const roleLabel = roleMetadata?.label || content.mediaRole;

    // Caption (most important)
    if (content.caption) {
      parts.push(`${roleLabel}: ${content.caption}`);
    }

    // Alt text
    if (content.altText) {
      parts.push(`Description: ${content.altText}`);
    }

    // Relevant field values
    if (content.relevantFieldValues.length > 0) {
      const contextParts = content.relevantFieldValues
        .slice(0, 10) // Limit to top 10 fields
        .map((fv) => `${fv.fieldName}: ${fv.value.substring(0, 200)}`);
      parts.push(`Context: ${contextParts.join('. ')}`);
    }

    // Extracted content (truncated)
    if (content.extractedContent) {
      const truncated = content.extractedContent.substring(0, 500);
      parts.push(`Content: ${truncated}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Find existing chunk for media with same content hash
   */
  private async findExistingMediaChunk(
    mediaId: string,
    contentHash: string,
  ): Promise<boolean> {
    const result = await db
      .select({ id: kbObjectChunks.id })
      .from(kbObjectChunks)
      .where(
        and(
          eq(kbObjectChunks.sourceMediaId, mediaId),
          eq(kbObjectChunks.contentHash, contentHash),
        ),
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Delete existing chunks for a media item
   */
  private async deleteMediaChunks(mediaId: string): Promise<void> {
    await db
      .delete(kbObjectChunks)
      .where(eq(kbObjectChunks.sourceMediaId, mediaId));
  }

  /**
   * Hash content for change detection
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Re-vectorize media when metadata changes
   */
  async onMediaUpdated(mediaId: string): Promise<void> {
    // Get current content hash
    const content = await this.getMediaEmbeddingContent(mediaId);

    if (!content || !content.caption) {
      // No caption = delete existing chunks
      await this.deleteMediaChunks(mediaId);
      return;
    }

    const newHash = this.hashContent(this.buildEmbeddingText(content));
    const existing = await this.findExistingMediaChunk(mediaId, newHash);

    if (!existing) {
      // Content changed, re-vectorize
      await this.vectorizeMedia(mediaId);
    }
  }
}
