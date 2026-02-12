/**
 * API Endpoints for backend communication
 */
import type {
  NotificationSettings,
  UpdateNotificationSettingsDto,
} from "@/lib/types/settings.types";
import { apiClient } from "./client";

// ==================== WhatsApp Business Account Types ====================

/**
 * Sender (WhatsApp Business Phone Number)
 */
export interface Sender {
  id: number;
  userId: number;
  phoneNumber: string;
  phoneNumberId: string | null;
  displayName: string | null;
  verifiedName: string | null;
  codeVerificationStatus: string | null;
  qualityRating: string | null;
  messagingLimit: string | null;
  status: string | null;
  nameStatus: string | null;
  isActive: boolean;
  isOfficialBusinessAccount: boolean;
  lastUsedAt: string | null;
  registeredAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Commerce settings
  isCatalogEnabled: boolean;
  isCartEnabled: boolean;
  linkedCatalogId: string | null;
  commerceSettingsSyncedAt: string | null;
}

/**
 * Commerce settings for a sender
 */
export interface CommerceSettings {
  isCatalogEnabled: boolean;
  isCartEnabled: boolean;
  linkedCatalogId: string | null;
  commerceSettingsSyncedAt: string | null;
  isCommerceAvailable: boolean;
}

/**
 * Update commerce settings request
 */
export interface UpdateCommerceSettingsRequest {
  isCatalogVisible?: boolean;
  isCartEnabled?: boolean;
}

/**
 * Result of WABA sync operation
 */
export interface SyncResult {
  created: Sender[];
  updated: Sender[];
  total: number;
}

/**
 * WABA configuration info
 */
export interface WabaInfo {
  wabaId: string | null;
  isConfigured: boolean;
}

// Supported language codes matching template locales
export const SUPPORTED_LANGUAGES = [
  "en",
  "es",
  "pt",
  "fr",
  "de",
  "it",
] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Language display names for UI
export const LANGUAGE_DISPLAY_NAMES: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
};

// Language flags for UI
export const LANGUAGE_FLAGS: Record<SupportedLanguage, string> = {
  en: "🇺🇸",
  es: "🇪🇸",
  pt: "🇧🇷",
  fr: "🇫🇷",
  de: "🇩🇪",
  it: "🇮🇹",
};

// DTOs
export interface CreateContactDto {
  firstName: string;
  lastName?: string;
  email?: string;
  language?: SupportedLanguage;
  countryCode: string;
  phoneNumber: string;
}

export interface UpdateContactDto extends Partial<CreateContactDto> {}

/**
 * Contact entity returned from the API
 */
export interface Contact {
  id: number;
  contactId: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  language?: string | null;
  countryCode: string;
  phoneNumber: string;
  twilioContactId?: string | null;
  lastMessageTime?: string | null;
  lastMessagePreview?: string | null;
  lastMessageType?: string | null;
  avatar?: string | null;
  isActive: boolean;
  source?: string | null;
  importJobId?: string | null;
  createdAt: string;
  updatedAt: string;
}

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

// ==================== Catalog Types ====================

/**
 * Catalog item status
 */
export type CatalogItemStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_UPDATE"
  | "ARCHIVED";

/**
 * Item availability status
 */
export type ItemAvailability =
  | "in stock"
  | "out of stock"
  | "available for order";

/**
 * Item condition
 */
export type ItemCondition = "new" | "refurbished" | "used";

/**
 * Catalog response
 */
export interface CatalogResponse {
  id: string;
  teamId: number;
  name: string;
  description: string | null;
  metaCatalogId: string | null;
  currency: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  syncStatus: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Catalog item image
 */
export interface CatalogItemImageResponse {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  originalFilename: string | null;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  status: "uploading" | "processing" | "ready" | "error";
  sortOrder: number;
  isMain: boolean;
}

/**
 * Catalog item response
 * Fields align with Meta Commerce catalog requirements
 */
export interface CatalogItemResponse {
  id: string;
  catalogId: string;
  name: string;
  description: string | null;
  price: number;
  salePrice: number | null;
  currency: string;
  link: string | null;
  retailerId: string | null;
  availability: ItemAvailability;
  condition: ItemCondition;
  brand: string | null;
  status: CatalogItemStatus;
  statusMessage: string | null;
  metaProductId: string | null;
  images: CatalogItemImageResponse[];
  mainImageUrl: string | null;
  mainThumbnailUrl: string | null;
  whatsappProductLink: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Paginated catalog items response
 */
export interface PaginatedCatalogItemsResponse {
  items: CatalogItemResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Create catalog item DTO
 * Fields align with Meta Commerce catalog requirements
 */
export interface CreateCatalogItemDto {
  name: string;
  description: string;
  price: number;
  salePrice?: number | null;
  currency?: string;
  link: string;
  retailerId?: string;
  availability?: ItemAvailability;
  condition?: ItemCondition;
  brand?: string;
}

/**
 * Update catalog item DTO
 */
export interface UpdateCatalogItemDto extends Partial<CreateCatalogItemDto> {}

/**
 * Update catalog DTO
 */
export interface UpdateCatalogDto {
  name?: string;
  description?: string;
  currency?: string;
  isActive?: boolean;
}

/**
 * Image upload response (presigned URL)
 */
export interface ImageUploadResponse {
  imageId: string;
  uploadUrl: string;
  imageKey: string;
  expiresAt: string;
}

/**
 * Direct image upload response (backend proxy)
 */
export interface DirectImageUploadResponse {
  imageId: string;
  imageKey: string;
  status: string;
  originalFilename?: string;
  fileSize?: number;
  mimeType?: string;
}

/**
 * Catalog collection response
 */
export interface CatalogCollectionResponse {
  id: string;
  catalogId: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  coverThumbnailUrl: string | null;
  isActive: boolean;
  itemCount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create catalog collection DTO
 */
export interface CreateCatalogCollectionDto {
  name: string;
  description?: string;
  itemIds?: string[];
}

// ==================== Meta Catalog Types ====================

/**
 * Meta Catalog vertical type
 * Only 'commerce' is supported for WhatsApp product messages
 */
export type MetaCatalogVertical = "commerce";

/**
 * Meta Catalog from the Graph API
 */
export interface MetaCatalog {
  id: string;
  name: string;
  vertical: string;
  productCount?: number;
  feedCount?: number;
  businessId?: string;
  businessName?: string;
}

/**
 * Response for listing Meta catalogs
 */
export interface MetaCatalogsResponse {
  catalogs: MetaCatalog[];
  total: number;
  businessId?: string;
}

/**
 * Create Meta catalog DTO
 * Commerce vertical is used automatically for WhatsApp compatibility
 */
export interface CreateMetaCatalogDto {
  name: string;
}

/**
 * Link Meta catalog DTO
 */
export interface LinkMetaCatalogDto {
  metaCatalogId: string;
}

/**
 * Meta product set (collection)
 */
export interface MetaProductSet {
  id: string;
  name: string;
  productCount?: number;
}

/**
 * Create Meta product set DTO
 */
export interface CreateMetaProductSetDto {
  name: string;
  filter?: Record<string, unknown>;
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

// ==================== Notes Types ====================

/**
 * Note user information
 */
export interface NoteUser {
  id: number;
  name: string;
  email: string;
}

/**
 * Note response from API
 */
export interface NoteResponse {
  id: number;
  messageId?: string;
  chatId?: string;
  userId: number;
  note: string;
  createdAt: string | Date;
  user?: NoteUser;
}

/**
 * Note search result with match context
 */
export interface NoteSearchResult extends NoteResponse {
  matchContext?: string;
}

/**
 * Pagination metadata for notes
 */
export interface NotesPagination {
  hasMore: boolean;
  hasPrevious: boolean;
  oldestId: number | null;
  newestId: number | null;
  total?: number;
}

/**
 * Paginated notes response from API
 */
export interface PaginatedNotesResponse {
  chatId: string;
  notes: NoteResponse[];
  pagination: NotesPagination;
}

/**
 * Notes search response from API
 */
export interface NotesSearchResponse {
  chatId: string;
  query: string;
  results: NoteSearchResult[];
  total: number;
}

// ==================== Reaction Types ====================

/**
 * Reaction response from API
 */
export interface ReactionResponse {
  id: number;
  messageId: string;
  userId: number;
  emoji: string;
  userName?: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Customer reaction response from API (from WhatsApp user)
 */
export interface CustomerReactionResponse {
  id: number;
  messageId: string;
  waMessageId?: string;
  chatId: string;
  senderPhone: string;
  emoji?: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Grouped reactions for a message
 */
export interface MessageReactionsResponse {
  messageId: string;
  reactions: ReactionResponse[];
}

// ==================== Pinned Messages Types ====================

/**
 * Pin duration options (in hours)
 */
export type PinDurationValue = 24 | 168 | 720;

// ==================== Labels Types ====================

/**
 * Label response from API
 */
export interface LabelResponse {
  id: string;
  teamId: number;
  name: string;
  color: string;
  emoji: string | null;
  description: string | null;
  isSystem: boolean;
  sortOrder: number;
  chatCount?: number;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * DTO for creating a label
 */
export interface CreateLabelDto {
  name: string;
  color?: string;
  emoji?: string;
  description?: string;
}

/**
 * DTO for updating a label
 */
export interface UpdateLabelDto {
  name?: string;
  color?: string;
  emoji?: string | null;
  description?: string | null;
}

/**
 * DTO for applying labels to chats
 */
export interface ApplyLabelsDto {
  chatIds: string[];
  labelIds: string[];
}

/**
 * DTO for removing labels from chats
 */
export interface RemoveLabelsDto {
  chatIds: string[];
  labelIds: string[];
}

/**
 * Response for chats with a specific label
 */
export interface ChatsWithLabelResponse {
  label: LabelResponse;
  chats: Array<{
    chatId: string;
    participantName: string | null;
    participantPhone: string;
    lastMessage: string | null;
    lastMessageTime: string | null;
    unreadCount: number;
  }>;
  total: number;
}

/**
 * Pinned message response from API
 */
export interface PinnedMessageResponse {
  id: number;
  messageId: string;
  chatId: string;
  pinnedBy: number;
  pinnedByName?: string;
  pinnedAt: string;
  expiresAt: string;
  message?: {
    messageId: string;
    text?: string | null;
    type: string;
    direction: string;
    timestamp: string;
    sender: string;
    attachments?: any[];
    senderName?: string;
  };
}

/**
 * Pin count response
 */
export interface PinCountResponse {
  chatId: string;
  count: number;
  maxPins: number;
  canPinMore: boolean;
  oldestPin?: PinnedMessageResponse;
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

/**
 * Result of syncing a single template status
 */
export interface TemplateSyncResult {
  localeId: string;
  templateId: string;
  templateName: string;
  locale: string;
  previousStatus: string;
  newStatus: string;
  statusChanged: boolean;
  qualityRating?: string;
  error?: string;
}

/**
 * Result of bulk sync operation
 */
export interface BulkSyncResult {
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  statusChangedCount: number;
  results: TemplateSyncResult[];
}

/**
 * Template with pending approval status
 */
export interface PendingTemplate {
  templateId: string;
  templateName: string;
  localeId: string;
  locale: string;
  approvalStatus: string;
  metaTemplateId: string | null;
  submittedAt: string | null;
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
  profilePictureUrl?: string | null;
  profilePictureStatus?:
    | "none"
    | "uploading"
    | "processing"
    | "ready"
    | "error";
}

/**
 * Profile picture upload URL response
 */
export interface ProfilePictureUploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
}

/**
 * Profile picture info response
 */
export interface ProfilePictureInfoResponse {
  hasProfilePicture: boolean;
  status: "none" | "uploading" | "processing" | "ready" | "error";
  thumbnailUrl?: string;
  originalUrl?: string;
  expiresIn?: number;
}

// ==================== Template Version Types ====================

/**
 * Version status enum - aligned with WhatsApp template lifecycle
 */
export type TemplateVersionStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "disabled";

/**
 * Content stored in a template version
 *
 * Supports two modes:
 * 1. Legacy mode: Using header/body/footer strings (backward compatible)
 * 2. Enhanced mode: Using components object (new full-featured mode)
 *
 * When components is present, it takes precedence but legacy fields are
 * maintained for backward compatibility.
 */
export interface VersionContent {
  /** Legacy text header (for backward compatibility) */
  header?: string | null;
  /** Body text (required) */
  body: string;
  /** Legacy footer text (for backward compatibility) */
  footer?: string | null;
  /** Example variable values */
  exampleVars?: Record<string, string>;
  /** Template category */
  category?: string;
  /**
   * Enhanced template components (full Meta API support)
   * When present, this is the source of truth for template structure
   */
  components?: Record<string, unknown>;
}

/**
 * Detailed information about a single template version
 */
export interface TemplateVersionDetail {
  id: string;
  templateId: string;
  localeId: string;
  versionNumber: number;
  content: VersionContent;
  status: TemplateVersionStatus;
  providerId: string | null;
  providerName: string | null;
  providerResponse: Record<string, any> | null;
  platforms: string[] | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canSubmit: boolean;
}

/**
 * Comprehensive version info for a template locale
 */
export interface TemplateVersionInfo {
  templateId: string;
  localeId: string;
  locale: string;
  hasActiveVersion: boolean;
  hasDraftVersion: boolean;
  activeVersion: TemplateVersionDetail | null;
  draftVersion: TemplateVersionDetail | null;
  versionHistory: TemplateVersionDetail[];
  canCreateNewVersion: boolean;
  canEditDraft: boolean;
}

export const backendApi = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",

