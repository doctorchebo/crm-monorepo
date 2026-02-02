import { db } from '@database/db.connection';
import { teamMembers } from '@database/schema';
import {
  teamWorkflowSettings,
  WorkflowChatState,
  workflowChatState,
  workflows,
} from '@database/workflow-builder.schema';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { WorkflowExecutionEngine } from './workflow-execution.engine';

@Injectable()
export class WorkflowAssignmentService {
  private readonly logger = new Logger(WorkflowAssignmentService.name);

  constructor(
    private readonly workflowExecutionEngine: WorkflowExecutionEngine,
  ) {}

  /**
   * Assign a workflow to a chat
   */
  async assignWorkflow(
    chatId: string,
    workflowId: string,
    source: 'auto' | 'manual' | 'trigger',
    userId?: number,
  ): Promise<WorkflowChatState> {
    const workflow = await db.query.workflows.findFirst({
      where: and(
        eq(workflows.id, workflowId),
        sql`${workflows.deletedAt} IS NULL`,
      ),
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.status !== 'active' && workflow.status !== 'published') {
      throw new Error(
        'Cannot assign a workflow that is not active or published',
      );
    }

    // Check existing assignment
    const existingState = await db.query.workflowChatState.findFirst({
      where: eq(workflowChatState.chatId, chatId),
    });

    let newState: WorkflowChatState;

    if (existingState) {
      // Update existing state
      // We reset execution state when assigning a new workflow
      const [updated] = await db
        .update(workflowChatState)
        .set({
          activeWorkflowId: workflowId,
          activeExecutionId: null,
          currentNodeId: null,
          currentAiInstructions: null,
          currentAiTone: null,
          currentAiGoal: null,
          isPaused: false,
          pausedAt: null,
          pausedBy: null,
          pauseReason: null,
          updatedAt: new Date(),
        })
        .where(eq(workflowChatState.chatId, chatId))
        .returning();
      newState = updated;
    } else {
      // Create new state
      const [created] = await db
        .insert(workflowChatState)
        .values({
          chatId,
          activeWorkflowId: workflowId,
          enteredWorkflowAt: new Date(),
        })
        .returning();
      newState = created;
    }

    this.logger.log(
      `Assigned workflow ${workflowId} to chat ${chatId} (source: ${source})`,
    );

    return newState;
  }

  /**
   * Remove workflow assignment from a chat
   */
  async unassignWorkflow(chatId: string): Promise<void> {
    await db
      .update(workflowChatState)
      .set({
        activeWorkflowId: null,
        activeExecutionId: null,
        currentNodeId: null,
        currentAiInstructions: null,
        currentAiTone: null,
        currentAiGoal: null,
        isPaused: false,
        pausedAt: null,
        pausedBy: null,
        pauseReason: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowChatState.chatId, chatId));

    this.logger.log(`Unassigned workflow from chat ${chatId}`);
  }

  /**
   * Get current workflow assignment
   */
  async getAssignment(chatId: string): Promise<WorkflowChatState | null> {
    const result = await db.query.workflowChatState.findFirst({
      where: eq(workflowChatState.chatId, chatId),
      with: {
        activeWorkflow: true,
      } as any, // Explicit cast to avoid type issues with relations not fully propagated
    });
    return result ?? null;
  }

  /**
   * Get user's primary team ID
   * Returns the first active team the user belongs to
   */
  private async getUserTeamId(userId: number): Promise<number | null> {
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.isActive, true),
      ),
    });
    return membership?.teamId ?? null;
  }

  /**
   * Auto-assign default workflow to a new chat using user ID
   * Looks up the user's team and assigns the team's default workflow
   */
  async assignDefaultWorkflowToNewChat(
    chatId: string,
    userId: number,
  ): Promise<WorkflowChatState | null> {
    try {
      this.logger.debug(
        `[assignDefaultWorkflowToNewChat] Looking up team for user ${userId}`,
      );
      const teamId = await this.getUserTeamId(userId);
      this.logger.debug(
        `[assignDefaultWorkflowToNewChat] User ${userId} teamId: ${teamId}`,
      );
      if (!teamId) {
        this.logger.debug(
          `User ${userId} has no active team, skipping default workflow assignment`,
        );
        return null;
      }
      return this.assignDefaultToNewChatByTeamId(chatId, teamId);
    } catch (error) {
      this.logger.error(
        `Error assigning default workflow to chat ${chatId} for user ${userId}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Auto-assign default workflow to a new chat based on team settings
   * Use assignDefaultWorkflowToNewChat(chatId, userId) if you only have a userId
   */
  async assignDefaultToNewChatByTeamId(
    chatId: string,
    teamId: number,
  ): Promise<WorkflowChatState | null> {
    try {
      this.logger.debug(
        `[assignDefaultToNewChatByTeamId] Looking up team settings for team ${teamId}, chat ${chatId}`,
      );

      // Get team settings
      const settings = await db.query.teamWorkflowSettings.findFirst({
        where: eq(teamWorkflowSettings.teamId, teamId),
      });

      this.logger.debug(
        `[assignDefaultToNewChatByTeamId] Team settings: ${JSON.stringify(settings)}`,
      );

      if (!settings?.defaultWorkflowId) {
        this.logger.debug(
          `[assignDefaultToNewChatByTeamId] No default workflow configured for team ${teamId}`,
        );
        return null;
      }

      // Verify workflow exists and is active
      const workflow = await db.query.workflows.findFirst({
        where: and(
          eq(workflows.id, settings.defaultWorkflowId),
          sql`${workflows.deletedAt} IS NULL`,
        ),
      });

      if (
        !workflow ||
        (workflow.status !== 'active' && workflow.status !== 'published')
      ) {
        this.logger.warn(
          `Default workflow ${settings.defaultWorkflowId} for team ${teamId} is not valid/active. Skipping auto-assignment.`,
        );
        return null;
      }

      // Assign the workflow
      return this.assignWorkflow(chatId, settings.defaultWorkflowId, 'auto');
    } catch (error) {
      this.logger.error(
        `Error auto-assigning workflow to chat ${chatId}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }
}
