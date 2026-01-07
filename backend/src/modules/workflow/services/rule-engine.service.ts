/**
 * Rule Engine Service
 * Evaluates workflow rules against messages for automatic stage transitions
 *
 * Features:
 * - Rule evaluation with priority ordering
 * - Keyword, sentiment, category, and intent matching
 * - AI-powered classification integration
 * - Confidence threshold enforcement
 */

import { db } from '@database/db.connection';
import { workflowRules } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import {
  CategoryCondition,
  ConditionType,
  CreateRuleRequest,
  EvaluateRulesRequest,
  EvaluateRulesResult,
  IntentCondition,
  KeywordCondition,
  MessageClassification,
  RuleConditions,
  RuleEvaluationResult,
  SentimentCondition,
  UpdateRuleRequest,
  WorkflowRuleConfig,
} from '../types';
import { LLMService } from './llm.service';
import { StageService } from './stage.service';

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  constructor(
    private readonly llmService: LLMService,
    private readonly stageService: StageService,
  ) {}

  /**
   * Get all rules for a user
   */
  async getRules(userId: number): Promise<WorkflowRuleConfig[]> {
    const rules = await db
      .select()
      .from(workflowRules)
      .where(eq(workflowRules.userId, userId))
      .orderBy(desc(workflowRules.priority));

    return rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description || undefined,
      fromStageId: rule.fromStageId,
      toStageId: rule.toStageId,
      conditionType: rule.conditionType as ConditionType,
      conditions: rule.conditions as RuleConditions,
      useAiClassification: rule.useAiClassification ?? true,
      aiPrompt: rule.aiPrompt || undefined,
      confidenceThreshold: rule.confidenceThreshold || 70,
      priority: rule.priority || 0,
      isActive: rule.isActive ?? true,
      requiresHumanApproval: rule.requiresHumanApproval || false,
    }));
  }

  /**
   * Get a single rule by ID
   */
  async getRule(
    ruleId: string,
    userId: number,
  ): Promise<WorkflowRuleConfig | null> {
    const [result] = await db
      .select()
      .from(workflowRules)
      .where(
        and(eq(workflowRules.id, ruleId), eq(workflowRules.userId, userId)),
      )
      .limit(1);

    if (!result) return null;

    return {
      id: result.id,
      name: result.name,
      description: result.description || undefined,
      fromStageId: result.fromStageId,
      toStageId: result.toStageId,
      conditionType: result.conditionType as ConditionType,
      conditions: result.conditions as RuleConditions,
      useAiClassification: result.useAiClassification ?? true,
      aiPrompt: result.aiPrompt || undefined,
      confidenceThreshold: result.confidenceThreshold || 70,
      priority: result.priority || 0,
      isActive: result.isActive ?? true,
      requiresHumanApproval: result.requiresHumanApproval || false,
    };
  }

  /**
   * Create a new rule
   */
  async createRule(
    userId: number,
    request: CreateRuleRequest,
  ): Promise<WorkflowRuleConfig> {
    const [rule] = await db
      .insert(workflowRules)
      .values({
        userId,
        name: request.name,
        description: request.description,
        fromStageId: request.fromStageId || null,
        toStageId: request.toStageId,
        conditionType: request.conditionType,
        conditions: request.conditions as unknown as Record<string, unknown>,
        useAiClassification: request.useAiClassification ?? true,
        aiPrompt: request.aiPrompt,
        confidenceThreshold: request.confidenceThreshold || 70,
        priority: request.priority || 0,
        isActive: true,
        requiresHumanApproval: request.requiresHumanApproval || false,
      })
      .returning();

    this.logger.log(`Created rule "${request.name}" for user ${userId}`);

    return {
      id: rule.id,
      name: rule.name,
      description: rule.description || undefined,
      fromStageId: rule.fromStageId,
      toStageId: rule.toStageId,
      conditionType: rule.conditionType as ConditionType,
      conditions: rule.conditions as RuleConditions,
      useAiClassification: rule.useAiClassification ?? true,
      aiPrompt: rule.aiPrompt || undefined,
      confidenceThreshold: rule.confidenceThreshold || 70,
      priority: rule.priority || 0,
      isActive: rule.isActive ?? true,
      requiresHumanApproval: rule.requiresHumanApproval || false,
    };
  }

  /**
   * Update a rule
   */
  async updateRule(
    ruleId: string,
    userId: number,
    request: UpdateRuleRequest,
  ): Promise<WorkflowRuleConfig | null> {
    const updateData: Partial<typeof workflowRules.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (request.name !== undefined) updateData.name = request.name;
    if (request.description !== undefined)
      updateData.description = request.description;
    if (request.fromStageId !== undefined)
      updateData.fromStageId = request.fromStageId;
    if (request.toStageId !== undefined)
      updateData.toStageId = request.toStageId;
    if (request.conditionType !== undefined)
      updateData.conditionType = request.conditionType;
    if (request.conditions !== undefined) {
      updateData.conditions = request.conditions as unknown as Record<
        string,
        unknown
      >;
    }
    if (request.useAiClassification !== undefined) {
      updateData.useAiClassification = request.useAiClassification;
    }
    if (request.aiPrompt !== undefined) updateData.aiPrompt = request.aiPrompt;
    if (request.confidenceThreshold !== undefined) {
      updateData.confidenceThreshold = request.confidenceThreshold;
    }
    if (request.priority !== undefined) updateData.priority = request.priority;
    if (request.isActive !== undefined) updateData.isActive = request.isActive;
    if (request.requiresHumanApproval !== undefined) {
      updateData.requiresHumanApproval = request.requiresHumanApproval;
    }

    const [rule] = await db
      .update(workflowRules)
      .set(updateData)
      .where(
        and(eq(workflowRules.id, ruleId), eq(workflowRules.userId, userId)),
      )
      .returning();

    if (!rule) return null;

    return {
      id: rule.id,
      name: rule.name,
      description: rule.description || undefined,
      fromStageId: rule.fromStageId,
      toStageId: rule.toStageId,
      conditionType: rule.conditionType as ConditionType,
      conditions: rule.conditions as RuleConditions,
      useAiClassification: rule.useAiClassification ?? true,
      aiPrompt: rule.aiPrompt || undefined,
      confidenceThreshold: rule.confidenceThreshold || 70,
      priority: rule.priority || 0,
      isActive: rule.isActive ?? true,
      requiresHumanApproval: rule.requiresHumanApproval || false,
    };
  }

  /**
   * Delete a rule
   */
  async deleteRule(ruleId: string, userId: number): Promise<boolean> {
    const result = await db
      .delete(workflowRules)
      .where(
        and(eq(workflowRules.id, ruleId), eq(workflowRules.userId, userId)),
      )
      .returning({ id: workflowRules.id });

    return result.length > 0;
  }

  /**
   * Evaluate all rules against a message
   */
  async evaluateRules(
    userId: number,
    request: EvaluateRulesRequest,
  ): Promise<EvaluateRulesResult> {
    const { chatId, messageText, currentStageId } = request;

    // Get all active rules ordered by priority
    const rules = await db
      .select()
      .from(workflowRules)
      .where(
        and(eq(workflowRules.userId, userId), eq(workflowRules.isActive, true)),
      )
      .orderBy(desc(workflowRules.priority));

    // Get stages for context
    const stages = await this.stageService.getStages(userId);
    const stageMap = new Map(stages.map((s) => [s.id, s]));

    // Get AI classification if any rule uses it
    let classification: MessageClassification | undefined;
    const needsClassification = rules.some((r) => r.useAiClassification);

    if (needsClassification) {
      const currentStage = currentStageId
        ? stageMap.get(currentStageId)
        : undefined;

      const classResult = await this.llmService.classifyMessage(
        messageText,
        {
          currentStageName: currentStage?.name,
          availableStages: stages.map((s) => s.name),
        },
        { userId, chatId },
      );

      classification = {
        category: classResult.category,
        subcategory: classResult.subcategory,
        sentiment: classResult.sentiment,
        sentimentScore: classResult.sentimentScore,
        intent: classResult.intent,
        keywords: classResult.keywords,
        confidence: classResult.confidence,
        requiresHandoff: classResult.requiresHandoff,
        handoffReason: classResult.handoffReason,
      };
    }

    // Evaluate each rule
    const matchedRules: RuleEvaluationResult[] = [];

    for (const rule of rules) {
      // Check if rule applies to current stage
      if (rule.fromStageId && rule.fromStageId !== currentStageId) {
        continue;
      }

      const result = await this.evaluateSingleRule(
        rule,
        messageText,
        classification,
      );

      if (result.matched) {
        const targetStage = stageMap.get(rule.toStageId);
        matchedRules.push({
          ruleId: rule.id,
          ruleName: rule.name,
          matched: true,
          confidence: result.confidence,
          targetStageId: rule.toStageId,
          targetStageName: targetStage?.name || 'Unknown',
          requiresHumanApproval: rule.requiresHumanApproval || false,
          evaluationDetails: result.details,
        });
      }
    }

    // Find best match (highest confidence among highest priority)
    const bestMatch = matchedRules.length > 0 ? matchedRules[0] : null;

    return {
      matchedRules,
      bestMatch,
      classification,
      shouldTransition:
        bestMatch !== null &&
        bestMatch.confidence >=
          (rules.find((r) => r.id === bestMatch.ruleId)?.confidenceThreshold ||
            70),
      requiresApproval: bestMatch?.requiresHumanApproval || false,
    };
  }

  /**
   * Evaluate a single rule against a message
   */
  private async evaluateSingleRule(
    rule: typeof workflowRules.$inferSelect,
    messageText: string,
    classification?: MessageClassification,
  ): Promise<{
    matched: boolean;
    confidence: number;
    details?: Record<string, unknown>;
  }> {
    const conditions = rule.conditions as RuleConditions;
    const threshold = rule.confidenceThreshold || 70;

    switch (conditions.type) {
      case 'keyword':
        return this.evaluateKeywordCondition(messageText, conditions.config);

      case 'sentiment':
        if (!classification) {
          return { matched: false, confidence: 0 };
        }
        return this.evaluateSentimentCondition(
          classification,
          conditions.config,
        );

      case 'category':
        if (!classification) {
          return { matched: false, confidence: 0 };
        }
        return this.evaluateCategoryCondition(
          classification,
          conditions.config,
        );

      case 'intent':
        if (!classification) {
          return { matched: false, confidence: 0 };
        }
        return this.evaluateIntentCondition(classification, conditions.config);

      case 'custom':
        // Custom conditions use AI classification confidence directly
        if (!classification) {
          return { matched: false, confidence: 0 };
        }
        return {
          matched: classification.confidence >= threshold,
          confidence: classification.confidence,
          details: { classification },
        };

      default:
        return { matched: false, confidence: 0 };
    }
  }

  /**
   * Evaluate keyword condition
   */
  private evaluateKeywordCondition(
    messageText: string,
    config: KeywordCondition,
  ): {
    matched: boolean;
    confidence: number;
    details?: Record<string, unknown>;
  } {
    const text = config.caseSensitive ? messageText : messageText.toLowerCase();
    const keywords = config.caseSensitive
      ? config.keywords
      : config.keywords.map((k) => k.toLowerCase());

    const matchedKeywords: string[] = [];

    for (const keyword of keywords) {
      if (config.matchMode === 'exact') {
        if (text === keyword) {
          matchedKeywords.push(keyword);
        }
      } else {
        if (text.includes(keyword)) {
          matchedKeywords.push(keyword);
        }
      }
    }

    let matched = false;
    let confidence = 0;

    if (config.matchMode === 'any') {
      matched = matchedKeywords.length > 0;
      confidence = (matchedKeywords.length / keywords.length) * 100;
    } else if (config.matchMode === 'all') {
      matched = matchedKeywords.length === keywords.length;
      confidence = matched
        ? 100
        : (matchedKeywords.length / keywords.length) * 100;
    } else if (config.matchMode === 'exact') {
      matched = matchedKeywords.length > 0;
      confidence = matched ? 100 : 0;
    }

    return {
      matched,
      confidence,
      details: { matchedKeywords, totalKeywords: keywords.length },
    };
  }

  /**
   * Evaluate sentiment condition
   */
  private evaluateSentimentCondition(
    classification: MessageClassification,
    config: SentimentCondition,
  ): {
    matched: boolean;
    confidence: number;
    details?: Record<string, unknown>;
  } {
    const matched = classification.sentiment === config.sentiment;

    // Calculate confidence based on sentiment score alignment
    let confidence = 0;
    if (matched) {
      confidence = Math.abs(classification.sentimentScore);
      if (config.sentiment === 'neutral') {
        confidence = 100 - Math.abs(classification.sentimentScore);
      }
    }

    return {
      matched: matched && confidence >= config.threshold,
      confidence,
      details: {
        expectedSentiment: config.sentiment,
        actualSentiment: classification.sentiment,
        sentimentScore: classification.sentimentScore,
      },
    };
  }

  /**
   * Evaluate category condition
   */
  private evaluateCategoryCondition(
    classification: MessageClassification,
    config: CategoryCondition,
  ): {
    matched: boolean;
    confidence: number;
    details?: Record<string, unknown>;
  } {
    const matchedCategories: string[] = [];

    for (const category of config.categories) {
      if (
        classification.category === category ||
        classification.subcategory === category
      ) {
        matchedCategories.push(category);
      }
    }

    let matched = false;
    if (config.matchMode === 'any') {
      matched = matchedCategories.length > 0;
    } else if (config.matchMode === 'all') {
      matched = matchedCategories.length === config.categories.length;
    }

    return {
      matched,
      confidence: matched ? classification.confidence : 0,
      details: { matchedCategories, expectedCategories: config.categories },
    };
  }

  /**
   * Evaluate intent condition
   */
  private evaluateIntentCondition(
    classification: MessageClassification,
    config: IntentCondition,
  ): {
    matched: boolean;
    confidence: number;
    details?: Record<string, unknown>;
  } {
    if (!classification.intent) {
      return { matched: false, confidence: 0 };
    }

    const matchedIntents: string[] = [];
    const classIntent = classification.intent.toLowerCase();

    for (const intent of config.intents) {
      if (classIntent.includes(intent.toLowerCase())) {
        matchedIntents.push(intent);
      }
    }

    let matched = false;
    if (config.matchMode === 'any') {
      matched = matchedIntents.length > 0;
    } else if (config.matchMode === 'all') {
      matched = matchedIntents.length === config.intents.length;
    }

    return {
      matched,
      confidence: matched ? classification.confidence : 0,
      details: { matchedIntents, expectedIntents: config.intents },
    };
  }
}
