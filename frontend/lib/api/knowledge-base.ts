/**
 * Knowledge Base API Endpoints
 *
 * API functions for managing knowledge base templates, objects, and retrieval.
 */

import { apiClient } from "./client";

// ==================== Types ====================

// Field Types - matches backend kb_field_type enum
export type FieldType =
  | "short_text"
  | "long_text"
  | "rich_text"
  | "number"
  | "price"
  | "date"
  | "date_range"
  | "boolean"
  | "tags"
  | "location"
  | "media"
  | "file"
  | "select"
  | "multi_select"
  | "url"
  | "email"
  | "phone"
  | "key_value";

// Object Status - matches backend kb_object_status enum
export type ObjectStatus =
  | "draft"
  | "pending"
  | "indexing"
  | "indexed"
  | "error"
  | "archived";

// Chunk Status - matches backend kb_chunk_status enum
export type ChunkStatus = "pending" | "processing" | "embedded" | "error";

// AI Relevance - matches backend kb_ai_relevance enum
export type AiRelevance = "low" | "medium" | "high" | "critical";

// ==================== Template Types ====================

export interface KbObjectTemplate {
  id: string;
  userId: number | null; // null for system templates
  name: string; // Internal name (e.g., "property_listing")
  slug: string; // URL-friendly identifier
  displayName: string; // User-friendly display name (e.g., "Property Listing")
  description: string | null;
  category: string;
  icon: string;
  color: string;
  isSystem: boolean; // System-provided template
  hasMedia: boolean;
  isActive: boolean;
  objectCount?: number;
  objectsWithMediaCount?: number;
  fieldCount?: number;
  fields?: KbTemplateField[];
  // AI-specific metadata
  aiUsageHints?: string;
  aiRetrievalContext?: string;
  supportedIntents?: string[];
  fabricationWarnings?: string[];
  priorityScore?: number;
}

export interface KbTemplateField {
  id: string;
  templateId: string;
  name: string; // Internal field name
  slug: string; // URL-friendly identifier
  displayName: string; // User-friendly display name
  description?: string;
  placeholder?: string;
  fieldType: FieldType;
  isRequired: boolean;
  isUnique: boolean;
  defaultValue?: unknown;
  fieldConfig?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  aiRelevance: "low" | "medium" | "high" | "critical";
  aiIncludeInEmbedding: boolean;
  aiFieldHints?: string;
  sortOrder: number;
  groupName?: string;
  isHidden: boolean;
}

// ==================== Object Types ====================

export interface KbObject {
  id: string;
  userId: number;
  templateId: string;
  templateName?: string; // Included in summary/detail responses
  name: string;
  slug?: string;
  status: ObjectStatus;
  chunkCount: number;
  mediaCount: number;
  fileCount: number;
  lastIndexedAt?: string;
  indexingError?: string;
  aiSummary?: string;
  aiTags?: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  // Extended details (when fetching single object)
  template?: KbObjectTemplate;
  fieldValues?: KbObjectFieldValueDetail[];
  media?: KbObjectMedia[];
  files?: KbObjectMedia[];
}

export interface KbObjectFieldValueDetail {
  fieldId: string;
  fieldName: string;
  fieldSlug: string;
  fieldType: FieldType;
  value: unknown;
}

export interface KbObjectFieldValue {
  id: string;
  objectId: string;
  fieldId: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
  field?: KbTemplateField;
}

export interface KbObjectMedia {
  id: string;
  objectId: string;
  fieldId: string | null;
  mediaType: "image" | "video" | "audio" | "document" | "other";
  s3Key: string;
  s3Bucket: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnailS3Key: string | null;
  altText: string | null;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
  field?: KbTemplateField;
}

