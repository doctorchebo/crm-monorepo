/**
 * Workflow Types
 * Type definitions for the workflow engine
 */

// ============================================================================
// Stage Types
// ============================================================================

export interface WorkflowStageConfig {
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
// Rule Types
// ============================================================================

export type ConditionType =
  | 'keyword'
  | 'sentiment'
  | 'category'
  | 'intent'
  | 'custom';

export type TriggerType = 'ai' | 'human' | 'system' | 'rule';

export interface KeywordCondition {
  keywords: string[];
  matchMode: 'any' | 'all' | 'exact';
  caseSensitive: boolean;
}

export interface SentimentCondition {
  sentiment: 'positive' | 'negative' | 'neutral';
  threshold: number; // 0-100
}

export interface CategoryCondition {
  categories: string[];
  matchMode: 'any' | 'all';
}

export interface IntentCondition {
  intents: string[];
  matchMode: 'any' | 'all';
}

export interface CustomCondition {
  expression: string; // Custom expression to evaluate
  variables: Record<string, unknown>;
}

export type RuleConditions =
  | { type: 'keyword'; config: KeywordCondition }
  | { type: 'sentiment'; config: SentimentCondition }
  | { type: 'category'; config: CategoryCondition }
  | { type: 'intent'; config: IntentCondition }
  | { type: 'custom'; config: CustomCondition };

export interface WorkflowRuleConfig {
  id: string;
  name: string;
  description?: string;
  fromStageId: string | null;
  toStageId: string;
  conditionType: ConditionType;
  conditions: RuleConditions;
  useAiClassification: boolean;
  aiPrompt?: string;
  confidenceThreshold: number;
  priority: number;
  isActive: boolean;
  requiresHumanApproval: boolean;
}

export interface CreateRuleRequest {
  name: string;
  description?: string;
  fromStageId?: string;
  toStageId: string;
  conditionType: ConditionType;
  conditions: RuleConditions;
  useAiClassification?: boolean;
  aiPrompt?: string;
  confidenceThreshold?: number;
  priority?: number;
  requiresHumanApproval?: boolean;
}

export interface UpdateRuleRequest {
  name?: string;
  description?: string;
  fromStageId?: string | null;
  toStageId?: string;
  conditionType?: ConditionType;
  conditions?: RuleConditions;
  useAiClassification?: boolean;
  aiPrompt?: string;
  confidenceThreshold?: number;
  priority?: number;
  isActive?: boolean;
  requiresHumanApproval?: boolean;
}

// ============================================================================
// Classification Types
// ============================================================================

export interface MessageClassification {
  category: string;
  subcategory?: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number; // -100 to 100
  intent?: string;
  keywords: string[];
  confidence: number; // 0-100
  suggestedStageId?: string;
  suggestedStageName?: string;
  requiresHandoff: boolean;
  handoffReason?: string;
  rawResponse?: unknown;
}

export interface ClassificationRequest {
  chatId: string;
  messageText: string;
  messageId?: string;
  context?: {
    recentMessages?: Array<{
      role: 'customer' | 'business';
      text: string;
      timestamp: Date;
    }>;
    customerName?: string;
    currentStageId?: string;
    currentStageName?: string;
  };
}

// ============================================================================
// Stage Transition Types
// ============================================================================

export interface StageTransitionRequest {
  chatId: string;
  toStageId: string;
  triggerType: TriggerType;
  triggerMessageId?: string;
  triggeredBy?: number; // userId for human triggers
  ruleId?: string;
  aiClassification?: MessageClassification;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface StageTransitionResult {
  success: boolean;
  previousStageId: string | null;
  newStageId: string;
  transitionId: string;
  awaitingHandoff: boolean;
  error?: string;
}

// ============================================================================
// Handoff Types
// ============================================================================

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
  currentStageId?: string | null; // Optional - may not have a stage assigned
  currentStageName: string;
}

export interface ResolveHandoffRequest {
  chatId: string;
  userId: number;
  resumeAi?: boolean;
  newStageId?: string;
  resolution?: string;
}

// ============================================================================
// Rule Evaluation Types
// ============================================================================

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  confidence: number;
  targetStageId: string;
  targetStageName: string;
  requiresHumanApproval: boolean;
  evaluationDetails?: Record<string, unknown>;
}

export interface EvaluateRulesRequest {
  chatId: string;
  messageText: string;
  messageId?: string;
  currentStageId?: string;
}

export interface EvaluateRulesResult {
  matchedRules: RuleEvaluationResult[];
  bestMatch: RuleEvaluationResult | null;
  classification?: MessageClassification;
  shouldTransition: boolean;
  requiresApproval: boolean;
}

// ============================================================================
// Chat Assignment Types
// ============================================================================

export interface ChatAssignment {
  chatId: string;
  stageId: string;
  stageName: string;
  stageColor: string;
  awaitingHandoff: boolean;
  handoffRequestedAt?: Date;
  handoffReason?: string;
  aiPaused: boolean;
  aiPausedAt?: Date;
  assignedAt: Date;
}

export interface AssignChatRequest {
  chatId: string;
  stageId: string;
  reason?: string;
}

// ============================================================================
// History Types
// ============================================================================

export interface StageHistoryEntry {
  id: string;
  chatId: string;
  fromStageId: string | null;
  fromStageName: string | null;
  toStageId: string;
  toStageName: string;
  triggerType: TriggerType;
  triggerMessageId?: string;
  triggeredByUserId?: number;
  triggeredByUserName?: string;
  ruleId?: string;
  ruleName?: string;
  aiClassification?: MessageClassification;
  aiConfidence?: number;
  reason?: string;
  createdAt: Date;
}

export interface GetHistoryRequest {
  chatId: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Default Stages
// ============================================================================

export const DEFAULT_WORKFLOW_STAGES: Omit<CreateStageRequest, 'userId'>[] = [
  {
    name: 'New Lead',
    description: 'Initial contact - unqualified leads',
    color: '#6366f1', // Indigo
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
    color: '#8b5cf6', // Purple
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
    color: '#f59e0b', // Amber
    icon: 'message-circle',
    sortOrder: 2,
    isDefault: false,
    isFinal: false,
    aiAutoReply: true,
    aiHandoffRequired: true, // Requires human for pricing discussions
  },
  {
    name: 'Won',
    description: 'Deal closed successfully',
    color: '#10b981', // Emerald
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
    color: '#ef4444', // Red
    icon: 'x-circle',
    sortOrder: 4,
    isDefault: false,
    isFinal: true,
    aiAutoReply: false,
    aiHandoffRequired: false,
  },
];

// ============================================================================
// Predefined Categories for Classification
// ============================================================================

export const MESSAGE_CATEGORIES = [
  'inquiry',
  'complaint',
  'support',
  'purchase_intent',
  'feedback',
  'greeting',
  'farewell',
  'pricing',
  'availability',
  'shipping',
  'returns',
  'technical',
  'general',
] as const;

export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

export const SENTIMENT_LABELS = ['positive', 'negative', 'neutral'] as const;

export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];