  // Auth endpoints
  auth: {
    register: (data: { email: string; name: string; password: string }) =>
      apiClient.post("/auth/register", data),
    login: (data: { email: string; password: string }) =>
      apiClient.post("/auth/login", data),
    forgotPassword: (email: string) =>
      apiClient.post("/auth/forgot-password", { email }),
    resetPassword: (data: {
      token: string;
      password: string;
      confirmPassword: string;
    }) => apiClient.post("/auth/reset-password", data),
    changePassword: (data: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) => apiClient.post("/auth/change-password", data),
    deleteAccount: (password: string) =>
      apiClient.post("/auth/delete-account", { password }),
  },

  // User endpoints
  user: {
    getProfile: (): Promise<UserProfileDto> => apiClient.get("/users/profile"),
    updateProfile: (data: any) => apiClient.patch("/users/profile", data),
    getActivity: () => apiClient.get("/users/activity"),
  },

  // Profile Picture endpoints
  profilePicture: {
    /**
     * Upload profile picture directly through backend (CORS-free)
     * Uses multipart/form-data - Content-Type header is NOT set manually
     * so the browser can automatically set it with the proper boundary.
     */
    upload: (
      file: File,
    ): Promise<{ jobId: string | null; status: string; s3Key: string }> => {
      const formData = new FormData();
      formData.append("file", file);
      // Don't pass headers - let browser set Content-Type with proper boundary
      return apiClient.post("/api/v1/profile-picture/upload", formData);
    },

    /**
     * Get presigned URL for uploading profile picture
     */
    getUploadUrl: (data: {
      fileName: string;
      contentType: string;
      fileSize?: number;
    }): Promise<ProfilePictureUploadUrlResponse> =>
      apiClient.post("/api/v1/profile-picture/upload-url", data),

    /**
     * Confirm upload completion and trigger thumbnail generation
     */
    confirmUpload: (data: {
      s3Key: string;
      contentType: string;
    }): Promise<{ jobId: string | null; status: string }> =>
      apiClient.post("/api/v1/profile-picture/confirm-upload", data),

    /**
     * Get current profile picture info
     */
    getInfo: (): Promise<ProfilePictureInfoResponse> =>
      apiClient.get("/api/v1/profile-picture"),

    /**
     * Delete profile picture
     */
    delete: (): Promise<{ success: boolean; message: string }> =>
      apiClient.delete("/api/v1/profile-picture"),
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
    getMetrics: (teamId: string) => apiClient.get(`/teams/${teamId}/metrics`),
    getRoles: (teamId: string) => apiClient.get(`/teams/${teamId}/roles`),
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
    /**
     * Get all archived chats
     * @param skip - Pagination offset
     * @param take - Number of chats to fetch
     */
    listArchived: (skip?: number, take?: number) =>
      apiClient.get(`/chats/archived?skip=${skip || 0}&take=${take || 20}`),
    /**
     * Search chats by participant name or phone number
     * @param query - Search query string (searches name and phone)
     * @param options - Optional pagination
     */
    search: (
      query: string,
      options?: {
        skip?: number;
        take?: number;
      },
    ): Promise<{
      results: Array<{
        chatId: string;
        senderId: number;
        businessPhone?: string;
        participantPhone: string;
        participantName?: string;
        lastMessage?: string;
        lastMessageType?: string;
        lastMessageTime?: string;
        unreadCount: number;
        matchedField?: "name" | "phone";
      }>;
      total: number;
      hasMore: boolean;
      query?: string;
    }> => {
      const params = new URLSearchParams({ query });
      if (options?.skip !== undefined)
        params.append("skip", options.skip.toString());
      if (options?.take !== undefined)
        params.append("take", options.take.toString());
      return apiClient.get(`/chats/search?${params}`);
    },
    get: (id: string) => apiClient.get(`/chats/${id}`),
    create: (data: any) => apiClient.post("/chats", data),
    update: (id: string, data: any) => apiClient.patch(`/chats/${id}`, data),
    close: (id: string) => apiClient.post(`/chats/${id}/close`, {}),
    /**
     * Archive a chat
     * @param id - The chat ID to archive
     */
    archive: (id: string) => apiClient.post(`/chats/${id}/archive`, {}),
    /**
     * Unarchive a chat
     * @param id - The chat ID to unarchive
     */
    unarchive: (id: string) => apiClient.post(`/chats/${id}/unarchive`, {}),
    /**
     * Delete a chat and all associated data permanently
     * @param id - The chat ID to delete
     */
    delete: (id: string) => apiClient.delete(`/chats/${id}`),
    markAsRead: (id: string) => apiClient.post(`/chats/${id}/mark-read`, {}),
    assign: (chatId: string, assigneeId: number) =>
      apiClient.post(`/chats/${chatId}/assign`, { assigneeId }),
    unassign: (chatId: string) => apiClient.delete(`/chats/${chatId}/assign`),
    getUnassigned: (teamId: string) =>
      apiClient.get(`/chats/team/${teamId}/unassigned`),
    getAllForTeam: (teamId: string) =>
      apiClient.get(`/chats/team/${teamId}/all`),
    getMessages: (id: string, skip?: number, take?: number) =>
      apiClient.get(
        `/chats/${id}/messages?skip=${skip || 0}&take=${take || 50}`,
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
      },
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
      messageId: string,
    ): Promise<{
      found: boolean;
      position: number;
      message: any;
      surroundingMessages: any[];
      totalCount: number;
    }> => apiClient.get(`/chats/${chatId}/messages/${messageId}/position`),
    /**
     * Find the first message on or after a specific date
     * Used for "jump to date" functionality
     */
    findMessageByDate: (
      chatId: string,
      date: Date,
    ): Promise<{
      found: boolean;
      messageId: string | null;
      message: any | null;
      position: number;
      totalCount: number;
    }> =>
      apiClient.get(
        `/chats/${chatId}/messages/by-date?date=${date.toISOString()}`,
      ),
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
      data: UpdateNotificationSettingsDto,
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
      attachmentId?: string; // ID of the specific attachment being sent (for multi-media messages)
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
    sendLocation: (data: {
      to: string;
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
      senderId?: number;
      replyToMessageId?: string;
    }) => apiClient.post("/whatsapp/send-location", data),
    getStatus: (messageId: string) =>
      apiClient.get(`/whatsapp/status/${messageId}`),
    getDownloadUrl: (messageId: string, attachmentId: string) =>
      apiClient.get(
        `/whatsapp/media/${messageId}/${attachmentId}/download-url`,
      ),
    getMessages: () => apiClient.get("/whatsapp/messages"),
    getChats: (skip?: number, take?: number) =>
      apiClient.get(`/whatsapp/chats?skip=${skip || 0}&take=${take || 20}`),
    getChatMessages: (
      chatId: string,
      skip?: number,
      take?: number,
    ): Promise<{
      messages: any[];
      hasMore: boolean;
      totalCount: number;
      nextCursor: number;
    }> =>
      apiClient.get(
        `/whatsapp/chats/${chatId}/messages?skip=${skip || 0}&take=${
          take || 50
        }`,
      ),
    /**
     * Get newer messages for bidirectional infinite scroll.
     * Used when viewing pinned message context to load messages AFTER the current window.
     */
    getNewerMessages: (
      chatId: string,
      afterTimestamp: string,
      take?: number,
    ): Promise<{
      messages: any[];
      hasMore: boolean;
    }> =>
      apiClient.get(
        `/whatsapp/chats/${chatId}/messages/newer?afterTimestamp=${encodeURIComponent(
          afterTimestamp,
        )}&take=${take || 50}`,
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
    // Conversation window endpoints - for 24-hour rule enforcement
    getConversationWindowStatus: (
      chatId: string,
    ): Promise<{
      canSendFreeFormMessage: boolean;
      canSendApprovedTemplate: boolean;
      lastInboundMessageTime: string | null;
      windowExpiresAt: string | null;
      timeRemainingMs: number;
      hasInboundMessage: boolean;
      blockReason?:
        | "no_inbound_messages"
        | "window_expired"
        | "window_expiring_soon";
    }> => apiClient.get(`/whatsapp/chats/${chatId}/window-status`),
    validateSend: (
      chatId: string,
      data: {
        messageType: "free-form" | "template";
        isTemplateApproved?: boolean;
      },
    ): Promise<{
      isValid: boolean;
      windowStatus: {
        canSendFreeFormMessage: boolean;
        canSendApprovedTemplate: boolean;
        lastInboundMessageTime: string | null;
        windowExpiresAt: string | null;
        timeRemainingMs: number;
        hasInboundMessage: boolean;
        blockReason?:
          | "no_inbound_messages"
          | "window_expired"
          | "window_expiring_soon";
      };
      errorMessage?: string;
      errorCode?:
        | "OUTSIDE_CONVERSATION_WINDOW"
        | "NO_CUSTOMER_MESSAGES"
        | "TEMPLATE_NOT_APPROVED"
        | "INVALID_MESSAGE_TYPE";
    }> => apiClient.post(`/whatsapp/chats/${chatId}/validate-send`, data),
  },