export interface KbObjectChunk {
  id: string;
  objectId: string;
  chunkIndex: number;
  content: string;
  fieldSources: string[];
  tokenCount: number | null;
  status: ChunkStatus;
  embeddingError: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==================== Retrieval Types ====================

export interface RetrievalResult {
  objectId: string;
  objectName: string;
  templateName: string;
  score: number;
  content: string;
  fieldValues: Record<string, unknown>;
  media: KbObjectMedia[];
}

export interface TestQueryResponse {
  query: string;
  results: RetrievalResult[];
  generatedContext: string;
  timing: {
    embeddingMs: number;
    searchMs: number;
    totalMs: number;
  };
}

// ==================== Dashboard Types ====================

export interface KnowledgeBaseStats {
  totalTemplates: number;
  totalObjects: number;
  totalChunks: number;
  objectsByStatus: {
    draft: number;
    published: number;
    archived: number;
  };
  objectsByTemplate: Array<{
    templateId: string;
    templateName: string;
    count: number;
  }>;
  recentActivity: Array<{
    objectId: string;
    objectName: string;
    action: string;
    timestamp: string;
  }>;
}

// ==================== DTOs ====================

export interface CreateTemplateDto {
  name: string;
  slug: string;
  displayName: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  hasMedia?: boolean;
  fields?: CreateFieldDto[];
  aiUsageHints?: string;
  aiRetrievalContext?: string;
}

export interface UpdateTemplateDto {
  name?: string;
  slug?: string;
  displayName?: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  hasMedia?: boolean;
  isActive?: boolean;
  aiUsageHints?: string;
  aiRetrievalContext?: string;
}

export interface CreateFieldDto {
  name: string;
  slug: string;
  displayName: string;
  description?: string;
  placeholder?: string;
  fieldType: FieldType;
  isRequired?: boolean;
  isUnique?: boolean;
  defaultValue?: unknown;
  fieldConfig?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  aiRelevance?: AiRelevance;
  aiIncludeInEmbedding?: boolean;
  aiFieldHints?: string;
  sortOrder?: number;
  groupName?: string;
  isHidden?: boolean;
}

export interface UpdateFieldDto extends Partial<CreateFieldDto> { }

// Field value structure as expected by backend
export interface FieldValueDto {
  fieldId: string;
  value: unknown;
}

export interface CreateObjectDto {
  templateId: string;
  name: string;
  externalId?: string;
  fieldValues: FieldValueDto[];
  publishImmediately?: boolean;
  isTransient?: boolean;
}

export interface UpdateObjectDto {
  name?: string;
  externalId?: string;
  fieldValues?: FieldValueDto[];
  isTransient?: boolean;
}

export interface RetrieveDto {
  query: string;
  templateIds?: string[];
  categories?: string[];
  limit?: number;
  threshold?: number;
}

export interface TestQueryDto {
  query: string;
  templateIds?: string[];
  categories?: string[];
  limit?: number;
}

export interface BulkUpdateStatusDto {
  objectIds: string[];
  status: "draft" | "pending" | "archived"; // Only these statuses are valid for bulk update
}

export interface ListObjectsQuery {
  templateId?: string;
  status?: ObjectStatus;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// ==================== API Functions ====================

/**
 * Knowledge Base API
 */
export const knowledgeBaseApi = {
  // ==================== Templates ====================

  /**
   * List all templates (including system templates)
   */
  async listTemplates(params?: {
    category?: string;
    includeSystem?: boolean;
    includeFields?: boolean;
  }): Promise<KbObjectTemplate[]> {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set("category", params.category);
    if (params?.includeSystem !== undefined)
      searchParams.set("includeSystem", String(params.includeSystem));
    if (params?.includeFields) searchParams.set("includeFields", "true");

    const query = searchParams.toString();
    return apiClient.get<KbObjectTemplate[]>(
      `/knowledge-base/templates${query ? `?${query}` : ""}`
    );
  },

  /**
   * Get a single template by ID
   */
  async getTemplate(id: string): Promise<KbObjectTemplate> {
    return apiClient.get<KbObjectTemplate>(`/knowledge-base/templates/${id}`);
  },

  /**
   * Create a new template
   */
  async createTemplate(data: CreateTemplateDto): Promise<KbObjectTemplate> {
    return apiClient.post<KbObjectTemplate>("/knowledge-base/templates", data);
  },

  /**
   * Update an existing template
   */
  async updateTemplate(
    id: string,
    data: UpdateTemplateDto
  ): Promise<KbObjectTemplate> {
    return apiClient.patch<KbObjectTemplate>(
      `/knowledge-base/templates/${id}`,
      data
    );
  },

  /**
   * Delete a template
   */
  async deleteTemplate(id: string): Promise<void> {
    return apiClient.delete<void>(`/knowledge-base/templates/${id}`);
  },

  /**
   * Duplicate a template (including fields)
   */
  async duplicateTemplate(
    id: string,
    newName: string
  ): Promise<KbObjectTemplate> {
    return apiClient.post<KbObjectTemplate>(
      `/knowledge-base/templates/${id}/duplicate`,
      { name: newName }
    );
  },

  // ==================== Template Fields ====================

  /**
   * Add a field to a template
   */
  async addField(
    templateId: string,
    data: CreateFieldDto
  ): Promise<KbTemplateField> {
    return apiClient.post<KbTemplateField>(
      `/knowledge-base/templates/${templateId}/fields`,
      data
    );
  },

  /**
   * Update a template field
   */
  async updateField(
    templateId: string,
    fieldId: string,
    data: UpdateFieldDto
  ): Promise<KbTemplateField> {
    return apiClient.patch<KbTemplateField>(
      `/knowledge-base/templates/${templateId}/fields/${fieldId}`,
      data
    );
  },

  /**
   * Delete a template field
   */
  async deleteField(templateId: string, fieldId: string): Promise<void> {
    return apiClient.delete<void>(
      `/knowledge-base/templates/${templateId}/fields/${fieldId}`
    );
  },

  /**
   * Reorder template fields
   */
  async reorderFields(
    templateId: string,
    fieldIds: string[]
  ): Promise<KbTemplateField[]> {
    return apiClient.post<KbTemplateField[]>(
      `/knowledge-base/templates/${templateId}/fields/reorder`,
      { fieldIds }
    );
  },

  // ==================== Objects ====================

  /**
   * List objects with filtering and pagination
   */
  async listObjects(
    params?: ListObjectsQuery
  ): Promise<PaginatedResponse<KbObject>> {
    const searchParams = new URLSearchParams();
    if (params?.templateId) searchParams.set("templateId", params.templateId);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.search) searchParams.set("search", params.search);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.sortBy) searchParams.set("sortBy", params.sortBy);
    if (params?.sortOrder) searchParams.set("sortOrder", params.sortOrder);

