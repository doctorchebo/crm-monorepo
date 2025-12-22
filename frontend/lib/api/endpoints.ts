/**
 * API Endpoints for backend communication
 */
import type {
  NotificationSettings,
  UpdateNotificationSettingsDto,
} from "@/lib/types/settings.types";
import { apiClient } from "./client";

// DTOs
export interface CreateContactDto {
  firstName: string;
  lastName?: string;
  email?: string;
  countryCode: string;
  phoneNumber: string;
  senderIds: number[];
}

export interface UpdateContactDto extends Partial<CreateContactDto> {}

export interface ContactAttribute {
  id: string;
  contactId: string;
  key: string;
  value: string | null;
  valueType: "string" | "number" | "date" | "phone" | "email";
  createdAt: string;
  updatedAt: string;
}

export interface CustomerProfile {
  contact: any;
  attributes: ContactAttribute[];
  customer: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    full_name: string;
  };
  custom: Record<string, string | null>;
}

export interface VariableResolutionResult {
  success: boolean;
  body: string;
  header?: string;
  footer?: string;
  resolvedVariables: Record<string, string>;
  unresolvedVariables: string[];
  errors: Array<{
    variable: string;
    message: string;
    type: "missing" | "invalid_type" | "validation_failed";
  }>;
}

export interface VariableDefinition {
  id: string;
  category: string;
  property: string;
  displayName: string;
  description: string | null;
  dataType: string;
  sourceTable: string | null;
  sourceColumn: string | null;
  fallbackValue: string | null;
  isRequired: boolean;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface VariableDefinitionsResponse {
  definitions: VariableDefinition[];
  grouped: Record<string, VariableDefinition[]>;
  categories: string[];
}

// Template Approval Types
export type TemplateApprovalStatusValue =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled"
  | "appeal_requested";

export type TemplateQualityRating = "pending" | "high" | "medium" | "low";

export type TemplateCategory = "authentication" | "marketing" | "utility";

export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
  code?: string;
}

export interface TemplateValidationResult {
  isValid: boolean;
  canSubmit: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: {
    errorCount: number;
    warningCount: number;
  };
}

export interface TemplateApprovalResult {
  success: boolean;
  status: TemplateApprovalStatusValue;
  metaTemplateId?: string;
  message: string;
  validationErrors?: ValidationError[];
  providerResponse?: Record<string, any>;
}

export interface TemplateApprovalStatus {
  templateId: string;
  localeId: string;
  locale: string;
  status: TemplateApprovalStatusValue;
  qualityRating: TemplateQualityRating;
  metaTemplateId?: string | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  canSubmit: boolean;
  canResubmit: boolean;
}

export interface UserProfileDto {
  id: number;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export const backendApi = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",

  // Auth endpoints
  auth: {
    register: (data: { email: string; name: string; password: string }) =>
      apiClient.post("/auth/register", data),
    login: (data: { email: string; password: string }) =>
      apiClient.post("/auth/login", data),
  },

  // User endpoints
  user: {
    getProfile: (): Promise<UserProfileDto> => apiClient.get("/users/profile"),
    updateProfile: (data: any) => apiClient.patch("/users/profile", data),
  },

  // Team endpoints
  team: {
    get: () => apiClient.get("/teams"),
    create: (data: { name: string; description?: string }) =>
      apiClient.post("/teams", data),
    inviteMember: (teamId: string, data: { email: string; role: string }) =>
      apiClient.post(`/teams/${teamId}/invite`, data),
    removeMember: (teamId: string, memberId: string) =>
      apiClient.delete(`/teams/${teamId}/members/${memberId}`),
    getMembers: (teamId: string) => apiClient.get(`/teams/${teamId}/members`),
  },

  // Billing endpoints
  billing: {
    getSubscription: () => apiClient.get("/billing/subscription"),
    createCheckout: (priceId: string) =>
      apiClient.post("/billing/checkout", { priceId }),
    createPortalSession: (returnUrl: string) =>
      apiClient.post("/billing/portal", { returnUrl }),
    getInvoices: () => apiClient.get("/billing/invoices"),
    getCheckoutSession: (sessionId: string) =>
      apiClient.get(`/billing/checkout/${sessionId}`),
  },