  // Contacts endpoints
  contacts: {
    /**
     * List contacts with pagination and search
     * @param options - Pagination and search options
     */
    list: (options?: {
      page?: number;
      limit?: number;
      search?: string;
    }): Promise<{
      data: Contact[];
      pagination: {
        page: number;
        limit: number;
        totalItems: number;
        totalPages: number;
      };
    }> => {
      const params = new URLSearchParams();
      if (options?.page) params.append("page", options.page.toString());
      if (options?.limit) params.append("limit", options.limit.toString());
      if (options?.search) params.append("search", options.search);
      const queryString = params.toString();
      return apiClient.get(`/contacts${queryString ? `?${queryString}` : ""}`);
    },
    get: (contactId: string) => apiClient.get(`/contacts/${contactId}`),
    create: (data: any) => apiClient.post("/contacts", data),
    update: (contactId: string, data: any) =>
      apiClient.patch(`/contacts/${contactId}`, data),
    delete: (contactId: string) => apiClient.delete(`/contacts/${contactId}`),
    /**
     * Bulk delete multiple contacts
     * @param contactIds - Array of contact IDs to delete
     */
    bulkDelete: (
      contactIds: string[],
    ): Promise<{ success: boolean; deletedCount: number }> =>
      apiClient.post("/contacts/bulk-delete", { contactIds }),
    getByPhone: (phoneNumber: string) =>
      apiClient.get(`/contacts/phone/${phoneNumber}`),
    // Profile endpoints (chatId is optional for chat-specific attributes)
    getProfile: (
      contactId: string,
      chatId?: string,
    ): Promise<CustomerProfile> =>
      apiClient.get(
        `/contacts/${contactId}/profile${
          chatId ? `?chatId=${encodeURIComponent(chatId)}` : ""
        }`,
      ),
    // Attributes endpoints (chatId is optional for chat-specific attributes)
    getAttributes: (
      contactId: string,
      chatId?: string,
    ): Promise<ContactAttribute[]> =>
      apiClient.get(
        `/contacts/${contactId}/attributes${
          chatId ? `?chatId=${encodeURIComponent(chatId)}` : ""
        }`,
      ),
    getAttribute: (
      contactId: string,
      key: string,
      chatId?: string,
    ): Promise<ContactAttribute> =>
      apiClient.get(
        `/contacts/${contactId}/attributes/${key}${
          chatId ? `?chatId=${encodeURIComponent(chatId)}` : ""
        }`,
      ),
    upsertAttribute: (
      contactId: string,
      data: {
        key: string;
        value?: string;
        valueType?: string;
        chatId?: string;
      },
    ): Promise<ContactAttribute> =>
      apiClient.post(`/contacts/${contactId}/attributes`, data),
    updateAttribute: (
      contactId: string,
      key: string,
      data: { value?: string; valueType?: string; chatId?: string },
    ): Promise<ContactAttribute> =>
      apiClient.patch(`/contacts/${contactId}/attributes/${key}`, data),
    deleteAttribute: (contactId: string, key: string, chatId?: string) =>
      apiClient.delete(
        `/contacts/${contactId}/attributes/${key}${
          chatId ? `?chatId=${encodeURIComponent(chatId)}` : ""
        }`,
      ),
    bulkUpsertAttributes: (
      contactId: string,
      data: {
        attributes: Array<{ key: string; value?: string; valueType?: string }>;
        chatId?: string;
      },
    ) => apiClient.post(`/contacts/${contactId}/attributes/bulk`, data),
  },

  // Catalog endpoints - Product catalog for WhatsApp Commerce
  catalog: {
    /**
     * Get or create catalog for current team
     */
    get: (): Promise<CatalogResponse> => apiClient.get("/catalog"),

    /**
     * Update catalog settings
     */
    update: (data: UpdateCatalogDto): Promise<CatalogResponse> =>
      apiClient.patch("/catalog", data),

    /**
     * List catalog items with pagination and filtering
     */
    listItems: (options?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      availableOnly?: boolean;
    }): Promise<PaginatedCatalogItemsResponse> => {
      const params = new URLSearchParams();
      if (options?.page) params.append("page", options.page.toString());
      if (options?.limit) params.append("limit", options.limit.toString());
      if (options?.search) params.append("search", options.search);
      if (options?.status) params.append("status", options.status);
      if (options?.availableOnly) params.append("availableOnly", "true");
      const queryString = params.toString();
      return apiClient.get(
        `/catalog/items${queryString ? `?${queryString}` : ""}`,
      );
    },

    /**
     * Get a single catalog item
     */
    getItem: (itemId: string): Promise<CatalogItemResponse> =>
      apiClient.get(`/catalog/items/${itemId}`),

    /**
     * Create a new catalog item
     */
    createItem: (data: CreateCatalogItemDto): Promise<CatalogItemResponse> =>
      apiClient.post("/catalog/items", data),

    /**
     * Update a catalog item
     */
    updateItem: (
      itemId: string,
      data: UpdateCatalogItemDto,
    ): Promise<CatalogItemResponse> =>
      apiClient.patch(`/catalog/items/${itemId}`, data),

    /**
     * Delete a catalog item
     */
    deleteItem: (itemId: string): Promise<void> =>
      apiClient.delete(`/catalog/items/${itemId}`),

    /**
     * Submit items for Meta review
     */
    submitForReview: (
      itemIds: string[],
    ): Promise<{
      submittedCount: number;
      failedCount: number;
      failures: Array<{
        itemId: string;
        itemName: string;
        reason: string;
      }>;
      message: string;
    }> => apiClient.post("/catalog/items/submit-for-review", { itemIds }),

    /**
     * Sync catalog item statuses with Meta Commerce
     * If no itemIds provided, syncs all pending approval items
     */
    syncStatuses: (
      itemIds?: string[],
    ): Promise<{
      totalChecked: number;
      changedCount: number;
      changes: Array<{
        itemId: string;
        itemName: string;
        previousStatus: string;
        newStatus: string;
        message?: string;
      }>;
      message: string;
    }> => apiClient.post("/catalog/items/sync-status", { itemIds }),

    /**
     * Sync status for a single catalog item with Meta Commerce
     */
    syncSingleStatus: (
      itemId: string,
    ): Promise<{
      itemId: string;
      itemName: string;
      previousStatus: string;
      currentStatus: string;
      changed: boolean;
      statusMessage?: string;
    }> => apiClient.post(`/catalog/items/${itemId}/sync-status`, {}),

    /**
     * Upload image directly through backend (CORS-free)
     * The backend proxies the upload to S3
     */
    uploadImage: (
      file: File,
      catalogItemId?: string,
    ): Promise<DirectImageUploadResponse> => {
      const formData = new FormData();
      formData.append("file", file);

      const endpoint = catalogItemId
        ? `/catalog/images/upload?catalogItemId=${encodeURIComponent(catalogItemId)}`
        : "/catalog/images/upload";

      return apiClient.post(endpoint, formData);
    },

    /**
     * Associate a previously uploaded image with a catalog item
     * Used when images are uploaded before the item is created
     */
    associateImage: (
      itemId: string,
      data: {
        imageKey: string;
        originalFilename?: string;
        fileSize?: number;
        mimeType?: string;
        isMain?: boolean;
        sortOrder?: number;
      },
    ): Promise<{
      id: string;
      imageKey: string;
      status: string;
      isMain: boolean;
      sortOrder: number;
    }> => apiClient.post(`/catalog/items/${itemId}/images/associate`, data),

    /**
     * Initiate image upload (get presigned URL)
     * @deprecated Use uploadImage instead for CORS-free uploads
     */
    initiateImageUpload: (data: {
      filename: string;
      mimeType: string;
      fileSize: number;
      catalogItemId?: string;
    }): Promise<ImageUploadResponse> =>
      apiClient.post("/catalog/images/initiate", data),

    /**
     * Complete image upload
     * @deprecated Use uploadImage instead - it handles completion automatically
     */
    completeImageUpload: (data: {
      imageId: string;
      width?: number;
      height?: number;
    }): Promise<CatalogItemImageResponse> =>
      apiClient.post("/catalog/images/complete", data),

    /**
     * Delete an image
     */
    deleteImage: (imageId: string): Promise<void> =>
      apiClient.delete(`/catalog/images/${imageId}`),

    /**
     * Reorder images for an item
     */
    reorderImages: (
      itemId: string,
      imageIds: string[],
    ): Promise<CatalogItemImageResponse[]> =>
      apiClient.put(`/catalog/items/${itemId}/images/reorder`, { imageIds }),

    /**
     * List collections
     */
    listCollections: (): Promise<CatalogCollectionResponse[]> =>
      apiClient.get("/catalog/collections"),

    /**
     * Create a collection
     */
    createCollection: (
      data: CreateCatalogCollectionDto,
    ): Promise<CatalogCollectionResponse> =>
      apiClient.post("/catalog/collections", data),

    /**
     * Add items to a collection
     */
    addItemsToCollection: (
      collectionId: string,
      itemIds: string[],
    ): Promise<void> =>
      apiClient.post(`/catalog/collections/${collectionId}/items`, { itemIds }),

    /**
     * Remove items from a collection
     */
    removeItemsFromCollection: (
      collectionId: string,
      itemIds: string[],
    ): Promise<void> =>
      apiClient.delete(`/catalog/collections/${collectionId}/items`, {
        data: { itemIds },
      }),

    /**
     * Delete a collection
     */
    deleteCollection: (collectionId: string): Promise<void> =>
      apiClient.delete(`/catalog/collections/${collectionId}`),

    /**
     * Send catalog item(s) to a chat
     */
    sendToChat: (
      chatId: string,
      catalogItemIds: string[],
    ): Promise<{ success: boolean; messageId: string }> =>
      apiClient.post("/catalog/items/send", { chatId, catalogItemIds }),

