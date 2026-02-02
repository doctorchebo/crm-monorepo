import { conversationSummaries } from '@database/ai-context.schema';
import { db } from '@database/db.connection';
import {
  workflowChatState,
  workflowExecutions,
} from '@database/workflow-builder.schema';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import type { ChatDeletedPayload } from '../../chats/constants/chat-events.constants';
import { CHAT_EVENTS } from '../../chats/constants/chat-events.constants';

/**
 * Chat Workflow Cleanup Service
 *
 * Handles cleanup of all workflow-related data when a chat is deleted.
 * Listens to CHAT_DELETED events and performs necessary cleanup operations.
 *
 * Architecture Notes:
 * - Most workflow tables have CASCADE DELETE on chatId, so they're auto-cleaned
 * - This service handles tables WITHOUT foreign key cascades
 * - Uses event-driven architecture for loose coupling between modules
 *
 * Tables with CASCADE DELETE (auto-handled by DB):
 * - workflowChatState (references chats.chatId with onDelete: 'cascade')
 * - workflowExecutions (references chats.chatId with onDelete: 'cascade')
 * - workflowExecutionLogs (cascades through workflowExecutions)
 * - chatStageAssignments (references chats.chatId with onDelete: 'cascade')
 *
 * Tables requiring manual cleanup (NO foreign key):
 * - conversationSummaries (varchar chatId, no FK reference)
 *
 * Note: Rate limit tracking and AI config overrides are handled by ChatsCleanupService
 * since they're core chat data, not workflow-specific.
 */
@Injectable()
export class ChatWorkflowCleanupService {
  private readonly logger = new Logger(ChatWorkflowCleanupService.name);

  /**
   * Handle chat deleted event
   *
   * Cleans up all workflow-related data that isn't handled by database cascades.
   * The database CASCADE rules will automatically clean up:
   * - workflowChatState, workflowExecutions, workflowExecutionLogs, chatStageAssignments
   *
   * This handler cleans up:
   * - conversationSummaries (no FK constraint)
   */
  @OnEvent(CHAT_EVENTS.CHAT_DELETED, { async: true })
  async handleChatDeleted(payload: ChatDeletedPayload): Promise<void> {
    const { chatId } = payload;

    this.logger.log(
      `[Chat Deleted] Cleaning up workflow data for chat ${chatId}`,
    );

    const results = {
      conversationSummaries: 0,
      errors: [] as string[],
    };

    // Clean up conversation summaries (no FK cascade)
    try {
      const deleted = await db
        .delete(conversationSummaries)
        .where(eq(conversationSummaries.chatId, chatId))
        .returning();

      results.conversationSummaries = deleted.length;

      if (deleted.length > 0) {
        this.logger.log(
          `[Chat Deleted] Deleted ${deleted.length} conversation summary for chat ${chatId}`,
        );
      }
    } catch (error) {
      const errorMsg = `Failed to delete conversation summaries for chat ${chatId}: ${(error as Error).message}`;
      this.logger.warn(`[Chat Deleted] ${errorMsg}`);
      results.errors.push(errorMsg);
    }

    // Log summary
    this.logger.log(
      `[Chat Deleted] Workflow cleanup complete for chat ${chatId}: ` +
        `summaries=${results.conversationSummaries}, ` +
        `errors=${results.errors.length}`,
    );

    // Note: The following are cleaned up by database CASCADE rules:
    // - workflowChatState
    // - workflowExecutions (and their logs)
    // - chatStageAssignments
  }

  /**
   * Manually clean up all workflow data for a chat
   *
   * Use this method for programmatic cleanup outside of event handling.
   * Useful for testing or bulk cleanup operations.
   */
  async cleanupWorkflowDataForChat(chatId: string): Promise<{
    conversationSummaries: number;
    workflowChatState: number;
    workflowExecutions: number;
    errors: string[];
  }> {
    const results = {
      conversationSummaries: 0,
      workflowChatState: 0,
      workflowExecutions: 0,
      errors: [] as string[],
    };

    // Clean up conversation summaries
    try {
      const deleted = await db
        .delete(conversationSummaries)
        .where(eq(conversationSummaries.chatId, chatId))
        .returning();
      results.conversationSummaries = deleted.length;
    } catch (error) {
      results.errors.push(
        `conversation summaries: ${(error as Error).message}`,
      );
    }

    // Clean up workflow chat state (usually handled by cascade)
    try {
      const deleted = await db
        .delete(workflowChatState)
        .where(eq(workflowChatState.chatId, chatId))
        .returning();
      results.workflowChatState = deleted.length;
    } catch (error) {
      results.errors.push(`workflow chat state: ${(error as Error).message}`);
    }

    // Clean up workflow executions (usually handled by cascade)
    try {
      const deleted = await db
        .delete(workflowExecutions)
        .where(eq(workflowExecutions.chatId, chatId))
        .returning();
      results.workflowExecutions = deleted.length;
    } catch (error) {
      results.errors.push(`workflow executions: ${(error as Error).message}`);
    }

    this.logger.log(
      `[Manual Cleanup] Cleaned workflow data for chat ${chatId}: ` +
        JSON.stringify(results),
    );

    return results;
  }

  /**
   * Check if a chat has any workflow data
   *
   * Useful for debugging and validation.
   */
  async hasWorkflowData(chatId: string): Promise<{
    hasConversationSummary: boolean;
    hasWorkflowState: boolean;
    hasExecutions: boolean;
  }> {
    const [summary, state, executions] = await Promise.all([
      db.query.conversationSummaries.findFirst({
        where: eq(conversationSummaries.chatId, chatId),
      }),
      db.query.workflowChatState.findFirst({
        where: eq(workflowChatState.chatId, chatId),
      }),
      db.query.workflowExecutions.findFirst({
        where: eq(workflowExecutions.chatId, chatId),
      }),
    ]);

    return {
      hasConversationSummary: !!summary,
      hasWorkflowState: !!state,
      hasExecutions: !!executions,
    };
  }
}
