// ============================================================================
// Audit Module Types
// ============================================================================
// Centralized type definitions for the unified audit system.
// All modules use these types when logging audit entries.
// ============================================================================

/**
 * High-level section grouping for audit entries.
 * Used for filtering and organizing history by app section.
 */
export type AuditCategory =
  | 'pipeline'
  | 'contacts'
  | 'templates'
  | 'team'
  | 'senders'
  | 'labels'
  | 'knowledge_base'
  | 'import'
  | 'settings'
  | 'auth';

/**
 * All possible audit actions across the system.
 * Grouped by category for clarity.
 */
export type AuditAction =
  // Pipeline / Workflow
  | 'stage_created'
  | 'stage_updated'
  | 'stage_deleted'
  | 'stage_reordered'
  | 'stage_default_changed'
  | 'chat_transitioned'
  | 'handoff_requested'
  | 'handoff_resolved'
  | 'ai_paused'
  | 'ai_resumed'
  | 'chat_assigned'
  | 'chat_reassigned'
  | 'chat_unassigned'
  | 'message_sent_human'
  | 'message_sent_ai'
  | 'message_deleted'
  | 'message_edited'
  | 'note_added'
  | 'note_deleted'
  | 'chat_created'
  | 'chat_deleted'
  | 'lock_acquired'
  | 'lock_released'
  | 'lock_force_released'
  // Contacts
  | 'contact_created'
  | 'contact_updated'
  | 'contact_deleted'
  | 'contacts_bulk_deleted'
  // Templates
  | 'template_created'
  | 'template_updated'
  | 'template_deleted'
  | 'template_submitted'
  | 'template_version_created'
  // Team
  | 'member_added'
  | 'member_removed'
  | 'role_changed'
  | 'invitation_sent'
  | 'invitation_accepted'
  | 'invitation_revoked'
  | 'invitation_expired'
  | 'custom_role_created'
  | 'custom_role_updated'
  | 'custom_role_deleted'
  // Senders
  | 'sender_created'
  | 'sender_updated'
  | 'sender_removed'
  | 'sender_synced'
  // Labels
  | 'label_created'
  | 'label_updated'
  | 'label_deleted'
  | 'labels_applied'
  | 'labels_removed'
  // Knowledge Base
  | 'kb_object_created'
  | 'kb_object_updated'
  | 'kb_object_deleted'
  | 'kb_object_published'
  | 'kb_template_created'
  | 'kb_template_updated'
  | 'kb_template_deleted'
  // Import Jobs
  | 'import_started'
  | 'import_completed'
  | 'import_rolled_back'
  | 'import_deleted'
  // Settings
  | 'setting_changed'
  // Auth (personal activity)
  | 'sign_in'
  | 'sign_up'
  | 'sign_out'
  | 'password_changed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'account_deleted';

/**
 * Entity types affected by audit actions.
 */
export type AuditEntityType =
  | 'chat'
  | 'chat_lock'
  | 'message'
  | 'note'
  | 'contact'
  | 'template'
  | 'template_version'
  | 'team'
  | 'team_member'
  | 'invitation'
  | 'custom_role'
  | 'workflow_stage'
  | 'ai_config'
  | 'sender'
  | 'label'
  | 'kb_object'
  | 'kb_template'
  | 'import_job'
  | 'setting'
  | 'user';

// ============================================================================
// Write types
// ============================================================================

/**
 * Parameters for creating a new audit entry.
 * Used by AuditWriteService.log() and all convenience methods.
 */
export interface CreateAuditEntryParams {
  userId: number;
  userName?: string;
  teamId?: number;
  category: AuditCategory;
  entityType: AuditEntityType;
  entityId: string;
  entityName?: string;
  action: AuditAction;
  description?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
  chatId?: string;
  ipAddress?: string;
}

// ============================================================================
// Query types
// ============================================================================

/**
 * Filters for querying audit logs.
 */
export interface AuditQueryFilters {
  category?: AuditCategory;
  categories?: AuditCategory[];
  entityType?: AuditEntityType;
  entityId?: string;
  action?: AuditAction;
  actions?: AuditAction[];
  userId?: number;
  startDate?: Date;
  endDate?: Date;
  chatId?: string;
  search?: string;
}

/**
 * A single audit log entry returned by queries.
 */
export interface AuditEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  teamId: number | null;
  category: string | null;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  action: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  chatId: string | null;
  ipAddress: string | null;
  createdAt: Date | null;
}

/**
 * Paginated result wrapper.
 */
export interface PaginatedAuditResult {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Team member info for the member filter dropdown.
 */
export interface AuditTeamMember {
  id: number;
  name: string;
  email: string;
  role: string;
}
