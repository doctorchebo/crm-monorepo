/**
 * Workflow Engine Types
 * Type definitions for the workflow engine module
 */

import type { WorkflowStageConfig } from './workflow.types';
import type { AIReplyInteractiveData } from '@modules/ai-reply/types';

// Re-export WorkflowStageConfig for convenience
export type { WorkflowStageConfig };

// ============================================================================
// Configuration Constants
// ============================================================================

export const AI_CONFIDENCE_THRESHOLD = 0.7;

export const AUTO_HANDOFF_CATEGORIES = [
  'complaint',
  'urgent',
  'legal',
  'refund',
];

export const HANDOFF_KEYWORDS = [
  'hablar con humano',
  'agente',
  'persona real',
  'speak to human',
  'real person',
];

// ============================================================================
// Input Types
// ============================================================================

export interface ProcessMessageInput {
  chatId: string;
  messageId: string;
  messageContent: string;
  senderId: number;
  userId: number;
  isFromCustomer: boolean;
  /** Interactive response data when user clicks a button or list item */
  interactiveResponse?: {
    type: 'button_reply' | 'list_reply';
    buttonId?: string;
    buttonTitle?: string;
    rowId?: string;
    rowTitle?: string;
    rowDescription?: string;
  };
}

// ============================================================================
// Result Types
// ============================================================================

export interface MediaAttachment {
  mediaId: string;
  objectId: string;
  objectName: string;
  s3Key: string;
  s3Bucket: string;
  fileName: string;
  mimeType: string;
  caption: string | null;
  mediaType: 'image' | 'video' | 'audio' | 'document';
}

export interface AiResponseResult {
  content: string;
  confidence: number;
  shouldSend: boolean;
  requiresHandoff: boolean;
  /** Media attachment to send with the response */
  mediaAttachment?: MediaAttachment;
  /** Interactive CTA data for the response (dynamic buttons) */
  interactiveData?: AIReplyInteractiveData;
}

/**
 * Stage transition info returned by processMessage
 * Different from StageTransitionResult (used internally by StageService)
 */
export interface ProcessStageTransition {
  from: WorkflowStageConfig | null;
  to: WorkflowStageConfig;
  reason: string;
  ruleId?: string;
  ruleName?: string;
}

export interface PolicyCheckResult {
  passed: boolean;
  warnings: string[];
}

export interface ProcessMessageResult {
  success: boolean;
  classification?: ClassificationResultType;
  stageTransition?: ProcessStageTransition;
  aiResponse?: AiResponseResult;
  handoffRequested?: boolean;
  policyCheck?: PolicyCheckResult;
  error?: string;
}

// ============================================================================
// Classification Types
// ============================================================================

export interface ClassificationResultType {
  category: string;
  sentiment: string;
  sentimentScore: number;
  keywords: string[];
  confidence: number;
  requiresHandoff: boolean;
  intent?: string;
}

// ============================================================================
// Summary & Status Types
// ============================================================================

export interface WorkflowStageSummary {
  stageId: string;
  stageName: string;
  count: number;
  color: string;
}

export interface WorkflowSummary {
  totalChats: number;
  byStage: WorkflowStageSummary[];
  pendingHandoffs: number;
  aiPaused: number;
  recentTransitions: number;
}

export interface HandoffStatusInfo {
  isPending: boolean;
  requestedAt?: Date;
  reason?: string;
}

export interface LastTransitionInfo {
  from: string;
  to: string;
  reason: string;
  timestamp: Date;
}

export interface ChatWorkflowStatus {
  chatId: string;
  currentStage: WorkflowStageConfig | null;
  handoffStatus: HandoffStatusInfo;
  aiEnabled: boolean;
  lastTransition?: LastTransitionInfo;
  classification?: ClassificationResultType;
}

export interface AiStatusResult {
  chatId: string;
  aiEnabled: boolean;
  aiConfigEnabled: boolean;
  reason?: string;
  isRateLimited: boolean;
  rateLimitReset?: Date;
  rateLimitCurrentCount?: number;
  rateLimitMaxCount?: number;
}

// ============================================================================
// Media Context Types
// ============================================================================

export interface MediaPreCheckResult {
  willHaveMedia: boolean;
  mediaDescription: string | null;
  mediaType: 'image' | 'video' | 'document' | 'audio' | null;
  mediaFileName: string | null;
  aiInstructions: string | null;
}
