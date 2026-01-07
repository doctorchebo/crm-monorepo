/**
 * Knowledge Base Media Retrieval Service
 *
 * Handles semantic search and retrieval of media for AI usage.
 * Implements:
 * - Vector-based similarity search on media metadata
 * - Hard filters (eligibility, already sent, language)
 * - Soft ranking (similarity, priority, recency)
 * - Integration with KB object retrieval
 */

import { db } from '@database/db.connection';
import {
  kbObjectMedia,
  kbObjects,
  kbObjectTemplates,
} from '@database/knowledge-base.schema';
import { messages } from '@database/schema';
import { EmbeddingService } from '@modules/ai-memory/services/embedding.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { KnowledgeBaseRepository } from '../repositories/knowledge-base.repository';
import {
  getMediaRoleMetadata,
  isWhatsAppSupportedMimeType,
  MediaEligibilityResult,
  MediaRetrievalOptions,
  MediaRetrievalResponse,
  MediaRetrievalResult,
  MediaRole,
} from '../types/media.types';
import { KbMediaService } from './media.service';

interface RankedMediaCandidate {
  media: {
    id: string;
    objectId: string;
    mediaType: string;
    fileName: string;
    mimeType: string;
    s3Key: string;
    s3Bucket: string;
    caption: string | null;
    altText: string | null;
    thumbnailS3Key: string | null;
    extractedContent: string | null;
    aiInstructions: string | null;
    sortOrder: number | null;
    createdAt: Date | null;
  };
  object: {
    name: string;
    status: string | null;
    templateId: string;
  };
  template: {
    displayName: string;
    priorityScore: number | null;
  } | null;
  similarity: number;
  rankingScore: number;
  eligibility: MediaEligibilityResult;
}

@Injectable()
export class MediaRetrievalService {
  private readonly logger = new Logger(MediaRetrievalService.name);
  private readonly defaultTopK: number;
  private readonly defaultMinSimilarity: number;

  constructor(
    private readonly repository: KnowledgeBaseRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly mediaService: KbMediaService,
    private readonly configService: ConfigService,
  ) {
    this.defaultTopK = this.configService.get<number>(
      'MEDIA_RETRIEVAL_DEFAULT_TOP_K',
      5,
    );
    // Lower threshold for text-embedding-3-large with 1536-dim reduction
    // which produces notably lower similarity scores
    this.defaultMinSimilarity = this.configService.get<number>(
      'MEDIA_RETRIEVAL_DEFAULT_MIN_SIMILARITY',
      0.15,
    );
  }

