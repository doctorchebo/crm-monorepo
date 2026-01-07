/**
 * Policy Simulation Service
 * Simulates potential ban or policy violations for testing and prevention
 *
 * Features:
 * - Simulate rate limit violations
 * - Simulate window expiration scenarios
 * - Simulate unapproved template usage
 * - Log all violations for analysis
 */

import { db } from '@database/db.connection';
import {
  policyViolationLogs,
  senders,
  templateLocales,
} from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, eq, gte } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

export type ViolationType =
  | 'rate_limit'
  | 'window_expired'
  | 'template_unapproved'
  | 'content_blocked'
  | 'ban_risk';

export type ViolationSeverity = 'info' | 'warning' | 'critical';

export type ViolationAction = 'blocked' | 'warned' | 'logged' | 'simulated';

export interface ViolationDetails {
  violationType: ViolationType;
  severity: ViolationSeverity;
  description: string;
  details: Record<string, unknown>;
  actionTaken: ViolationAction;
  isSimulated: boolean;
}

export interface SimulationScenario {
  name: string;
  type: ViolationType;
  description: string;
  parameters: Record<string, unknown>;
}

export interface SimulationResult {
  scenario: string;
  passed: boolean;
  violation?: ViolationDetails;
  recommendations: string[];
}

// ============================================================================
// Predefined Scenarios
// ============================================================================

export const SIMULATION_SCENARIOS: SimulationScenario[] = [
  {
    name: 'Rate Limit Burst',
    type: 'rate_limit',
    description: 'Simulates sending 100 messages in 1 minute',
    parameters: { messagesPerMinute: 100, durationSeconds: 60 },
  },
  {
    name: 'Window Expiration',
    type: 'window_expired',
    description: 'Simulates attempting to send after 24h window',
    parameters: { hoursSinceLastCustomerMessage: 25 },
  },
  {
    name: 'Unapproved Template',
    type: 'template_unapproved',
    description: 'Simulates using a template not approved by Meta',
    parameters: { templateStatus: 'rejected' },
  },
  {
    name: 'Daily Limit Exceeded',
    type: 'rate_limit',
    description: 'Simulates exceeding daily message limit',
    parameters: { messagesPerDay: 1000, limit: 500 },
  },
  {
    name: 'Spam Detection Risk',
    type: 'ban_risk',
    description: 'Simulates sending identical messages to multiple recipients',
    parameters: { identicalMessages: 50, uniqueRecipients: 50 },
  },
  {
    name: 'Quality Rating Decline',
    type: 'ban_risk',
    description: 'Simulates quality rating dropping to RED',
    parameters: { qualityRating: 'RED', previousRating: 'GREEN' },
  },
];

@Injectable()
export class PolicySimulationService {
  private readonly logger = new Logger(PolicySimulationService.name);

  /**
   * Run a specific simulation scenario
   */
  async runSimulation(
    userId: number,
    scenarioName: string,
    options?: {
      chatId?: string;
      senderId?: number;
      messageId?: string;
    },
  ): Promise<SimulationResult> {
    const scenario = SIMULATION_SCENARIOS.find((s) => s.name === scenarioName);

    if (!scenario) {
      throw new Error(`Unknown simulation scenario: ${scenarioName}`);
    }

    this.logger.log(`Running simulation: ${scenarioName} for user ${userId}`);

    const result = await this.executeScenario(userId, scenario, options);

    // Log the simulation
    if (result.violation) {
      await this.logViolation({
        userId,
        chatId: options?.chatId,
        messageId: options?.messageId,
        senderId: options?.senderId,
        ...result.violation,
      });
    }

    return result;
  }

