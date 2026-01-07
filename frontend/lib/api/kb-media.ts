/**
 * Knowledge Base Media API
 *
 * Frontend API functions for managing KB media with AI support.
 */

import { apiClient } from "./client";

// ==================== Media Types ====================

/**
 * Media roles that define the purpose of attached media
 */
export type MediaRole =
  | "hero_image"
  | "gallery_image"
  | "thumbnail"
  | "brochure"
  | "price_sheet"
  | "floor_plan"
  | "video_tour"
  | "promotional_video"
  | "audio_description"
  | "legal_document"
  | "specification_sheet"
  | "certificate"
  | "map"
  | "infographic"
  | "logo"
  | "other";

/**
 * Media role metadata for UI display
 */
export interface MediaRoleOption {
  value: MediaRole;
  label: string;
  description: string;
  defaultAiEnabled: boolean;
}

/**
 * Available media roles with metadata
 */
export const MEDIA_ROLE_OPTIONS: MediaRoleOption[] = [
  {
    value: "hero_image",
    label: "Hero Image",
    description: "Primary display image",
    defaultAiEnabled: true,
  },
  {
    value: "gallery_image",
    label: "Gallery Image",
    description: "Additional gallery images",
    defaultAiEnabled: true,
  },
  {
    value: "brochure",
    label: "Brochure",
    description: "PDF brochure, catalog, or image flyer",
    defaultAiEnabled: true,
  },
  {
    value: "price_sheet",
    label: "Price Sheet",
    description: "Pricing document",
    defaultAiEnabled: true,
  },
  {
    value: "floor_plan",
    label: "Floor Plan",
    description: "Architectural layout",
    defaultAiEnabled: true,
  },
  {
    value: "video_tour",
    label: "Video Tour",
    description: "Video walkthrough",
    defaultAiEnabled: true,
  },
  {
    value: "promotional_video",
    label: "Promotional Video",
    description: "Marketing video",
    defaultAiEnabled: true,
  },
  {
    value: "specification_sheet",
    label: "Specification Sheet",
    description: "Technical specifications",
    defaultAiEnabled: true,
  },
  {
    value: "map",
    label: "Map",
    description: "Location map",
    defaultAiEnabled: true,
  },
  {
    value: "infographic",
    label: "Infographic",
    description: "Data visualization",
    defaultAiEnabled: true,
  },
  {
    value: "audio_description",
    label: "Audio Description",
    description: "Audio narration",
    defaultAiEnabled: false,
  },
  {
    value: "legal_document",
    label: "Legal Document",
    description: "Contracts, terms",
    defaultAiEnabled: false,
  },
  {
    value: "certificate",
    label: "Certificate",
    description: "Certifications, awards",
    defaultAiEnabled: false,
  },
  {
    value: "thumbnail",
    label: "Thumbnail",
    description: "Preview thumbnail",
    defaultAiEnabled: false,
  },
  {
    value: "logo",
    label: "Logo",
    description: "Brand logo",
    defaultAiEnabled: false,
  },
  {
    value: "other",
    label: "Other",
    description: "Other media type",
    defaultAiEnabled: false,
  },
];

/**
 * Full media object with all metadata
 */
export interface KbMedia {
  id: string;
  objectId: string;
  fieldId: string | null;
  fileName: string;
  originalFileName: string | null;
  mimeType: string;
  fileSize: number;
  s3Bucket: string;
  s3Key: string;
  s3Url: string | null;
  mediaType: MediaRole;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnailS3Key: string | null;
  thumbnailUrl: string | null;
  // Compression fields
  compressionStatus: CompressionStatus | null;
  compressedS3Key: string | null;
  compressedFileSize: number | null;
  originalFileSize: number | null;
  compressionError: string | null;
  extractedContent: string | null;
  extractionStatus: string | null;
  sortOrder: number | null;
  altText: string | null;
  caption: string | null;
  createdAt: string;
  updatedAt: string;
  // AI fields for media selection guidance
  aiEnabled: boolean;
  aiInstructions: string | null;
  // Extended fields
  objectName?: string;
  objectStatus?: string;
  templateId?: string;
  templateName?: string;
}