  // Chats endpoints
  chats: {
    list: (skip?: number, take?: number) =>
      apiClient.get(`/chats?skip=${skip || 0}&take=${take || 20}`),
    get: (id: string) => apiClient.get(`/chats/${id}`),
    create: (data: any) => apiClient.post("/chats", data),
    update: (id: string, data: any) => apiClient.patch(`/chats/${id}`, data),
    close: (id: string) => apiClient.post(`/chats/${id}/close`, {}),
    markAsRead: (id: string) => apiClient.post(`/chats/${id}/mark-read`, {}),
    getMessages: (id: string, skip?: number, take?: number) =>
      apiClient.get(
        `/chats/${id}/messages?skip=${skip || 0}&take=${take || 50}`
      ),
    startWithContact: (data: {
      businessPhone: string;
      participantPhone: string;
      participantName?: string;
      senderId?: number;
    }) => apiClient.post("/chats/contact/start", data),
    /**
     * Search messages within a chat
     * @param chatId - The chat ID to search within
     * @param query - Search query string (min 2 characters)
     * @param options - Optional date range and pagination
     */
    searchMessages: (
      chatId: string,
      query: string,
      options?: {
        startDate?: string;
        endDate?: string;
        skip?: number;
        take?: number;
      }
    ): Promise<{
      results: Array<{
        messageId: string;
        chatId: string;
        text: string;
        type: string;
        direction: "inbound" | "outbound";
        status: string;
        timestamp: string;
        sender: string;
        sentAt?: string | null;
        deliveredAt?: string | null;
        readAt?: string | null;
        attachments?: any[];
        matchedText?: string;
        matchStartIndex?: number;
        matchEndIndex?: number;
      }>;
      total: number;
      hasMore: boolean;
      query: string;
    }> => {
      const params = new URLSearchParams({ query });
      if (options?.startDate) params.append("startDate", options.startDate);
      if (options?.endDate) params.append("endDate", options.endDate);
      if (options?.skip !== undefined)
        params.append("skip", options.skip.toString());
      if (options?.take !== undefined)
        params.append("take", options.take.toString());
      return apiClient.get(`/chats/${chatId}/messages/search?${params}`);
    },
    /**
     * Get message position within a chat for scroll-to-message
     */
    getMessagePosition: (
      chatId: string,
      messageId: string
    ): Promise<{
      found: boolean;
      position: number;
      message: any;
      surroundingMessages: any[];
      totalCount: number;
    }> => apiClient.get(`/chats/${chatId}/messages/${messageId}/position`),
  },

  // Kanban endpoints
  kanban: {
    getStages: () => apiClient.get("/kanban/stages"),
    createStage: (data: any) => apiClient.post("/kanban/stages", data),
    updateStage: (id: string, data: any) =>
      apiClient.patch(`/kanban/stages/${id}`, data),
    deleteStage: (id: string) => apiClient.delete(`/kanban/stages/${id}`),
    moveCard: (data: any) => apiClient.post("/kanban/cards/move", data),
    getCards: (stageId: string) =>
      apiClient.get(`/kanban/stages/${stageId}/cards`),
  },

  // Automation endpoints
  automation: {
    list: () => apiClient.get("/automation/rules"),
    get: (id: string) => apiClient.get(`/automation/rules/${id}`),
    create: (data: any) => apiClient.post("/automation/rules", data),
    update: (id: string, data: any) =>
      apiClient.patch(`/automation/rules/${id}`, data),
    delete: (id: string) => apiClient.delete(`/automation/rules/${id}`),
    evaluateTriggers: (data: any) =>
      apiClient.post("/automation/evaluate", data),
  },

  // Settings endpoints
  settings: {
    getTeam: () => apiClient.get("/settings/team"),
    updateTeam: (data: any) => apiClient.patch("/settings/team", data),
    getWhatsApp: () => apiClient.get("/settings/whatsapp"),
    updateWhatsApp: (data: any) => apiClient.patch("/settings/whatsapp", data),
    getAutomation: () => apiClient.get("/settings/automation"),
    updateAutomation: (data: any) =>
      apiClient.patch("/settings/automation", data),

    // User notification settings
    getNotifications: (): Promise<NotificationSettings> =>
      apiClient.get("/settings/notifications"),
    updateNotifications: (
      data: UpdateNotificationSettingsDto
    ): Promise<NotificationSettings> =>
      apiClient.patch("/settings/notifications", data),
  },