    /**
     * Send catalog item(s) to multiple chats
     */
    sendToMultipleChats: (
      chatIds: string[],
      catalogItemIds: string[],
    ): Promise<{
      success: boolean;
      results: Array<{
        chatId: string;
        success: boolean;
        messageId?: string;
        error?: string;
      }>;
    }> =>
      apiClient.post("/catalog/items/send-bulk", { chatIds, catalogItemIds }),

    /**
     * Bulk import catalog items
     * @param items - Array of items to import (max 500)
     */
    bulkImport: (
      items: Array<{
        name: string;
        description?: string;
        price: number;
        salePrice?: number;
        currency?: string;
        link: string;
        retailerId?: string;
        availability?: string;
        condition?: string;
        brand?: string;
        imageUrl?: string;
      }>,
    ): Promise<{
      successCount: number;
      failedCount: number;
      totalCount: number;
      errors: Array<{ row: number; name: string; error: string }>;
      createdItemIds: string[];
    }> => apiClient.post("/catalog/items/bulk-import", { items }),

    // ==================== Meta Catalog Management ====================

    /**
     * List all Meta catalogs for the business
     */
    listMetaCatalogs: (): Promise<MetaCatalogsResponse> =>
      apiClient.get("/catalog/meta/catalogs"),

    /**
     * Create a new Meta catalog
     * Creates on Meta platform and links to team catalog
     */
    createMetaCatalog: (data: CreateMetaCatalogDto): Promise<CatalogResponse> =>
      apiClient.post("/catalog/meta/catalogs", data),

    /**
     * Get Meta catalog details
     */
    getMetaCatalogInfo: (metaCatalogId: string): Promise<MetaCatalog> =>
      apiClient.get(`/catalog/meta/catalogs/${metaCatalogId}`),

    /**
     * Delete a Meta catalog
     * This permanently deletes the catalog from Meta (if we own it),
     * disconnects it from WABA, and unlinks it from the team catalog.
     * For catalogs owned by other businesses, it will disconnect and clean up local references.
     */
    deleteMetaCatalog: (
      metaCatalogId: string,
    ): Promise<{
      success: boolean;
      catalogId: string;
      disconnectedFromWaba?: boolean;
      deletedFromMeta?: boolean;
      localCatalogUnlinked?: boolean;
      message?: string;
    }> => apiClient.delete(`/catalog/meta/catalogs/${metaCatalogId}`),

    /**
     * Link an existing Meta catalog to team catalog
     */
    linkMetaCatalog: (data: LinkMetaCatalogDto): Promise<CatalogResponse> =>
      apiClient.post("/catalog/meta/link", data),

    /**
     * Unlink Meta catalog from team catalog
     */
    unlinkMetaCatalog: (): Promise<CatalogResponse> =>
      apiClient.delete("/catalog/meta/link"),

    /**
     * List product sets (collections) in Meta catalog
     */
    listMetaProductSets: (): Promise<MetaProductSet[]> =>
      apiClient.get("/catalog/meta/product-sets"),

    /**
     * Create a product set in Meta catalog
     */
    createMetaProductSet: (
      data: CreateMetaProductSetDto,
    ): Promise<MetaProductSet> =>
      apiClient.post("/catalog/meta/product-sets", data),

    /**
     * Delete a product set from Meta catalog
     */
    deleteMetaProductSet: (
      productSetId: string,
    ): Promise<{ success: boolean }> =>
      apiClient.delete(`/catalog/meta/product-sets/${productSetId}`),
  },

  // Import Jobs endpoints - Bulk contacts import
  importJobs: {
    /**
     * Create a new import job and get presigned URL for upload
     */
    create: (
      originalFilename: string,
    ): Promise<{
      jobId: string;
      uploadUrl: string;
      s3Key: string;
    }> => apiClient.post("/import-jobs", { originalFilename }),

    /**
     * Notify that file upload is complete
     */
    notifyUploadComplete: (jobId: string) =>
      apiClient.post(`/import-jobs/${jobId}/upload-complete`, {}),

    /**
     * List all import jobs for current user
     */
    list: () => apiClient.get("/import-jobs"),

    /**
     * Get a single import job
     */
    get: (jobId: string) => apiClient.get(`/import-jobs/${jobId}`),

    /**
     * Save field mapping configuration
     */
    saveMapping: (
      jobId: string,
      data: {
        mapping: Record<string, string | null>;
        fullNameColumn?: string;
        defaultCountryCode?: string;
      },
    ) => apiClient.post(`/import-jobs/${jobId}/mapping`, data),

    /**
     * Trigger validation
     */
    triggerValidation: (jobId: string, batchSize?: number) =>
      apiClient.post(`/import-jobs/${jobId}/validate`, { batchSize }),

    /**
     * Get staging rows preview
     */
    getPreview: (
      jobId: string,
      options?: { skip?: number; take?: number; status?: string },
    ): Promise<{
      rows: Array<{
        id: string;
        rowNumber: number | null;
        rawData: Record<string, unknown>;
        mappedData: Record<string, unknown> | null;
        validationErrors: Array<{ field: string; message: string }>;
        status: string;
      }>;
      total: number;
      validCount: number;
      invalidCount: number;
      duplicateCount: number;
    }> => {
      const params = new URLSearchParams();
      if (options?.skip !== undefined)
        params.append("skip", String(options.skip));
      if (options?.take !== undefined)
        params.append("take", String(options.take));
      if (options?.status) params.append("status", options.status);
      const query = params.toString();
      return apiClient.get(
        `/import-jobs/${jobId}/preview${query ? `?${query}` : ""}`,
      );
    },

    /**
     * Commit the import
     */
    commit: (jobId: string, batchSize?: number) =>
      apiClient.post(`/import-jobs/${jobId}/commit`, { batchSize }),

    /**
     * Rollback an import
     */
    rollback: (jobId: string): Promise<{ count: number }> =>
      apiClient.delete(`/import-jobs/${jobId}/rollback`),

    /**
     * Delete an import job
     */
    delete: (jobId: string) => apiClient.delete(`/import-jobs/${jobId}`),

    // Mapping profiles
    profiles: {
      list: () => apiClient.get("/import-jobs/profiles"),
      create: (data: {
        providerName: string;
        mapping: Record<string, string | null>;
      }) => apiClient.post("/import-jobs/profiles", data),
      delete: (profileId: string) =>
        apiClient.delete(`/import-jobs/profiles/${profileId}`),
    },
  },

  // Senders endpoints - Phone number management for the WABA
  senders: {
    /**
     * Sync phone numbers from Meta WABA
     * Fetches all phone numbers and creates/updates senders
     */
    sync: (): Promise<SyncResult> => apiClient.post("/senders/sync", {}),

    /**
     * Get WABA configuration info
     */
    getWabaInfo: (): Promise<WabaInfo> => apiClient.get("/senders/waba-info"),

    /**
     * Get all senders
     */
    list: (): Promise<Sender[]> => apiClient.get("/senders"),

    /**
     * Get only active senders
     */
    listActive: (): Promise<Sender[]> => apiClient.get("/senders/active"),

    /**
     * Get a specific sender
     */
    get: (senderId: number): Promise<Sender> =>
      apiClient.get(`/senders/${senderId}`),

    /**
     * Create a sender manually
     */
    create: (data: {
      phoneNumber: string;
      displayName?: string;
      phoneNumberId?: string;
    }): Promise<Sender> => apiClient.post("/senders", data),

    /**
     * Update a sender
     */
    update: (
      senderId: number,
      data: {
        phoneNumber?: string;
        displayName?: string;
        phoneNumberId?: string;
      },
    ): Promise<Sender> => apiClient.patch(`/senders/${senderId}`, data),

    /**
     * Soft delete a sender
     */
    delete: (senderId: number): Promise<Sender> =>
      apiClient.delete(`/senders/${senderId}`),

    /**
     * Verify sender with Meta and retrieve metadata
     */
    verify: (senderId: number): Promise<Sender> =>
      apiClient.patch(`/senders/${senderId}/verify`, {}),

    /**
     * Refresh sender metadata from Meta
     */
    refresh: (senderId: number): Promise<Sender> =>
      apiClient.patch(`/senders/${senderId}/refresh`, {}),

    // Commerce Settings

    /**
     * Get commerce settings for a sender
     */
    getCommerceSettings: (senderId: number): Promise<CommerceSettings> =>
      apiClient.get(`/senders/${senderId}/commerce-settings`),

    /**
     * Sync commerce settings from Meta
     */
    syncCommerceSettings: (senderId: number): Promise<CommerceSettings> =>
      apiClient.post(`/senders/${senderId}/commerce-settings/sync`, {}),

    /**
     * Update commerce settings for a sender
     */
    updateCommerceSettings: (
      senderId: number,
      data: UpdateCommerceSettingsRequest,
    ): Promise<CommerceSettings> =>
      apiClient.patch(`/senders/${senderId}/commerce-settings`, data),

    /**
     * Link a Meta catalog to a sender
     * Connects the catalog to the phone number's commerce settings
     */
    linkCatalog: (
      senderId: number,
      catalogId: string,
    ): Promise<CommerceSettings> =>
      apiClient.post(`/senders/${senderId}/catalog/link`, { catalogId }),

    /**
     * Unlink catalog from a sender
     * Disconnects the catalog from the phone number's commerce settings
     */
    unlinkCatalog: (senderId: number): Promise<CommerceSettings> =>
      apiClient.delete(`/senders/${senderId}/catalog/link`),
  },

  // Templates endpoints
  templates: {
    /**
     * List templates (non-paginated, for backward compatibility)
     */
    list: (visible?: boolean) =>
      apiClient.get(`/templates${visible ? "?visible=true" : ""}`),

    /**
     * List templates with pagination
     */
    listPaginated: (params: {
      page: number;
      limit: number;
      search?: string;
      visible?: boolean;
    }): Promise<{
      data: any[];
      pagination: {
        page: number;
        limit: number;
        totalItems: number;
        totalPages: number;
      };
    }> => {
      const searchParams = new URLSearchParams({
        page: String(params.page),
        limit: String(params.limit),
      });
      if (params.search) {
        searchParams.set("search", params.search);
      }
      if (params.visible) {
        searchParams.set("visible", "true");
      }
      return apiClient.get(`/templates?${searchParams.toString()}`);
    },

    /**
     * Bulk delete multiple templates
     */
    bulkDelete: (
      templateIds: string[],
    ): Promise<{ success: boolean; deletedCount: number }> =>
      apiClient.post("/templates/bulk-delete", { templateIds }),

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
        data,
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
      },
    ): Promise<VariableResolutionResult> =>
      apiClient.post(`/templates/${templateId}/resolve`, data),
    getAutoFill: (
      templateId: string,
      data: {
        locale: string;
        contactId: string;
        senderId?: number;
        chatId?: string;
      },
    ) => apiClient.post(`/templates/${templateId}/autofill`, data),
    validateVariables: (variables: string[]) =>
      apiClient.post("/templates/validate-variables", { variables }),
    // Template approval endpoints
    validateForApproval: (
      templateId: string,
      data: { locale: string },
    ): Promise<TemplateValidationResult> =>
      apiClient.post(`/templates/${templateId}/validate-for-approval`, data),
    requestApproval: (
      templateId: string,
      data: { locale: string; provider?: string },
    ): Promise<TemplateApprovalResult> =>
      apiClient.post(`/templates/${templateId}/request-approval`, data),
    getApprovalStatus: (
      templateId: string,
      locale: string,
    ): Promise<TemplateApprovalStatus> =>
      apiClient.get(
        `/templates/${templateId}/approval-status?locale=${encodeURIComponent(
          locale,
        )}`,
      ),
    /**
     * Sync status for a single template with Meta API
     * Returns detailed sync result including status change info
     */
    syncStatus: (
      templateId: string,
      data: { locale: string },
    ): Promise<TemplateSyncResult> =>
      apiClient.post(`/templates/${templateId}/sync-status`, data),
    /**
     * Sync all pending templates with Meta API
     * Useful when webhooks may have been missed or to force a refresh
     */
    syncAllPending: (data?: { statuses?: string[] }): Promise<BulkSyncResult> =>
      apiClient.post("/templates/sync-all-pending", data || {}),
    /**
     * Get all templates with pending approval status
     */
    getPending: (): Promise<PendingTemplate[]> =>
      apiClient.get("/templates/pending"),

