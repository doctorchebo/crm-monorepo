/**
 * Handoff Types
 * Types for human-AI handoff management
 */

export interface HandoffRequest {
  chatId: string;
  reason: string;
  messageId?: string;
  pauseAi?: boolean;
}

export interface HandoffStatus {
  chatId: string;
  awaitingHandoff: boolean;
  handoffRequestedAt?: Date;
  handoffReason?: string;
  aiPaused: boolean;
  aiPausedAt?: Date;
  aiPausedBy?: number;
  currentStageId?: string | null;
  currentStageName: string;
}

export interface ResolveHandoffRequest {
  chatId: string;
  userId: number;
  resumeAi?: boolean;
  newStageId?: string;
  resolution?: string;
}
