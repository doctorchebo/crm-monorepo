/**
 * Interactive Message Types
 *
 * Types for WhatsApp Cloud API interactive messages (buttons and lists)
 * and proactive sales funnel CTAs.
 *
 * IMPORTANT: Interactive messages can ONLY be sent within the 24-hour conversation window.
 * Unlike templates, they CANNOT be used to initiate conversations.
 *
 * @see https://developers.facebook.com/docs/whatsapp/guides/interactive-messages/
 */

import {
  InteractiveMessageType as InteractiveMessageTypeFromConstants,
  MAX_BUTTON_TITLE_LENGTH,
  MAX_REPLY_BUTTONS,
} from '@modules/whatsapp/constants';

// ============================================================================
// WHATSAPP INTERACTIVE MESSAGE TYPES
// ============================================================================

/**
 * Types of interactive messages supported by WhatsApp Cloud API
 */
export type InteractiveMessageType = InteractiveMessageTypeFromConstants;

/**
 * A single button in an interactive message
 * @see MAX_REPLY_BUTTONS - Max 3 buttons per message
 * @see MAX_BUTTON_TITLE_LENGTH - Max 20 chars per title
 */
export interface InteractiveButton {
  /** Unique identifier for this button (returned in webhook) */
  id: string;
  /** Button text shown to user (max ${MAX_BUTTON_TITLE_LENGTH} chars) */
  title: string;
}

/**
 * A single row in a list section
 */
export interface InteractiveListRow {
  /** Unique identifier for this row (returned in webhook) */
  id: string;
  /** Row title (max ${MAX_LIST_ROW_TITLE_LENGTH} chars) */
  title: string;
  /** Optional description (max ${MAX_LIST_ROW_DESCRIPTION_LENGTH} chars) */
  description?: string;
}

/**
 * A section in an interactive list message
 */
export interface InteractiveListSection {
  /** Section title (max ${MAX_SECTION_TITLE_LENGTH} chars) */
  title: string;
  /** Rows in this section (max ${MAX_ROWS_PER_SECTION} per section) */
  rows: InteractiveListRow[];
}

/**
 * Header for interactive messages
 */
export interface InteractiveHeader {
  type: 'text' | 'image' | 'video' | 'document';
  text?: string;
  image?: { link: string };
  video?: { link: string };
  document?: { link: string; filename: string };
}

/**
 * Options for creating an interactive button message
 */
export interface InteractiveButtonMessageOptions {
  /** Recipient phone number */
  to: string;
  /** Message body text */
  bodyText: string;
  /** Buttons to display (max 3) */
  buttons: InteractiveButton[];
  /** Optional header */
  header?: InteractiveHeader;
  /** Optional footer text (max 60 chars) */
  footerText?: string;
}

/**
 * Options for creating an interactive list message
 */
export interface InteractiveListMessageOptions {
  /** Recipient phone number */
  to: string;
  /** Message body text */
  bodyText: string;
  /** Button text that opens the list (max 20 chars) */
  buttonText: string;
  /** Sections containing list items */
  sections: InteractiveListSection[];
  /** Optional header */
  header?: InteractiveHeader;
  /** Optional footer text (max 60 chars) */
  footerText?: string;
}

/**
 * Response from user clicking a button
 */
export interface InteractiveButtonResponse {
  /** The button ID that was clicked */
  buttonId: string;
  /** The button title */
  buttonTitle: string;
}

/**
 * Response from user selecting a list item
 */
export interface InteractiveListResponse {
  /** The row ID that was selected */
  rowId: string;
  /** The row title */
  rowTitle: string;
  /** The row description if present */
  rowDescription?: string;
}

// ============================================================================
// SALES FUNNEL TYPES
// ============================================================================

/**
 * Stages in a real estate sales funnel
 */
export type FunnelStage =
  | 'awareness' // Initial contact, showing interest
  | 'interest' // Requesting info, asking questions
  | 'consideration' // Comparing options, requesting specific details
  | 'intent' // Expressing serious interest, scheduling viewings
  | 'evaluation' // Visited property, awaiting decision
  | 'purchase'; // Ready to close/closed

/**
 * Predefined CTA actions for the sales funnel
 */
