// Re-export conversation window utilities
export {
  CONVERSATION_WINDOW_DURATION_HOURS,
  CONVERSATION_WINDOW_DURATION_MS,
  EFFECTIVE_WINDOW_MS,
  SAFETY_MARGIN_MS,
  calculateConversationWindow,
  enrichTemplatesWithAvailability,
  formatTimeRemaining,
  getLastInboundMessage,
  getTemplateAvailability,
  type ConversationWindowStatus,
  type TemplateAvailability,
  type TemplateLocale,
  type TemplateUnavailableReason,
  type TemplateWithAvailability,
} from "./utils/conversation-window";