    // ==================== Version Management Endpoints ====================

    /**
     * Get comprehensive version info for a template locale
     * Returns active version, draft version, and version history
     */
    getVersionInfo: (
      templateId: string,
      locale: string,
    ): Promise<TemplateVersionInfo> =>
      apiClient.get(
        `/templates/${templateId}/versions?locale=${encodeURIComponent(locale)}`,
      ),

    /**
     * Get the active (approved) version for a template locale
     */
    getActiveVersion: (
      templateId: string,
      locale: string,
    ): Promise<TemplateVersionDetail | null> =>
      apiClient.get(
        `/templates/${templateId}/versions/active?locale=${encodeURIComponent(
          locale,
        )}`,
      ),

    /**
     * Get the draft version for a template locale (if exists)
     */
    getDraftVersion: (
      templateId: string,
      locale: string,
    ): Promise<TemplateVersionDetail | null> =>
      apiClient.get(
        `/templates/${templateId}/versions/draft?locale=${encodeURIComponent(
          locale,
        )}`,
      ),

    /**
     * Create a new draft version for a template locale
     * Always copies content from the active version if one exists.
     */
    createVersion: (
      templateId: string,
      data: { locale: string },
    ): Promise<TemplateVersionDetail> =>
      apiClient.post(`/templates/${templateId}/versions`, data),

    /**
     * Get a specific version by ID
     */
    getVersion: (
      templateId: string,
      versionId: string,
    ): Promise<TemplateVersionDetail> =>
      apiClient.get(`/templates/${templateId}/versions/${versionId}`),

    /**
     * Update version content (only for draft/rejected versions)
     */
    updateVersionContent: (
      templateId: string,
      versionId: string,
      data: Partial<VersionContent>,
    ): Promise<TemplateVersionDetail> =>
      apiClient.patch(`/templates/${templateId}/versions/${versionId}`, data),

    /**
     * Delete a version (only for draft/rejected versions)
     */
    deleteVersion: (
      templateId: string,
      versionId: string,
    ): Promise<{ success: boolean }> =>
      apiClient.delete(`/templates/${templateId}/versions/${versionId}`),

    /**
     * Submit a draft version for approval
     * Changes status from draft to pending_approval
     */
    submitVersionForApproval: (
      templateId: string,
      versionId: string,
    ): Promise<TemplateVersionDetail> =>
      apiClient.post(
        `/templates/${templateId}/versions/${versionId}/submit`,
        {},
      ),

    /**
     * Duplicate a version as a new draft
     * Useful for creating a new draft from an approved or rejected version
     */
    duplicateVersion: (
      templateId: string,
      versionId: string,
      data: { locale: string },
    ): Promise<TemplateVersionDetail> =>
      apiClient.post(
        `/templates/${templateId}/versions/${versionId}/duplicate`,
        data,
      ),

    /**
     * Set a specific approved version as the active version for a locale
     * By default, the latest approved version becomes active automatically,
     * but this allows manual selection of any approved version
     */
    setActiveVersion: (
      templateId: string,
      versionId: string,
    ): Promise<TemplateVersionDetail> =>
      apiClient.post(
        `/templates/${templateId}/versions/${versionId}/set-active`,
        {},
      ),

    // ==================== Media Upload Endpoints ====================

    /**
     * Upload media file directly to Meta and S3 without requiring an existing template/locale
     * Used when creating new templates - the asset handle can be included in template data when saving
     * Returns the asset handle for Meta API and a URL for display
     */
    uploadMediaTemporary: (data: {
      filename: string;
      mimeType: string;
      base64Data: string;
    }): Promise<{
      success: boolean;
      assetHandle?: string;
      /** Public URL for displaying the media */
      url?: string;
      filename: string;
      mimeType: string;
      fileSize: number;
      error?: string;
      /** Temporary ID for matching WebSocket thumbnail events (videos/documents only) */
      tempId?: string;
    }> => apiClient.post(`/templates/media/upload-temporary`, data),

    /**
     * Upload media file for template header or carousel card
     * Returns the asset handle for Meta API and a URL for display
     */
    uploadMedia: (
      templateId: string,
      localeId: string,
      data: {
        componentType: "HEADER" | "CAROUSEL_CARD";
        filename: string;
        mimeType: string;
        base64Data: string;
        cardIndex?: number;
      },
    ): Promise<{
      success: boolean;
      assetHandle?: string;
      mediaId?: string;
      url?: string;
      error?: string;
    }> =>
      apiClient.post(
        `/templates/${templateId}/locales/${localeId}/media/upload`,
        data,
      ),

    /**
     * Get all media files for a template locale
     */
    getMedia: (
      templateId: string,
      localeId: string,
    ): Promise<{
      media: Array<{
        id: string;
        componentType: string;
        mediaType: string;
        originalFilename: string;
        assetHandle?: string;
        uploadStatus: string;
        createdAt: string;
      }>;
      count: number;
    }> => apiClient.get(`/templates/${templateId}/locales/${localeId}/media`),

    /**
     * Delete a media file from a template locale
     */
    deleteMedia: (
      templateId: string,
      localeId: string,
      mediaId: string,
    ): Promise<{ success: boolean }> =>
      apiClient.delete(
        `/templates/${templateId}/locales/${localeId}/media/${mediaId}`,
      ),
  },

  // Notes endpoints
  notes: {
    create: (data: {
      messageId?: string;
      chatId?: string;
      note: string;
    }): Promise<NoteResponse> => apiClient.post("/notes", data),

    /** @deprecated Use getPaginated for better performance */
    getChatNotes: (chatId: string) => apiClient.get(`/notes/chat/${chatId}`),

    /**
     * Get paginated notes for a chat (general notes only)
     * @param chatId - The chat ID
     * @param options - Pagination options
     */
    getPaginated: (
      chatId: string,
      options?: {
        limit?: number;
        cursor?: number;
        direction?: "before" | "after";
        aroundId?: number;
      },
    ): Promise<PaginatedNotesResponse> => {
      const params = new URLSearchParams();
      if (options?.limit) params.append("limit", options.limit.toString());
      if (options?.cursor) params.append("cursor", options.cursor.toString());
      if (options?.direction) params.append("direction", options.direction);
      if (options?.aroundId)
        params.append("aroundId", options.aroundId.toString());

      const queryString = params.toString();
      return apiClient.get(
        `/notes/chat/${chatId}/paginated${queryString ? `?${queryString}` : ""}`,
      );
    },

    /**
     * Search notes in a chat
     * @param chatId - The chat ID
     * @param query - Search query
     * @param options - Search options
     */
    search: (
      chatId: string,
      query: string,
      options?: { limit?: number },
    ): Promise<NotesSearchResponse> => {
      const params = new URLSearchParams();
      params.append("q", query);
      if (options?.limit) params.append("limit", options.limit.toString());

      return apiClient.get(`/notes/chat/${chatId}/search?${params.toString()}`);
    },

    getMessageNotes: (messageId: string) =>
      apiClient.get(`/notes/message/${messageId}`),
    delete: (noteId: number) => apiClient.delete(`/notes/${noteId}`),
  },

  // Reactions endpoints
  reactions: {
    /**
     * Add or update a reaction to a message
     * If user already has a reaction, it will be replaced
     */
    add: (data: {
      messageId: string;
      emoji: string;
    }): Promise<ReactionResponse> => apiClient.post("/reactions", data),

    /**
     * Remove a reaction from a message
     */
    remove: (messageId: string): Promise<{ success: boolean }> =>
      apiClient.delete(`/reactions/${messageId}`),

    /**
     * Get all reactions for a specific message
     */
    getForMessage: (messageId: string): Promise<ReactionResponse[]> =>
      apiClient.get(`/reactions/${messageId}`),

    /**
     * Get reactions for multiple messages in batch
     */
    getForMessages: (
      messageIds: string[],
    ): Promise<{ messageId: string; reactions: ReactionResponse[] }[]> =>
      apiClient.get(
        `/reactions/batch/messages?messageIds=${messageIds.join(",")}`,
      ),

    /**
     * Get current user's reaction on a message
     */
    getMine: (messageId: string): Promise<ReactionResponse | null> =>
      apiClient.get(`/reactions/${messageId}/mine`),

    /**
     * Get customer reactions for a chat
     */
    getCustomerReactionsForChat: (
      chatId: string,
    ): Promise<CustomerReactionResponse[]> =>
      apiClient.get(`/reactions/customer/${chatId}`),

    /**
     * Get customer reactions for multiple messages in batch
     */
    getCustomerReactionsForMessages: (
      messageIds: string[],
    ): Promise<CustomerReactionResponse[]> =>
      apiClient.get(
        `/reactions/customer/batch/messages?messageIds=${messageIds.join(",")}`,
      ),
  },