export type CTAAction =
  // Awareness stage
  | 'send_overview'
  | 'send_location_info'
  // Interest stage
  | 'send_brochure'
  | 'send_price_sheet'
  | 'send_photos'
  | 'send_video_tour'
  // Consideration stage
  | 'send_floor_plan'
  | 'send_specifications'
  | 'compare_options'
  // Intent stage
  | 'schedule_viewing'
  | 'schedule_call'
  | 'talk_to_agent'
  // Evaluation stage
  | 'send_proposal'
  | 'answer_questions'
  // Purchase stage
  | 'send_contract'
  | 'schedule_signing'
  // Generic
  | 'request_callback'
  | 'get_more_info'
  | 'ask_question';

/**
 * A call-to-action option to present to the user
 */
export interface FunnelCTA {
  /** Unique action identifier */
  action: CTAAction;
  /** Button/row title shown to user */
  label: string;
  /** Description (for list items) */
  description?: string;
  /** What funnel stages this CTA is appropriate for */
  appropriateStages: FunnelStage[];
  /** Priority order (higher = more prominent) */
  priority: number;
  /** Whether this requires media attachment */
  requiresMedia?: boolean;
  /** Media roles appropriate for this action */
  mediaRoles?: string[];
}

/**
 * Registry of all available CTAs with metadata
 */
export const FUNNEL_CTA_REGISTRY: FunnelCTA[] = [
  // Awareness CTAs
  {
    action: 'send_overview',
    label: 'Send me an overview',
    description: 'Get a general overview of our properties',
    appropriateStages: ['awareness', 'interest'],
    priority: 90,
    requiresMedia: true,
    mediaRoles: ['brochure', 'hero_image'],
  },
  {
    action: 'send_location_info',
    label: 'Send location details',
    description: 'See where our properties are located',
    appropriateStages: ['awareness', 'interest', 'consideration'],
    priority: 75,
    requiresMedia: true,
    mediaRoles: ['map', 'gallery_image'],
  },

  // Interest CTAs
  {
    action: 'send_brochure',
    label: 'Send me a brochure',
    description: 'Get our detailed property brochure',
    appropriateStages: ['interest', 'consideration'],
    priority: 95,
    requiresMedia: true,
    mediaRoles: ['brochure'],
  },
  {
    action: 'send_price_sheet',
    label: 'Send pricing info',
    description: 'View our current prices and availability',
    appropriateStages: ['interest', 'consideration', 'intent'],
    priority: 100,
    requiresMedia: true,
    mediaRoles: ['price_sheet'],
  },
  {
    action: 'send_photos',
    label: 'Send me photos',
    description: 'See property photos and gallery',
    appropriateStages: ['interest', 'consideration'],
    priority: 85,
    requiresMedia: true,
    mediaRoles: ['hero_image', 'gallery_image'],
  },
  {
    action: 'send_video_tour',
    label: 'Send video tour',
    description: 'Watch a virtual property tour',
    appropriateStages: ['interest', 'consideration', 'intent'],
    priority: 80,
    requiresMedia: true,
    mediaRoles: ['video_tour', 'promotional_video'],
  },

  // Consideration CTAs
  {
    action: 'send_floor_plan',
    label: 'Send floor plans',
    description: 'View detailed floor plans and layouts',
    appropriateStages: ['consideration', 'intent'],
    priority: 85,
    requiresMedia: true,
    mediaRoles: ['floor_plan'],
  },
  {
    action: 'send_specifications',
    label: 'Send specifications',
    description: 'Get detailed technical specifications',
    appropriateStages: ['consideration', 'intent', 'evaluation'],
    priority: 70,
    requiresMedia: true,
    mediaRoles: ['specification_sheet'],
  },
  {
    action: 'compare_options',
    label: 'Compare options',
    description: 'See comparison of available units',
    appropriateStages: ['consideration', 'intent'],
    priority: 65,
    requiresMedia: false,
  },

  // Intent CTAs
  {
    action: 'schedule_viewing',
    label: 'Schedule a viewing',
    description: 'Book a property visit',
    appropriateStages: ['consideration', 'intent', 'evaluation'],
    priority: 100,
    requiresMedia: false,
  },
  {
    action: 'schedule_call',
    label: 'Schedule a call',
    description: 'Book a call with our team',
    appropriateStages: ['interest', 'consideration', 'intent', 'evaluation'],
    priority: 90,
    requiresMedia: false,
  },
  {
    action: 'talk_to_agent',
    label: 'Talk to an agent',
    description: 'Connect with a sales representative',
    appropriateStages: ['intent', 'evaluation', 'purchase'],
    priority: 95,
    requiresMedia: false,
  },

  // Evaluation CTAs
  {
    action: 'send_proposal',
    label: 'Send me a proposal',
    description: 'Get a personalized offer',
    appropriateStages: ['intent', 'evaluation'],
    priority: 90,
    requiresMedia: true,
    mediaRoles: ['brochure', 'specification_sheet'],
  },
  {
    action: 'answer_questions',
    label: 'I have questions',
    description: 'Ask specific questions',
    appropriateStages: ['interest', 'consideration', 'intent', 'evaluation'],
    priority: 60,
    requiresMedia: false,
  },

  // Purchase CTAs
  {
    action: 'send_contract',
    label: 'Send contract info',
    description: 'View contract details',
    appropriateStages: ['evaluation', 'purchase'],
    priority: 85,
    requiresMedia: true,
    mediaRoles: ['legal_document'],
  },
  {
    action: 'schedule_signing',
    label: 'Schedule signing',
    description: 'Book contract signing appointment',
    appropriateStages: ['purchase'],
    priority: 100,
    requiresMedia: false,
  },

  // Generic fallback CTAs
  {
    action: 'request_callback',
    label: 'Request a callback',
    description: 'Have someone call you back',
    appropriateStages: [
      'awareness',
      'interest',
      'consideration',
      'intent',
      'evaluation',
      'purchase',
    ],
    priority: 50,
    requiresMedia: false,
  },
  {
    action: 'get_more_info',
    label: 'Get more information',
    description: 'Receive additional details',
    appropriateStages: ['awareness', 'interest', 'consideration'],
    priority: 40,
    requiresMedia: false,
  },
  {
    action: 'ask_question',
    label: 'Ask a question',
    description: 'Have a specific question answered',
    appropriateStages: [
      'awareness',
      'interest',
      'consideration',
      'intent',
      'evaluation',
      'purchase',
    ],
    priority: 30,
    requiresMedia: false,
  },
];

