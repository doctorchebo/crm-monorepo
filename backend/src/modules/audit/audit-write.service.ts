// ============================================================================
// Audit Write Service
// ============================================================================
// Centralized service for writing audit entries to the activity_logs table.
// All modules inject this service to log their actions.
//
// DESIGN PRINCIPLES:
// - Never throws: audit logging failures must not break business operations
// - Denormalizes user/entity names at write time for fast reads
// - Uses buildChanges() to compute minimal diffs for update operations
// ============================================================================

import { db } from '@database/db.connection';
import { activityLogs } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, CreateAuditEntryParams } from './audit.types';

@Injectable()
export class AuditWriteService {
  private readonly logger = new Logger(AuditWriteService.name);

  // ==========================================================================
  // Core write method
  // ==========================================================================

  /**
   * Log a single audit entry. Never throws — errors are caught and logged.
   */
  async log(params: CreateAuditEntryParams): Promise<void> {
    try {
      await db.insert(activityLogs).values({
        userId: params.userId,
        teamId: params.teamId,
        category: params.category,
        entityType: params.entityType,
        entityId: params.entityId,
        entityName: params.entityName,
        action: params.action,
        description: params.description,
        userName: params.userName,
        metadata: params.metadata ?? {},
        changes: params.changes,
        chatId: params.chatId,
        ipAddress: params.ipAddress,
      });
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(
        `Failed to write audit entry [${params.action}] on ${params.entityType}:${params.entityId}: ${error.message}`,
        error.stack,
      );
    }
  }

  // ==========================================================================
  // Utility: compute field-level diff
  // ==========================================================================

  /**
   * Computes a minimal diff between two objects, returning only changed fields.
   * Useful for update operations to store exactly what changed.
   *
   * @returns Object like `{ fieldName: { from: oldVal, to: newVal } }`, or undefined if no changes
   */
  buildChanges(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    fields?: string[],
  ): Record<string, { from: unknown; to: unknown }> | undefined {
    const keys = fields ?? [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ];
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    let hasChanges = false;

    for (const key of keys) {
      const oldVal = before[key];
      const newVal = after[key];
      // Skip undefined values in after (not part of the update)
      if (newVal === undefined) continue;
      // Compare with JSON serialization to handle objects/arrays
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = { from: oldVal ?? null, to: newVal ?? null };
        hasChanges = true;
      }
    }

