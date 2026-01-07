/**
 * Media Decision Audit Service
 *
 * Tracks and stores all AI media decisions for auditability.
 * Provides:
 * - Full decision trace for every AI media consideration
 * - Query capabilities for reviewing past decisions
 * - Feedback collection for improving AI selection
 */

import { db } from '@database/db.connection';
import { kbRetrievalLogs } from '@database/knowledge-base.schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql, SQL } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  GuardrailFailure,
  MediaCandidate,
  MediaDecisionAudit,
} from '../types/media.types';

export interface LogMediaDecisionParams {
  messageId: string;
  chatId: string;
  userId: number;
  mediaSent: boolean;
  selectedMediaId?: string;
  objectId?: string;
  userIntent: string;
  queryText: string;
  selectionReason: string;
  guardrailsApplied: string[];
  guardrailFailures?: GuardrailFailure[];
  candidatesConsidered?: MediaCandidate[];
  similarityScore?: number;
  rankingScore?: number;
}

export interface QueryAuditLogsParams {
  chatId?: string;
  userId?: number;
  mediaId?: string;
  objectId?: string;
  mediaSentOnly?: boolean;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

export interface AuditLogSummary {
  id: string;
  messageId: string;
  chatId: string;
  timestamp: string;
  mediaSent: boolean;
  selectedMediaId: string | null;
  objectName: string | null;
  userIntent: string;
  selectionReason: string;
}

/**
 * Store audit logs in kb_retrieval_logs table with extended data
 * The existing table structure supports our needs through JSON fields
 */
@Injectable()
export class MediaDecisionAuditService {
  private readonly logger = new Logger(MediaDecisionAuditService.name);

  /**
   * Log a media decision
   *
   * Called every time the AI considers sending media, whether it
   * actually sends it or not.
   */
  async logDecision(params: LogMediaDecisionParams): Promise<string> {
    const auditId = uuidv4();

    const auditData: MediaDecisionAudit = {
      id: auditId,
      messageId: params.messageId,
      chatId: params.chatId,
      userId: params.userId,
      timestamp: new Date().toISOString(),
      mediaSent: params.mediaSent,
      selectedMediaId: params.selectedMediaId || null,
      objectId: params.objectId || null,
      userIntent: params.userIntent,
      queryText: params.queryText,
      selectionReason: params.selectionReason,
      guardrailsApplied: params.guardrailsApplied,
      guardrailFailures: params.guardrailFailures || [],
      candidatesConsidered: params.candidatesConsidered || [],
      similarityScore: params.similarityScore || null,
      rankingScore: params.rankingScore || null,
    };

    // Store in retrieval logs with media-specific data
    await db.insert(kbRetrievalLogs).values({
      id: auditId,
      userId: params.userId,
      chatId: params.chatId,
      messageId: params.messageId,
      queryText: params.queryText,
      retrievedObjectIds: params.objectId ? [params.objectId] : [],
      retrievedChunkIds: [],
      similarityScores: params.similarityScore ? [params.similarityScore] : [],
      topK: 1,
      latencyMs: 0,
      totalResults: params.candidatesConsidered?.length || 0,
      // Store full audit data in JSON-compatible fields
      // Using filterTemplateIds as a carrier for extended audit data
      filterTemplateIds: [JSON.stringify(auditData)],
    });

    this.logger.debug(
      `Logged media decision ${auditId}: mediaSent=${params.mediaSent}, ` +
        `intent="${params.userIntent.substring(0, 50)}"`,
    );

    return auditId;
  }

  /**
   * Get a specific audit log by ID
   */
  async getAuditLog(auditId: string): Promise<MediaDecisionAudit | null> {
    const result = await db
      .select()
      .from(kbRetrievalLogs)
      .where(eq(kbRetrievalLogs.id, auditId))
      .limit(1);

    if (!result[0]) {
      return null;
    }

    // Parse the extended audit data from filterTemplateIds
    const log = result[0];
    if (
      log.filterTemplateIds &&
      Array.isArray(log.filterTemplateIds) &&
      log.filterTemplateIds.length > 0
    ) {
      try {
        return JSON.parse(
          log.filterTemplateIds[0] as string,
        ) as MediaDecisionAudit;
      } catch (e) {
        this.logger.warn(`Failed to parse audit data for ${auditId}`);
      }
    }

    // Return basic info if extended data not available
    return {
      id: log.id,
      messageId: log.messageId || '',
      chatId: log.chatId || '',
      userId: log.userId || 0,
      timestamp: log.createdAt?.toISOString() || '',
      mediaSent: false,
      selectedMediaId: null,
      objectId: null,
      userIntent: '',
      queryText: log.queryText,
      selectionReason: '',
      guardrailsApplied: [],
      guardrailFailures: [],
      candidatesConsidered: [],
      similarityScore: null,
      rankingScore: null,
    };
  }