/**
 * Configuration for which CTAs to show at each funnel stage
 */
export interface FunnelStageConfig {
  stage: FunnelStage;
  /** Human-readable name */
  name: string;
  /** Description of this stage */
  description: string;
  /** Max number of CTA buttons to show */
  maxButtons: number;
  /** Preferred CTA actions for this stage (in priority order) */
  preferredActions: CTAAction[];
}

/**
 * Default funnel stage configurations for real estate
 */
export const DEFAULT_FUNNEL_CONFIG: FunnelStageConfig[] = [
  {
    stage: 'awareness',
    name: 'Awareness',
    description: 'Customer just discovered us',
    maxButtons: 3,
    preferredActions: ['send_brochure', 'send_photos', 'get_more_info'],
  },
  {
    stage: 'interest',
    name: 'Interest',
    description: 'Customer is asking questions',
    maxButtons: 3,
    preferredActions: ['send_brochure', 'send_price_sheet', 'send_video_tour'],
  },
  {
    stage: 'consideration',
    name: 'Consideration',
    description: 'Customer is comparing options',
    maxButtons: 3,
    preferredActions: [
      'send_floor_plan',
      'schedule_viewing',
      'send_specifications',
    ],
  },
  {
    stage: 'intent',
    name: 'Intent',
    description: 'Customer shows serious interest',
    maxButtons: 3,
    preferredActions: ['schedule_viewing', 'talk_to_agent', 'send_proposal'],
  },
  {
    stage: 'evaluation',
    name: 'Evaluation',
    description: 'Customer is making a decision',
    maxButtons: 3,
    preferredActions: ['talk_to_agent', 'send_proposal', 'answer_questions'],
  },
  {
    stage: 'purchase',
    name: 'Purchase',
    description: 'Ready to close',
    maxButtons: 3,
    preferredActions: ['schedule_signing', 'talk_to_agent', 'send_contract'],
  },
];

/**
 * Result of analyzing customer funnel position
 */