  /**
   * Retrieve relevant media for a user query
   *
   * This is the main entry point for AI media retrieval.
   * It performs:
   * 1. Vector similarity search on media-related text
   * 2. Hard filtering (eligibility, already sent, language)
   * 3. Soft ranking (similarity, template priority, media role priority, recency)
   */
  async retrieveMedia(
    userId: number,
    query: string,
    options: MediaRetrievalOptions = {},
  ): Promise<MediaRetrievalResponse> {
    const startTime = Date.now();

    const {
      topK = this.defaultTopK,
      minSimilarity = this.defaultMinSimilarity,
      templateIds,
      objectIds,
      excludeObjectIds,
      mediaRoles,
      mimeTypes,
      chatId,
      chatLanguage,
      aiEnabledOnly = true,
      conversationContext,
    } = options;

    this.logger.debug(
      `[Media Retrieve] Query: "${query.substring(0, 50)}...", chatId: ${chatId || 'none'}`,
    );

    // Step 1: Build enhanced query for better matching
    const enhancedQuery = this.buildEnhancedQuery(query, conversationContext);

    // Step 2: Generate embedding for query
    const embeddingResult = await this.embeddingService.embed({
      id: 'media-query',
      content: enhancedQuery,
      metadata: {
        userId,
        chatId: chatId || '',
        messageId: '',
        timestamp: new Date().toISOString(),
        source: 'message' as const,
        contentType: 'text' as const,
        direction: 'inbound' as const,
        importanceScore: 1,
      },
    });

    // Step 3: Search for media-related chunks
    // We search chunks that have sourceMediaId or are from media descriptions
    const mediaChunks = await this.searchMediaChunks(
      userId,
      embeddingResult.vector,
      {
        topK: topK * 5, // Get more candidates for filtering
        minScore: minSimilarity,
        templateIds,
        objectIds,
        excludeObjectIds,
      },
    );

    // Step 4: Get unique object IDs from matching chunks
    const objectIdsFromChunks = [
      ...new Set(mediaChunks.map((c) => c.objectId)),
    ];

    if (objectIdsFromChunks.length === 0) {
      return {
        query,
        results: [],
        totalMatches: 0,
        eligibleCount: 0,
        latencyMs: Date.now() - startTime,
      };
    }

    // Step 5: Get all media for matching objects
    const mediaWithObjects = await this.getMediaForObjects(
      objectIdsFromChunks,
      mediaRoles,
      mimeTypes,
    );

    // Step 6: Get already-sent media IDs for this chat
    const alreadySentMediaIds = chatId
      ? await this.getAlreadySentMediaIds(chatId)
      : new Set<string>();

    // Step 7: Calculate similarity and ranking for each media
    const rankedCandidates: RankedMediaCandidate[] = [];

    for (const item of mediaWithObjects) {
      // Find best matching chunk similarity for this object
      const objectChunks = mediaChunks.filter(
        (c) => c.objectId === item.media.objectId,
      );
      const bestSimilarity =
        objectChunks.length > 0
          ? Math.max(...objectChunks.map((c) => c.similarity))
          : 0;

      // Check eligibility
      const eligibility = await this.checkMediaEligibility(
        item.media,
        item.object,
        chatId,
        chatLanguage,
        alreadySentMediaIds,
        aiEnabledOnly,
      );

      // Calculate ranking score
      const rankingScore = this.calculateRankingScore(
        bestSimilarity,
        item.media.mediaType as MediaRole,
        item.template?.priorityScore || 50,
        item.media.createdAt,
      );

      rankedCandidates.push({
        ...item,
        similarity: bestSimilarity,
        rankingScore,
        eligibility,
      });
    }

    // Step 8: Filter to eligible only and sort by ranking
    const eligibleCandidates = rankedCandidates
      .filter((c) => c.eligibility.isEligible)
      .sort((a, b) => b.rankingScore - a.rankingScore)
      .slice(0, topK);

    // Step 9: Transform to response format
    const results: MediaRetrievalResult[] = eligibleCandidates.map((c) => ({
      mediaId: c.media.id,
      objectId: c.media.objectId,
      objectName: c.object.name,
      templateId: c.object.templateId,
      templateName: c.template?.displayName || 'Unknown',
      mediaRole: c.media.mediaType as MediaRole,
      fileName: c.media.fileName,
      mimeType: c.media.mimeType,
      s3Key: c.media.s3Key,
      s3Bucket: c.media.s3Bucket,
      caption: c.media.caption,
      altText: c.media.altText,
      thumbnailS3Key: c.media.thumbnailS3Key,
      extractedContent: c.media.extractedContent,
      aiInstructions: c.media.aiInstructions ?? null,
      similarity: c.similarity,
      rankingScore: c.rankingScore,
      eligibility: c.eligibility,
    }));

    const latencyMs = Date.now() - startTime;

    this.logger.debug(
      `[Media Retrieve] Found ${rankedCandidates.length} candidates, ` +
        `${eligibleCandidates.length} eligible, returned ${results.length} in ${latencyMs}ms`,
    );

    return {
      query,
      results,
      totalMatches: rankedCandidates.length,
      eligibleCount: eligibleCandidates.length,
      latencyMs,
    };
  }

