import { db } from '@database/db.connection';
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
    return db.query.workflowChatState.findFirst({
      where: eq(workflowChatState.chatId, chatId),
      with: {
        activeWorkflow: true,
      } as any, // Explicit cast to avoid type issues with relations not fully propagated
    });
  }

  /**
   * Auto-assign default workflow to a new chat based on team settings
   */
  async assignDefaultToNewChat(
    chatId: string,
    teamId: number,
  ): Promise<WorkflowChatState | null> {
    try {
      // Get team settings
      const settings = await db.query.teamWorkflowSettings.findFirst({
        where: eq(teamWorkflowSettings.teamId, teamId),
      });

      if (!settings?.defaultWorkflowId) {
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
