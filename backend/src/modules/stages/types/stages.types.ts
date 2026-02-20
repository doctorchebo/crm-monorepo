/**
 * Stage Types
 * Type definitions for the pipeline stages (Kanban board)
 */

// ============================================================================
// Stage Types
// ============================================================================

export interface StageConfig {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  sortOrder: number;
  isDefault: boolean;
  isFinal: boolean;
  aiAutoReply: boolean;
  aiHandoffRequired: boolean;
}

export interface CreateStageRequest {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  isDefault?: boolean;
  isFinal?: boolean;
  aiAutoReply?: boolean;
  aiHandoffRequired?: boolean;
}

export interface UpdateStageRequest {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  isDefault?: boolean;
  isFinal?: boolean;
  aiAutoReply?: boolean;
  aiHandoffRequired?: boolean;
  isActive?: boolean;
}

// ============================================================================
// Default Stages
// ============================================================================

export const DEFAULT_PIPELINE_STAGES: Omit<CreateStageRequest, 'userId'>[] = [
  {
    name: 'New Lead',
    description: 'Initial contact - unqualified leads',
    color: '#6366f1',
    icon: 'user-plus',
    sortOrder: 0,
    isDefault: true,
    isFinal: false,
    aiAutoReply: true,
    aiHandoffRequired: false,
  },
  {
    name: 'Interested',
    description: 'Lead has shown interest in products/services',
    color: '#8b5cf6',
    icon: 'star',
    sortOrder: 1,
    isDefault: false,
    isFinal: false,
    aiAutoReply: true,
    aiHandoffRequired: false,
  },
  {
    name: 'Negotiating',
    description: 'Active negotiation or quote stage',
    color: '#f59e0b',
    icon: 'message-circle',
    sortOrder: 2,
    isDefault: false,
    isFinal: false,
    aiAutoReply: true,
    aiHandoffRequired: true,
  },
  {
    name: 'Won',
    description: 'Deal closed successfully',
    color: '#10b981',
    icon: 'check-circle',
    sortOrder: 3,
    isDefault: false,
    isFinal: true,
    aiAutoReply: false,
    aiHandoffRequired: false,
  },
  {
    name: 'Lost',
    description: 'Deal lost or customer not interested',
    color: '#ef4444',
    icon: 'x-circle',
    sortOrder: 4,
    isDefault: false,
    isFinal: true,
    aiAutoReply: false,
    aiHandoffRequired: false,
  },
];
