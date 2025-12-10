/**
 * Message Status DTO
 *
 * Comprehensive status information for message delivery tracking
 * Supports the double-tick (✓✓) feature with status history
 */

export interface MessageStatusHistoryEvent {
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string; // ISO 8601
  failureReason?: string; // Present only if status is 'failed'
}

/**
 * Complete message status response
 * Used by GET /whatsapp/messages/:messageId/status endpoint
 */
export interface MessageStatusDto {
  messageId: string;
  direction: 'inbound' | 'outbound';
  currentStatus: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

  // Timestamp tracking for UI display
  sentAt?: string; // ISO 8601 - When message reached WhatsApp servers
  deliveredAt?: string; // ISO 8601 - When message reached recipient device
  readAt?: string; // ISO 8601 - When message was read
  failedReason?: string; // Error reason if failed

  // Status history for debugging
  statusHistory: MessageStatusHistoryEvent[];

  // Last update for cache invalidation
  updatedAt: string; // ISO 8601
}

/**
 * Status update event from Meta Cloud API webhook
 * Maps to CloudAPIMessageStatus from cloud-api.types
 */
export interface MetaStatusUpdateEvent {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string; // Unix timestamp as string
  recipientId?: string;
  errorData?: {
    code: number;
    title: string;
    message: string;
  };
}

/**
 * Batch status update response
 * When fetching multiple message statuses
 */
export interface BatchMessageStatusDto {
  messages: MessageStatusDto[];
  totalCount: number;
  lastUpdated: string; // ISO 8601
}
