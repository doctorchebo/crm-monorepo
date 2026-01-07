/**
 * Usage Tracking Service
 * Tracks AI token consumption and costs for billing and throttling
 *
 * Features:
 * - Log token usage per message
 * - Calculate costs based on provider/model
 * - Aggregate usage statistics
 * - Support for billing periods
 */

import { db } from '@database/db.connection';
import {
  aiUsageLogs,
  chats,
  usageLimits,
  type AiUsageLog,
} from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

export interface LogUsageRequest {
  userId: number;
  chatId?: string;
  messageId?: number;
  providerName: string;
  model?: string;
  operationType?: string;
  inputTokens?: number;
  outputTokens?: number;
  tokensUsed?: number;
  cost?: string;
}

export interface UsageSummary {
  totalTokens: number;
  totalCost: number;
  requestCount: number;
  byProvider: Record<
    string,
    { tokens: number; cost: number; requests: number }
  >;
  byOperationType: Record<
    string,
    { tokens: number; cost: number; requests: number }
  >;
  periodStart: Date;
  periodEnd: Date;
}

export interface UsageStatus {
  currentUsage: number;
  limit: number;
  percentUsed: number;
  remaining: number;
  isAtLimit: boolean;
  isNearLimit: boolean;
  limitType: string;
  limitPeriod: string;
  periodEnd?: Date;
}

// Cost per 1M tokens (in dollars)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
};

@Injectable()
export class UsageTrackingService {
  private readonly logger = new Logger(UsageTrackingService.name);