  /**
   * Run all simulation scenarios
   */
  async runAllSimulations(
    userId: number,
    options?: {
      chatId?: string;
      senderId?: number;
    },
  ): Promise<SimulationResult[]> {
    const results: SimulationResult[] = [];

    for (const scenario of SIMULATION_SCENARIOS) {
      const result = await this.runSimulation(userId, scenario.name, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute a specific scenario
   */
  private async executeScenario(
    userId: number,
    scenario: SimulationScenario,
    options?: {
      chatId?: string;
      senderId?: number;
      messageId?: string;
    },
  ): Promise<SimulationResult> {
    switch (scenario.type) {
      case 'rate_limit':
        return this.simulateRateLimitViolation(scenario);

      case 'window_expired':
        return this.simulateWindowExpiration(scenario);

      case 'template_unapproved':
        return this.simulateUnapprovedTemplate(userId, scenario);

      case 'ban_risk':
        return this.simulateBanRisk(userId, scenario, options?.senderId);

      case 'content_blocked':
        return this.simulateContentBlocked(scenario);

      default:
        return {
          scenario: scenario.name,
          passed: true,
          recommendations: ['Unknown scenario type'],
        };
    }
  }

  /**
   * Simulate rate limit violation
   */
  private simulateRateLimitViolation(
    scenario: SimulationScenario,
  ): SimulationResult {
    const { messagesPerMinute, messagesPerDay, limit } =
      scenario.parameters as {
        messagesPerMinute?: number;
        messagesPerDay?: number;
        limit?: number;
      };

    const recommendations: string[] = [];
    let violated = false;
    let severity: ViolationSeverity = 'warning';

    if (messagesPerMinute && messagesPerMinute > 30) {
      violated = true;
      severity = messagesPerMinute > 60 ? 'critical' : 'warning';
      recommendations.push(
        'Implement exponential backoff between messages',
        'Use queue-based message sending with delays',
        'Monitor real-time rate limits from Meta API',
      );
    }

    if (messagesPerDay && limit && messagesPerDay > limit) {
      violated = true;
      severity = 'critical';
      recommendations.push(
        `Daily limit of ${limit} exceeded (attempted: ${messagesPerDay})`,
        'Implement daily quota tracking per sender',
        'Consider upgrading messaging tier with Meta',
      );
    }

    return {
      scenario: scenario.name,
      passed: !violated,
      violation: violated
        ? {
            violationType: 'rate_limit',
            severity,
            description: `Rate limit would be exceeded: ${JSON.stringify(scenario.parameters)}`,
            details: scenario.parameters,
            actionTaken: 'simulated',
            isSimulated: true,
          }
        : undefined,
      recommendations,
    };
  }

  /**
   * Simulate window expiration
   */
  private simulateWindowExpiration(
    scenario: SimulationScenario,
  ): SimulationResult {
    const { hoursSinceLastCustomerMessage } = scenario.parameters as {
      hoursSinceLastCustomerMessage: number;
    };

    const violated = hoursSinceLastCustomerMessage > 24;

    return {
      scenario: scenario.name,
      passed: !violated,
      violation: violated
        ? {
            violationType: 'window_expired',
            severity: 'critical',
            description: `24-hour window expired (${hoursSinceLastCustomerMessage}h since last customer message)`,
            details: { hoursSinceLastCustomerMessage },
            actionTaken: 'simulated',
            isSimulated: true,
          }
        : undefined,
      recommendations: violated
        ? [
            'Use approved template messages for re-engagement',
            'Implement window tracking before each message',
            'Queue messages for later if approaching window limit',
          ]
        : [],
    };
  }

  /**
   * Simulate unapproved template usage
   */
  private async simulateUnapprovedTemplate(
    userId: number,
    scenario: SimulationScenario,
  ): Promise<SimulationResult> {
    // Check for any rejected templates
    const rejectedTemplates = await db
      .select()
      .from(templateLocales)
      .where(eq(templateLocales.approvalStatus, 'rejected'))
      .limit(5);

    const violated = rejectedTemplates.length > 0;

    return {
      scenario: scenario.name,
      passed: !violated,
      violation: violated
        ? {
            violationType: 'template_unapproved',
            severity: 'critical',
            description: `Found ${rejectedTemplates.length} rejected templates that cannot be used`,
            details: {
              rejectedTemplates: rejectedTemplates.map((t) => ({
                id: t.id,
                locale: t.locale,
                reason: t.rejectionReason,
              })),
            },
            actionTaken: 'simulated',
            isSimulated: true,
          }
        : undefined,
      recommendations: violated
        ? [
            'Review and fix rejected template content',
            'Ensure templates follow Meta guidelines',
            'Only use templates with "approved" status',
          ]
        : [],
    };
  }

  /**
   * Simulate ban risk scenarios
   */
  private async simulateBanRisk(
    userId: number,
    scenario: SimulationScenario,
    senderId?: number,
  ): Promise<SimulationResult> {
    const { qualityRating, identicalMessages, uniqueRecipients } =
      scenario.parameters as {
        qualityRating?: string;
        identicalMessages?: number;
        uniqueRecipients?: number;
      };

    const recommendations: string[] = [];
    let violated = false;
    let severity: ViolationSeverity = 'warning';
    let description = '';
    const details: Record<string, unknown> = scenario.parameters;

    // Check quality rating
    if (qualityRating === 'RED') {
      violated = true;
      severity = 'critical';
      description = 'Quality rating is RED - high ban risk';
      recommendations.push(
        'Immediately reduce message volume',
        'Review recent messages for spam-like patterns',
        'Check for user complaints or blocks',
        'Consider pausing automation temporarily',
      );
    }

    // Check for spam patterns
    if (
      identicalMessages &&
      uniqueRecipients &&
      identicalMessages >= uniqueRecipients
    ) {
      violated = true;
      severity = identicalMessages > 30 ? 'critical' : 'warning';
      description = `Spam pattern detected: ${identicalMessages} identical messages to ${uniqueRecipients} recipients`;
      recommendations.push(
        'Add personalization to messages',
        'Implement message variation',
        'Use templates with dynamic variables',
        'Space out bulk sends over time',
      );
    }

    // Check actual sender quality if senderId provided
    if (senderId) {
      const [sender] = await db
        .select()
        .from(senders)
        .where(eq(senders.id, senderId))
        .limit(1);

      if (sender?.qualityRating === 'RED') {
        violated = true;
        severity = 'critical';
        description = `Sender ${sender.phoneNumber} has RED quality rating`;
        details.actualQualityRating = sender.qualityRating;
        recommendations.push(
          'This sender is at high risk of ban',
          'Review recent message content and patterns',
          'Consider using a different sender number',
        );
      }
    }

    return {
      scenario: scenario.name,
      passed: !violated,
      violation: violated
        ? {
            violationType: 'ban_risk',
            severity,
            description,
            details,
            actionTaken: 'simulated',
            isSimulated: true,
          }
        : undefined,
      recommendations,
    };
  }

  /**
   * Simulate content blocked
   */
  private simulateContentBlocked(
    scenario: SimulationScenario,
  ): SimulationResult {
    return {
      scenario: scenario.name,
      passed: true,
      recommendations: [
        'Implement content moderation before sending',
        'Check messages against blocked word lists',
        'Use AI content filtering for sensitive topics',
      ],
    };
  }

  /**
   * Log a policy violation
   */
  async logViolation(data: {
    userId?: number;
    chatId?: string;
    messageId?: string;
    senderId?: number;
    violationType: ViolationType;
    severity: ViolationSeverity;
    description: string;
    details: Record<string, unknown>;
    actionTaken: ViolationAction;
    isSimulated: boolean;
  }): Promise<string> {
    const [log] = await db
      .insert(policyViolationLogs)
      .values({
        userId: data.userId,
        chatId: data.chatId,
        messageId: data.messageId,
        senderId: data.senderId,
        violationType: data.violationType,
        severity: data.severity,
        description: data.description,
        details: data.details,
        actionTaken: data.actionTaken,
        isSimulated: data.isSimulated,
      })
      .returning({ id: policyViolationLogs.id });

    return log.id;
  }

  /**
   * Get violation logs for a user
   */
  async getViolationLogs(
    userId: number,
    options?: {
      limit?: number;
      includeSimulated?: boolean;
      severity?: ViolationSeverity;
      startDate?: Date;
    },
  ): Promise<Array<typeof policyViolationLogs.$inferSelect>> {
    const {
      limit = 50,
      includeSimulated = true,
      severity,
      startDate,
    } = options || {};

    let query = db.select().from(policyViolationLogs);

    // Build conditions
    const conditions = [eq(policyViolationLogs.userId, userId)];

    if (!includeSimulated) {
      conditions.push(eq(policyViolationLogs.isSimulated, false));
    }

    if (severity) {
      conditions.push(eq(policyViolationLogs.severity, severity));
    }

    if (startDate) {
      conditions.push(gte(policyViolationLogs.createdAt, startDate));
    }

    const logs = await query.where(and(...conditions)).limit(limit);

    return logs;
  }

  /**
   * Get violation statistics
   */
  async getViolationStats(
    userId: number,
    options?: {
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<{
    total: number;
    byType: Record<ViolationType, number>;
    bySeverity: Record<ViolationSeverity, number>;
    simulated: number;
    real: number;
  }> {
    const logs = await this.getViolationLogs(userId, {
      limit: 1000,
      startDate: options?.startDate,
    });

    const stats = {
      total: logs.length,
      byType: {} as Record<ViolationType, number>,
      bySeverity: {} as Record<ViolationSeverity, number>,
      simulated: 0,
      real: 0,
    };

    for (const log of logs) {
      // By type
      const type = log.violationType as ViolationType;
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      // By severity
      const severity = log.severity as ViolationSeverity;
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;

      // Simulated vs real
      if (log.isSimulated) {
        stats.simulated++;
      } else {
        stats.real++;
      }
    }

    return stats;
  }

  /**
   * Get available simulation scenarios
   */
  getAvailableScenarios(): SimulationScenario[] {
    return SIMULATION_SCENARIOS;
  }
}