  // WhatsApp endpoints
  whatsapp: {
    sendMessage: (data: {
      to: string;
      body: string;
      senderId?: number;
      replyToMessageId?: string;
    }) => apiClient.post("/whatsapp/send", data),
    sendMedia: (data: {
      to: string;
      mediaType: "image" | "video" | "audio" | "document";
      mediaUrl: string;
      caption?: string;
      senderId?: number;
      fileName?: string;
      originalMessageId?: string;
    }) => apiClient.post("/whatsapp/send-media", data),
    sendContacts: (data: {
      to: string;
      senderId?: number;
      contacts: Array<{
        name: {
          formatted_name: string;
          first_name?: string;
          last_name?: string;
        };
        phones?: Array<{
          phone: string;
          type?: string;
          wa_id?: string;
        }>;
      }>;
    }) => apiClient.post("/whatsapp/send-contacts", data),
    getStatus: (messageId: string) =>
      apiClient.get(`/whatsapp/status/${messageId}`),
    getDownloadUrl: (messageId: string, attachmentId: string) =>
      apiClient.get(
        `/whatsapp/media/${messageId}/${attachmentId}/download-url`
      ),
    getMessages: () => apiClient.get("/whatsapp/messages"),
    getChats: (skip?: number, take?: number) =>
      apiClient.get(`/whatsapp/chats?skip=${skip || 0}&take=${take || 20}`),
    getChatMessages: (
      chatId: string,
      skip?: number,
      take?: number
    ): Promise<{
      messages: any[];
      hasMore: boolean;
      totalCount: number;
      nextCursor: number;
    }> =>
      apiClient.get(
        `/whatsapp/chats/${chatId}/messages?skip=${skip || 0}&take=${
          take || 50
        }`
      ),
    saveNote: (data: { messageId: string; note: string }) =>
      apiClient.post("/whatsapp/notes", data),
    getMessageNotes: (messageId: string) =>
      apiClient.get(`/whatsapp/notes/${messageId}`),
    // Message edit and delete endpoints
    editMessage: (messageId: string, data: { text: string; chatId?: string }) =>
      apiClient.put(`/whatsapp/messages/${messageId}/edit`, data),
    deleteMessage: (messageId: string, data?: { chatId?: string }) =>
      apiClient.delete(`/whatsapp/messages/${messageId}`),
  },

  // Contacts endpoints
  contacts: {
    list: (skip?: number, take?: number, phoneNumberId?: number) =>
      apiClient.get(
        `/contacts?skip=${skip || 0}&take=${take || 50}${
          phoneNumberId ? `&phoneNumberId=${phoneNumberId}` : ""
        }`
      ),
    get: (contactId: string) => apiClient.get(`/contacts/${contactId}`),
    create: (data: any) => apiClient.post("/contacts", data),
    update: (contactId: string, data: any) =>
      apiClient.patch(`/contacts/${contactId}`, data),
    delete: (contactId: string) => apiClient.delete(`/contacts/${contactId}`),
    getByPhone: (phoneNumber: string) =>
      apiClient.get(`/contacts/phone/${phoneNumber}`),
    // Profile endpoints
    getProfile: (contactId: string): Promise<CustomerProfile> =>
      apiClient.get(`/contacts/${contactId}/profile`),
    // Attributes endpoints
    getAttributes: (contactId: string): Promise<ContactAttribute[]> =>
      apiClient.get(`/contacts/${contactId}/attributes`),
    getAttribute: (contactId: string, key: string): Promise<ContactAttribute> =>
      apiClient.get(`/contacts/${contactId}/attributes/${key}`),
    upsertAttribute: (
      contactId: string,
      data: { key: string; value?: string; valueType?: string }
    ): Promise<ContactAttribute> =>
      apiClient.post(`/contacts/${contactId}/attributes`, data),
    updateAttribute: (
      contactId: string,
      key: string,
      data: { value?: string; valueType?: string }
    ): Promise<ContactAttribute> =>
      apiClient.patch(`/contacts/${contactId}/attributes/${key}`, data),
    deleteAttribute: (contactId: string, key: string) =>
      apiClient.delete(`/contacts/${contactId}/attributes/${key}`),
    bulkUpsertAttributes: (
      contactId: string,
      data: {
        attributes: Array<{ key: string; value?: string; valueType?: string }>;
      }
    ) => apiClient.post(`/contacts/${contactId}/attributes/bulk`, data),
  },