  /**
   * Log AI usage for a message
   */
  async logUsage(request: LogUsageRequest): Promise<string> {
    const inputTokens = request.inputTokens || 0;
    const outputTokens = request.outputTokens || 0;
    const totalTokens = request.tokensUsed || inputTokens + outputTokens;

    // Calculate cost if not provided
    const cost =
      request.cost ||
      this.calculateCost(
        request.model || 'gpt-4o-mini',
        inputTokens,
        outputTokens,
      );

    // Get chat ID (numeric) if only chatId string is provided
    let chatIdNumeric: number | undefined;
    if (request.chatId) {
      const [chat] = await db
        .select({ id: chats.id })
        .from(chats)
        .where(eq(chats.chatId, request.chatId))
        .limit(1);
      chatIdNumeric = chat?.id;
    }

    try {
      const [log] = await db
        .insert(aiUsageLogs)
        .values({
          userId: request.userId,
          chatId: chatIdNumeric,
          messageId: request.messageId,
          providerName: request.providerName,
          model: request.model,
          operationType: request.operationType,
          inputTokens,
          outputTokens,
          tokensUsed: totalTokens,
          cost,
        })
        .returning({ id: aiUsageLogs.id });

      // Update usage limits
      await this.updateUsageLimits(
        request.userId,
        totalTokens,
        parseFloat(cost),
      );

      this.logger.debug(
        `Logged AI usage: ${totalTokens} tokens, $${cost} for user ${request.userId}`,
      );

      return log.id;
    } catch (error) {
      this.logger.error(`Failed to log AI usage: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get usage summary for a user
   */
  async getUsageSummary(
    userId: number,
    options?: {
      startDate?: Date;
      endDate?: Date;
      period?: 'daily' | 'weekly' | 'monthly' | 'all';
    },
  ): Promise<UsageSummary> {
    const { period = 'monthly' } = options || {};

    // Calculate period bounds
    const now = new Date();
    let startDate = options?.startDate;
    let endDate = options?.endDate || now;

    if (!startDate) {
      startDate = new Date();
      switch (period) {
        case 'daily':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'weekly':
          startDate.setDate(startDate.getDate() - startDate.getDay());
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'monthly':
          startDate.setDate(1);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'all':
          startDate = new Date(0); // Beginning of time
          break;
      }
    }

    const conditions = [eq(aiUsageLogs.userId, userId)];
    if (startDate) {
      conditions.push(gte(aiUsageLogs.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(aiUsageLogs.createdAt, endDate));
    }

    const logs = await db
      .select()
      .from(aiUsageLogs)
      .where(and(...conditions))
      .orderBy(desc(aiUsageLogs.createdAt));

    const summary: UsageSummary = {
      totalTokens: 0,
      totalCost: 0,
      requestCount: logs.length,
      byProvider: {},
      byOperationType: {},
      periodStart: startDate,
      periodEnd: endDate,
    };

    for (const log of logs) {
      const tokens = log.tokensUsed || 0;
      const cost = parseFloat(log.cost || '0');

      summary.totalTokens += tokens;
      summary.totalCost += cost;

      // By provider
      const provider = log.providerName;
      if (!summary.byProvider[provider]) {
        summary.byProvider[provider] = { tokens: 0, cost: 0, requests: 0 };
      }
      summary.byProvider[provider].tokens += tokens;
      summary.byProvider[provider].cost += cost;
      summary.byProvider[provider].requests += 1;

      // By operation type
      const opType = log.operationType || 'unknown';
      if (!summary.byOperationType[opType]) {
        summary.byOperationType[opType] = { tokens: 0, cost: 0, requests: 0 };
      }
      summary.byOperationType[opType].tokens += tokens;
      summary.byOperationType[opType].cost += cost;
      summary.byOperationType[opType].requests += 1;
    }

    return summary;
  }

  /**
   * Get usage for a specific chat
   */
  async getChatUsage(
    chatId: string,
    options?: { limit?: number },
  ): Promise<AiUsageLog[]> {
    const { limit = 100 } = options || {};

    // Get numeric chat ID
    const [chat] = await db
      .select({ id: chats.id })
      .from(chats)
      .where(eq(chats.chatId, chatId))
      .limit(1);

    if (!chat) {
      return [];
    }

    return db
      .select()
      .from(aiUsageLogs)
      .where(eq(aiUsageLogs.chatId, chat.id))
      .orderBy(desc(aiUsageLogs.createdAt))
      .limit(limit);
  }

  /**
   * Get current usage status against limits
   */
  async getUsageStatus(userId: number): Promise<UsageStatus[]> {
    const limits = await db
      .select()
      .from(usageLimits)
      .where(
        and(eq(usageLimits.userId, userId), eq(usageLimits.isActive, true)),
      );

    const statuses: UsageStatus[] = [];

    for (const limit of limits) {
      const percentUsed =
        limit.limitValue > 0
          ? Math.round(((limit.currentUsage || 0) / limit.limitValue) * 100)
          : 0;

      statuses.push({
        currentUsage: limit.currentUsage || 0,
        limit: limit.limitValue,
        percentUsed,
        remaining: Math.max(0, limit.limitValue - (limit.currentUsage || 0)),
        isAtLimit: (limit.currentUsage || 0) >= limit.limitValue,
        isNearLimit: percentUsed >= (limit.warningThreshold || 80),
        limitType: limit.limitType,
        limitPeriod: limit.limitPeriod,
        periodEnd: limit.periodEnd || undefined,
      });
    }

    return statuses;
  }

  /**
   * Check if user has exceeded any limits
   */
  async isLimitExceeded(userId: number): Promise<{
    exceeded: boolean;
    limits: Array<{ type: string; period: string; action: string }>;
  }> {
    const limits = await db
      .select()
      .from(usageLimits)
      .where(
        and(eq(usageLimits.userId, userId), eq(usageLimits.isActive, true)),
      );

    const exceededLimits = limits.filter(
      (l) => (l.currentUsage || 0) >= l.limitValue,
    );

    return {
      exceeded: exceededLimits.length > 0,
      limits: exceededLimits.map((l) => ({
        type: l.limitType,
        period: l.limitPeriod,
        action: l.actionOnLimit || 'pause',
      })),
    };
  }

  /**
   * Set a usage limit for a user
   */
  async setLimit(
    userId: number,
    limitType: 'tokens' | 'cost' | 'requests',
    limitPeriod: 'daily' | 'weekly' | 'monthly' | 'total',
    limitValue: number,
    options?: {
      warningThreshold?: number;
      actionOnLimit?: 'pause' | 'notify' | 'block';
    },
  ): Promise<string> {
    const periodEnd = this.calculatePeriodEnd(limitPeriod);

    const [result] = await db
      .insert(usageLimits)
      .values({
        userId,
        limitType,
        limitPeriod,
        limitValue,
        warningThreshold: options?.warningThreshold || 80,
        actionOnLimit: options?.actionOnLimit || 'pause',
        periodEnd,
      })
      .onConflictDoUpdate({
        target: [
          usageLimits.userId,
          usageLimits.limitType,
          usageLimits.limitPeriod,
        ],
        set: {
          limitValue,
          warningThreshold: options?.warningThreshold || 80,
          actionOnLimit: options?.actionOnLimit || 'pause',
          periodEnd,
          updatedAt: new Date(),
        },
      })
      .returning({ id: usageLimits.id });

    this.logger.log(
      `Set ${limitType} limit for user ${userId}: ${limitValue} per ${limitPeriod}`,
    );

    return result.id;
  }

  /**
   * Remove a usage limit
   */
  async removeLimit(
    userId: number,
    limitType: string,
    limitPeriod: string,
  ): Promise<boolean> {
    const result = await db
      .delete(usageLimits)
      .where(
        and(
          eq(usageLimits.userId, userId),
          eq(usageLimits.limitType, limitType),
          eq(usageLimits.limitPeriod, limitPeriod),
        ),
      )
      .returning({ id: usageLimits.id });

    return result.length > 0;
  }

  /**
   * Reset period usage counters
   */
  async resetPeriodUsage(
    limitPeriod: 'daily' | 'weekly' | 'monthly',
  ): Promise<number> {
    const now = new Date();

    const result = await db
      .update(usageLimits)
      .set({
        currentUsage: 0,
        periodStart: now,
        periodEnd: this.calculatePeriodEnd(limitPeriod),
        updatedAt: now,
      })
      .where(
        and(
          eq(usageLimits.limitPeriod, limitPeriod),
          lte(usageLimits.periodEnd, now),
        ),
      )
      .returning({ id: usageLimits.id });

    if (result.length > 0) {
      this.logger.log(`Reset ${result.length} ${limitPeriod} usage limits`);
    }

    return result.length;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): string {
    const costs = MODEL_COSTS[model] || MODEL_COSTS['gpt-4o-mini'];

    const inputCost = (inputTokens / 1_000_000) * costs.input;
    const outputCost = (outputTokens / 1_000_000) * costs.output;
    const totalCost = inputCost + outputCost;

    return totalCost.toFixed(6);
  }

  private async updateUsageLimits(
    userId: number,
    tokens: number,
    cost: number,
  ): Promise<void> {
    const now = new Date();

    // Update token limits
    await db
      .update(usageLimits)
      .set({
        currentUsage: sql`${usageLimits.currentUsage} + ${tokens}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(usageLimits.userId, userId),
          eq(usageLimits.limitType, 'tokens'),
          eq(usageLimits.isActive, true),
        ),
      );

    // Update cost limits (stored in cents)
    const costCents = Math.round(cost * 100);
    await db
      .update(usageLimits)
      .set({
        currentUsage: sql`${usageLimits.currentUsage} + ${costCents}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(usageLimits.userId, userId),
          eq(usageLimits.limitType, 'cost'),
          eq(usageLimits.isActive, true),
        ),
      );

    // Update request limits
    await db
      .update(usageLimits)
      .set({
        currentUsage: sql`${usageLimits.currentUsage} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(usageLimits.userId, userId),
          eq(usageLimits.limitType, 'requests'),
          eq(usageLimits.isActive, true),
        ),
      );
  }

  private calculatePeriodEnd(period: string): Date {
    const end = new Date();
    switch (period) {
      case 'daily':
        end.setDate(end.getDate() + 1);
        end.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        end.setDate(end.getDate() + (7 - end.getDay()));
        end.setHours(23, 59, 59, 999);
        break;
      case 'monthly':
        end.setMonth(end.getMonth() + 1);
        end.setDate(1);
        end.setHours(0, 0, 0, 0);
        break;
      case 'total':
        end.setFullYear(2099); // Far future
        break;
    }
    return end;
  }
}
