/**
 * AI Configuration Service
 * Manages user, chat, and workflow stage AI behavior configurations
 *
 * Features:
 * - CRUD for user-level AI configurations
 * - Chat-level overrides
 * - Workflow stage AI settings
 * - Configuration resolution (chat > stage > user)
 * - Rate limiting enforcement
 */

import { db } from '@database/db.connection';
import {
  aiConfigurations,
  chatAiOverrides,
  chatStageAssignments,
  workflowStageAiSettings,
  type AiConfiguration,
  type ChatAiOverride,
  type WorkflowStageAiSetting,
} from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

/**
 * Resolved AI configuration for a specific context
 * Merges user defaults, stage settings, and chat overrides
 */
export interface ResolvedAiConfig {
  // Source tracking
  source: {
    userId: number;
    chatId?: string;
    stageId?: string;
    hasUserConfig: boolean;
    hasStageConfig: boolean;
    hasChatOverride: boolean;
  };

  // Tone and style
  tone: string;
  style: string;
  formalityLevel: string;

  // Rate limiting
  maxMessagesPerHour: number;
  maxMessagesPerDay: number;
  minDelayBetweenMessagesMs: number;

  // Language
  languagePreference: string | null;
  autoTranslateResponses: boolean;

  // Reply behavior
  allowFreeTextReplies: boolean;
  preferTemplatesOver24h: boolean;
  autoSuggestTemplates: boolean;
  useTemplatesOnly: boolean;
  suggestedTemplateIds: string[];

  // Content restrictions
  maxResponseLength: number;
  avoidTopics: string[];
  requiredSignature: string | null;

  // AI model preferences
  preferredModel: string | null;
  temperature: number;

  // AI behavior flags
  aiEnabled: boolean;

  // Stage-specific
  systemPromptAddition: string | null;
  goalDescription: string | null;
  customInstructions: string | null;
  escalationTriggers: unknown[];
}

/**
 * DTO for creating/updating user AI configuration
 */