  // Pins endpoints - Pinned messages management
  pins: {
    /**
     * Get all pinned messages for a chat
     */
    getForChat: (chatId: string): Promise<PinnedMessageResponse[]> =>
      apiClient.get(`/pins/${chatId}`),

    /**
     * Get pin count for a chat
     */
    getCount: (chatId: string): Promise<PinCountResponse> =>
      apiClient.get(`/pins/${chatId}/count`),

    /**
     * Pin a message
     * Duration options: 24 (24h), 168 (7 days), 720 (30 days)
     */
    pin: (data: {
      messageId: string;
      chatId: string;
      duration: 24 | 168 | 720;
    }): Promise<PinnedMessageResponse> => apiClient.post("/pins", data),

    /**
     * Unpin a message
     */
    unpin: (data: {
      messageId: string;
      chatId: string;
    }): Promise<{ success: boolean }> =>
      apiClient.delete(`/pins/${data.chatId}/${data.messageId}`),

    /**
     * Check if a message is pinned
     */
    isPinned: (
      chatId: string,
      messageId: string,
    ): Promise<{ isPinned: boolean }> =>
      apiClient.get(`/pins/${chatId}/check/${messageId}`),

    /**
     * Get pinned status for multiple messages
     */
    getPinnedIds: (
      chatId: string,
      messageIds: string[],
    ): Promise<{ pinnedMessageIds: string[] }> =>
      apiClient.get(`/pins/${chatId}/batch?messageIds=${messageIds.join(",")}`),

    /**
     * Get message context for scrolling to a pinned message
     * Returns the target message and surrounding messages for efficient loading
     */
    getMessageContext: (
      chatId: string,
      messageId: string,
      windowSize?: number,
    ): Promise<{
      found: boolean;
      message?: any;
      surroundingMessages: any[];
      hasMoreBefore: boolean;
      hasMoreAfter: boolean;
      position: number;
      total: number;
    }> =>
      apiClient.get(
        `/pins/${chatId}/context/${messageId}${
          windowSize ? `?windowSize=${windowSize}` : ""
        }`,
      ),
  },

  // Link Preview endpoints
  linkPreview: {
    get: (url: string) =>
      apiClient.get(`/link-preview?url=${encodeURIComponent(url)}`),
    getBatch: (urls: string[]) =>
      apiClient.post("/link-preview/batch", { urls }),
  },

  // ==========================================================================
  // Workflow & AI Handoff
  // ==========================================================================
  workflow: {
    // Handoff status
    getHandoffStatus: (
      chatId: string,
    ): Promise<{
      chatId: string;
      awaitingHandoff: boolean;
      handoffRequestedAt?: string;
      handoffReason?: string;
      aiPaused: boolean;
      aiPausedAt?: string;
      aiPausedBy?: number;
      currentStageId: string;
      currentStageName: string;
    } | null> => apiClient.get(`/workflow/handoff/chat/${chatId}/status`),

    // AI status for a chat
    getAIStatus: (
      chatId: string,
    ): Promise<{
      chatId: string;
      aiEnabled: boolean;
      reason?: string;
    }> => apiClient.get(`/workflow/ai/status/${chatId}`),

    // Pause AI for a chat
    pauseAI: (chatId: string): Promise<{ success: boolean; message: string }> =>
      apiClient.post("/workflow/ai/pause", { chatId }),

    // Resume AI for a chat
    resumeAI: (
      chatId: string,
    ): Promise<{ success: boolean; message: string }> =>
      apiClient.post(`/workflow/ai/resume/${chatId}`),

    // Request human handoff
    requestHandoff: (data: {
      chatId: string;
      reason: string;
    }): Promise<{ success: boolean; message: string }> =>
      apiClient.post("/workflow/handoffs/request", data),

    // Resolve handoff
    resolveHandoff: (data: {
      chatId: string;
      resumeAI: boolean;
      resolution?: string;
    }): Promise<{ success: boolean; message: string }> =>
      apiClient.post("/workflow/handoffs/resolve", data),

    // Get pending handoffs
    getPendingHandoffs: (): Promise<
      Array<{
        chatId: string;
        stageId: string;
        stageName: string;
        handoffRequestedAt: string | null;
        handoffReason: string | null;
      }>
    > => apiClient.get("/workflow/handoffs/pending"),

    // Handoff notifications
    getNotifications: (): Promise<
      Array<{
        id: string;
        chatId: string;
        notificationType: string;
        priority: string;
        title: string;
        message: string;
        aiReason?: string;
        suggestedAction?: string;
        status: string;
        createdAt: string;
      }>
    > => apiClient.get("/workflow/handoff/notifications"),

    acknowledgeNotification: (
      notificationId: string,
    ): Promise<{ success: boolean }> =>
      apiClient.patch(
        `/workflow/handoff/notifications/${notificationId}/acknowledge`,
      ),

    resolveNotification: (
      notificationId: string,
      resolution: string,
    ): Promise<{ success: boolean }> =>
      apiClient.patch(
        `/workflow/handoff/notifications/${notificationId}/resolve`,
        { resolution },
      ),
  },

  // ==========================================================================
  // Usage Tracking & Throttling
  // ==========================================================================
  usage: {
    // Get usage summary
    getSummary: (options?: {
      period?: "daily" | "weekly" | "monthly" | "all";
      startDate?: string;
      endDate?: string;
    }): Promise<{
      totalTokens: number;
      totalCost: number;
      requestCount: number;
      byProvider: Record<
        string,
        { tokens: number; cost: number; requests: number }
      >;
      byOperationType: Record<
        string,
        { tokens: number; cost: number; requests: number }
      >;
      periodStart: string;
      periodEnd: string;
    }> => {
      const params = new URLSearchParams();
      if (options?.period) params.append("period", options.period);
      if (options?.startDate) params.append("startDate", options.startDate);
      if (options?.endDate) params.append("endDate", options.endDate);
      return apiClient.get(`/workflow/usage/summary?${params.toString()}`);
    },

    // Get usage status against limits
    getStatus: (): Promise<
      Array<{
        currentUsage: number;
        limit: number;
        percentUsed: number;
        remaining: number;
        isAtLimit: boolean;
        isNearLimit: boolean;
        limitType: string;
        limitPeriod: string;
        periodEnd?: string;
      }>
    > => apiClient.get("/workflow/usage/status"),

    // Get chat-specific usage
    getChatUsage: (
      chatId: string,
      limit?: number,
    ): Promise<
      Array<{
        id: string;
        providerName: string;
        tokensUsed: number;
        cost: string;
        operationType: string;
        createdAt: string;
      }>
    > =>
      apiClient.get(
        `/workflow/usage/chat/${chatId}${limit ? `?limit=${limit}` : ""}`,
      ),

    // Set usage limit
    setLimit: (data: {
      limitType: "tokens" | "cost" | "requests";
      limitPeriod: "daily" | "weekly" | "monthly" | "total";
      limitValue: number;
      warningThreshold?: number;
      actionOnLimit?: "pause" | "notify" | "block";
    }): Promise<{ success: boolean; limitId: string }> =>
      apiClient.post("/workflow/usage/limits", data),

    // Remove usage limit
    removeLimit: (limitType: string, limitPeriod: string): Promise<void> =>
      apiClient.delete(`/workflow/usage/limits/${limitType}/${limitPeriod}`),

    // Get throttle dashboard status
    getThrottleStatus: (): Promise<{
      isThrottled: boolean;
      aiPausedChats: number;
      usageStatuses: Array<{
        currentUsage: number;
        limit: number;
        percentUsed: number;
        remaining: number;
        isAtLimit: boolean;
        isNearLimit: boolean;
        limitType: string;
        limitPeriod: string;
      }>;
      warnings: string[];
      recommendations: string[];
    }> => apiClient.get("/workflow/throttle/status"),

    // Check if AI operation is allowed
    checkBeforeAiOperation: (): Promise<{
      allowed: boolean;
      reason?: string;
      actionRequired?: "pause" | "notify" | "block";
      exceededLimits?: Array<{
        type: string;
        period: string;
        current: number;
        limit: number;
        percentUsed: number;
      }>;
      warnings?: string[];
    }> => apiClient.post("/workflow/throttle/check"),

    // Pause AI for a chat
    pauseChat: (
      chatId: string,
      reason?: string,
    ): Promise<{ success: boolean; message: string }> =>
      apiClient.post("/workflow/throttle/pause-chat", { chatId, reason }),

    // Resume AI for a chat
    resumeChat: (
      chatId: string,
    ): Promise<{ success: boolean; message: string }> =>
      apiClient.post("/workflow/throttle/resume-chat", { chatId }),

    // Pause all AI
    pauseAll: (
      reason?: string,
    ): Promise<{ success: boolean; pausedCount: number }> =>
      apiClient.post("/workflow/throttle/pause-all", { reason }),
  },

  // Workflow Stages
  stages: {
    // Get all stages for the user
    getStages: (): Promise<WorkflowStage[]> =>
      apiClient.get("/workflow/stages"),

    // Get single stage
    getStage: (stageId: string): Promise<WorkflowStage> =>
      apiClient.get(`/workflow/stages/${stageId}`),

    // Create new stage
    createStage: (data: CreateStageDto): Promise<WorkflowStage> =>
      apiClient.post("/workflow/stages", data),

    // Update stage
    updateStage: (
      stageId: string,
      data: UpdateStageDto,
    ): Promise<WorkflowStage> =>
      apiClient.patch(`/workflow/stages/${stageId}`, data),

    // Delete stage
    deleteStage: (stageId: string): Promise<void> =>
      apiClient.delete(`/workflow/stages/${stageId}`),

    // Reorder stages
    reorderStages: (stageIds: string[]): Promise<{ success: boolean }> =>
      apiClient.post("/workflow/stages/reorder", { stageIds }),

    // Initialize default stages
    initializeDefaults: (): Promise<{ success: boolean }> =>
      apiClient.post("/workflow/stages/initialize-defaults", {}),

    // Get chats by stage
    getChatsByStage: (
      stageId: string,
      limit?: number,
      offset?: number,
    ): Promise<ChatStageAssignment[]> => {
      const params = new URLSearchParams();
      if (limit) params.append("limit", limit.toString());
      if (offset) params.append("offset", offset.toString());
      return apiClient.get(
        `/workflow/stages/${stageId}/chats?${params.toString()}`,
      );
    },

    // Transition chat to new stage
    transitionChat: (data: {
      chatId: string;
      toStageId: string;
      reason?: string;
      metadata?: Record<string, unknown>;
    }): Promise<{ success: boolean; message: string }> =>
      apiClient.post("/workflow/chat/transition", data),

    // Get chat's current stage
    getChatStatus: (chatId: string): Promise<ChatWorkflowStatus> =>
      apiClient.get(`/workflow/chat/${chatId}/status`),

    // Get stage history for chat (raw)
    getStageHistory: (chatId: string): Promise<StageHistoryEntry[]> =>
      apiClient.get(`/workflow/chat/${chatId}/history`),

    // Get enriched stage history for chat (with stage names and user info)
    getEnrichedStageHistory: (
      chatId: string,
      limit?: number,
    ): Promise<EnrichedStageHistoryEntry[]> => {
      const params = limit ? `?limit=${limit}` : "";
      return apiClient.get(
        `/workflow/chat/${chatId}/history/enriched${params}`,
      );
    },

    // Get global stage history (for kanban page activity)
    getGlobalStageHistory: (
      limit?: number,
    ): Promise<GlobalStageHistoryEntry[]> => {
      const params = limit ? `?limit=${limit}` : "";
      return apiClient.get(`/workflow/history/global${params}`);
    },

    // Get paginated activity logs with date range filtering
    getActivityLogs: (params: {
      page?: number;
      pageSize?: number;
      startDate?: string;
      endDate?: string;
      activityTypes?: string[];
      entityType?: string;
      chatId?: string;
    }): Promise<PaginatedAuditResponse> => {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.append("page", params.page.toString());
      if (params.pageSize)
        searchParams.append("pageSize", params.pageSize.toString());
      if (params.startDate) searchParams.append("startDate", params.startDate);
      if (params.endDate) searchParams.append("endDate", params.endDate);
      if (params.activityTypes && params.activityTypes.length > 0)
        searchParams.append("activityTypes", params.activityTypes.join(","));
      if (params.entityType)
        searchParams.append("entityType", params.entityType);
      if (params.chatId) searchParams.append("chatId", params.chatId);
      const queryString = searchParams.toString();
      return apiClient.get(
        `/workflow/activity-logs${queryString ? `?${queryString}` : ""}`,
      );
    },

    // Get workflow summary
    getWorkflowSummary: (senderId?: number): Promise<WorkflowSummary> => {
      const params = senderId ? `?senderId=${senderId}` : "";
      return apiClient.get(`/workflow/summary${params}`);
    },
  },