export interface FunnelAnalysis {
  /** Detected funnel stage */
  currentStage: FunnelStage;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** Signals that led to this detection */
  signals: string[];
  /** Recommended CTAs for this position */
  recommendedCTAs: FunnelCTA[];
  /** Time since first message */
  timeSinceFirstContact?: number;
  /** Number of interactions */
  interactionCount: number;
}

/**
 * Options for generating interactive CTAs
 *
 * Supports two modes:
 * 1. Static mode (legacy): Uses funnel analysis + predefined CTA registry
 * 2. Dynamic mode (preferred): Uses AI to generate contextual CTAs based on response
 */
export interface GenerateInteractiveCTAsOptions {
  /** Chat ID for context */
  chatId: string;
  /** User ID */
  userId: number;
  /** Override detected funnel stage */
  overrideFunnelStage?: FunnelStage;
  /** Maximum number of CTAs to generate */
  maxCTAs?: number;
  /** Filter by available media roles */
  availableMediaRoles?: string[];
  /** Recent conversation context */
  conversationContext?: string;
  /** Whether media-required CTAs should be included */
  includeMediaCTAs?: boolean;

  // ============================================================================
  // DYNAMIC CTA OPTIONS - For AI-generated contextual CTAs
  // ============================================================================

  /**
   * The AI's generated response text
   * When provided, enables dynamic CTA generation based on response content
   */
  aiResponseText?: string;

  /**
   * The customer's last message
   * Used for dynamic CTA generation to understand the conversation flow
   */
  customerMessage?: string;

  /**
   * Whether to use dynamic (AI-generated) CTAs instead of static funnel-based CTAs
   * @default true when aiResponseText is provided
   */
  useDynamicCTAs?: boolean;

  /**
   * Whether media was included in the AI response
   * Helps dynamic CTA generator suggest appropriate follow-ups
   */
  hasMediaAttachment?: boolean;

  /**
   * Type of media attached to the response
   * E.g., 'brochure', 'photo', 'video'
   */
  mediaType?: string;

  /**
   * Business context for CTA generation
   * E.g., 'real estate', 'e-commerce', 'customer support'
   */
  businessContext?: string;
}

/**
 * Result of generating interactive CTAs
 */
export interface GeneratedInteractiveCTAs {
  /** The funnel analysis used (may be minimal if dynamic CTAs were used) */
  funnelAnalysis: FunnelAnalysis;
  /** Generated buttons (for button messages, max 3) */
  buttons: InteractiveButton[];
  /** Generated list sections (for list messages) */
  listSections?: InteractiveListSection[];
  /** Whether to use buttons or list format */
  format: 'button' | 'list' | 'none';
  /** Explanation of why these CTAs were chosen */
  reasoning: string;
  /** Footer text for the interactive message */
  footerText?: string;

  // ============================================================================
  // DYNAMIC CTA METADATA
  // ============================================================================

  /**
   * Whether dynamic (AI-generated) CTAs were used
   * If false, static funnel-based CTAs were used as fallback
   */
  usedDynamicCTAs?: boolean;

  /**
   * Whether fallback CTAs were used (within dynamic mode)
   * True if the LLM call failed and intelligent fallbacks were used
   */
  usedFallback?: boolean;
}

// ============================================================================
// INTERACTIVE MESSAGE RESPONSE HANDLING
// ============================================================================

/**
 * Parsed interactive response from webhook
 */
export interface ParsedInteractiveResponse {
  /** Type of interactive response */
  type: 'button_reply' | 'list_reply';
  /** The selected ID */
  selectedId: string;
  /** The selected title */
  selectedTitle: string;
  /** Description if from list */
  selectedDescription?: string;
  /** Parsed CTA action if it matches our registry */
  ctaAction?: CTAAction;
  /** The original message context */
  messageContext?: {
    messageId: string;
    chatId: string;
    timestamp: Date;
  };
}

/**
 * Handler result for interactive response
 */
export interface InteractiveResponseHandlerResult {
  /** Whether handling was successful */
  success: boolean;
  /** Response action taken */
  actionTaken: 'send_media' | 'send_text' | 'create_task' | 'handoff' | 'none';
  /** Response message sent */
  responseMessage?: string;
  /** Media sent if applicable */
  mediaSent?: {
    mediaId: string;
    mediaRole: string;
  };
  /** Error if failed */
  error?: string;
}