export interface AiConfigurationDto {
  defaultTone?: string;
  defaultStyle?: string;
  formalityLevel?: string;
  maxMessagesPerHour?: number;
  maxMessagesPerDay?: number;
  minDelayBetweenMessagesMs?: number;
  languagePreference?: string | null;
  autoTranslateResponses?: boolean;
  allowFreeTextRepliesWithin24h?: boolean;
  preferTemplatesOver24h?: boolean;
  autoSuggestTemplates?: boolean;
  maxResponseLength?: number;
  avoidTopics?: string[];
  requiredSignature?: string | null;
  preferredModel?: string | null;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

/**
 * DTO for creating/updating chat AI overrides
 */
export interface ChatAiOverrideDto {
  tone?: string | null;
  style?: string | null;
  formalityLevel?: string | null;
  maxMessagesPerHour?: number | null;
  languagePreference?: string | null;
  allowFreeTextReplies?: boolean | null;
  maxResponseLength?: number | null;
  customInstructions?: string | null;
  avoidTopics?: string[] | null;
  aiEnabled?: boolean;
  useTemplatesOnly?: boolean;
  overrideReason?: string | null;
}

/**
 * DTO for workflow stage AI settings
 */
export interface WorkflowStageAiSettingsDto {
  tone?: string | null;
  style?: string | null;
  formalityLevel?: string | null;
  maxMessagesPerHour?: number | null;
  languagePreference?: string | null;
  allowFreeTextReplies?: boolean | null;
  useTemplatesOnly?: boolean;
  suggestedTemplateIds?: string[];
  maxResponseLength?: number | null;
  systemPromptAddition?: string | null;
  goalDescription?: string | null;
  escalationTriggers?: unknown[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Omit<ResolvedAiConfig, 'source'> = {
  tone: 'friendly',
  style: 'concise',
  formalityLevel: 'balanced',
  maxMessagesPerHour: 5,
  maxMessagesPerDay: 50,
  minDelayBetweenMessagesMs: 3000,
  languagePreference: null,
  autoTranslateResponses: false,
  allowFreeTextReplies: true,
  preferTemplatesOver24h: true,
  autoSuggestTemplates: true,
  useTemplatesOnly: false,
  suggestedTemplateIds: [],
  maxResponseLength: 500,
  avoidTopics: [],
  requiredSignature: null,
  preferredModel: null,
  temperature: 70,
  // AI is disabled by default - users must explicitly enable per chat
  aiEnabled: false,
  systemPromptAddition: null,
  goalDescription: null,
  customInstructions: null,
  escalationTriggers: [],
};

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class AiConfigurationService {
  private readonly logger = new Logger(AiConfigurationService.name);

  // ==========================================================================
  // User AI Configuration CRUD
  // ==========================================================================

  /**
   * Get user's AI configuration (creates default if not exists)
   */
  async getUserConfiguration(userId: number): Promise<AiConfiguration> {
    const existing = await db
      .select()
      .from(aiConfigurations)
      .where(eq(aiConfigurations.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    // Create default configuration
    const [created] = await db
      .insert(aiConfigurations)
      .values({ userId })
      .returning();

    this.logger.log(`Created default AI configuration for user ${userId}`);
    return created;
  }

  /**
   * Update user's AI configuration
   */
  async updateUserConfiguration(
    userId: number,
    dto: AiConfigurationDto,
  ): Promise<AiConfiguration> {
    // Ensure config exists
    await this.getUserConfiguration(userId);

    const [updated] = await db
      .update(aiConfigurations)
      .set({
        defaultTone: dto.defaultTone,
        defaultStyle: dto.defaultStyle,
        formalityLevel: dto.formalityLevel,
        maxMessagesPerHour: dto.maxMessagesPerHour,
        maxMessagesPerDay: dto.maxMessagesPerDay,
        minDelayBetweenMessagesMs: dto.minDelayBetweenMessagesMs,
        languagePreference: dto.languagePreference,
        autoTranslateResponses: dto.autoTranslateResponses,
        allowFreeTextRepliesWithin24h: dto.allowFreeTextRepliesWithin24h,
        preferTemplatesOver24h: dto.preferTemplatesOver24h,
        autoSuggestTemplates: dto.autoSuggestTemplates,
        maxResponseLength: dto.maxResponseLength,
        avoidTopics: dto.avoidTopics
          ? JSON.stringify(dto.avoidTopics)
          : undefined,
        requiredSignature: dto.requiredSignature,
        preferredModel: dto.preferredModel,
        temperature: dto.temperature,
        metadata: dto.metadata ? JSON.stringify(dto.metadata) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(aiConfigurations.userId, userId))
      .returning();

    this.logger.log(`Updated AI configuration for user ${userId}`);
    return updated;
  }

  // ==========================================================================
  // Chat AI Overrides CRUD
  // ==========================================================================

  /**
   * Get chat AI override
   */
  async getChatOverride(chatId: string): Promise<ChatAiOverride | null> {
    const results = await db
      .select()
      .from(chatAiOverrides)
      .where(eq(chatAiOverrides.chatId, chatId))
      .limit(1);

    return results.length > 0 ? results[0] : null;
  }

  /**
   * Set or update chat AI override
   */
  async setChatOverride(
    chatId: string,
    userId: number,
    dto: ChatAiOverrideDto,
  ): Promise<ChatAiOverride> {
    const existing = await this.getChatOverride(chatId);

    if (existing) {
      // Update existing
      const [updated] = await db
        .update(chatAiOverrides)
        .set({
          tone: dto.tone,
          style: dto.style,
          formalityLevel: dto.formalityLevel,
          maxMessagesPerHour: dto.maxMessagesPerHour,
          languagePreference: dto.languagePreference,
          allowFreeTextReplies: dto.allowFreeTextReplies,
          maxResponseLength: dto.maxResponseLength,
          customInstructions: dto.customInstructions,
          avoidTopics: dto.avoidTopics
            ? JSON.stringify(dto.avoidTopics)
            : undefined,
          aiEnabled: dto.aiEnabled,
          useTemplatesOnly: dto.useTemplatesOnly,
          overrideReason: dto.overrideReason,
          updatedAt: new Date(),
        })
        .where(eq(chatAiOverrides.chatId, chatId))
        .returning();

      this.logger.log(`Updated chat override for chat ${chatId}`);
      return updated;
    }

    // Create new
    const [created] = await db
      .insert(chatAiOverrides)
      .values({
        chatId,
        userId,
        tone: dto.tone,
        style: dto.style,
        formalityLevel: dto.formalityLevel,
        maxMessagesPerHour: dto.maxMessagesPerHour,
        languagePreference: dto.languagePreference,
        allowFreeTextReplies: dto.allowFreeTextReplies,
        maxResponseLength: dto.maxResponseLength,
        customInstructions: dto.customInstructions,
        avoidTopics: dto.avoidTopics
          ? JSON.stringify(dto.avoidTopics)
          : undefined,
        aiEnabled: dto.aiEnabled ?? true,
        useTemplatesOnly: dto.useTemplatesOnly ?? false,
        overrideReason: dto.overrideReason,
      })
      .returning();

    this.logger.log(`Created chat override for chat ${chatId}`);
    return created;
  }

  /**
   * Delete chat AI override (reverts to defaults)
   */
  async deleteChatOverride(chatId: string): Promise<boolean> {
    const result = await db
      .delete(chatAiOverrides)
      .where(eq(chatAiOverrides.chatId, chatId))
      .returning();

    if (result.length > 0) {
      this.logger.log(`Deleted chat override for chat ${chatId}`);
      return true;
    }
    return false;
  }

  /**
   * Get all chat overrides for a user
   */
  async getUserChatOverrides(userId: number): Promise<ChatAiOverride[]> {
    return db
      .select()
      .from(chatAiOverrides)
      .where(eq(chatAiOverrides.userId, userId));
  }

  // ==========================================================================
  // Workflow Stage AI Settings CRUD
  // ==========================================================================

  /**
   * Get workflow stage AI settings
   */
  async getStageSettings(
    stageId: string,
  ): Promise<WorkflowStageAiSetting | null> {
    const results = await db
      .select()
      .from(workflowStageAiSettings)
      .where(eq(workflowStageAiSettings.stageId, stageId))
      .limit(1);

    return results.length > 0 ? results[0] : null;
  }

  /**
   * Set or update workflow stage AI settings
   */
  async setStageSettings(
    stageId: string,
    userId: number,
    dto: WorkflowStageAiSettingsDto,
  ): Promise<WorkflowStageAiSetting> {
    const existing = await this.getStageSettings(stageId);

    if (existing) {
      // Update existing
      const [updated] = await db
        .update(workflowStageAiSettings)
        .set({
          tone: dto.tone,
          style: dto.style,
          formalityLevel: dto.formalityLevel,
          maxMessagesPerHour: dto.maxMessagesPerHour,
          languagePreference: dto.languagePreference,
          allowFreeTextReplies: dto.allowFreeTextReplies,
          useTemplatesOnly: dto.useTemplatesOnly,
          suggestedTemplateIds: dto.suggestedTemplateIds
            ? JSON.stringify(dto.suggestedTemplateIds)
            : undefined,
          maxResponseLength: dto.maxResponseLength,
          systemPromptAddition: dto.systemPromptAddition,
          goalDescription: dto.goalDescription,
          escalationTriggers: dto.escalationTriggers
            ? JSON.stringify(dto.escalationTriggers)
            : undefined,
          updatedAt: new Date(),
        })
        .where(eq(workflowStageAiSettings.stageId, stageId))
        .returning();

      this.logger.log(`Updated stage settings for stage ${stageId}`);
      return updated;
    }

    // Create new
    const [created] = await db
      .insert(workflowStageAiSettings)
      .values({
        stageId,
        userId,
        tone: dto.tone,
        style: dto.style,
        formalityLevel: dto.formalityLevel,
        maxMessagesPerHour: dto.maxMessagesPerHour,
        languagePreference: dto.languagePreference,
        allowFreeTextReplies: dto.allowFreeTextReplies,
        useTemplatesOnly: dto.useTemplatesOnly ?? false,
        suggestedTemplateIds: dto.suggestedTemplateIds
          ? JSON.stringify(dto.suggestedTemplateIds)
          : undefined,
        maxResponseLength: dto.maxResponseLength,
        systemPromptAddition: dto.systemPromptAddition,
        goalDescription: dto.goalDescription,
        escalationTriggers: dto.escalationTriggers
          ? JSON.stringify(dto.escalationTriggers)
          : undefined,
      })
      .returning();

    this.logger.log(`Created stage settings for stage ${stageId}`);
    return created;
  }

  /**
   * Delete workflow stage AI settings
   */
  async deleteStageSettings(stageId: string): Promise<boolean> {
    const result = await db
      .delete(workflowStageAiSettings)
      .where(eq(workflowStageAiSettings.stageId, stageId))
      .returning();

    if (result.length > 0) {
      this.logger.log(`Deleted stage settings for stage ${stageId}`);
      return true;
    }
    return false;
  }

  /**
   * Get all stage settings for a user
   */
  async getUserStageSettings(
    userId: number,
  ): Promise<WorkflowStageAiSetting[]> {
    return db
      .select()
      .from(workflowStageAiSettings)
      .where(eq(workflowStageAiSettings.userId, userId));
  }

  // ==========================================================================
  // Configuration Resolution
  // ==========================================================================

  /**
   * Resolve the effective AI configuration for a specific context
   * Priority: Chat Override > Workflow Stage > User Default > System Default
   *
   * Gracefully handles missing workflow tables by catching errors and proceeding
   * with available configuration sources.
   */
  async resolveConfiguration(
    userId: number,
    chatId?: string,
  ): Promise<ResolvedAiConfig> {
    // Get user configuration
    const userConfig = await this.getUserConfiguration(userId);

    // Get workflow stage if we have a chat
    let stageConfig: WorkflowStageAiSetting | null = null;
    let stageId: string | undefined;

    if (chatId) {
      // Find the current stage for this chat (gracefully handle missing table)
      try {
        const stageAssignment = await db
          .select()
          .from(chatStageAssignments)
          .where(eq(chatStageAssignments.chatId, chatId))
          .limit(1);

        if (stageAssignment.length > 0 && stageAssignment[0].stageId) {
          stageId = stageAssignment[0].stageId;
          stageConfig = await this.getStageSettings(stageId);
        }
      } catch (error) {
        // Table might not exist yet - gracefully continue without stage config
        this.logger.debug(
          `Could not query stage assignment for chat ${chatId}: ${error}`,
        );
      }
    }

    // Get chat override if exists
    const chatOverride = chatId ? await this.getChatOverride(chatId) : null;

    // Merge configurations with priority
    const resolved = this.mergeConfigurations(
      userConfig,
      stageConfig,
      chatOverride,
    );

    return {
      ...resolved,
      source: {
        userId,
        chatId,
        stageId,
        hasUserConfig: true,
        hasStageConfig: !!stageConfig,
        hasChatOverride: !!chatOverride,
      },
    };
  }

  /**
   * Merge configurations with proper priority
   */
  private mergeConfigurations(
    userConfig: AiConfiguration,
    stageConfig: WorkflowStageAiSetting | null,
    chatOverride: ChatAiOverride | null,
  ): Omit<ResolvedAiConfig, 'source'> {
    // Helper to pick first non-null value with priority
    const pick = <T>(
      chatVal: T | null | undefined,
      stageVal: T | null | undefined,
      userVal: T | null | undefined,
      defaultVal: T,
    ): T => {
      if (chatVal !== null && chatVal !== undefined) return chatVal;
      if (stageVal !== null && stageVal !== undefined) return stageVal;
      if (userVal !== null && userVal !== undefined) return userVal;
      return defaultVal;
    };

    // Parse JSON arrays safely
    const parseJsonArray = (val: unknown): string[] => {
      if (Array.isArray(val)) return val as string[];
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    return {
      // Tone and style
      tone: pick(
        chatOverride?.tone,
        stageConfig?.tone,
        userConfig.defaultTone,
        DEFAULT_CONFIG.tone,
      ),
      style: pick(
        chatOverride?.style,
        stageConfig?.style,
        userConfig.defaultStyle,
        DEFAULT_CONFIG.style,
      ),
      formalityLevel: pick(
        chatOverride?.formalityLevel,
        stageConfig?.formalityLevel,
        userConfig.formalityLevel,
        DEFAULT_CONFIG.formalityLevel,
      ),

      // Rate limiting
      maxMessagesPerHour: pick(
        chatOverride?.maxMessagesPerHour,
        stageConfig?.maxMessagesPerHour,
        userConfig.maxMessagesPerHour,
        DEFAULT_CONFIG.maxMessagesPerHour,
      ),
      maxMessagesPerDay: pick(
        null,
        null,
        userConfig.maxMessagesPerDay,
        DEFAULT_CONFIG.maxMessagesPerDay,
      ),
      minDelayBetweenMessagesMs: pick(
        null,
        null,
        userConfig.minDelayBetweenMessagesMs,
        DEFAULT_CONFIG.minDelayBetweenMessagesMs,
      ),

      // Language
      languagePreference: pick(
        chatOverride?.languagePreference,
        stageConfig?.languagePreference,
        userConfig.languagePreference,
        DEFAULT_CONFIG.languagePreference,
      ),
      autoTranslateResponses: pick(
        null,
        null,
        userConfig.autoTranslateResponses,
        DEFAULT_CONFIG.autoTranslateResponses,
      ),

      // Reply behavior
      allowFreeTextReplies: pick(
        chatOverride?.allowFreeTextReplies,
        stageConfig?.allowFreeTextReplies,
        userConfig.allowFreeTextRepliesWithin24h,
        DEFAULT_CONFIG.allowFreeTextReplies,
      ),
      preferTemplatesOver24h: pick(
        null,
        null,
        userConfig.preferTemplatesOver24h,
        DEFAULT_CONFIG.preferTemplatesOver24h,
      ),
      autoSuggestTemplates: pick(
        null,
        null,
        userConfig.autoSuggestTemplates,
        DEFAULT_CONFIG.autoSuggestTemplates,
      ),
      useTemplatesOnly: pick(
        chatOverride?.useTemplatesOnly,
        stageConfig?.useTemplatesOnly,
        null,
        DEFAULT_CONFIG.useTemplatesOnly,
      ),
      suggestedTemplateIds: parseJsonArray(
        stageConfig?.suggestedTemplateIds ??
          DEFAULT_CONFIG.suggestedTemplateIds,
      ),

      // Content restrictions
      maxResponseLength: pick(
        chatOverride?.maxResponseLength,
        stageConfig?.maxResponseLength,
        userConfig.maxResponseLength,
        DEFAULT_CONFIG.maxResponseLength,
      ),
      avoidTopics: [
        ...parseJsonArray(userConfig.avoidTopics),
        ...parseJsonArray(chatOverride?.avoidTopics),
      ],
      requiredSignature: pick(
        null,
        null,
        userConfig.requiredSignature,
        DEFAULT_CONFIG.requiredSignature,
      ),

      // AI model
      preferredModel: pick(
        null,
        null,
        userConfig.preferredModel,
        DEFAULT_CONFIG.preferredModel,
      ),
      temperature: pick(
        null,
        null,
        userConfig.temperature,
        DEFAULT_CONFIG.temperature,
      ),

      // AI behavior flags
      aiEnabled: chatOverride?.aiEnabled ?? DEFAULT_CONFIG.aiEnabled,

      // Stage-specific additions
      systemPromptAddition:
        stageConfig?.systemPromptAddition ??
        DEFAULT_CONFIG.systemPromptAddition,
      goalDescription:
        stageConfig?.goalDescription ?? DEFAULT_CONFIG.goalDescription,
      customInstructions:
        chatOverride?.customInstructions ?? DEFAULT_CONFIG.customInstructions,
      escalationTriggers: parseJsonArray(
        stageConfig?.escalationTriggers ?? DEFAULT_CONFIG.escalationTriggers,
      ),
    };
  }

  // ==========================================================================
  // Prompt Building with Configuration
  // ==========================================================================

  /**
   * Build system prompt additions based on resolved configuration
   */
  buildPromptInstructions(config: ResolvedAiConfig): string {
    const instructions: string[] = [];

    // Tone instruction
    const toneInstructions: Record<string, string> = {
      friendly:
        'Be warm, approachable, and personable. Use casual language when appropriate.',
      professional:
        'Maintain a professional demeanor. Be polite and businesslike.',
      casual: 'Be relaxed and conversational. Use informal language.',
      formal:
        'Use formal language and proper etiquette. Avoid contractions and slang.',
    };
    if (toneInstructions[config.tone]) {
      instructions.push(`Tone: ${toneInstructions[config.tone]}`);
    }

    // Style instruction
    const styleInstructions: Record<string, string> = {
      concise:
        'Keep responses brief and to the point. Avoid unnecessary elaboration.',
      detailed:
        'Provide thorough, comprehensive responses with relevant details.',
      conversational:
        'Write in a natural, flowing conversational manner as if speaking.',
      technical: 'Use precise technical language appropriate for the domain.',
    };
    if (styleInstructions[config.style]) {
      instructions.push(`Style: ${styleInstructions[config.style]}`);
    }

    // Formality instruction
    const formalityInstructions: Record<string, string> = {
      casual: 'Use informal language, emojis are acceptable.',
      balanced: 'Balance professionalism with approachability.',
      formal: 'Use formal language and proper titles.',
      very_formal:
        'Use highly formal language, proper titles, and formal structures.',
    };
    if (formalityInstructions[config.formalityLevel]) {
      instructions.push(
        `Formality: ${formalityInstructions[config.formalityLevel]}`,
      );
    }

    // Language preference
    if (config.languagePreference) {
      instructions.push(
        `Always respond in ${this.getLanguageName(config.languagePreference)}.`,
      );
    }

    // Response length
    if (config.maxResponseLength && config.maxResponseLength < 500) {
      instructions.push(
        `Keep responses under ${config.maxResponseLength} characters.`,
      );
    }

    // Topics to avoid
    if (config.avoidTopics.length > 0) {
      instructions.push(
        `Avoid discussing these topics: ${config.avoidTopics.join(', ')}.`,
      );
    }

    // Signature
    if (config.requiredSignature) {
      instructions.push(`End your message with: "${config.requiredSignature}"`);
    }

    // Goal description
    if (config.goalDescription) {
      instructions.push(`Your goal: ${config.goalDescription}`);
    }

    // Custom instructions
    if (config.customInstructions) {
      instructions.push(`Additional context: ${config.customInstructions}`);
    }

    // Stage-specific additions
    if (config.systemPromptAddition) {
      instructions.push(config.systemPromptAddition);
    }

    return instructions.join('\n');
  }

  /**
   * Get language name from ISO code
   */
  private getLanguageName(code: string): string {
    const languages: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      pt: 'Portuguese',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      nl: 'Dutch',
      ru: 'Russian',
      zh: 'Chinese',
      ja: 'Japanese',
      ko: 'Korean',
      ar: 'Arabic',
    };
    return languages[code] || code;
  }

  // ==========================================================================
  // Available Options
  // ==========================================================================

  /**
   * Get available tone options
   */
  getToneOptions(): Array<{
    value: string;
    label: string;
    description: string;
  }> {
    return [
      {
        value: 'friendly',
        label: 'Friendly',
        description: 'Warm and approachable, uses casual language',
      },
      {
        value: 'professional',
        label: 'Professional',
        description: 'Polite and businesslike demeanor',
      },
      {
        value: 'casual',
        label: 'Casual',
        description: 'Relaxed and informal conversation style',
      },
      {
        value: 'formal',
        label: 'Formal',
        description: 'Proper etiquette, avoids slang',
      },
    ];
  }

  /**
   * Get available style options
   */
  getStyleOptions(): Array<{
    value: string;
    label: string;
    description: string;
  }> {
    return [
      {
        value: 'concise',
        label: 'Concise',
        description: 'Brief and to the point',
      },
      {
        value: 'detailed',
        label: 'Detailed',
        description: 'Thorough and comprehensive',
      },
      {
        value: 'conversational',
        label: 'Conversational',
        description: 'Natural flowing dialogue',
      },
      {
        value: 'technical',
        label: 'Technical',
        description: 'Precise domain-specific language',
      },
    ];
  }

  /**
   * Get available formality options
   */
  getFormalityOptions(): Array<{
    value: string;
    label: string;
    description: string;
  }> {
    return [
      {
        value: 'casual',
        label: 'Casual',
        description: 'Informal, emojis allowed',
      },
      {
        value: 'balanced',
        label: 'Balanced',
        description: 'Mix of professional and approachable',
      },
      {
        value: 'formal',
        label: 'Formal',
        description: 'Professional language and titles',
      },
      {
        value: 'very_formal',
        label: 'Very Formal',
        description: 'Highly formal, structured responses',
      },
    ];
  }
}