  // AI Configuration
  aiConfig: {
    // Get available options (tones, styles, formalities)
    getOptions: (): Promise<AiConfigOptions> =>
      apiClient.get("/workflow/ai-config/options"),

    // Get user's AI configuration
    getUserConfig: (): Promise<AiConfiguration> =>
      apiClient.get("/workflow/ai-config"),

    // Update user's AI configuration
    updateUserConfig: (
      data: UpdateAiConfigurationDto,
    ): Promise<AiConfiguration> => apiClient.patch("/workflow/ai-config", data),

    // Get resolved configuration for a chat (merged user + stage + chat)
    getResolvedConfig: (chatId: string): Promise<ResolvedAiConfig> =>
      apiClient.get(`/workflow/ai-config/resolved/${chatId}`),

    // Chat overrides
    getChatOverrides: (): Promise<ChatAiOverride[]> =>
      apiClient.get("/workflow/ai-config/chat-overrides"),

    getChatOverride: (chatId: string): Promise<ChatAiOverride | null> =>
      apiClient.get(`/workflow/ai-config/chat-overrides/${chatId}`),

    setChatOverride: (data: SetChatOverrideDto): Promise<ChatAiOverride> =>
      apiClient.post("/workflow/ai-config/chat-overrides", data),

    deleteChatOverride: (chatId: string): Promise<void> =>
      apiClient.delete(`/workflow/ai-config/chat-overrides/${chatId}`),

    // Stage settings
    getStageSettings: (): Promise<WorkflowStageAiSetting[]> =>
      apiClient.get("/workflow/ai-config/stage-settings"),

    getStageSetting: (
      stageId: string,
    ): Promise<WorkflowStageAiSetting | null> =>
      apiClient.get(`/workflow/ai-config/stage-settings/${stageId}`),

    setStageSetting: (
      data: SetStageAiSettingsDto,
    ): Promise<WorkflowStageAiSetting> =>
      apiClient.post("/workflow/ai-config/stage-settings", data),

    deleteStageSetting: (stageId: string): Promise<void> =>
      apiClient.delete(`/workflow/ai-config/stage-settings/${stageId}`),
  },

  // AI Review
  aiReview: {
    sendReviewed: (data: {
      chatId: string;
      content: string;
      mediaAttachment?: unknown;
      interactiveData?: unknown;
    }) => apiClient.post("/workflow/ai/send-reviewed", data),

    discardPending: (chatId: string) =>
      apiClient.post("/workflow/ai/discard-pending", { chatId }),

    regenerate: async (chatId: string) => {
      return apiClient.post("/workflow/ai/regenerate", { chatId });
    },
  },

  aiWorkflow: {
    getAIStatus: (
      chatId: string,
    ): Promise<{
      chatId: string;
      aiEnabled: boolean;
      aiConfigEnabled: boolean;
      reason?: string;
      isRateLimited: boolean;
      rateLimitReset?: Date;
      rateLimitCurrentCount?: number;
      rateLimitMaxCount?: number;
    }> => apiClient.get(`/workflow/ai/status/${chatId}`),
  },

  // ==================== Labels API ====================
  labels: {
    /**
     * Get all labels for the current team
     */
    list: (): Promise<LabelResponse[]> => apiClient.get("/labels"),

    /**
     * Get a specific label by ID
     */
    get: (labelId: string): Promise<LabelResponse> =>
      apiClient.get(`/labels/${labelId}`),

    /**
     * Create a new label
     */
    create: (data: CreateLabelDto): Promise<LabelResponse> =>
      apiClient.post("/labels", data),

    /**
     * Update a label
     */
    update: (labelId: string, data: UpdateLabelDto): Promise<LabelResponse> =>
      apiClient.patch(`/labels/${labelId}`, data),

    /**
     * Delete a label
     */
    delete: (labelId: string): Promise<{ success: boolean; message: string }> =>
      apiClient.delete(`/labels/${labelId}`),

    /**
     * Get all labels for a specific chat
     */
    getChatLabels: (chatId: string): Promise<LabelResponse[]> =>
      apiClient.get(`/labels/chat/${chatId}`),

    /**
     * Apply labels to multiple chats
     */
    applyToChats: (
      data: ApplyLabelsDto,
    ): Promise<{ applied: number; skipped: number }> =>
      apiClient.post("/labels/apply", data),

    /**
     * Remove labels from multiple chats
     */
    removeFromChats: (data: RemoveLabelsDto): Promise<{ removed: number }> =>
      apiClient.post("/labels/remove", data),

    /**
     * Get all chats with a specific label
     */
    getChatsWithLabel: (
      labelId: string,
      options?: { skip?: number; take?: number },
    ): Promise<ChatsWithLabelResponse> => {
      const params = new URLSearchParams();
      if (options?.skip !== undefined)
        params.append("skip", String(options.skip));
      if (options?.take !== undefined)
        params.append("take", String(options.take));
      const query = params.toString();
      return apiClient.get(
        `/labels/${labelId}/chats${query ? `?${query}` : ""}`,
      );
    },
  },

  // ==================== Public Endpoints ====================

  // ==================== Audit History ====================