  // Senders endpoints
  senders: {
    list: () => apiClient.get("/senders"),
    get: (senderId: number) => apiClient.get(`/senders/${senderId}`),
    create: (data: any) => apiClient.post("/senders", data),
    update: (senderId: number, data: any) =>
      apiClient.patch(`/senders/${senderId}`, data),
    delete: (senderId: number) => apiClient.delete(`/senders/${senderId}`),
    verify: (senderId: number) =>
      apiClient.patch(`/senders/${senderId}/verify`, {}),
    getContacts: (senderId: number) =>
      apiClient.get(`/senders/${senderId}/contacts`),
    linkContact: (senderId: number, contactId: string, data?: any) =>
      apiClient.post(`/senders/${senderId}/contacts/${contactId}`, data || {}),
    unlinkContact: (senderId: number, contactId: string) =>
      apiClient.delete(`/senders/${senderId}/contacts/${contactId}`),
  },

  // Templates endpoints
  templates: {
    list: (visible?: boolean) =>
      apiClient.get(`/templates${visible ? "?visible=true" : ""}`),
    get: (templateId: string) => apiClient.get(`/templates/${templateId}`),
    create: (data: any) => apiClient.post("/templates", data),
    update: (templateId: string, data: any) =>
      apiClient.patch(`/templates/${templateId}`, data),
    delete: (templateId: string) =>
      apiClient.delete(`/templates/${templateId}`),
    addLocale: (templateId: string, data: any) =>
      apiClient.post(`/templates/${templateId}/locales`, data),
    preview: (templateId: string, data: any) =>
      apiClient.post(`/templates/${templateId}/preview`, data),
    validate: (templateId: string, data: any) =>
      apiClient.post(`/templates/${templateId}/validate`, data),
    submit: (templateId: string, data: any, provider?: string) =>
      apiClient.post(
        `/templates/${templateId}/submit${
          provider ? `?provider=${provider}` : ""
        }`,
        data
      ),
    test: (templateId: string, data: any) =>
      apiClient.post(`/templates/${templateId}/test`, data),
    getVersions: (templateId: string) =>
      apiClient.get(`/templates/${templateId}/versions`),
    // Variable definitions
    getVariableDefinitions: (): Promise<VariableDefinitionsResponse> =>
      apiClient.get("/templates/variables/definitions"),
    // Variable resolution endpoints
    resolve: (
      templateId: string,
      data: {
        locale: string;
        contactId: string;
        senderId?: number;
        chatId?: string;
        overrides?: Record<string, string>;
      }
    ): Promise<VariableResolutionResult> =>
      apiClient.post(`/templates/${templateId}/resolve`, data),
    getAutoFill: (
      templateId: string,
      data: {
        locale: string;
        contactId: string;
        senderId?: number;
        chatId?: string;
      }
    ) => apiClient.post(`/templates/${templateId}/autofill`, data),
    validateVariables: (variables: string[]) =>
      apiClient.post("/templates/validate-variables", { variables }),
    // Template approval endpoints
    validateForApproval: (
      templateId: string,
      data: { locale: string }
    ): Promise<TemplateValidationResult> =>
      apiClient.post(`/templates/${templateId}/validate-for-approval`, data),
    requestApproval: (
      templateId: string,
      data: { locale: string; provider?: string }
    ): Promise<TemplateApprovalResult> =>
      apiClient.post(`/templates/${templateId}/request-approval`, data),
    getApprovalStatus: (
      templateId: string,
      locale: string
    ): Promise<TemplateApprovalStatus> =>
      apiClient.get(
        `/templates/${templateId}/approval-status?locale=${encodeURIComponent(
          locale
        )}`
      ),
    syncStatus: (
      templateId: string,
      data: { locale: string }
    ): Promise<TemplateApprovalStatus> =>
      apiClient.post(`/templates/${templateId}/sync-status`, data),
  },

  // Notes endpoints
  notes: {
    create: (data: { messageId?: string; chatId?: string; note: string }) =>
      apiClient.post("/notes", data),
    getChatNotes: (chatId: string) => apiClient.get(`/notes/chat/${chatId}`),
    getMessageNotes: (messageId: string) =>
      apiClient.get(`/notes/message/${messageId}`),
    delete: (noteId: number) => apiClient.delete(`/notes/${noteId}`),
  },

  // Link Preview endpoints
  linkPreview: {
    get: (url: string) =>
      apiClient.get(`/link-preview?url=${encodeURIComponent(url)}`),
    getBatch: (urls: string[]) =>
      apiClient.post("/link-preview/batch", { urls }),
  },
};