  /**
   * Query audit logs with filters
   */
  async queryAuditLogs(params: QueryAuditLogsParams): Promise<{
    logs: AuditLogSummary[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const {
      chatId,
      userId,
      mediaId,
      objectId,
      mediaSentOnly,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = params;

    // Build conditions
    const conditions: SQL<unknown>[] = [];

    if (chatId) {
      conditions.push(eq(kbRetrievalLogs.chatId, chatId));
    }

    if (userId) {
      conditions.push(eq(kbRetrievalLogs.userId, userId));
    }

    if (startDate) {
      conditions.push(gte(kbRetrievalLogs.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(kbRetrievalLogs.createdAt, endDate));
    }

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(kbRetrievalLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = Number(countResult[0]?.count || 0);

    // Get paginated results
    const offset = (page - 1) * pageSize;

    const results = await db
      .select()
      .from(kbRetrievalLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(kbRetrievalLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    // Transform to summaries
    const logs: AuditLogSummary[] = results.map((log) => {
      let auditData: Partial<MediaDecisionAudit> = {};

      if (
        log.filterTemplateIds &&
        Array.isArray(log.filterTemplateIds) &&
        log.filterTemplateIds.length > 0
      ) {
        try {
          auditData = JSON.parse(log.filterTemplateIds[0] as string);
        } catch (e) {
          // Ignore parse errors
        }
      }

      return {
        id: log.id,
        messageId: log.messageId || '',
        chatId: log.chatId || '',
        timestamp: log.createdAt?.toISOString() || '',
        mediaSent: auditData.mediaSent || false,
        selectedMediaId: auditData.selectedMediaId || null,
        objectName: null, // Would need join to get
        userIntent: auditData.userIntent || '',
        selectionReason: auditData.selectionReason || '',
      };
    });

    // Filter by mediaSent if requested
    const filteredLogs = mediaSentOnly ? logs.filter((l) => l.mediaSent) : logs;

    // Filter by mediaId/objectId if requested (post-filter since stored in JSON)
    let finalLogs = filteredLogs;
    if (mediaId) {
      finalLogs = finalLogs.filter((l) => l.selectedMediaId === mediaId);
    }

    return {
      logs: finalLogs,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get audit logs for a specific chat
   */
  async getAuditLogsForChat(
    chatId: string,
    limit: number = 20,
  ): Promise<AuditLogSummary[]> {
    const result = await this.queryAuditLogs({
      chatId,
      pageSize: limit,
    });
    return result.logs;
  }

  /**
   * Get audit log for a specific message
   */
  async getAuditLogForMessage(
    messageId: string,
  ): Promise<MediaDecisionAudit | null> {
    const result = await db
      .select()
      .from(kbRetrievalLogs)
      .where(eq(kbRetrievalLogs.messageId, messageId))
      .limit(1);

    if (!result[0]) {
      return null;
    }

    return this.getAuditLog(result[0].id);
  }

  /**
   * Record feedback on a media decision
   */
  async recordFeedback(
    auditId: string,
    feedback: 'correct' | 'incorrect' | 'inappropriate',
    comment?: string,
    correctMediaId?: string,
  ): Promise<void> {
    const existingLog = await db
      .select()
      .from(kbRetrievalLogs)
      .where(eq(kbRetrievalLogs.id, auditId))
      .limit(1);

    if (!existingLog[0]) {
      throw new Error(`Audit log ${auditId} not found`);
    }

    // Update with feedback
    await db
      .update(kbRetrievalLogs)
      .set({
        wasHelpful: feedback === 'correct',
        feedbackAt: new Date(),
      })
      .where(eq(kbRetrievalLogs.id, auditId));

    this.logger.log(`Recorded feedback for audit ${auditId}: ${feedback}`);
  }

  /**
   * Get statistics on media decisions
   */
  async getDecisionStats(
    userId: number,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalDecisions: number;
    mediasSent: number;
    mediasBlocked: number;
    feedbackPositive: number;
    feedbackNegative: number;
    topBlockReasons: Array<{ reason: string; count: number }>;
  }> {
    const conditions = [eq(kbRetrievalLogs.userId, userId)];

    if (startDate) {
      conditions.push(gte(kbRetrievalLogs.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(kbRetrievalLogs.createdAt, endDate));
    }

    const results = await db
      .select()
      .from(kbRetrievalLogs)
      .where(and(...conditions));

    let totalDecisions = 0;
    let mediasSent = 0;
    let mediasBlocked = 0;
    let feedbackPositive = 0;
    let feedbackNegative = 0;
    const blockReasons: Record<string, number> = {};

    for (const log of results) {
      if (
        log.filterTemplateIds &&
        Array.isArray(log.filterTemplateIds) &&
        log.filterTemplateIds.length > 0
      ) {
        try {
          const auditData = JSON.parse(
            log.filterTemplateIds[0] as string,
          ) as MediaDecisionAudit;

          totalDecisions++;

          if (auditData.mediaSent) {
            mediasSent++;
          } else {
            mediasBlocked++;

            // Track block reasons
            for (const failure of auditData.guardrailFailures || []) {
              const reason = failure.rule;
              blockReasons[reason] = (blockReasons[reason] || 0) + 1;
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      if (log.wasHelpful === true) {
        feedbackPositive++;
      } else if (log.wasHelpful === false) {
        feedbackNegative++;
      }
    }

    // Sort block reasons by count
    const topBlockReasons = Object.entries(blockReasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalDecisions,
      mediasSent,
      mediasBlocked,
      feedbackPositive,
      feedbackNegative,
      topBlockReasons,
    };
  }
}