/**
 * Video compression status
 */
export type CompressionStatus =
  | "none"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

/**
 * Request to initiate a media upload
 */
export interface InitiateMediaUploadRequest {
  objectId: string;
  fieldId?: string;
  mediaRole: MediaRole;
  fileName: string;
  mimeType: string;
  fileSize: number;
  caption: string;
  altText?: string;
  aiEnabled: boolean;
  allowedLanguages?: string[];
  sortOrder?: number;
}

/**
 * Response from initiating upload
 */
export interface InitiateMediaUploadResponse {
  mediaId: string;
  uploadUrl: string;
  uploadUrlExpires: string;
}

/**
 * Request to confirm upload completion
 */
export interface ConfirmMediaUploadRequest {
  width?: number;
  height?: number;
  duration?: number;
}

/**
 * Request to update media metadata
 */
export interface UpdateMediaRequest {
  caption?: string;
  altText?: string;
  mediaRole?: MediaRole;
  aiEnabled?: boolean;
  allowedLanguages?: string[];
  aiInstructions?: string;
  sortOrder?: number;
}

/**
 * AI permission settings
 */
export interface MediaAiPermissionRequest {
  aiEnabled: boolean;
  allowedLanguages?: string[];
  relevantIntents?: string[];
  maxSendsPerChat?: number;
  aiInstructions?: string;
}

/**
 * Eligibility check result
 */
export interface MediaEligibilityResult {
  isEligible: boolean;
  failureReasons: string[];
  explanation: string;
  confidenceScore?: number;
}

/**
 * Guardrail check result
 */
export interface GuardrailCheckResult {
  passed: boolean;
  failures: Array<{
    rule: string;
    reason: string;
    retryAfterMs?: number;
  }>;
  recommendation: "send_media" | "send_text_only" | "use_template" | "block";
  explanation: string;
}

/**
 * Guardrail configuration
 */
export interface WhatsAppMediaGuardrails {
  noMediaInFirstMessage: boolean;
  noConsecutiveMediaMessages: boolean;
  maxMediaPerReply: number;
  minMessagesBeforeMedia: number;
  requireIntentSignal: boolean;
  mediaCooldownMs: number;
  blockOutsideWindow: boolean;
}

/**
 * Media decision audit log
 */
export interface MediaDecisionAudit {
  id: string;
  messageId: string;
  chatId: string;
  timestamp: string;
  mediaSent: boolean;
  selectedMediaId: string | null;
  objectId: string | null;
  userIntent: string;
  queryText: string;
  selectionReason: string;
  guardrailsApplied: string[];
  guardrailFailures: Array<{ rule: string; reason: string }>;
  similarityScore: number | null;
  rankingScore: number | null;
}

/**
 * Audit log summary for list view
 */
export interface AuditLogSummary {
  id: string;
  messageId: string;
  chatId: string;
  timestamp: string;
  mediaSent: boolean;
  selectedMediaId: string | null;
  objectName: string | null;
  userIntent: string;
  selectionReason: string;
}

/**
 * Media decision statistics
 */
export interface MediaDecisionStats {
  totalDecisions: number;
  mediasSent: number;
  mediasBlocked: number;
  feedbackPositive: number;
  feedbackNegative: number;
  topBlockReasons: Array<{ reason: string; count: number }>;
}

/**
 * Feedback on a media decision
 */
export type MediaFeedbackType = "correct" | "incorrect" | "inappropriate";

// ==================== Upload Progress Types ====================

/**
 * Upload phase for progress tracking
 */
export type UploadPhase = "uploading" | "processing" | "complete";

/**
 * Progress callback with phase information
 */
export interface UploadProgressInfo {
  /** Current progress percentage (0-100) */
  progress: number;
  /** Current upload phase */
  phase: UploadPhase;
}

/**
 * Enhanced progress callback type
 */
export type UploadProgressCallback = (info: UploadProgressInfo) => void;

// ==================== API Functions ====================

