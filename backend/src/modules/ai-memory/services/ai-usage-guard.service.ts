import { AiContextConfig } from '@config/ai-context.config';
import {
  aiOperationLogs,
  aiUsageDailyLimits,
  NewAiOperationLog,
} from '@database/ai-context.schema';
import { db } from '@database/db.connection';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql } from 'drizzle-orm';

/**
 * Operation types for logging and tracking
 */
export enum AiOperationType {
  SUMMARY_UPDATE = 'summary_update',
  SUMMARY_INITIAL = 'summary_initial',
  AI_REPLY = 'ai_reply',
  CONTEXT_BUILD = 'context_build',
}

/**
 * Trigger reasons for audit trail
 */
export enum AiTriggerReason {
  MESSAGE_THRESHOLD = 'message_threshold',
  STALENESS_TIMEOUT = 'staleness_timeout',
  USER_REQUEST = 'user_request',
  AI_REPLY_NEEDED = 'ai_reply_needed',
  MANUAL_REFRESH = 'manual_refresh',
}

/**
 * Result of usage check
 */
export interface UsageCheckResult {
  allowed: boolean;
  reason?: string;
  currentCalls: number;
  maxCalls: number;
  currentTokens: number;
  maxTokens: number;
  currentCostCents: number;
  maxCostCents: number;
  usagePercent: number;
  isWarning: boolean;
}

/**
 * AI Usage Guard Service
 *
 * Provides cost control and usage tracking for AI operations.
 *
 * Responsibilities:
 * - Check if user can make AI calls (within limits)
 * - Track daily usage (calls, tokens, cost)
 * - Log every AI operation with audit trail
 * - Provide usage statistics
 *
 * Design principles:
 * - Every AI call MUST go through this guard
 * - Hard limits are non-negotiable
 * - Full audit trail for debugging and billing
 * - Daily reset at midnight UTC
 */
