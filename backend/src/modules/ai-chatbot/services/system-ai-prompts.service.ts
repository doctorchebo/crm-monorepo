/**
 * System AI Prompts Service
 *
 * Manages global AI goal prompts that apply to all users/teams.
 * Only system admins (users.is_system_admin = true) can modify these prompts.
 *
 * These prompts define the base behavior/instructions for each goal type:
 * - answer_faq: Answer questions using knowledge base
 * - qualify_lead: Qualify leads via discovery questions
 * - book_appointment: Help schedule appointments
 * - handle_support: Provide customer support
 * - custom: Custom-defined behavior
 */

import { db } from '@database/db.connection';
import { systemAiGoalPrompts, systemAiSettings, users } from '@database/schema';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';

export interface GoalPromptDto {
  goalType: string;
  displayName: string;
  description?: string | null;
  promptTemplate: string;
  isActive?: boolean;
}

export interface SystemSettingDto {
  settingKey: string;
  settingValue: unknown;
  description?: string | null;
}

@Injectable()
export class SystemAiPromptsService {
  private readonly logger = new Logger(SystemAiPromptsService.name);

  /**
   * Check if a user is a system admin
   */
  async isSystemAdmin(userId: number): Promise<boolean> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { isSystemAdmin: true },
    });

    return user?.isSystemAdmin === true;
  }

  /**
   * Verify user is system admin, throw ForbiddenException if not
   */
  async requireSystemAdmin(userId: number): Promise<void> {
    const isAdmin = await this.isSystemAdmin(userId);
    if (!isAdmin) {
      throw new ForbiddenException(
        'Only system administrators can modify global AI prompts',
      );
    }
  }

  // =========================================================================
  // Goal Prompts CRUD
  // =========================================================================

  /**
   * Get all goal prompts
   */
  async getAllGoalPrompts() {
    return db.query.systemAiGoalPrompts.findMany({
      orderBy: (prompts, { asc }) => [asc(prompts.goalType)],
    });
  }

  /**
   * Get active goal prompts only
   */
  async getActiveGoalPrompts() {
    return db.query.systemAiGoalPrompts.findMany({
      where: eq(systemAiGoalPrompts.isActive, true),
      orderBy: (prompts, { asc }) => [asc(prompts.goalType)],
    });
  }

  /**
   * Get a single goal prompt by type
   */
  async getGoalPrompt(goalType: string) {
    const prompt = await db.query.systemAiGoalPrompts.findFirst({
      where: eq(systemAiGoalPrompts.goalType, goalType),
    });

    if (!prompt) {
      throw new NotFoundException(`Goal prompt '${goalType}' not found`);
    }

    return prompt;
  }

  /**
   * Get the prompt template for a goal type
   * Returns the prompt text or null if not found/inactive
   */
  async getPromptTemplate(goalType: string): Promise<string | null> {
    const prompt = await db.query.systemAiGoalPrompts.findFirst({
      where: eq(systemAiGoalPrompts.goalType, goalType),
      columns: { promptTemplate: true, isActive: true },
    });

    if (!prompt || !prompt.isActive) {
      return null;
    }

    return prompt.promptTemplate;
  }

  /**
   * Update a goal prompt (system admin only)
   */
  async updateGoalPrompt(
    userId: number,
    goalType: string,
    dto: Partial<GoalPromptDto>,
  ) {
    await this.requireSystemAdmin(userId);

    const existing = await db.query.systemAiGoalPrompts.findFirst({
      where: eq(systemAiGoalPrompts.goalType, goalType),
    });

    if (!existing) {
      throw new NotFoundException(`Goal prompt '${goalType}' not found`);
    }

    const [updated] = await db
      .update(systemAiGoalPrompts)
      .set({
        displayName: dto.displayName ?? existing.displayName,
        description:
          dto.description !== undefined
            ? dto.description
            : existing.description,
        promptTemplate: dto.promptTemplate ?? existing.promptTemplate,
        isActive: dto.isActive ?? existing.isActive,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(systemAiGoalPrompts.goalType, goalType))
      .returning();

    this.logger.log(`Goal prompt '${goalType}' updated by user ${userId}`);

    return updated;
  }

  /**
   * Create a new goal prompt (system admin only)
   * Used for creating custom goal types
   */
  async createGoalPrompt(userId: number, dto: GoalPromptDto) {
    await this.requireSystemAdmin(userId);

    const existing = await db.query.systemAiGoalPrompts.findFirst({
      where: eq(systemAiGoalPrompts.goalType, dto.goalType),
    });

    if (existing) {
      throw new ForbiddenException(
        `Goal prompt '${dto.goalType}' already exists`,
      );
    }

    const [created] = await db
      .insert(systemAiGoalPrompts)
      .values({
        goalType: dto.goalType,
        displayName: dto.displayName,
        description: dto.description,
        promptTemplate: dto.promptTemplate,
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    this.logger.log(`Goal prompt '${dto.goalType}' created by user ${userId}`);

    return created;
  }

  /**
   * Reset a goal prompt to its default value (system admin only)
   */
  async resetGoalPromptToDefault(userId: number, goalType: string) {
    await this.requireSystemAdmin(userId);

    const defaultPrompt = this.getDefaultPromptTemplate(goalType);
    if (!defaultPrompt) {
      throw new NotFoundException(
        `No default prompt available for '${goalType}'`,
      );
    }

    return this.updateGoalPrompt(userId, goalType, {
      promptTemplate: defaultPrompt,
    });
  }

  /**
   * Get default prompt template (hardcoded fallback)
   */
  private getDefaultPromptTemplate(goalType: string): string | null {
    const defaults: Record<string, string> = {
      answer_faq:
        'Answer customer questions accurately using the available knowledge base. ' +
        'Provide specific details (prices, features, availability) when available. ' +
        "If you don't have the information, let them know an agent will follow up. " +
        'When customers share their name or details, acknowledge naturally and use their name in future responses.',

      qualify_lead:
        'Qualify incoming leads by understanding their needs and budget. ' +
        'Ask relevant discovery questions (timeline, budget, requirements, decision makers). ' +
        'When customers share their name, contact info, or preferences, acknowledge this information naturally ' +
        '(e.g., "Thanks for sharing that, [Name]" or "I\'ve noted your budget of X"). ' +
        'Share relevant information from the knowledge base to keep them engaged. ' +
        'When a lead is qualified, suggest connecting with an agent for next steps.',

      book_appointment:
        'Help customers schedule appointments or meetings. ' +
        'Collect necessary information: preferred date/time, type of service, contact details. ' +
        "When customers provide their name, email, or preferences, confirm you've noted the information " +
        '(e.g., "I have you down as [Name] for [date/time]" or "I\'ll send confirmation to [email]"). ' +
        'Provide available options from the knowledge base when possible. ' +
        'Confirm all details before finalizing.',

      handle_support:
        'Provide customer support by troubleshooting issues and answering questions. ' +
        'Be empathetic and patient. When customers introduce themselves, use their name to personalize the interaction. ' +
        'If they share contact details for follow-up, acknowledge receipt. ' +
        'Search the knowledge base for solutions. ' +
        'If the issue requires human intervention, offer to connect with a support agent. ' +
        "Always acknowledge the customer's frustration and provide clear next steps.",

      custom:
        'Assist the customer based on the additional context provided below. ' +
        'Be helpful, accurate, and professional in all interactions. ' +
        'When customers share personal information, acknowledge it naturally.',
    };

    return defaults[goalType] || null;
  }

  // =========================================================================
  // System Settings CRUD
  // =========================================================================

  /**
   * Get all system AI settings
   */
  async getAllSettings() {
    return db.query.systemAiSettings.findMany({
      orderBy: (settings, { asc }) => [asc(settings.settingKey)],
    });
  }

  /**
   * Get a specific system setting
   */
  async getSetting(settingKey: string) {
    const setting = await db.query.systemAiSettings.findFirst({
      where: eq(systemAiSettings.settingKey, settingKey),
    });

    return setting;
  }

  /**
   * Get a setting value with fallback
   */
  async getSettingValue<T = unknown>(
    settingKey: string,
    fallback: T,
  ): Promise<T> {
    const setting = await this.getSetting(settingKey);
    return setting ? (setting.settingValue as T) : fallback;
  }

  /**
   * Update a system setting (system admin only)
   */
  async updateSetting(userId: number, dto: SystemSettingDto) {
    await this.requireSystemAdmin(userId);

    const existing = await db.query.systemAiSettings.findFirst({
      where: eq(systemAiSettings.settingKey, dto.settingKey),
    });

    if (existing) {
      const [updated] = await db
        .update(systemAiSettings)
        .set({
          settingValue: dto.settingValue,
          description: dto.description ?? existing.description,
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(eq(systemAiSettings.settingKey, dto.settingKey))
        .returning();

      this.logger.log(
        `System setting '${dto.settingKey}' updated by user ${userId}`,
      );

      return updated;
    } else {
      const [created] = await db
        .insert(systemAiSettings)
        .values({
          settingKey: dto.settingKey,
          settingValue: dto.settingValue,
          description: dto.description,
          updatedBy: userId,
        })
        .returning();

      this.logger.log(
        `System setting '${dto.settingKey}' created by user ${userId}`,
      );

      return created;
    }
  }
}