export const kbMediaApi = {
  // ==================== Upload ====================

  /**
   * Initiate a media upload
   *
   * Returns a presigned URL for direct S3 upload.
   * @deprecated Use proxyUpload instead to avoid CORS issues
   */
  async initiateUpload(
    data: InitiateMediaUploadRequest
  ): Promise<InitiateMediaUploadResponse> {
    return apiClient.post<InitiateMediaUploadResponse>(
      "/knowledge-base/media/initiate",
      data
    );
  },

  /**
   * Confirm upload completion
   * @deprecated Use proxyUpload instead to avoid CORS issues
   */
  async confirmUpload(
    mediaId: string,
    data: ConfirmMediaUploadRequest
  ): Promise<KbMedia> {
    return apiClient.post<KbMedia>(
      `/knowledge-base/media/${mediaId}/confirm`,
      data
    );
  },

  /**
   * Upload media through the backend proxy (recommended)
   *
   * This method uploads files through the backend to S3, avoiding CORS issues.
   * Use this instead of the presigned URL flow for reliable uploads.
   *
   * Progress phases:
   * - uploading (0-80%): File data being sent to server
   * - processing (80-99%): Server processing (S3 upload, thumbnails, etc.)
   * - complete (100%): Upload finished successfully
   */
  async proxyUpload(
    file: File,
    data: Omit<
      InitiateMediaUploadRequest,
      "fileName" | "mimeType" | "fileSize"
    >,
    onProgress?: (progress: number) => void,
    onProgressWithPhase?: UploadProgressCallback
  ): Promise<KbMedia> {
    // Get image dimensions if applicable
    let dimensions: { width?: number; height?: number } = {};
    if (file.type.startsWith("image/")) {
      dimensions = await this.getImageDimensions(file);
    }

    // Build form data
    const formData = new FormData();
    formData.append("file", file);
    formData.append("objectId", data.objectId);
    formData.append("mediaRole", data.mediaRole);
    formData.append("caption", data.caption);
    formData.append("aiEnabled", String(data.aiEnabled));

    if (data.fieldId) {
      formData.append("fieldId", data.fieldId);
    }
    if (data.altText) {
      formData.append("altText", data.altText);
    }
    if (data.allowedLanguages && data.allowedLanguages.length > 0) {
      formData.append(
        "allowedLanguages",
        JSON.stringify(data.allowedLanguages)
      );
    }
    if (dimensions.width) {
      formData.append("width", String(dimensions.width));
    }
    if (dimensions.height) {
      formData.append("height", String(dimensions.height));
    }

    // Get API base URL from environment
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

    // Upload with progress tracking using XHR (for progress events)
    // Use withCredentials to send HTTP-only auth cookies
    // Progress phases:
    // - 0-80%: File upload to server
    // - 80-99%: Server processing (waiting for response)
    // - 100%: Complete
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress (0-80%)
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          // Scale upload progress to 0-80%
          const uploadProgress = Math.round((event.loaded / event.total) * 80);
          if (onProgress) {
            onProgress(uploadProgress);
          }
          if (onProgressWithPhase) {
            onProgressWithPhase({
              progress: uploadProgress,
              phase: "uploading",
            });
          }
        }
      });

      // When upload completes (file sent to server), switch to processing phase
      xhr.upload.addEventListener("load", () => {
        // Upload complete, now waiting for server to process
        if (onProgress) {
          onProgress(85);
        }
        if (onProgressWithPhase) {
          onProgressWithPhase({
            progress: 85,
            phase: "processing",
          });
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            // Mark as complete
            if (onProgress) {
              onProgress(100);
            }
            if (onProgressWithPhase) {
              onProgressWithPhase({
                progress: 100,
                phase: "complete",
              });
            }
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("Invalid response from server"));
          }
        } else if (xhr.status === 401) {
          // Redirect to login on auth failure
          if (typeof window !== "undefined") {
            window.location.href = "/sign-in";
          }
          reject(new Error("Unauthorized: Please log in again"));
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(
              new Error(
                error.message || `Upload failed with status ${xhr.status}`
              )
            );
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Upload failed due to network error"));
      });

      xhr.open("POST", `${apiBaseUrl}/knowledge-base/media/upload`);

      // Enable credentials to send HTTP-only auth cookies
      xhr.withCredentials = true;

      xhr.send(formData);
    });
  },

  /**
   * Full upload flow using proxy (recommended)
   *
   * This is the main upload method that should be used.
   * It uploads files through the backend, avoiding CORS issues.
   *
   * Progress phases:
   * - uploading (0-80%): File data being sent to server
   * - processing (80-99%): Server processing (S3 upload, thumbnails, etc.)
   * - complete (100%): Upload finished successfully
   */
  async uploadMedia(
    file: File,
    data: Omit<
      InitiateMediaUploadRequest,
      "fileName" | "mimeType" | "fileSize"
    >,
    onProgress?: (progress: number) => void,
    onProgressWithPhase?: UploadProgressCallback
  ): Promise<KbMedia> {
    // Use proxy upload - more reliable, no CORS issues
    return this.proxyUpload(file, data, onProgress, onProgressWithPhase);
  },

  /**
   * Upload file directly to S3 using presigned URL
   * @deprecated Use proxyUpload instead to avoid CORS issues
   */
  async uploadToS3(
    presignedUrl: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      if (onProgress) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        });
      }

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Upload failed"));
      });

      xhr.open("PUT", presignedUrl);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.send(file);
    });
  },

  /**
   * Get image dimensions from file
   */
  async getImageDimensions(
    file: File
  ): Promise<{ width?: number; height?: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        resolve({});
      };
      img.src = URL.createObjectURL(file);
    });
  },

  // ==================== Retrieval ====================

  /**
   * Get media details
   */
  async getMedia(mediaId: string): Promise<KbMedia> {
    return apiClient.get<KbMedia>(`/knowledge-base/media/${mediaId}`);
  },

  /**
   * Get download URL for media
   */
  async getDownloadUrl(
    mediaId: string
  ): Promise<{ url: string; expiresAt: string }> {
    return apiClient.get<{ url: string; expiresAt: string }>(
      `/knowledge-base/media/${mediaId}/download`
    );
  },

  /**
   * Get thumbnail URL for media
   *
   * Returns a presigned URL for the thumbnail if available.
   * Thumbnails are auto-generated for images, videos, and PDFs.
   */
  async getThumbnailUrl(
    mediaId: string
  ): Promise<{ url: string | null; hasThumbnail: boolean }> {
    return apiClient.get<{ url: string | null; hasThumbnail: boolean }>(
      `/knowledge-base/media/${mediaId}/thumbnail`
    );
  },

  /**
   * Regenerate thumbnail for media
   *
   * Useful when thumbnail generation failed or needs to be updated.
   */
  async regenerateThumbnail(
    mediaId: string
  ): Promise<{ success: boolean; thumbnailUrl?: string; error?: string }> {
    return apiClient.post<{
      success: boolean;
      thumbnailUrl?: string;
      error?: string;
    }>(`/knowledge-base/media/${mediaId}/regenerate-thumbnail`);
  },

  /**
   * List media for an object
   */
  async listObjectMedia(objectId: string): Promise<KbMedia[]> {
    return apiClient.get<KbMedia[]>(
      `/knowledge-base/objects/${objectId}/media`
    );
  },

  /**
   * Get media count and limit for an object
   *
   * Returns current media count, maximum allowed, and whether more can be uploaded
   */
  async getObjectMediaLimit(objectId: string): Promise<{
    currentCount: number;
    maxLimit: number;
    remaining: number;
    canUpload: boolean;
  }> {
    return apiClient.get(`/knowledge-base/objects/${objectId}/media-limit`);
  },

  // ==================== Update ====================

  /**
   * Update media metadata
   */
  async updateMedia(
    mediaId: string,
    data: UpdateMediaRequest
  ): Promise<KbMedia> {
    return apiClient.patch<KbMedia>(`/knowledge-base/media/${mediaId}`, data);
  },

  /**
   * Update AI permission settings
   */
  async updateAiPermission(
    mediaId: string,
    data: MediaAiPermissionRequest
  ): Promise<KbMedia> {
    return apiClient.patch<KbMedia>(
      `/knowledge-base/media/${mediaId}/ai-permission`,
      data
    );
  },

  // ==================== Delete ====================

  /**
   * Delete media
   */
  async deleteMedia(mediaId: string): Promise<void> {
    return apiClient.delete<void>(`/knowledge-base/media/${mediaId}`);
  },

  /**
   * Disable media from AI usage
   */
  async disableMediaForAi(mediaId: string, reason: string): Promise<void> {
    return apiClient.post<void>(`/knowledge-base/media/${mediaId}/disable-ai`, {
      reason,
    });
  },

  // ==================== Eligibility & Guardrails ====================

  /**
   * Check if media is eligible for AI sending
   */
  async checkEligibility(
    mediaId: string,
    chatId: string,
    chatLanguage?: string
  ): Promise<MediaEligibilityResult> {
    return apiClient.post<MediaEligibilityResult>(
      "/knowledge-base/media/check-eligibility",
      { mediaId, chatId, chatLanguage }
    );
  },

  /**
   * Check guardrails for sending media
   */
  async checkGuardrails(data: {
    chatId: string;
    isFirstAiMessage?: boolean;
    lastMessageHadMedia?: boolean;
    messageCountInConversation?: number;
  }): Promise<GuardrailCheckResult> {
    return apiClient.post<GuardrailCheckResult>(
      "/knowledge-base/media/check-guardrails",
      data
    );
  },

  /**
   * Get guardrail configuration
   */
  async getGuardrailConfig(): Promise<WhatsAppMediaGuardrails> {
    return apiClient.get<WhatsAppMediaGuardrails>(
      "/knowledge-base/media/guardrails"
    );
  },

  // ==================== Audit & Decisions ====================

  /**
   * Get media decision for a message
   */
  async getMessageDecision(
    messageId: string
  ): Promise<MediaDecisionAudit | null> {
    return apiClient.get<MediaDecisionAudit | null>(
      `/knowledge-base/messages/${messageId}/media-decision`
    );
  },

  /**
   * Get decision audit logs for a chat
   */
  async getDecisionLogs(
    chatId: string,
    params?: {
      page?: number;
      pageSize?: number;
      mediaSentOnly?: boolean;
    }
  ): Promise<{
    logs: AuditLogSummary[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize));
    if (params?.mediaSentOnly) searchParams.set("mediaSentOnly", "true");

    const query = searchParams.toString();
    return apiClient.get<{
      logs: AuditLogSummary[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/knowledge-base/media-decisions/${chatId}${query ? `?${query}` : ""}`);
  },

  /**
   * Get specific audit log
   */
  async getAuditLog(auditId: string): Promise<MediaDecisionAudit | null> {
    return apiClient.get<MediaDecisionAudit | null>(
      `/knowledge-base/media-decisions/audit/${auditId}`
    );
  },

  /**
   * Submit feedback on a media decision
   */
  async submitFeedback(
    auditId: string,
    feedback: MediaFeedbackType,
    comment?: string,
    correctMediaId?: string
  ): Promise<void> {
    return apiClient.post<void>(
      `/knowledge-base/media-decisions/${auditId}/feedback`,
      { feedback, comment, correctMediaId }
    );
  },

  // ==================== Statistics ====================

  /**
   * Get media decision statistics
   */
  async getMediaStats(
    startDate?: string,
    endDate?: string
  ): Promise<MediaDecisionStats> {
    const searchParams = new URLSearchParams();
    if (startDate) searchParams.set("startDate", startDate);
    if (endDate) searchParams.set("endDate", endDate);

    const query = searchParams.toString();
    return apiClient.get<MediaDecisionStats>(
      `/knowledge-base/media-stats${query ? `?${query}` : ""}`
    );
  },
};

export default kbMediaApi;