  /**
   * Get the best single media for a query (for AI reply)
   */
  async getBestMediaForQuery(
    userId: number,
    query: string,
    chatId: string,
    chatLanguage?: string,
    conversationContext?: string,
  ): Promise<MediaRetrievalResult | null> {
    const response = await this.retrieveMedia(userId, query, {
      topK: 1,
      chatId,
      chatLanguage,
      aiEnabledOnly: true,
      conversationContext,
    });

    return response.results[0] || null;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Build enhanced query with conversation context
   */
  private buildEnhancedQuery(
    query: string,
    conversationContext?: string,
  ): string {
    if (!conversationContext) {
      return query;
    }

    // Combine query with relevant context
    const contextSummary = conversationContext.slice(0, 500);
    return `${query}\n\nContext: ${contextSummary}`;
  }

  /**
   * Search chunks for media-related content
   */
  private async searchMediaChunks(
    userId: number,
    queryVector: number[],
    options: {
      topK: number;
      minScore: number;
      templateIds?: string[];
      objectIds?: string[];
      excludeObjectIds?: string[];
    },
  ): Promise<
    Array<{
      id: string;
      objectId: string;
      content: string;
      similarity: number;
    }>
  > {
    // Use the repository's existing vector search
    return this.repository.searchChunksByVector(userId, queryVector, {
      topK: options.topK,
      minScore: options.minScore,
      templateIds: options.templateIds,
      objectIds: options.objectIds,
      excludeObjectIds: options.excludeObjectIds,
    });
  }

  /**
   * Get all media for a list of objects
   */
  private async getMediaForObjects(
    objectIds: string[],
    mediaRoles?: MediaRole[],
    mimeTypes?: string[],
  ): Promise<
    Array<{
      media: {
        id: string;
        objectId: string;
        mediaType: string;
        fileName: string;
        mimeType: string;
        s3Key: string;
        s3Bucket: string;
        caption: string | null;
        altText: string | null;
        thumbnailS3Key: string | null;
        extractedContent: string | null;
        aiInstructions: string | null;
        sortOrder: number | null;
        createdAt: Date | null;
      };
      object: {
        name: string;
        status: string | null;
        templateId: string;
      };
      template: {
        displayName: string;
        priorityScore: number | null;
      } | null;
    }>
  > {
    // Build where conditions
    const conditions = [inArray(kbObjectMedia.objectId, objectIds)];

    if (mediaRoles && mediaRoles.length > 0) {
      conditions.push(inArray(kbObjectMedia.mediaType, mediaRoles));
    }

    if (mimeTypes && mimeTypes.length > 0) {
      conditions.push(inArray(kbObjectMedia.mimeType, mimeTypes));
    }

    const results = await db
      .select({
        media: {
          id: kbObjectMedia.id,
          objectId: kbObjectMedia.objectId,
          mediaType: kbObjectMedia.mediaType,
          fileName: kbObjectMedia.fileName,
          mimeType: kbObjectMedia.mimeType,
          s3Key: kbObjectMedia.s3Key,
          s3Bucket: kbObjectMedia.s3Bucket,
          caption: kbObjectMedia.caption,
          altText: kbObjectMedia.altText,
          thumbnailS3Key: kbObjectMedia.thumbnailS3Key,
          extractedContent: kbObjectMedia.extractedContent,
          aiInstructions: kbObjectMedia.aiInstructions,
          sortOrder: kbObjectMedia.sortOrder,
          createdAt: kbObjectMedia.createdAt,
        },
        object: {
          name: kbObjects.name,
          status: kbObjects.status,
          templateId: kbObjects.templateId,
        },
        template: {
          displayName: kbObjectTemplates.displayName,
          priorityScore: kbObjectTemplates.priorityScore,
        },
      })
      .from(kbObjectMedia)
      .innerJoin(kbObjects, eq(kbObjectMedia.objectId, kbObjects.id))
      .leftJoin(
        kbObjectTemplates,
        eq(kbObjects.templateId, kbObjectTemplates.id),
      )
      .where(and(...conditions))
      .orderBy(kbObjectMedia.sortOrder);

    return results;
  }

  /**
   * Get media IDs that have already been sent in a chat
   */
  private async getAlreadySentMediaIds(chatId: string): Promise<Set<string>> {
    // Query messages table for AI-sent media
    // Look for attachments in AI-generated messages
    const aiMediaMessages = await db
      .select({
        attachments: messages.attachments,
      })
      .from(messages)
      .where(
        and(
          eq(messages.chatId, chatId),
          eq(messages.isAiGenerated, true),
          // Only look at messages with media
          sql`${messages.type} IN ('image', 'video', 'audio', 'document')`,
        ),
      );

    const sentMediaIds = new Set<string>();

    for (const msg of aiMediaMessages) {
      if (msg.attachments && Array.isArray(msg.attachments)) {
        for (const attachment of msg.attachments as Array<{
          kbMediaId?: string;
        }>) {
          if (attachment.kbMediaId) {
            sentMediaIds.add(attachment.kbMediaId);
          }
        }
      }
    }

    return sentMediaIds;
  }

  /**
   * Check if a specific media is eligible for AI sending
   */
  private async checkMediaEligibility(
    media: {
      id: string;
      caption: string | null;
      mimeType: string;
      extractedContent: string | null;
    },
    object: {
      status: string | null;
    },
    chatId?: string,
    chatLanguage?: string,
    alreadySentMediaIds?: Set<string>,
    aiEnabledOnly?: boolean,
  ): Promise<MediaEligibilityResult> {
    const failures: Array<
      | 'missing_caption'
      | 'ai_disabled'
      | 'already_sent_in_chat'
      | 'language_mismatch'
      | 'outside_whatsapp_window'
      | 'max_sends_exceeded'
      | 'object_not_indexed'
      | 'low_relevance_score'
      | 'object_archived'
      | 'extraction_pending'
      | 'invalid_media_type'
    > = [];

    // Check 1: Caption must exist and be meaningful
    if (!media.caption || media.caption.trim().length < 10) {
      failures.push('missing_caption');
    }

    // Check 2: Object must be in valid status
    if (!object.status || object.status === 'archived') {
      failures.push('object_archived');
    } else if (!['indexed', 'pending', 'indexing'].includes(object.status)) {
      failures.push('object_not_indexed');
    }

    // Check 3: MIME type must be WhatsApp-supported
    if (!isWhatsAppSupportedMimeType(media.mimeType)) {
      failures.push('invalid_media_type');
    }

    // Check 4: Not already sent in this chat
    if (chatId && alreadySentMediaIds?.has(media.id)) {
      failures.push('already_sent_in_chat');
    }

    // Build result
    const isEligible = failures.length === 0;

    return {
      isEligible,
      failureReasons: failures,
      explanation: isEligible
        ? 'Media is eligible for AI sending'
        : `Not eligible: ${failures.join(', ')}`,
      confidenceScore: isEligible ? 1 : 0,
    };
  }

  /**
   * Calculate ranking score for media selection
   *
   * Factors:
   * - Vector similarity (40%)
   * - Media role priority (25%)
   * - Template priority (20%)
   * - Recency (15%)
   */
  private calculateRankingScore(
    similarity: number,
    mediaRole: MediaRole,
    templatePriority: number,
    createdAt: Date | null,
  ): number {
    // Similarity component (0-40)
    const similarityScore = similarity * 40;

    // Media role priority component (0-25)
    const roleMetadata = getMediaRoleMetadata(mediaRole);
    const rolePriorityScore = roleMetadata
      ? (roleMetadata.aiPriorityScore / 100) * 25
      : 5;

    // Template priority component (0-20)
    const templatePriorityScore = (templatePriority / 100) * 20;

    // Recency component (0-15)
    // More recent media gets higher score
    let recencyScore = 7.5; // Default to middle
    if (createdAt) {
      const ageMs = Date.now() - createdAt.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      // Score decreases as age increases (max 90 days consideration)
      recencyScore = Math.max(0, 15 * (1 - ageDays / 90));
    }

    return (
      similarityScore + rolePriorityScore + templatePriorityScore + recencyScore
    );
  }
}