    return hasChanges ? changes : undefined;
  }

  // ==========================================================================
  // Pipeline / Workflow
  // ==========================================================================

  async logStageCreated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'pipeline',
      entityType: 'workflow_stage',
      action: 'stage_created',
      description: `Created stage "${params.entityName}"`,
    });
  }

  async logStageUpdated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'pipeline',
      entityType: 'workflow_stage',
      action: 'stage_updated',
      description: `Updated stage "${params.entityName}"`,
    });
  }

  async logStageDeleted(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'pipeline',
      entityType: 'workflow_stage',
      action: 'stage_deleted',
      description: `Deleted stage "${params.entityName}"`,
    });
  }

  async logStageReordered(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'pipeline',
      entityType: 'workflow_stage',
      action: 'stage_reordered',
      description: 'Reordered pipeline stages',
    });
  }

  async logStageDefaultChanged(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'pipeline',
      entityType: 'workflow_stage',
      action: 'stage_default_changed',
      description: `Set "${params.entityName}" as default stage`,
    });
  }

  async logChatTransitioned(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    chatId: string;
    metadata: Record<string, unknown>;
    description?: string;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'pipeline',
      entityType: 'chat',
      entityId: params.chatId,
      action: 'chat_transitioned',
    });
  }

  async logHandoffRequested(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    chatId: string;
    metadata?: Record<string, unknown>;
    description?: string;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'pipeline',
      entityType: 'chat',
      entityId: params.chatId,
      action: 'handoff_requested',
      description: params.description ?? 'Handoff to human requested',
    });
  }

  async logHandoffResolved(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    chatId: string;
    metadata?: Record<string, unknown>;
    description?: string;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'pipeline',
      entityType: 'chat',
      entityId: params.chatId,
      action: 'handoff_resolved',
      description: params.description ?? 'Handoff resolved',
    });
  }

  async logAiPauseToggle(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    chatId: string;
    paused: boolean;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const action: AuditAction = params.paused ? 'ai_paused' : 'ai_resumed';
    await this.log({
      userId: params.userId,
      userName: params.userName,
      teamId: params.teamId,
      category: 'pipeline',
      entityType: 'ai_config',
      entityId: params.chatId,
      action,
      chatId: params.chatId,
      description: params.paused
        ? `AI paused${params.reason ? `: ${params.reason}` : ''}`
        : 'AI resumed',
      metadata: { ...params.metadata, reason: params.reason },
    });
  }

  async logChatAssigned(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    chatId: string;
    assigneeId: number;
    assigneeName?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      userId: params.userId,
      userName: params.userName,
      teamId: params.teamId,
      category: 'pipeline',
      entityType: 'chat',
      entityId: params.chatId,
      action: 'chat_assigned',
      chatId: params.chatId,
      description: params.assigneeName
        ? `Assigned chat to ${params.assigneeName}`
        : `Assigned chat to user #${params.assigneeId}`,
      metadata: {
        ...params.metadata,
        assigneeId: params.assigneeId,
        assigneeName: params.assigneeName,
      },
    });
  }

  async logMessageSent(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    chatId: string;
    messageId: string;
    isAi: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const action: AuditAction = params.isAi
      ? 'message_sent_ai'
      : 'message_sent_human';
    await this.log({
      userId: params.userId,
      userName: params.userName,
      teamId: params.teamId,
      category: 'pipeline',
      entityType: 'message',
      entityId: params.messageId,
      action,
      chatId: params.chatId,
      description: params.isAi ? 'AI sent a message' : 'Sent a message',
      metadata: { ...params.metadata, chatId: params.chatId },
    });
  }

  // ==========================================================================
  // Contacts
  // ==========================================================================

  async logContactCreated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'contacts',
      entityType: 'contact',
      action: 'contact_created',
      description: `Created contact "${params.entityName}"`,
    });
  }

  async logContactUpdated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'contacts',
      entityType: 'contact',
      action: 'contact_updated',
      description: `Updated contact "${params.entityName}"`,
    });
  }

  async logContactDeleted(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'contacts',
      entityType: 'contact',
      action: 'contact_deleted',
      description: `Deleted contact "${params.entityName}"`,
    });
  }

  async logContactsBulkDeleted(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    count: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      userId: params.userId,
      userName: params.userName,
      teamId: params.teamId,
      category: 'contacts',
      entityType: 'contact',
      entityId: 'bulk',
      action: 'contacts_bulk_deleted',
      description: `Bulk deleted ${params.count} contacts`,
      metadata: { ...params.metadata, count: params.count },
    });
  }

  // ==========================================================================
  // Templates
  // ==========================================================================

  async logTemplateCreated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'templates',
      entityType: 'template',
      action: 'template_created',
      description: `Created template "${params.entityName}"`,
    });
  }

  async logTemplateUpdated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'templates',
      entityType: 'template',
      action: 'template_updated',
      description: `Updated template "${params.entityName}"`,
    });
  }

  async logTemplateDeleted(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'templates',
      entityType: 'template',
      action: 'template_deleted',
      description: `Deleted template "${params.entityName}"`,
    });
  }

  async logTemplateSubmitted(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'templates',
      entityType: 'template',
      action: 'template_submitted',
      description: `Submitted template "${params.entityName}" for approval`,
    });
  }

  async logTemplateVersionCreated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'templates',
      entityType: 'template_version',
      action: 'template_version_created',
      description: `Created new version for template "${params.entityName}"`,
    });
  }

  // ==========================================================================
  // Team
  // ==========================================================================

  async logMemberAdded(params: {
    userId: number;
    userName?: string;
    teamId: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'team',
      entityType: 'team_member',
      action: 'member_added',
      description: `Added "${params.entityName}" to the team`,
    });
  }

  async logMemberRemoved(params: {
    userId: number;
    userName?: string;
    teamId: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'team',
      entityType: 'team_member',
      action: 'member_removed',
      description: `Removed "${params.entityName}" from the team`,
    });
  }

  async logRoleChanged(params: {
    userId: number;
    userName?: string;
    teamId: number;
    entityId: string;
    entityName: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'team',
      entityType: 'team_member',
      action: 'role_changed',
      description: `Changed role for "${params.entityName}"`,
    });
  }

  async logInvitationSent(params: {
    userId: number;
    userName?: string;
    teamId: number;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const email = (params.metadata as Record<string, unknown>)?.email as
      | string
      | undefined;
    await this.log({
      ...params,
      category: 'team',
      entityType: 'invitation',
      entityName: email,
      action: 'invitation_sent',
      description: email
        ? `Sent invitation to ${email}`
        : 'Sent team invitation',
    });
  }

  async logInvitationAccepted(params: {
    userId: number;
    userName?: string;
    teamId: number;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'team',
      entityType: 'invitation',
      action: 'invitation_accepted',
      description: 'Invitation accepted',
    });
  }

  async logCustomRoleCreated(params: {
    userId: number;
    userName?: string;
    teamId: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'team',
      entityType: 'custom_role',
      action: 'custom_role_created',
      description: `Created custom role "${params.entityName}"`,
    });
  }

  async logCustomRoleUpdated(params: {
    userId: number;
    userName?: string;
    teamId: number;
    entityId: string;
    entityName: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'team',
      entityType: 'custom_role',
      action: 'custom_role_updated',
      description: `Updated custom role "${params.entityName}"`,
    });
  }

  async logCustomRoleDeleted(params: {
    userId: number;
    userName?: string;
    teamId: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'team',
      entityType: 'custom_role',
      action: 'custom_role_deleted',
      description: `Deleted custom role "${params.entityName}"`,
    });
  }

  // ==========================================================================
  // Catalog
  // ==========================================================================

  async logCatalogItemCreated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'catalog',
      entityType: 'catalog_item',
      action: 'catalog_item_created',
      description: `Created catalog item "${params.entityName}"`,
    });
  }

  async logCatalogItemUpdated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'catalog',
      entityType: 'catalog_item',
      action: 'catalog_item_updated',
      description: `Updated catalog item "${params.entityName}"`,
    });
  }

  async logCatalogItemDeleted(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'catalog',
      entityType: 'catalog_item',
      action: 'catalog_item_deleted',
      description: `Deleted catalog item "${params.entityName}"`,
    });
  }

  async logCatalogLinked(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'catalog',
      entityType: 'catalog',
      action: 'catalog_linked',
      description: params.entityName
        ? `Linked catalog "${params.entityName}" to Meta`
        : 'Linked catalog to Meta',
    });
  }

  async logCatalogUnlinked(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'catalog',
      entityType: 'catalog',
      action: 'catalog_unlinked',
      description: params.entityName
        ? `Unlinked catalog "${params.entityName}" from Meta`
        : 'Unlinked catalog from Meta',
    });
  }

  async logCollectionCreated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'catalog',
      entityType: 'catalog_collection',
      action: 'collection_created',
      description: `Created collection "${params.entityName}"`,
    });
  }

  async logCollectionDeleted(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'catalog',
      entityType: 'catalog_collection',
      action: 'collection_deleted',
      description: `Deleted collection "${params.entityName}"`,
    });
  }

  async logCatalogBulkImport(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    count: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      userId: params.userId,
      userName: params.userName,
      teamId: params.teamId,
      category: 'catalog',
      entityType: 'catalog_item',
      entityId: params.entityId,
      action: 'catalog_bulk_import',
      description: `Bulk imported ${params.count} catalog items`,
      metadata: { ...params.metadata, count: params.count },
    });
  }

  // ==========================================================================
  // Senders
  // ==========================================================================

  async logSenderCreated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'senders',
      entityType: 'sender',
      action: 'sender_created',
      description: `Created sender "${params.entityName}"`,
    });
  }

  async logSenderUpdated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'senders',
      entityType: 'sender',
      action: 'sender_updated',
      description: `Updated sender "${params.entityName}"`,
    });
  }

  async logSenderRemoved(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'senders',
      entityType: 'sender',
      action: 'sender_removed',
      description: `Removed sender "${params.entityName}"`,
    });
  }

  async logSenderSynced(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'senders',
      entityType: 'sender',
      action: 'sender_synced',
      description: 'Synced senders from WhatsApp Business Account',
    });
  }

  // ==========================================================================
  // Labels
  // ==========================================================================

  async logLabelCreated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'labels',
      entityType: 'label',
      action: 'label_created',
      description: `Created label "${params.entityName}"`,
    });
  }

  async logLabelUpdated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'labels',
      entityType: 'label',
      action: 'label_updated',
      description: `Updated label "${params.entityName}"`,
    });
  }

  async logLabelDeleted(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'labels',
      entityType: 'label',
      action: 'label_deleted',
      description: `Deleted label "${params.entityName}"`,
    });
  }

  async logLabelsApplied(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    labelNames: string[];
    chatIds: string[];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const labelList = params.labelNames.join(', ');
    await this.log({
      userId: params.userId,
      userName: params.userName,
      teamId: params.teamId,
      category: 'labels',
      entityType: 'label',
      entityId: 'batch',
      action: 'labels_applied',
      description: `Applied labels [${labelList}] to ${params.chatIds.length} chat(s)`,
      metadata: {
        ...params.metadata,
        labelNames: params.labelNames,
        chatIds: params.chatIds,
      },
    });
  }

  async logLabelsRemoved(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    labelNames: string[];
    chatIds: string[];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const labelList = params.labelNames.join(', ');
    await this.log({
      userId: params.userId,
      userName: params.userName,
      teamId: params.teamId,
      category: 'labels',
      entityType: 'label',
      entityId: 'batch',
      action: 'labels_removed',
      description: `Removed labels [${labelList}] from ${params.chatIds.length} chat(s)`,
      metadata: {
        ...params.metadata,
        labelNames: params.labelNames,
        chatIds: params.chatIds,
      },
    });
  }

  // ==========================================================================
  // Knowledge Base
  // ==========================================================================

  async logKBObjectCreated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'knowledge_base',
      entityType: 'kb_object',
      action: 'kb_object_created',
      description: `Created knowledge base entry "${params.entityName}"`,
    });
  }

  async logKBObjectUpdated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'knowledge_base',
      entityType: 'kb_object',
      action: 'kb_object_updated',
      description: `Updated knowledge base entry "${params.entityName}"`,
    });
  }

  async logKBObjectDeleted(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'knowledge_base',
      entityType: 'kb_object',
      action: 'kb_object_deleted',
      description: `Deleted knowledge base entry "${params.entityName}"`,
    });
  }

  async logKBObjectPublished(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'knowledge_base',
      entityType: 'kb_object',
      action: 'kb_object_published',
      description: `Published knowledge base entry "${params.entityName}"`,
    });
  }

  async logKBTemplateCreated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'knowledge_base',
      entityType: 'kb_template',
      action: 'kb_template_created',
      description: `Created knowledge base template "${params.entityName}"`,
    });
  }

  async logKBTemplateUpdated(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'knowledge_base',
      entityType: 'kb_template',
      action: 'kb_template_updated',
      description: `Updated knowledge base template "${params.entityName}"`,
    });
  }

  async logKBTemplateDeleted(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'knowledge_base',
      entityType: 'kb_template',
      action: 'kb_template_deleted',
      description: `Deleted knowledge base template "${params.entityName}"`,
    });
  }

  // ==========================================================================
  // Import Jobs
  // ==========================================================================

  async logImportStarted(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'import',
      entityType: 'import_job',
      action: 'import_started',
      description: params.entityName
        ? `Started import "${params.entityName}"`
        : 'Started contact import',
    });
  }

  async logImportCompleted(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const total = (params.metadata as Record<string, unknown>)
      ?.totalImported as number | undefined;
    await this.log({
      ...params,
      category: 'import',
      entityType: 'import_job',
      action: 'import_completed',
      description: total
        ? `Completed import of ${total} contacts`
        : 'Completed contact import',
    });
  }

  async logImportRolledBack(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'import',
      entityType: 'import_job',
      action: 'import_rolled_back',
      description: 'Rolled back contact import',
    });
  }

  // ==========================================================================
  // Settings
  // ==========================================================================

  async logSettingChanged(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    entityId: string;
    entityName?: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      ...params,
      category: 'settings',
      entityType: 'setting',
      action: 'setting_changed',
      description: params.entityName
        ? `Changed setting "${params.entityName}"`
        : `Changed setting "${params.entityId}"`,
    });
  }

  // ==========================================================================
  // Auth (personal activity)
  // ==========================================================================

  async logAuthAction(params: {
    userId: number;
    userName?: string;
    teamId?: number;
    action: Extract<
      AuditAction,
      | 'sign_in'
      | 'sign_up'
      | 'sign_out'
      | 'password_changed'
      | 'password_reset_requested'
      | 'password_reset_completed'
      | 'account_deleted'
    >;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      userId: params.userId,
      userName: params.userName,
      teamId: params.teamId,
      category: 'auth',
      entityType: 'user',
      entityId: params.userId.toString(),
      action: params.action,
      ipAddress: params.ipAddress,
      description: params.action.replace(/_/g, ' '),
      metadata: params.metadata,
    });
  }
}