    const query = searchParams.toString();
    return apiClient.get<PaginatedResponse<KbObject>>(
      `/knowledge-base/objects${query ? `?${query}` : ""}`
    );
  },

  /**
   * Get a single object by ID with full details
   */
  async getObject(id: string): Promise<KbObject> {
    return apiClient.get<KbObject>(`/knowledge-base/objects/${id}`);
  },

  /**
   * Create a new object
   */
  async createObject(data: CreateObjectDto): Promise<KbObject> {
    return apiClient.post<KbObject>("/knowledge-base/objects", data);
  },

  /**
   * Update an existing object
   */
  async updateObject(id: string, data: UpdateObjectDto): Promise<KbObject> {
    return apiClient.patch<KbObject>(`/knowledge-base/objects/${id}`, data);
  },

  /**
   * Delete an object
   */
  async deleteObject(id: string): Promise<void> {
    return apiClient.delete<void>(`/knowledge-base/objects/${id}`);
  },

  /**
   * Publish an object (makes it available for AI retrieval)
   */
  async publishObject(id: string): Promise<KbObject> {
    return apiClient.post<KbObject>(`/knowledge-base/objects/${id}/publish`);
  },

  /**
   * Archive an object (removes from AI retrieval)
   */
  async archiveObject(id: string): Promise<KbObject> {
    return apiClient.post<KbObject>(`/knowledge-base/objects/${id}/archive`);
  },

  /**
   * Restore an archived object to draft
   */
  async restoreObject(id: string): Promise<KbObject> {
    return apiClient.post<KbObject>(`/knowledge-base/objects/${id}/restore`);
  },

  /**
   * Re-index an object (regenerate chunks and embeddings)
   */
  async reindexObject(id: string): Promise<KbObject> {
    return apiClient.post<KbObject>(`/knowledge-base/objects/${id}/reindex`);
  },

  /**
   * Bulk update object status
   */
  async bulkUpdateStatus(
    data: BulkUpdateStatusDto
  ): Promise<{ updated: number }> {
    return apiClient.post<{ updated: number }>(
      "/knowledge-base/objects/bulk/status",
      data
    );
  },

  /**
   * Duplicate an object
   */
  async duplicateObject(id: string, newName?: string): Promise<KbObject> {
    return apiClient.post<KbObject>(`/knowledge-base/objects/${id}/duplicate`, {
      name: newName,
    });
  },

  // ==================== Object Media ====================

  /**
   * Upload media to an object
   */
  async uploadMedia(
    objectId: string,
    file: File,
    fieldId?: string,
    altText?: string,
    caption?: string
  ): Promise<KbObjectMedia> {
    const formData = new FormData();
    formData.append("file", file);
    if (fieldId) formData.append("fieldId", fieldId);
    if (altText) formData.append("altText", altText);
    if (caption) formData.append("caption", caption);

    return apiClient.post<KbObjectMedia>(
      `/knowledge-base/objects/${objectId}/media`,
      formData
    );
  },

  /**
   * Delete media from an object
   */
  async deleteMedia(objectId: string, mediaId: string): Promise<void> {
    return apiClient.delete<void>(
      `/knowledge-base/objects/${objectId}/media/${mediaId}`
    );
  },

  /**
   * Reorder media for an object
   */
  async reorderMedia(
    objectId: string,
    mediaIds: string[]
  ): Promise<KbObjectMedia[]> {
    return apiClient.post<KbObjectMedia[]>(
      `/knowledge-base/objects/${objectId}/media/reorder`,
      { mediaIds }
    );
  },

  // ==================== Retrieval ====================

  /**
   * Retrieve relevant knowledge for a query
   */
  async retrieve(data: RetrieveDto): Promise<RetrievalResult[]> {
    return apiClient.post<RetrievalResult[]>("/knowledge-base/retrieve", data);
  },

  /**
   * Retrieve knowledge by specific object ID
   */
  async retrieveByObject(objectId: string): Promise<RetrievalResult> {
    return apiClient.post<RetrievalResult>(
      "/knowledge-base/retrieve/by-object",
      { objectId }
    );
  },

  /**
   * Test a query and see detailed results
   */
  async testQuery(data: TestQueryDto): Promise<TestQueryResponse> {
    return apiClient.post<TestQueryResponse>("/knowledge-base/test", data);
  },

  // ==================== Dashboard & Stats ====================

  /**
   * Get dashboard statistics
   */
  async getStats(): Promise<KnowledgeBaseStats> {
    return apiClient.get<KnowledgeBaseStats>("/knowledge-base/stats");
  },

  // ==================== Categories ====================

  /**
   * Get all unique categories
   */
  async getCategories(): Promise<string[]> {
    return apiClient.get<string[]>("/knowledge-base/categories");
  },
};

export default knowledgeBaseApi;
