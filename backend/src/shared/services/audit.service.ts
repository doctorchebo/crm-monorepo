import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../database/db.connection';
import { activityLogs } from '../../database/schema';

/**
 * Audit actions that must be logged (from requirements)
 */
export type AuditAction =
  // Invitation actions
  | 'invitation_sent'
  | 'invitation_accepted'
  | 'invitation_revoked'
  | 'invitation_expired'
  // Team membership actions
  | 'user_joined'
  | 'user_removed'
  | 'role_changed'
  // Chat assignment actions
  | 'chat_assigned'
  | 'chat_reassigned'
  | 'chat_unassigned'
  // Lock actions
  | 'lock_acquired'
  | 'lock_released'
  | 'lock_force_released'
  | 'control_requested'
  // Message actions
  | 'message_sent_human'
  | 'message_sent_ai'
  | 'message_deleted'
  | 'message_edited'
  // Note actions
  | 'note_added'
  // Stage/workflow actions
  | 'stage_moved_manual'
  | 'stage_moved_ai'
  | 'workflow_updated'
  // AI actions
  | 'ai_paused'
  | 'ai_resumed'
  // Admin overrides
  | 'admin_override';

/**
 * Entity types for audit logging
 */
export type EntityType =
  | 'team'
  | 'team_member'
  | 'invitation'
  | 'chat'
  | 'chat_lock'
  | 'message'
  | 'note'
  | 'workflow_stage'
  | 'ai_config';

export interface AuditLogParams {
  userId: number;
  teamId?: number;
  entityType: EntityType;
  entityId: string;
  action: AuditAction;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * AuditService - Centralized audit trail for all system actions
 *
 * Requirements:
 * - No frontend-only logging allowed
 * - All actions must be logged server-side
 * - Audit trail must be comprehensive and immutable
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  /**
   * Log an action to the audit trail
   */
  async log(params: AuditLogParams): Promise<void> {
    try {
      await db.insert(activityLogs).values({
        userId: params.userId,
        teamId: params.teamId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        metadata: params.metadata ?? {},
        ipAddress: params.ipAddress,
      });

      this.logger.debug(
        `Audit: ${params.action} on ${params.entityType}:${params.entityId} by user ${params.userId}`,
      );
    } catch (err: unknown) {
      const error = err as Error;
      // Audit logging should never fail silently, but also shouldn't break the main operation
      this.logger.error(
        `Failed to log audit entry: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Log invitation sent
   */
  async logInvitationSent(
    userId: number,
    teamId: number,
    invitationId: string,
    email: string,
    role: string,
  ): Promise<void> {
    await this.log({
      userId,
      teamId,
      entityType: 'invitation',
      entityId: invitationId,
      action: 'invitation_sent',
      metadata: { email, role },
    });
  }

  /**
   * Log invitation accepted
   */
  async logInvitationAccepted(
    userId: number,
    teamId: number,
    invitationId: string,
  ): Promise<void> {
    await this.log({
      userId,
      teamId,
      entityType: 'invitation',
      entityId: invitationId,
      action: 'invitation_accepted',
    });
  }

  /**
   * Log chat assignment
   */
  async logChatAssigned(
    userId: number,
    teamId: number,
    chatId: string,
    assigneeId: number,
    assignedBy: number,
  ): Promise<void> {
    await this.log({
      userId,
      teamId,
      entityType: 'chat',
      entityId: chatId,
      action: 'chat_assigned',
      metadata: { assigneeId, assignedBy },
    });
  }

  /**
   * Log message sent
   */
  async logMessageSent(
    userId: number,
    teamId: number,
    chatId: string,
    messageId: string,
    isAi: boolean,
  ): Promise<void> {
    await this.log({
      userId,
      teamId,
      entityType: 'message',
      entityId: messageId,
      action: isAi ? 'message_sent_ai' : 'message_sent_human',
      metadata: { chatId },
    });
  }

  /**
   * Log stage transition
   */
  async logStageMoved(
    userId: number,
    teamId: number,
    chatId: string,
    fromStageId: string | null,
    toStageId: string,
    isAi: boolean,
    confidence?: number,
  ): Promise<void> {
    await this.log({
      userId,
      teamId,
      entityType: 'chat',
      entityId: chatId,
      action: isAi ? 'stage_moved_ai' : 'stage_moved_manual',
      metadata: { fromStageId, toStageId, confidence },
    });
  }

  /**
   * Log AI pause/resume
   */
  async logAiPauseToggle(
    userId: number,
    teamId: number,
    chatId: string,
    paused: boolean,
    reason?: string,
  ): Promise<void> {
    await this.log({
      userId,
      teamId,
      entityType: 'chat',
      entityId: chatId,
      action: paused ? 'ai_paused' : 'ai_resumed',
      metadata: { reason },
    });
  }

  /**
   * Log role change
   */
  async logRoleChanged(
    userId: number,
    teamId: number,
    targetUserId: number,
    oldRole: string,
    newRole: string,
  ): Promise<void> {
    await this.log({
      userId,
      teamId,
      entityType: 'team_member',
      entityId: targetUserId.toString(),
      action: 'role_changed',
      metadata: { oldRole, newRole },
    });
  }
}