@Injectable()
export class AiUsageGuardService {
  private readonly logger = new Logger(AiUsageGuardService.name);
  private readonly config: AiContextConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<AiContextConfig>('aiContext')!;
  }

  /**
   * Check if user can make an AI call
   * Call this BEFORE every AI operation
   */
  async checkUsage(userId: number): Promise<UsageCheckResult> {
    const today = this.getTodayDate();
    const limits = this.config.limits;

    // Get or create today's usage record
    const usage = await this.getOrCreateDailyUsage(userId, today);

    const usagePercent = Math.max(
      (usage.totalCallsCount / limits.maxCallsPerDayPerAccount) * 100,
      ((usage.totalInputTokens + usage.totalOutputTokens) /
        limits.maxTokensPerDayPerAccount) *
        100,
      (usage.estimatedCostCents / limits.maxCostCentsPerDayPerAccount) * 100,
    );

    const isWarning = usagePercent >= limits.warningThresholdPercent;
    const totalTokens = usage.totalInputTokens + usage.totalOutputTokens;

    // Check each limit
    if (usage.totalCallsCount >= limits.maxCallsPerDayPerAccount) {
      return {
        allowed: false,
        reason: `Daily call limit reached (${usage.totalCallsCount}/${limits.maxCallsPerDayPerAccount})`,
        currentCalls: usage.totalCallsCount,
        maxCalls: limits.maxCallsPerDayPerAccount,
        currentTokens: totalTokens,
        maxTokens: limits.maxTokensPerDayPerAccount,
        currentCostCents: usage.estimatedCostCents,
        maxCostCents: limits.maxCostCentsPerDayPerAccount,
        usagePercent,
        isWarning: true,
      };
    }

    if (totalTokens >= limits.maxTokensPerDayPerAccount) {
      return {
        allowed: false,
        reason: `Daily token limit reached (${totalTokens}/${limits.maxTokensPerDayPerAccount})`,
        currentCalls: usage.totalCallsCount,
        maxCalls: limits.maxCallsPerDayPerAccount,
        currentTokens: totalTokens,
        maxTokens: limits.maxTokensPerDayPerAccount,
        currentCostCents: usage.estimatedCostCents,
        maxCostCents: limits.maxCostCentsPerDayPerAccount,
        usagePercent,
        isWarning: true,
      };
    }

    if (usage.estimatedCostCents >= limits.maxCostCentsPerDayPerAccount) {
      return {
        allowed: false,
        reason: `Daily cost limit reached ($${(usage.estimatedCostCents / 100).toFixed(2)}/$${(limits.maxCostCentsPerDayPerAccount / 100).toFixed(2)})`,
        currentCalls: usage.totalCallsCount,
        maxCalls: limits.maxCallsPerDayPerAccount,
        currentTokens: totalTokens,
        maxTokens: limits.maxTokensPerDayPerAccount,
        currentCostCents: usage.estimatedCostCents,
        maxCostCents: limits.maxCostCentsPerDayPerAccount,
        usagePercent,
        isWarning: true,
      };
    }

    return {
      allowed: true,
      currentCalls: usage.totalCallsCount,
      maxCalls: limits.maxCallsPerDayPerAccount,
      currentTokens: totalTokens,
      maxTokens: limits.maxTokensPerDayPerAccount,
      currentCostCents: usage.estimatedCostCents,
      maxCostCents: limits.maxCostCentsPerDayPerAccount,
      usagePercent,
      isWarning,
    };
  }

  /**
   * Record an AI operation (call this AFTER successful operation)
   */
  async recordOperation(params: {
    userId: number;
    chatId?: string;
    operationType: AiOperationType;
    triggerReason: AiTriggerReason;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostCents: number;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const today = this.getTodayDate();

    // Determine if this is a summary call or reply call
    const isSummaryCall =
      params.operationType === AiOperationType.SUMMARY_UPDATE ||
      params.operationType === AiOperationType.SUMMARY_INITIAL;

    // Update daily usage
    await this.incrementDailyUsage(
      params.userId,
      today,
      params.inputTokens,
      params.outputTokens,
      params.estimatedCostCents,
      isSummaryCall,
    );

    // Log the operation if enabled
    if (this.config.logging.enabled) {
      const log: NewAiOperationLog = {
        userId: params.userId,
        chatId: params.chatId,
        operationType: params.operationType,
        triggerReason: params.triggerReason,
        modelUsed: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        totalTokens: params.totalTokens,
        estimatedCostCents: params.estimatedCostCents,
        latencyMs: params.latencyMs,
        status: 'success',
        metadata: params.metadata,
      };

      await db.insert(aiOperationLogs).values(log);
    }

    this.logger.debug(
      `Recorded AI operation: ${params.operationType} for user ${params.userId}, ` +
        `tokens: ${params.totalTokens}, cost: $${(params.estimatedCostCents / 100).toFixed(4)}`,
    );
  }

  /**
   * Record a failed AI operation
   */
  async recordFailure(params: {
    userId: number;
    chatId?: string;
    operationType: AiOperationType;
    triggerReason: AiTriggerReason;
    model: string;
    errorMessage: string;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (this.config.logging.enabled) {
      const log: NewAiOperationLog = {
        userId: params.userId,
        chatId: params.chatId,
        operationType: params.operationType,
        triggerReason: params.triggerReason,
        modelUsed: params.model,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostCents: 0,
        latencyMs: params.latencyMs,
        status: 'failed',
        errorMessage: params.errorMessage,
        metadata: params.metadata,
      };

      await db.insert(aiOperationLogs).values(log);
    }

    this.logger.warn(
      `AI operation failed: ${params.operationType} for user ${params.userId}: ${params.errorMessage}`,
    );
  }

  /**
   * Get usage statistics for a user
   */
  async getUsageStats(
    userId: number,
    days: number = 7,
  ): Promise<{
    daily: Array<{
      date: string;
      calls: number;
      tokens: number;
      costCents: number;
    }>;
    total: {
      calls: number;
      tokens: number;
      costCents: number;
    };
  }> {
    const results = await db
      .select({
        date: aiUsageDailyLimits.usageDate,
        calls: aiUsageDailyLimits.totalCallsCount,
        inputTokens: aiUsageDailyLimits.totalInputTokens,
        outputTokens: aiUsageDailyLimits.totalOutputTokens,
        costCents: aiUsageDailyLimits.estimatedCostCents,
      })
      .from(aiUsageDailyLimits)
      .where(eq(aiUsageDailyLimits.userId, userId))
      .orderBy(desc(aiUsageDailyLimits.usageDate))
      .limit(days);

    const daily = results.map((r) => ({
      date: r.date,
      calls: r.calls,
      tokens: r.inputTokens + r.outputTokens,
      costCents: r.costCents,
    }));

    const total = daily.reduce(
      (acc, d) => ({
        calls: acc.calls + d.calls,
        tokens: acc.tokens + d.tokens,
        costCents: acc.costCents + d.costCents,
      }),
      { calls: 0, tokens: 0, costCents: 0 },
    );

    return { daily, total };
  }

  /**
   * Estimate cost for an operation (call before execution)
   */
  estimateCost(params: {
    model: string;
    promptTokens: number;
    completionTokens: number;
  }): number {
    // Cost per 1M tokens (in cents) - GPT-4o-mini pricing
    const pricing: Record<string, { prompt: number; completion: number }> = {
      'gpt-4o-mini': { prompt: 15, completion: 60 }, // $0.15/$0.60 per 1M tokens
      'gpt-4o': { prompt: 250, completion: 1000 }, // $2.50/$10 per 1M tokens
      'gpt-4-turbo': { prompt: 1000, completion: 3000 }, // $10/$30 per 1M tokens
      default: { prompt: 15, completion: 60 }, // Default to cheapest
    };

    const modelPricing = pricing[params.model] || pricing.default;
    const promptCost = (params.promptTokens / 1_000_000) * modelPricing.prompt;
    const completionCost =
      (params.completionTokens / 1_000_000) * modelPricing.completion;

    return Math.ceil((promptCost + completionCost) * 100); // Convert to cents
  }

  // ==================== Private Methods ====================

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD in UTC
  }

  private async getOrCreateDailyUsage(userId: number, date: string) {
    const existing = await db
      .select()
      .from(aiUsageDailyLimits)
      .where(
        and(
          eq(aiUsageDailyLimits.userId, userId),
          eq(aiUsageDailyLimits.usageDate, date),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    // Create new record
    const [newRecord] = await db
      .insert(aiUsageDailyLimits)
      .values({
        userId,
        usageDate: date,
        summaryCallsCount: 0,
        aiReplyCallsCount: 0,
        totalCallsCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedCostCents: 0,
        limitReached: false,
      })
      .returning();

    return newRecord;
  }

  private async incrementDailyUsage(
    userId: number,
    date: string,
    inputTokens: number,
    outputTokens: number,
    costCents: number,
    isSummaryCall: boolean,
  ): Promise<void> {
    const limits = this.config.limits;
    const totalTokens = inputTokens + outputTokens;

    await db
      .update(aiUsageDailyLimits)
      .set({
        summaryCallsCount: isSummaryCall
          ? sql`${aiUsageDailyLimits.summaryCallsCount} + 1`
          : sql`${aiUsageDailyLimits.summaryCallsCount}`,
        aiReplyCallsCount: !isSummaryCall
          ? sql`${aiUsageDailyLimits.aiReplyCallsCount} + 1`
          : sql`${aiUsageDailyLimits.aiReplyCallsCount}`,
        totalCallsCount: sql`${aiUsageDailyLimits.totalCallsCount} + 1`,
        totalInputTokens: sql`${aiUsageDailyLimits.totalInputTokens} + ${inputTokens}`,
        totalOutputTokens: sql`${aiUsageDailyLimits.totalOutputTokens} + ${outputTokens}`,
        estimatedCostCents: sql`${aiUsageDailyLimits.estimatedCostCents} + ${costCents}`,
        limitReached: sql`
          CASE WHEN 
            ${aiUsageDailyLimits.totalCallsCount} + 1 >= ${limits.maxCallsPerDayPerAccount}
            OR ${aiUsageDailyLimits.totalInputTokens} + ${aiUsageDailyLimits.totalOutputTokens} + ${totalTokens} >= ${limits.maxTokensPerDayPerAccount}
            OR ${aiUsageDailyLimits.estimatedCostCents} + ${costCents} >= ${limits.maxCostCentsPerDayPerAccount}
          THEN true ELSE ${aiUsageDailyLimits.limitReached} END
        `,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiUsageDailyLimits.userId, userId),
          eq(aiUsageDailyLimits.usageDate, date),
        ),
      );
  }
}