  audit: {
    /**
     * Get paginated audit history with filters
     */
    getHistory: (
      params?: AuditHistoryParams,
    ): Promise<PaginatedAuditResponse> => {
      const searchParams = new URLSearchParams();
      if (params) {
        if (params.page !== undefined)
          searchParams.append("page", String(params.page));
        if (params.pageSize !== undefined)
          searchParams.append("pageSize", String(params.pageSize));
        if (params.category) searchParams.append("category", params.category);
        if (params.categories?.length)
          searchParams.append("categories", params.categories.join(","));
        if (params.entityType)
          searchParams.append("entityType", params.entityType);
        if (params.entityId) searchParams.append("entityId", params.entityId);
        if (params.action) searchParams.append("action", params.action);
        if (params.actions?.length)
          searchParams.append("actions", params.actions.join(","));
        if (params.userId !== undefined)
          searchParams.append("userId", String(params.userId));
        if (params.startDate)
          searchParams.append("startDate", params.startDate);
        if (params.endDate) searchParams.append("endDate", params.endDate);
        if (params.chatId) searchParams.append("chatId", params.chatId);
        if (params.search) searchParams.append("search", params.search);
      }
      const query = searchParams.toString();
      return apiClient.get(`/audit/history${query ? `?${query}` : ""}`);
    },

    /**
     * Get audit history for a specific entity
     */
    getEntityHistory: (
      entityType: AuditEntityType,
      entityId: string,
    ): Promise<AuditEntry[]> =>
      apiClient.get(`/audit/entity/${entityType}/${entityId}`),

    /**
     * Get team members for audit filter dropdown (admin/owner only)
     */
    getTeamMembers: (): Promise<AuditTeamMember[]> =>
      apiClient.get("/audit/team-members"),

    /**
     * Export audit logs as CSV file download.
     * Uses the same filter params as getHistory.
     */
    exportCsv: async (params?: AuditHistoryParams): Promise<void> => {
      const searchParams = new URLSearchParams();
      if (params) {
        if (params.category) searchParams.append("category", params.category);
        if (params.categories?.length)
          searchParams.append("categories", params.categories.join(","));
        if (params.entityType)
          searchParams.append("entityType", params.entityType);
        if (params.entityId) searchParams.append("entityId", params.entityId);
        if (params.action) searchParams.append("action", params.action);
        if (params.actions?.length)
          searchParams.append("actions", params.actions.join(","));
        if (params.userId !== undefined)
          searchParams.append("userId", String(params.userId));
        if (params.startDate)
          searchParams.append("startDate", params.startDate);
        if (params.endDate) searchParams.append("endDate", params.endDate);
        if (params.chatId) searchParams.append("chatId", params.chatId);
        if (params.search) searchParams.append("search", params.search);
      }
      const query = searchParams.toString();
      const baseUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
      const url = `${baseUrl}/audit/export${query ? `?${query}` : ""}`;

      const response = await fetch(url, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download =
        response.headers
          .get("content-disposition")
          ?.match(/filename="?(.+?)"?$/)?.[1] ??
        `audit-history-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    },
  },
};

// ==================== AI Configuration Types ====================

export interface AiConfigOption {
  value: string;
  label: string;
  description: string;
}

export interface AiConfigOptions {
  tones: AiConfigOption[];
  styles: AiConfigOption[];
  formalities: AiConfigOption[];
}

export interface AiConfiguration {
  id: string;
  userId: number;
  // Default AI behavior for new chats
  defaultAiRepliesEnabled: boolean;
  defaultAiPaused: boolean;
  // Conversation strategy - how AI handles initial/vague messages
  conversationStrategy: "direct" | "qualifying" | "guided";
  // Style settings
  defaultTone: string;
  defaultStyle: string;
  formalityLevel: string;
  maxMessagesPerHour: number;
  maxMessagesPerDay: number;
  minDelayBetweenMessagesMs: number;
  languagePreference: string | null;
  autoTranslateResponses: boolean;
  allowFreeTextRepliesWithin24h: boolean;
  preferTemplatesOver24h: boolean;
  autoSuggestTemplates: boolean;
  maxResponseLength: number;
  avoidTopics: string[];
  requiredSignature: string | null;
  preferredModel: string | null;
  temperature: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateAiConfigurationDto {
  // Default AI behavior for new chats
  defaultAiRepliesEnabled?: boolean;
  defaultAiPaused?: boolean;
  // Conversation strategy - how AI handles initial/vague messages
  conversationStrategy?: "direct" | "qualifying" | "guided";
  // Style settings
  defaultTone?: string;
  defaultStyle?: string;
  formalityLevel?: string;
  maxMessagesPerHour?: number;
  maxMessagesPerDay?: number;
  minDelayBetweenMessagesMs?: number;
  languagePreference?: string | null;
  autoTranslateResponses?: boolean;
  allowFreeTextRepliesWithin24h?: boolean;
  preferTemplatesOver24h?: boolean;
  autoSuggestTemplates?: boolean;
  maxResponseLength?: number;
  avoidTopics?: string[];
  requiredSignature?: string | null;
  preferredModel?: string | null;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

// ==================== Workflow Stages Types ====================

export interface WorkflowStage {
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

export interface CreateStageDto {
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

export interface UpdateStageDto {
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

/**
 * Enriched chat stage assignment with full chat details for Kanban display
 */
export interface ChatStageAssignment {
  // Assignment fields
  id: string;
  chatId: string;
  stageId: string | null;
  awaitingHandoff: boolean;
  handoffRequestedAt: string | null;
  handoffReason: string | null;
  aiPaused: boolean;
  aiPausedAt: string | null;
  aiPausedBy: number | null;
  aiPauseReason?: string | null;
  assignedAt: string; // Time entered current stage
  updatedAt: string;
  // Enriched chat fields for Kanban card display
  participantPhone: string;
  participantName: string | null;
  lastMessage: string | null;
  lastMessageTime: string | null;
  lastMessageType: string | null;
  unreadCount: number;
  isActive: boolean | null;
  aiOverrideEnabled?: boolean;
  // Assignee info for avatar display
  assignedToId: number | null;
  assignedToName: string | null;
  assignedToProfilePictureUrl: string | null;
}

export interface ChatWorkflowStatus {
  chatId: string;
  currentStage: WorkflowStage | null;
  awaitingHandoff: boolean;
  aiPaused: boolean;
  canTransition: boolean;
  availableStages: WorkflowStage[];
}

export interface StageHistoryEntry {
  id: string;
  chatId: string;
  fromStageId: string | null;
  toStageId: string;
  fromStageName: string | null;
  toStageName: string;
  triggerType: "ai" | "human" | "system" | "rule";
  triggeredBy: number | null;
  reason: string | null;
  createdAt: string;
}

/**
 * Enriched stage history entry for the Pipeline Activity tab
 * Includes stage colors and triggered by user name
 */
export interface EnrichedStageHistoryEntry {
  id: string;
  chatId: string;
  fromStageId: string | null;
  toStageId: string | null;
  fromStageName: string | null;
  fromStageColor: string | null;
  toStageName: string | null;
  toStageColor: string | null;
  triggerType: "ai" | "human" | "system" | "rule";
  triggeredBy: number | null;
  triggeredByName: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Global stage history entry for the Kanban Activity panel
 * Includes chat participant info for identification
 */
export interface GlobalStageHistoryEntry {
  id: string;
  chatId: string;
  participantName: string | null;
  participantPhone: string | null;
  fromStageId: string | null;
  toStageId: string | null;
  fromStageName: string | null;
  fromStageColor: string | null;
  toStageName: string | null;
  toStageColor: string | null;
  triggerType: "ai" | "human" | "system" | "rule";
  triggeredBy: number | null;
  triggeredByName: string | null;
  reason: string | null;
  createdAt: string;
}

export interface WorkflowSummary {
  totalChats: number;
  stageDistribution: Array<{
    stageId: string;
    stageName: string;
    stageColor: string;
    chatCount: number;
    percentage: number;
  }>;
  recentTransitions: StageHistoryEntry[];
  handoffsPending: number;
  aiPausedChats: number;
}

export interface ResolvedAiConfig {
  source: {
    userId: number;
    chatId?: string;
    stageId?: string;
    hasUserConfig: boolean;
    hasStageConfig: boolean;
    hasChatOverride: boolean;
  };
  tone: string;
  style: string;
  formalityLevel: string;
  maxMessagesPerHour: number;
  maxMessagesPerDay: number;
  minDelayBetweenMessagesMs: number;
  languagePreference: string | null;
  autoTranslateResponses: boolean;
  allowFreeTextReplies: boolean;
  preferTemplatesOver24h: boolean;
  autoSuggestTemplates: boolean;
  useTemplatesOnly: boolean;
  suggestedTemplateIds: string[];
  maxResponseLength: number;
  avoidTopics: string[];
  requiredSignature: string | null;
  preferredModel: string | null;
  temperature: number;
  aiEnabled: boolean;
  systemPromptAddition: string | null;
  goalDescription: string | null;
  customInstructions: string | null;
  escalationTriggers: unknown[];
}

export interface ChatAiOverride {
  id: string;
  chatId: string;
  userId: number;
  tone: string | null;
  style: string | null;
  formalityLevel: string | null;
  maxMessagesPerHour: number | null;
  languagePreference: string | null;
  allowFreeTextReplies: boolean | null;
  useTemplatesOnly: boolean;
  reviewBeforeSend: boolean;
  maxResponseLength: number | null;
  customInstructions: string | null;
  avoidTopics: string[] | null;
  aiEnabled: boolean;
  overrideReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SetChatOverrideDto {
  chatId: string;
  tone?: string | null;
  style?: string | null;
  formalityLevel?: string | null;
  maxMessagesPerHour?: number | null;
  languagePreference?: string | null;
  allowFreeTextReplies?: boolean | null;
  useTemplatesOnly?: boolean;
  reviewBeforeSend?: boolean;
  maxResponseLength?: number | null;
  customInstructions?: string | null;
  avoidTopics?: string[] | null;
  aiEnabled?: boolean;
  overrideReason?: string | null;
}

export interface WorkflowStageAiSetting {
  id: string;
  stageId: string;
  userId: number;
  tone: string | null;
  style: string | null;
  formalityLevel: string | null;
  maxMessagesPerHour: number | null;
  languagePreference: string | null;
  allowFreeTextReplies: boolean | null;
  useTemplatesOnly: boolean;
  suggestedTemplateIds: string[];
  maxResponseLength: number | null;
  systemPromptAddition: string | null;
  goalDescription: string | null;
  escalationTriggers: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface SetStageAiSettingsDto {
  stageId: string;
  tone?: string | null;
  style?: string | null;
  formalityLevel?: string | null;
  maxMessagesPerHour?: number | null;
  languagePreference?: string | null;
  allowFreeTextReplies?: boolean | null;
  useTemplatesOnly?: boolean;
  suggestedTemplateIds?: string[];
  maxResponseLength?: number | null;
  systemPromptAddition?: string | null;
  goalDescription?: string | null;
  escalationTriggers?: unknown[];
}

// ==================== Audit Types ====================

/**
 * Categories for audit log filtering.
 * Maps to the backend AuditCategory type.
 */
export type AuditCategory =
  | "pipeline"
  | "contacts"
  | "templates"
  | "team"
  | "catalog"
  | "senders"
  | "labels"
  | "knowledge_base"
  | "import"
  | "settings"
  | "auth";

/**
 * All possible audit actions across the system.
 */
export type AuditAction =
  // Pipeline / Workflow
  | "stage_created"
  | "stage_updated"
  | "stage_deleted"
  | "stage_reordered"
  | "stage_default_changed"
  | "chat_transitioned"
  | "handoff_requested"
  | "handoff_resolved"
  | "ai_paused"
  | "ai_resumed"
  | "chat_assigned"
  | "chat_reassigned"
  | "chat_unassigned"
  | "message_sent_human"
  | "message_sent_ai"
  | "message_deleted"
  | "message_edited"
  | "note_added"
  | "note_deleted"
  | "chat_created"
  | "chat_deleted"
  | "lock_acquired"
  | "lock_released"
  | "lock_force_released"
  // Contacts
  | "contact_created"
  | "contact_updated"
  | "contact_deleted"
  | "contacts_bulk_deleted"
  // Templates
  | "template_created"
  | "template_updated"
  | "template_deleted"
  | "template_submitted"
  | "template_version_created"
  // Team
  | "member_added"
  | "member_removed"
  | "role_changed"
  | "invitation_sent"
  | "invitation_accepted"
  | "invitation_revoked"
  | "invitation_expired"
  | "custom_role_created"
  | "custom_role_updated"
  | "custom_role_deleted"
  // Catalog
  | "catalog_item_created"
  | "catalog_item_updated"
  | "catalog_item_deleted"
  | "catalog_linked"
  | "catalog_unlinked"
  | "collection_created"
  | "collection_deleted"
  | "catalog_bulk_import"
  // Senders
  | "sender_created"
  | "sender_updated"
  | "sender_removed"
  | "sender_synced"
  // Labels
  | "label_created"
  | "label_updated"
  | "label_deleted"
  | "labels_applied"
  | "labels_removed"
  // Knowledge Base
  | "kb_object_created"
  | "kb_object_updated"
  | "kb_object_deleted"
  | "kb_object_published"
  | "kb_template_created"
  | "kb_template_updated"
  | "kb_template_deleted"
  // Import Jobs
  | "import_started"
  | "import_completed"
  | "import_rolled_back"
  | "import_deleted"
  // Settings
  | "setting_changed"
  // Auth
  | "sign_in"
  | "sign_up"
  | "sign_out"
  | "password_changed"
  | "password_reset_requested"
  | "password_reset_completed"
  | "account_deleted";

/**
 * Entity types affected by audit actions.
 */
export type AuditEntityType =
  | "chat"
  | "chat_lock"
  | "message"
  | "note"
  | "contact"
  | "template"
  | "template_version"
  | "team"
  | "team_member"
  | "invitation"
  | "custom_role"
  | "workflow_stage"
  | "ai_config"
  | "catalog"
  | "catalog_item"
  | "catalog_collection"
  | "sender"
  | "label"
  | "kb_object"
  | "kb_template"
  | "import_job"
  | "setting"
  | "user";

/**
 * A single audit log entry returned from the API.
 */
export interface AuditEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  teamId: number | null;
  category: AuditCategory | null;
  entityType: AuditEntityType | null;
  entityId: string | null;
  entityName: string | null;
  action: AuditAction | null;
  description: string | null;
  metadata: Record<string, unknown>;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  chatId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

/**
 * Paginated audit history response.
 */
export interface PaginatedAuditResponse {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Team member info for audit filter dropdown.
 */
export interface AuditTeamMember {
  id: number;
  name: string;
  email: string;
  role: string;
}

/**
 * Query parameters for the audit history endpoint.
 */
export interface AuditHistoryParams {
  page?: number;
  pageSize?: number;
  category?: AuditCategory;
  categories?: AuditCategory[];
  entityType?: AuditEntityType;
  entityId?: string;
  action?: AuditAction;
  actions?: AuditAction[];
  userId?: number;
  startDate?: string;
  endDate?: string;
  chatId?: string;
  search?: string;
}
