/**
 * Workflow Builder API Endpoints
 * Frontend API client for visual workflow builder
 */

import type {
  CreateConnectionDto,
  CreateNodeDto,
  CreateVariableDto,
  CreateWorkflowDto,
  ListExecutionsQuery,
  ListWorkflowsQuery,
  OverviewAnalytics,
  PublishWorkflowDto,
  SaveCanvasDto,
  TriggerWorkflowDto,
  UpdateConnectionDto,
  UpdateNodeDto,
  UpdateVariableDto,
  UpdateWorkflowDto,
  Workflow,
  WorkflowAnalytics,
  WorkflowAnalyticsQuery,
  WorkflowConnection,
  WorkflowExecution,
  WorkflowExecutionLog,
  WorkflowNode,
  WorkflowTemplate,
  WorkflowTemplateCategory,
  WorkflowVariable,
  WorkflowVersion,
  WorkflowWithDetails,
} from "@/lib/types/workflow.types";
import { apiClient } from "./client";

export const workflowBuilderApi = {
  // ============================================================================
  // Workflows CRUD
  // ============================================================================

  /**
   * List all workflows for the current team
   */
  list: (
    query?: ListWorkflowsQuery,
  ): Promise<{
    workflows: Workflow[];
    total: number;
  }> => {
    const params = new URLSearchParams();
    if (query?.status) params.append("status", query.status);
    if (query?.search) params.append("search", query.search);
    if (query?.page) params.append("page", query.page.toString());
    if (query?.limit) params.append("limit", query.limit.toString());
    const queryString = params.toString();
    return apiClient.get(
      `/workflow-builder/workflows${queryString ? `?${queryString}` : ""}`,
    );
  },

  /**
   * Get a single workflow with full details (nodes, connections, variables)
   */
  get: (workflowId: string): Promise<WorkflowWithDetails> =>
    apiClient.get(`/workflow-builder/workflows/${workflowId}`),

  /**
   * Create a new workflow
   */
  create: (data: CreateWorkflowDto): Promise<Workflow> =>
    apiClient.post("/workflow-builder/workflows", data),

  /**
   * Update a workflow
   */
  update: (workflowId: string, data: UpdateWorkflowDto): Promise<Workflow> =>
    apiClient.patch(`/workflow-builder/workflows/${workflowId}`, data),

  /**
   * Delete a workflow (soft delete)
   */
  delete: (workflowId: string): Promise<{ success: boolean }> =>
    apiClient.delete(`/workflow-builder/workflows/${workflowId}`),

  /**
   * Duplicate a workflow
   */
  duplicate: (workflowId: string, data: { name?: string }): Promise<Workflow> =>
    apiClient.post(`/workflow-builder/workflows/${workflowId}/duplicate`, data),

  /**
   * Import a workflow from JSON
   */
  import: (data: { definition: unknown; name?: string }): Promise<Workflow> =>
    apiClient.post("/workflow-builder/workflows/import", data),

  /**
   * Export a workflow to JSON
   */
  export: (workflowId: string): Promise<{ definition: unknown }> =>
    apiClient.get(`/workflow-builder/workflows/${workflowId}/export`),

  // ============================================================================
  // Canvas Operations
  // ============================================================================

  /**
   * Save entire canvas state (nodes, connections, variables)
   * This is the main operation for the visual editor
   */
  saveCanvas: (
    workflowId: string,
    data: SaveCanvasDto,
  ): Promise<WorkflowWithDetails> =>
    apiClient.post(`/workflow-builder/workflows/${workflowId}/canvas`, data),

  /**
   * Publish a workflow (create new version and set status to published)
   */
  publish: (workflowId: string, data?: PublishWorkflowDto): Promise<Workflow> =>
    apiClient.post(
      `/workflow-builder/workflows/${workflowId}/publish`,
      data || {},
    ),

  /**
   * Unpublish a workflow (set status back to draft)
   */
  unpublish: (workflowId: string): Promise<Workflow> =>
    apiClient.post(`/workflow-builder/workflows/${workflowId}/unpublish`, {}),

  // ============================================================================
  // Nodes CRUD
  // ============================================================================

  nodes: {
    /**
     * Create a new node
     */
    create: (data: CreateNodeDto): Promise<WorkflowNode> =>
      apiClient.post(`/workflow-builder/nodes`, data),

    /**
     * Update a node
     */
    update: (nodeId: string, data: UpdateNodeDto): Promise<WorkflowNode> =>
      apiClient.patch(`/workflow-builder/nodes/${nodeId}`, data),

    /**
     * Delete a node
     */
    delete: (nodeId: string): Promise<{ success: boolean }> =>
      apiClient.delete(`/workflow-builder/nodes/${nodeId}`),

    /**
     * Bulk update node positions (for drag operations)
     */
    updatePositions: (
      workflowId: string,
      nodes: Array<{ id: string; positionX: number; positionY: number }>,
    ): Promise<{ success: boolean }> =>
      apiClient.patch(
        `/workflow-builder/workflows/${workflowId}/nodes/positions`,
        {
          nodes,
        },
      ),
  },

  // ============================================================================
  // Connections CRUD
  // ============================================================================

  connections: {
    /**
     * Create a new connection
     */
    create: (data: CreateConnectionDto): Promise<WorkflowConnection> =>
      apiClient.post(`/workflow-builder/connections`, data),

    /**
     * Update a connection
     */
    update: (
      connectionId: string,
      data: UpdateConnectionDto,
    ): Promise<WorkflowConnection> =>
      apiClient.patch(`/workflow-builder/connections/${connectionId}`, data),

    /**
     * Delete a connection
     */
    delete: (connectionId: string): Promise<{ success: boolean }> =>
      apiClient.delete(`/workflow-builder/connections/${connectionId}`),
  },

  // ============================================================================
  // Variables CRUD
  // ============================================================================

  variables: {
    /**
     * Create a new variable
     */
    create: (data: CreateVariableDto): Promise<WorkflowVariable> =>
      apiClient.post(`/workflow-builder/variables`, data),

    /**
     * Update a variable
     */
    update: (
      variableId: string,
      data: UpdateVariableDto,
    ): Promise<WorkflowVariable> =>
      apiClient.patch(`/workflow-builder/variables/${variableId}`, data),

    /**
     * Delete a variable
     */
    delete: (variableId: string): Promise<{ success: boolean }> =>
      apiClient.delete(`/workflow-builder/variables/${variableId}`),
  },

  // ============================================================================
  // Versioning
  // ============================================================================

  versions: {
    /**
     * Get version history for a workflow
     */
    list: (workflowId: string): Promise<WorkflowVersion[]> =>
      apiClient.get(`/workflow-builder/workflows/${workflowId}/versions`),

    /**
     * Restore a specific version
     */
    restore: (
      workflowId: string,
      version: number,
    ): Promise<WorkflowWithDetails> =>
      apiClient.post(
        `/workflow-builder/workflows/${workflowId}/restore/${version}`,
        {},
      ),
  },

  // ============================================================================
  // Executions
  // ============================================================================

  executions: {
    /**
     * List executions with filtering
     */
    list: (
      query?: ListExecutionsQuery,
    ): Promise<{
      executions: WorkflowExecution[];
      total: number;
    }> => {
      const params = new URLSearchParams();
      if (query?.workflowId) params.append("workflowId", query.workflowId);
      if (query?.chatId) params.append("chatId", query.chatId);
      if (query?.status) params.append("status", query.status);
      if (query?.page) params.append("page", query.page.toString());
      if (query?.limit) params.append("limit", query.limit.toString());
      const queryString = params.toString();
      return apiClient.get(
        `/workflow-builder/executions${queryString ? `?${queryString}` : ""}`,
      );
    },

    /**
     * Get a single execution with details
     */
    get: (executionId: string): Promise<WorkflowExecution> =>
      apiClient.get(`/workflow-builder/executions/${executionId}`),

    /**
     * Get execution logs
     */
    getLogs: (executionId: string): Promise<WorkflowExecutionLog[]> =>
      apiClient.get(`/workflow-builder/executions/${executionId}/logs`),

    /**
     * Manually trigger a workflow for a chat
     */
    trigger: (
      workflowId: string,
      data: TriggerWorkflowDto,
    ): Promise<WorkflowExecution> =>
      apiClient.post(`/workflow-builder/execute`, { workflowId, ...data }),

    /**
     * Cancel a running execution
     */
    cancel: (executionId: string): Promise<{ success: boolean }> =>
      apiClient.post(`/workflow-builder/executions/${executionId}/cancel`, {}),
  },

  // ============================================================================
  // Chat Workflow State
  // ============================================================================

  chatState: {
    /**
     * Get current workflow state for a chat
     */
    get: (
      chatId: string,
    ): Promise<{
      chatId: string;
      activeWorkflowId: string | null;
      activeWorkflow: Workflow | null;
      currentNodeId: string | null;
      currentNode: WorkflowNode | null;
      isPaused: boolean;
      pausedAt: string | null;
      pausedBy: number | null;
      pauseReason: string | null;
      currentAiInstructions: string | null;
      currentAiTone: string | null;
      currentAiGoal: string | null;
      allowedKbTemplates: string[] | null;
    } | null> =>
      apiClient.get(`/workflow-builder/chats/${chatId}/workflow-state`),

    /**
     * Reset workflow state for a chat
     */
    reset: (chatId: string): Promise<{ success: boolean }> =>
      apiClient.post(
        `/workflow-builder/chats/${chatId}/workflow-state/reset`,
        {},
      ),
  },

  // ============================================================================
  // Analytics
  // ============================================================================

  analytics: {
    /**
     * Get analytics for a specific workflow
     */
    getWorkflow: (
      workflowId: string,
      query?: WorkflowAnalyticsQuery,
    ): Promise<WorkflowAnalytics> => {
      const params = new URLSearchParams();
      if (query?.startDate) params.append("startDate", query.startDate);
      if (query?.endDate) params.append("endDate", query.endDate);
      const queryString = params.toString();
      return apiClient.get(
        `/workflow-builder/workflows/${workflowId}/analytics${queryString ? `?${queryString}` : ""}`,
      );
    },

    /**
     * Get overview analytics for all workflows
     */
    getOverview: (
      query?: WorkflowAnalyticsQuery,
    ): Promise<OverviewAnalytics> => {
      const params = new URLSearchParams();
      if (query?.startDate) params.append("startDate", query.startDate);
      if (query?.endDate) params.append("endDate", query.endDate);
      const queryString = params.toString();
      return apiClient.get(
        `/workflow-builder/analytics/overview${queryString ? `?${queryString}` : ""}`,
      );
    },
  },

  // ============================================================================
  // Templates
  // ============================================================================

  templates: {
    /**
     * List template categories
     */
    listCategories: (): Promise<WorkflowTemplateCategory[]> =>
      apiClient.get("/workflow-builder/templates/categories"),

    /**
     * List templates, optionally filtered by category
     */
    list: (categoryId?: string): Promise<WorkflowTemplate[]> => {
      const params = categoryId ? `?categoryId=${categoryId}` : "";
      return apiClient.get(`/workflow-builder/templates${params}`);
    },

    /**
     * Get a specific template
     */
    get: (templateId: string): Promise<WorkflowTemplate> =>
      apiClient.get(`/workflow-builder/templates/${templateId}`),

    /**
     * Create a workflow from a template
     */
    createFromTemplate: (
      templateId: string,
      data: { name?: string },
    ): Promise<Workflow> =>
      apiClient.post(`/workflow-builder/templates/${templateId}/use`, data),
  },
};
