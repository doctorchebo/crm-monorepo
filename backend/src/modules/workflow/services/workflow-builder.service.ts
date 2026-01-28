/**
 * Workflow Builder Service
 * CRUD operations for visual workflow definitions (canvas-based)
 *
 * Handles:
 * - Workflow creation, update, delete
 * - Node management (create, update, delete, reposition)
 * - Connection management
 * - Variable management
 * - Bulk canvas save operations
 * - Publishing and versioning
 * - Import/export
 */

import { db } from '@database/db.connection';
import { teamMembers } from '@database/schema';
import {
  Workflow,
  workflowChatState,
  WorkflowConnection,
  workflowConnections,
  workflowExecutionLogs,
  workflowExecutions,
  WorkflowNode,
  workflowNodes,
  workflows,
  WorkflowTemplate,
  workflowTemplateCategories,
  WorkflowTemplateCategory,
  workflowTemplates,
  WorkflowVariable,
  workflowVariables,
  WorkflowVersion,
  workflowVersions,
} from '@database/workflow-builder.schema';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  sql,
  SQL,
} from 'drizzle-orm';
import {
  BulkUpdateNodePositionsDto,
  CreateConnectionDto,
  CreateNodeDto,
  CreateVariableDto,
  CreateWorkflowDto,
  CreateWorkflowTemplateCategoryDto,
  CreateWorkflowTemplateDto,
  DuplicateWorkflowDto,
  ListExecutionsQueryDto,
  ListWorkflowsQueryDto,
  ListWorkflowTemplatesQueryDto,
  PublishWorkflowDto,
  SaveWorkflowCanvasDto,
  UpdateConnectionDto,
  UpdateNodeDto,
  UpdateVariableDto,
  UpdateWorkflowDto,
  UpdateWorkflowTemplateCategoryDto,
  UpdateWorkflowTemplateDto,
  UseWorkflowTemplateDto,
  WorkflowAnalyticsQueryDto,
} from '../dto/workflow-builder.dto';
import type { WorkflowDefinition } from '../types/workflow-builder.types';

@Injectable()
export class WorkflowBuilderService {
  private readonly logger = new Logger(WorkflowBuilderService.name);

  // ============================================================================
  // Team Access Validation
  // ============================================================================

  /**
   * Verify user has access to team workflows
   */
  private async verifyTeamAccess(
    userId: number,
    teamId: number,
    requiredRole?: string[],
  ): Promise<void> {
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
        eq(teamMembers.isActive, true),
      ),
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this team');
    }

    if (requiredRole && !requiredRole.includes(membership.role)) {
      throw new ForbiddenException(
        `Requires role: ${requiredRole.join(' or ')}`,
      );
    }
  }

  /**
   * Get team ID for user (or throw if no teams)
   */
  private async getUserTeamId(userId: number): Promise<number> {
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.isActive, true),
      ),
      with: {
        team: true,
      },
    });

    if (!membership) {
      throw new BadRequestException(
        'You must be part of a team to manage workflows',
      );
    }

    return membership.teamId;
  }

  // ============================================================================
  // Workflow CRUD
  // ============================================================================

  /**
   * Create a new workflow
   */
  async createWorkflow(
    userId: number,
    teamId: number,
    dto: CreateWorkflowDto,
  ): Promise<Workflow> {
    await this.verifyTeamAccess(userId, teamId, ['owner', 'admin']);

    // Check for duplicate name in team
    const existing = await db.query.workflows.findFirst({
      where: and(
        eq(workflows.teamId, teamId),
        eq(workflows.name, dto.name),
        isNull(workflows.status) || sql`${workflows.status} != 'archived'`,
      ),
    });

    if (existing) {
      throw new ConflictException(
        `A workflow named "${dto.name}" already exists`,
      );
    }

    const [workflow] = await db
      .insert(workflows)
      .values({
        teamId,
        createdBy: userId,
        name: dto.name,
        description: dto.description,
        icon: dto.icon ?? 'workflow',
        color: dto.color ?? '#3b82f6',
        isExclusive: dto.isExclusive ?? true,
        priority: dto.priority ?? 0,
        maxExecutionsPerChat: dto.maxExecutionsPerChat,
        status: 'draft',
        version: 1,
      })
      .returning();

    this.logger.log(
      `Created workflow "${dto.name}" (${workflow.id}) for team ${teamId}`,
    );

    return workflow;
  }

  /**
   * Get workflow by ID with full details
   */
  async getWorkflow(
    userId: number,
    workflowId: string,
    includeDetails = true,
  ): Promise<
    Workflow & {
      nodes?: WorkflowNode[];
      connections?: WorkflowConnection[];
      variables?: WorkflowVariable[];
    }
  > {
    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, workflowId),
      with: includeDetails
        ? {
            nodes: true,
            connections: true,
            variables: true,
          }
        : undefined,
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow not found: ${workflowId}`);
    }

    await this.verifyTeamAccess(userId, workflow.teamId);

    return workflow;
  }

  /**
   * List workflows for a team
   */
  async listWorkflows(
    userId: number,
    teamId: number,
    query: ListWorkflowsQueryDto,
  ): Promise<{ workflows: Workflow[]; total: number }> {
    await this.verifyTeamAccess(userId, teamId);

    const conditions = [eq(workflows.teamId, teamId)];

    if (query.status) {
      conditions.push(eq(workflows.status, query.status));
    } else {
      // Default: exclude archived
      conditions.push(sql`${workflows.status} != 'archived'`);
    }

    if (query.search) {
      conditions.push(ilike(workflows.name, `%${query.search}%`));
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const [workflowList, countResult] = await Promise.all([
      db.query.workflows.findMany({
        where: and(...conditions),
        orderBy: [desc(workflows.priority), desc(workflows.updatedAt)],
        limit,
        offset,
      }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(workflows)
        .where(and(...conditions)),
    ]);

    return {
      workflows: workflowList,
      total: Number(countResult[0]?.count ?? 0),
    };
  }

  /**
   * Update a workflow
   */
  async updateWorkflow(
    userId: number,
    workflowId: string,
    dto: UpdateWorkflowDto,
  ): Promise<Workflow> {
    const workflow = await this.getWorkflow(userId, workflowId, false);
    await this.verifyTeamAccess(userId, workflow.teamId, ['owner', 'admin']);

    // Check name uniqueness if changing name
    if (dto.name && dto.name !== workflow.name) {
      const existing = await db.query.workflows.findFirst({
        where: and(
          eq(workflows.teamId, workflow.teamId),
          eq(workflows.name, dto.name),
          sql`${workflows.id} != ${workflowId}`,
        ),
      });

      if (existing) {
        throw new ConflictException(
          `A workflow named "${dto.name}" already exists`,
        );
      }
    }

    const updateData: Partial<typeof workflows.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.status !== undefined) {
      updateData.status = dto.status;
      if (dto.status === 'active' && workflow.status !== 'active') {
        updateData.publishedAt = new Date();
      }
    }
    if (dto.isExclusive !== undefined) updateData.isExclusive = dto.isExclusive;
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.maxExecutionsPerChat !== undefined)
      updateData.maxExecutionsPerChat = dto.maxExecutionsPerChat;
    if (dto.triggerConfig !== undefined)
      updateData.triggerConfig = dto.triggerConfig;
    if (dto.viewportX !== undefined) updateData.viewportX = dto.viewportX;
    if (dto.viewportY !== undefined) updateData.viewportY = dto.viewportY;
    if (dto.viewportZoom !== undefined)
      updateData.viewportZoom = dto.viewportZoom;

    const [updated] = await db
      .update(workflows)
      .set(updateData)
      .where(eq(workflows.id, workflowId))
      .returning();

    this.logger.log(`Updated workflow ${workflowId}`);

    return updated;
  }

  /**
   * Delete (archive) a workflow
   */
  async deleteWorkflow(userId: number, workflowId: string): Promise<void> {
    const workflow = await this.getWorkflow(userId, workflowId, false);
    await this.verifyTeamAccess(userId, workflow.teamId, ['owner', 'admin']);

    // Soft delete by setting status to archived
    await db
      .update(workflows)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(workflows.id, workflowId));

    // Clear any chat states pointing to this workflow
    await db
      .update(workflowChatState)
      .set({
        activeWorkflowId: null,
        activeExecutionId: null,
        currentNodeId: null,
        currentAiInstructions: null,
        currentAiTone: null,
        currentAiGoal: null,
        allowedKbTemplates: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowChatState.activeWorkflowId, workflowId));

    this.logger.log(`Archived workflow ${workflowId}`);
  }

  // ============================================================================
  // Node CRUD
  // ============================================================================

  /**
   * Create a node
   */
  async createNode(userId: number, dto: CreateNodeDto): Promise<WorkflowNode> {
    const workflow = await this.getWorkflow(userId, dto.workflowId, false);
    await this.verifyTeamAccess(userId, workflow.teamId, ['owner', 'admin']);

    const [node] = await db
      .insert(workflowNodes)
      .values({
        workflowId: dto.workflowId,
        nodeType: dto.nodeType,
        positionX: dto.positionX,
        positionY: dto.positionY,
        label: dto.label,
        description: dto.description,
        config: dto.config ?? {},
        aiInstructions: dto.aiInstructions,
        aiTone: dto.aiTone,
        aiGoal: dto.aiGoal,
        allowedKbTemplates: dto.allowedKbTemplates ?? [],
        onErrorNodeId: dto.onErrorNodeId,
        continueOnError: dto.continueOnError ?? false,
      })
      .returning();

    // Touch workflow updated timestamp
    await db
      .update(workflows)
      .set({ updatedAt: new Date() })
      .where(eq(workflows.id, dto.workflowId));

    return node;
  }

  /**
   * Update a node
   */
  async updateNode(
    userId: number,
    nodeId: string,
    dto: UpdateNodeDto,
  ): Promise<WorkflowNode> {
    const node = await db.query.workflowNodes.findFirst({
      where: eq(workflowNodes.id, nodeId),
      with: { workflow: true },
    });

    if (!node) {
      throw new NotFoundException(`Node not found: ${nodeId}`);
    }

    await this.verifyTeamAccess(userId, node.workflow.teamId, [
      'owner',
      'admin',
    ]);

    const updateData: Partial<typeof workflowNodes.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.nodeType !== undefined) updateData.nodeType = dto.nodeType;
    if (dto.positionX !== undefined) updateData.positionX = dto.positionX;
    if (dto.positionY !== undefined) updateData.positionY = dto.positionY;
    if (dto.label !== undefined) updateData.label = dto.label;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.config !== undefined) updateData.config = dto.config;
    if (dto.aiInstructions !== undefined)
      updateData.aiInstructions = dto.aiInstructions;
    if (dto.aiTone !== undefined) updateData.aiTone = dto.aiTone;
    if (dto.aiGoal !== undefined) updateData.aiGoal = dto.aiGoal;
    if (dto.allowedKbTemplates !== undefined)
      updateData.allowedKbTemplates = dto.allowedKbTemplates;
    if (dto.onErrorNodeId !== undefined)
      updateData.onErrorNodeId = dto.onErrorNodeId;
    if (dto.continueOnError !== undefined)
      updateData.continueOnError = dto.continueOnError;

    const [updated] = await db
      .update(workflowNodes)
      .set(updateData)
      .where(eq(workflowNodes.id, nodeId))
      .returning();

    // Touch workflow
    await db
      .update(workflows)
      .set({ updatedAt: new Date() })
      .where(eq(workflows.id, node.workflowId));

    return updated;
  }

  /**
   * Bulk update node positions
   */
  async bulkUpdateNodePositions(
    userId: number,
    workflowId: string,
    dto: BulkUpdateNodePositionsDto,
  ): Promise<void> {
    const workflow = await this.getWorkflow(userId, workflowId, false);
    await this.verifyTeamAccess(userId, workflow.teamId, ['owner', 'admin']);

    // Update each node position
    await Promise.all(
      dto.updates.map(({ nodeId, positionX, positionY }) =>
        db
          .update(workflowNodes)
          .set({ positionX, positionY, updatedAt: new Date() })
          .where(
            and(
              eq(workflowNodes.id, nodeId),
              eq(workflowNodes.workflowId, workflowId),
            ),
          ),
      ),
    );

    // Touch workflow
    await db
      .update(workflows)
      .set({ updatedAt: new Date() })
      .where(eq(workflows.id, workflowId));
  }

  /**
   * Delete a node and its connections
   */
  async deleteNode(userId: number, nodeId: string): Promise<void> {
    const node = await db.query.workflowNodes.findFirst({
      where: eq(workflowNodes.id, nodeId),
      with: { workflow: true },
    });

    if (!node) {
      throw new NotFoundException(`Node not found: ${nodeId}`);
    }

    await this.verifyTeamAccess(userId, node.workflow.teamId, [
      'owner',
      'admin',
    ]);

    // Delete node (connections cascade automatically)
    await db.delete(workflowNodes).where(eq(workflowNodes.id, nodeId));

    // Touch workflow
    await db
      .update(workflows)
      .set({ updatedAt: new Date() })
      .where(eq(workflows.id, node.workflowId));

    this.logger.log(`Deleted node ${nodeId} from workflow ${node.workflowId}`);
  }

  // ============================================================================
  // Connection CRUD
  // ============================================================================

  /**
   * Create a connection
   */
  async createConnection(
    userId: number,
    dto: CreateConnectionDto,
  ): Promise<WorkflowConnection> {
    const workflow = await this.getWorkflow(userId, dto.workflowId, false);
    await this.verifyTeamAccess(userId, workflow.teamId, ['owner', 'admin']);

    // Verify both nodes exist and belong to this workflow
    const [fromNode, toNode] = await Promise.all([
      db.query.workflowNodes.findFirst({
        where: and(
          eq(workflowNodes.id, dto.fromNodeId),
          eq(workflowNodes.workflowId, dto.workflowId),
        ),
      }),
      db.query.workflowNodes.findFirst({
        where: and(
          eq(workflowNodes.id, dto.toNodeId),
          eq(workflowNodes.workflowId, dto.workflowId),
        ),
      }),
    ]);

    if (!fromNode || !toNode) {
      throw new BadRequestException(
        'Both nodes must exist in the same workflow',
      );
    }

    // Check for duplicate connection
    const existing = await db.query.workflowConnections.findFirst({
      where: and(
        eq(workflowConnections.fromNodeId, dto.fromNodeId),
        eq(workflowConnections.toNodeId, dto.toNodeId),
        eq(workflowConnections.branch, dto.branch ?? 'default'),
      ),
    });

    if (existing) {
      throw new ConflictException('This connection already exists');
    }

    const [connection] = await db
      .insert(workflowConnections)
      .values({
        workflowId: dto.workflowId,
        fromNodeId: dto.fromNodeId,
        toNodeId: dto.toNodeId,
        branch: dto.branch ?? 'default',
        conditionLabel: dto.conditionLabel,
        conditionConfig: dto.conditionConfig,
        label: dto.label,
        animated: dto.animated ?? false,
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();

    // Touch workflow
    await db
      .update(workflows)
      .set({ updatedAt: new Date() })
      .where(eq(workflows.id, dto.workflowId));

    return connection;
  }

  /**
   * Update a connection
   */
  async updateConnection(
    userId: number,
    connectionId: string,
    dto: UpdateConnectionDto,
  ): Promise<WorkflowConnection> {
    const connection = await db.query.workflowConnections.findFirst({
      where: eq(workflowConnections.id, connectionId),
      with: { workflow: true },
    });

    if (!connection) {
      throw new NotFoundException(`Connection not found: ${connectionId}`);
    }

    await this.verifyTeamAccess(userId, connection.workflow.teamId, [
      'owner',
      'admin',
    ]);

    const updateData: Partial<typeof workflowConnections.$inferInsert> = {};

    if (dto.branch !== undefined) updateData.branch = dto.branch;
    if (dto.conditionLabel !== undefined)
      updateData.conditionLabel = dto.conditionLabel;
    if (dto.conditionConfig !== undefined)
      updateData.conditionConfig = dto.conditionConfig;
    if (dto.label !== undefined) updateData.label = dto.label;
    if (dto.animated !== undefined) updateData.animated = dto.animated;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;

    const [updated] = await db
      .update(workflowConnections)
      .set(updateData)
      .where(eq(workflowConnections.id, connectionId))
      .returning();

    // Touch workflow
    await db
      .update(workflows)
      .set({ updatedAt: new Date() })
      .where(eq(workflows.id, connection.workflowId));

    return updated;
  }

  /**
   * Delete a connection
   */
  async deleteConnection(userId: number, connectionId: string): Promise<void> {
    const connection = await db.query.workflowConnections.findFirst({
      where: eq(workflowConnections.id, connectionId),
      with: { workflow: true },
    });

    if (!connection) {
      throw new NotFoundException(`Connection not found: ${connectionId}`);
    }

    await this.verifyTeamAccess(userId, connection.workflow.teamId, [
      'owner',
      'admin',
    ]);

    await db
      .delete(workflowConnections)
      .where(eq(workflowConnections.id, connectionId));

    // Touch workflow
    await db
      .update(workflows)
      .set({ updatedAt: new Date() })
      .where(eq(workflows.id, connection.workflowId));
  }

  // ============================================================================
  // Variable CRUD
  // ============================================================================

  /**
   * Create a variable
   */
  async createVariable(
    userId: number,
    dto: CreateVariableDto,
  ): Promise<WorkflowVariable> {
    const workflow = await this.getWorkflow(userId, dto.workflowId, false);
    await this.verifyTeamAccess(userId, workflow.teamId, ['owner', 'admin']);

    // Check for duplicate name
    const existing = await db.query.workflowVariables.findFirst({
      where: and(
        eq(workflowVariables.workflowId, dto.workflowId),
        eq(workflowVariables.name, dto.name),
      ),
    });

    if (existing) {
      throw new ConflictException(
        `A variable named "${dto.name}" already exists in this workflow`,
      );
    }

    const [variable] = await db
      .insert(workflowVariables)
      .values({
        workflowId: dto.workflowId,
        name: dto.name,
        description: dto.description,
        variableType: dto.variableType ?? 'string',
        defaultValue: dto.defaultValue,
        isInput: dto.isInput ?? false,
        isOutput: dto.isOutput ?? false,
      })
      .returning();

    // Touch workflow
    await db
      .update(workflows)
      .set({ updatedAt: new Date() })
      .where(eq(workflows.id, dto.workflowId));

    return variable;
  }

  /**
   * Update a variable
   */
  async updateVariable(
    userId: number,
    variableId: string,
    dto: UpdateVariableDto,
  ): Promise<WorkflowVariable> {
    const variable = await db.query.workflowVariables.findFirst({
      where: eq(workflowVariables.id, variableId),
      with: { workflow: true },
    });

    if (!variable) {
      throw new NotFoundException(`Variable not found: ${variableId}`);
    }

    await this.verifyTeamAccess(userId, variable.workflow.teamId, [
      'owner',
      'admin',
    ]);

    // Check for duplicate name if renaming
    if (dto.name && dto.name !== variable.name) {
      const existing = await db.query.workflowVariables.findFirst({
        where: and(
          eq(workflowVariables.workflowId, variable.workflowId),
          eq(workflowVariables.name, dto.name),
        ),
      });

      if (existing) {
        throw new ConflictException(
          `A variable named "${dto.name}" already exists`,
        );
      }
    }

    const updateData: Partial<typeof workflowVariables.$inferInsert> = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.variableType !== undefined)
      updateData.variableType = dto.variableType;
    if (dto.defaultValue !== undefined)
      updateData.defaultValue = dto.defaultValue;
    if (dto.isInput !== undefined) updateData.isInput = dto.isInput;
    if (dto.isOutput !== undefined) updateData.isOutput = dto.isOutput;

    const [updated] = await db
      .update(workflowVariables)
      .set(updateData)
      .where(eq(workflowVariables.id, variableId))
      .returning();

    // Touch workflow
    await db
      .update(workflows)
      .set({ updatedAt: new Date() })
      .where(eq(workflows.id, variable.workflowId));

    return updated;
  }

  /**
   * Delete a variable
   */
  async deleteVariable(userId: number, variableId: string): Promise<void> {
    const variable = await db.query.workflowVariables.findFirst({
      where: eq(workflowVariables.id, variableId),
      with: { workflow: true },
    });

    if (!variable) {
      throw new NotFoundException(`Variable not found: ${variableId}`);
    }

    await this.verifyTeamAccess(userId, variable.workflow.teamId, [
      'owner',
      'admin',
    ]);

    await db
      .delete(workflowVariables)
      .where(eq(workflowVariables.id, variableId));

    // Touch workflow
    await db
      .update(workflows)
      .set({ updatedAt: new Date() })
      .where(eq(workflows.id, variable.workflowId));
  }

  // ============================================================================
  // Bulk Canvas Operations
  // ============================================================================

  /**
   * Save entire canvas state (nodes + connections) in one transaction
   */
  async saveCanvas(
    userId: number,
    workflowId: string,
    dto: SaveWorkflowCanvasDto,
  ): Promise<{
    nodes: WorkflowNode[];
    connections: WorkflowConnection[];
  }> {
    const workflow = await this.getWorkflow(userId, workflowId, false);
    await this.verifyTeamAccess(userId, workflow.teamId, ['owner', 'admin']);

    // Map temporary IDs to real IDs
    const tempIdMap = new Map<string, string>();
    const savedNodes: WorkflowNode[] = [];
    const savedConnections: WorkflowConnection[] = [];

    // Helper to check if a string is a valid UUID
    const isValidUUID = (str: string): boolean => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      return uuidRegex.test(str);
    };

    // Delete removed items first
    if (dto.deletedNodeIds?.length) {
      // Filter out any non-UUID IDs (temp IDs from frontend)
      const validDeleteIds = dto.deletedNodeIds.filter(isValidUUID);
      if (validDeleteIds.length) {
        await db
          .delete(workflowNodes)
          .where(
            and(
              eq(workflowNodes.workflowId, workflowId),
              inArray(workflowNodes.id, validDeleteIds),
            ),
          );
      }
    }

    if (dto.deletedConnectionIds?.length) {
      // Filter out any non-UUID IDs
      const validDeleteIds = dto.deletedConnectionIds.filter(isValidUUID);
      if (validDeleteIds.length) {
        await db
          .delete(workflowConnections)
          .where(
            and(
              eq(workflowConnections.workflowId, workflowId),
              inArray(workflowConnections.id, validDeleteIds),
            ),
          );
      }
    }

    // Process nodes (create new, update existing)
    for (const nodeDto of dto.nodes) {
      // Determine if this is an existing node (has valid UUID id) or new node
      const isExistingNode = nodeDto.id && isValidUUID(nodeDto.id);

      if (isExistingNode) {
        // Update existing node
        const [updated] = await db
          .update(workflowNodes)
          .set({
            nodeType: nodeDto.nodeType,
            positionX: nodeDto.positionX,
            positionY: nodeDto.positionY,
            label: nodeDto.label,
            description: nodeDto.description,
            config: nodeDto.config ?? {},
            aiInstructions: nodeDto.aiInstructions,
            aiTone: nodeDto.aiTone,
            aiGoal: nodeDto.aiGoal,
            allowedKbTemplates: nodeDto.allowedKbTemplates ?? [],
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(workflowNodes.id, nodeDto.id!),
              eq(workflowNodes.workflowId, workflowId),
            ),
          )
          .returning();

        if (updated) {
          savedNodes.push(updated);
        }
      } else {
        // Create new node
        // Store the temp ID from frontend (could be in tempId field or the non-UUID id field)
        const frontendTempId =
          nodeDto.tempId ||
          (nodeDto.id && !isValidUUID(nodeDto.id) ? nodeDto.id : null);

        const [created] = await db
          .insert(workflowNodes)
          .values({
            workflowId,
            nodeType: nodeDto.nodeType,
            positionX: nodeDto.positionX,
            positionY: nodeDto.positionY,
            label: nodeDto.label,
            description: nodeDto.description,
            config: nodeDto.config ?? {},
            aiInstructions: nodeDto.aiInstructions,
            aiTone: nodeDto.aiTone,
            aiGoal: nodeDto.aiGoal,
            allowedKbTemplates: nodeDto.allowedKbTemplates ?? [],
          })
          .returning();

        // Map the frontend temp ID to the real database UUID
        if (frontendTempId) {
          tempIdMap.set(frontendTempId, created.id);
        }
        savedNodes.push(created);
      }
    }

    // Process connections
    for (const connDto of dto.connections) {
      // Resolve node IDs (could be temp IDs from frontend)
      const fromNodeId =
        tempIdMap.get(connDto.fromNodeId) ?? connDto.fromNodeId;
      const toNodeId = tempIdMap.get(connDto.toNodeId) ?? connDto.toNodeId;

      // Verify the resolved IDs are valid UUIDs
      if (!isValidUUID(fromNodeId) || !isValidUUID(toNodeId)) {
        this.logger.warn(
          `Skipped connection with invalid node IDs: ${connDto.fromNodeId} -> ${connDto.toNodeId}`,
        );
        continue;
      }

      // Check if this is an existing connection (has valid UUID id)
      const isExistingConnection = connDto.id && isValidUUID(connDto.id);

      if (isExistingConnection) {
        // Update existing connection
        const [updated] = await db
          .update(workflowConnections)
          .set({
            fromNodeId,
            toNodeId,
            branch: connDto.branch ?? 'default',
            conditionLabel: connDto.conditionLabel,
            conditionConfig: connDto.conditionConfig,
            label: connDto.label,
            animated: connDto.animated ?? false,
          })
          .where(
            and(
              eq(workflowConnections.id, connDto.id!),
              eq(workflowConnections.workflowId, workflowId),
            ),
          )
          .returning();

        if (updated) {
          savedConnections.push(updated);
        }
      } else {
        // Create new connection
        try {
          const [created] = await db
            .insert(workflowConnections)
            .values({
              workflowId,
              fromNodeId,
              toNodeId,
              branch: connDto.branch ?? 'default',
              conditionLabel: connDto.conditionLabel,
              conditionConfig: connDto.conditionConfig,
              label: connDto.label,
              animated: connDto.animated ?? false,
            })
            .returning();

          savedConnections.push(created);
        } catch (error) {
          // Skip duplicate connections
          this.logger.warn(
            `Skipped duplicate connection: ${fromNodeId} -> ${toNodeId}`,
          );
        }
      }
    }

    // Update workflow viewport and timestamp
    await db
      .update(workflows)
      .set({
        viewportX: dto.viewportX ?? workflow.viewportX,
        viewportY: dto.viewportY ?? workflow.viewportY,
        viewportZoom: dto.viewportZoom ?? workflow.viewportZoom,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId));

    // CRITICAL: Fetch ALL nodes and connections for this workflow
    // The frontend expects the complete state, not just what was processed
    const allNodes = await db
      .select()
      .from(workflowNodes)
      .where(eq(workflowNodes.workflowId, workflowId));

    const allConnections = await db
      .select()
      .from(workflowConnections)
      .where(eq(workflowConnections.workflowId, workflowId));

    this.logger.log(
      `Saved canvas for workflow ${workflowId}: ${savedNodes.length} nodes processed, ${savedConnections.length} connections processed. Total: ${allNodes.length} nodes, ${allConnections.length} connections`,
    );

    return {
      nodes: allNodes,
      connections: allConnections,
    };
  }

  // ============================================================================
  // Publishing & Versioning
  // ============================================================================

  /**
   * Publish a workflow (activate and create version snapshot)
   */
  async publishWorkflow(
    userId: number,
    workflowId: string,
    dto: PublishWorkflowDto,
  ): Promise<{ workflow: Workflow; version: WorkflowVersion }> {
    const workflow = await this.getWorkflow(userId, workflowId, true);
    await this.verifyTeamAccess(userId, workflow.teamId, ['owner', 'admin']);

    // Validate workflow has at least one trigger node
    const triggerNodes = (workflow.nodes ?? []).filter((n) =>
      n.nodeType.startsWith('trigger_'),
    );

    if (triggerNodes.length === 0) {
      throw new BadRequestException(
        'Workflow must have at least one trigger node',
      );
    }

    // Create version snapshot
    const definition: WorkflowDefinition = {
      version: workflow.version + 1,
      name: workflow.name,
      description: workflow.description ?? undefined,
      icon: workflow.icon ?? undefined,
      color: workflow.color ?? undefined,
      nodes:
        workflow.nodes?.map((n) => ({
          id: n.id,
          nodeType: n.nodeType,
          positionX: n.positionX,
          positionY: n.positionY,
          label: n.label ?? undefined,
          description: n.description ?? undefined,
          config: n.config as Record<string, unknown>,
          aiInstructions: n.aiInstructions ?? undefined,
          aiTone: n.aiTone ?? undefined,
          aiGoal: n.aiGoal ?? undefined,
          allowedKbTemplates: (n.allowedKbTemplates as string[]) ?? undefined,
          onErrorNodeId: n.onErrorNodeId ?? undefined,
          continueOnError: n.continueOnError ?? undefined,
        })) ?? [],
      connections:
        workflow.connections?.map((c) => ({
          id: c.id,
          fromNodeId: c.fromNodeId,
          toNodeId: c.toNodeId,
          branch: c.branch as
            | 'default'
            | 'true'
            | 'false'
            | 'timeout'
            | 'error',
          conditionLabel: c.conditionLabel ?? undefined,
          conditionConfig: c.conditionConfig as
            | Record<string, unknown>
            | undefined,
          label: c.label ?? undefined,
          animated: c.animated ?? undefined,
          sortOrder: c.sortOrder ?? undefined,
        })) ?? [],
      variables:
        workflow.variables?.map((v) => ({
          id: v.id,
          name: v.name,
          description: v.description ?? undefined,
          variableType: v.variableType,
          defaultValue: v.defaultValue ?? undefined,
          isInput: v.isInput ?? undefined,
          isOutput: v.isOutput ?? undefined,
        })) ?? [],
      viewportX: workflow.viewportX ?? undefined,
      viewportY: workflow.viewportY ?? undefined,
      viewportZoom: workflow.viewportZoom ?? undefined,
    };

    const [version] = await db
      .insert(workflowVersions)
      .values({
        workflowId,
        version: workflow.version + 1,
        publishedBy: userId,
        snapshot: definition,
        changeNotes: dto.changeNotes,
      })
      .returning();

    // Update workflow status and version
    const [updatedWorkflow] = await db
      .update(workflows)
      .set({
        status: 'active',
        version: workflow.version + 1,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId))
      .returning();

    this.logger.log(
      `Published workflow ${workflowId} version ${updatedWorkflow.version}`,
    );

    return {
      workflow: updatedWorkflow,
      version,
    };
  }

  /**
   * Get version history
   */
  async getVersionHistory(
    userId: number,
    workflowId: string,
  ): Promise<WorkflowVersion[]> {
    const workflow = await this.getWorkflow(userId, workflowId, false);
    await this.verifyTeamAccess(userId, workflow.teamId);

    return db.query.workflowVersions.findMany({
      where: eq(workflowVersions.workflowId, workflowId),
      orderBy: [desc(workflowVersions.version)],
    });
  }

  /**
   * Rollback to a specific version
   */
  async rollbackToVersion(
    userId: number,
    workflowId: string,
    versionNumber: number,
  ): Promise<Workflow> {
    const workflow = await this.getWorkflow(userId, workflowId, false);
    await this.verifyTeamAccess(userId, workflow.teamId, ['owner', 'admin']);

    const version = await db.query.workflowVersions.findFirst({
      where: and(
        eq(workflowVersions.workflowId, workflowId),
        eq(workflowVersions.version, versionNumber),
      ),
    });

    if (!version) {
      throw new NotFoundException(`Version ${versionNumber} not found`);
    }

    const snapshot = version.snapshot as WorkflowDefinition;

    // Delete current nodes and connections
    await db
      .delete(workflowNodes)
      .where(eq(workflowNodes.workflowId, workflowId));
    await db
      .delete(workflowVariables)
      .where(eq(workflowVariables.workflowId, workflowId));

    // Recreate from snapshot
    if (snapshot.nodes?.length) {
      await db.insert(workflowNodes).values(
        snapshot.nodes.map((n) => ({
          id: n.id,
          workflowId,
          nodeType: n.nodeType as any,
          positionX: n.positionX,
          positionY: n.positionY,
          label: n.label,
          description: n.description,
          config: n.config,
          aiInstructions: n.aiInstructions,
          aiTone: n.aiTone,
          aiGoal: n.aiGoal,
          allowedKbTemplates: n.allowedKbTemplates ?? [],
          onErrorNodeId: n.onErrorNodeId,
          continueOnError: n.continueOnError ?? false,
        })),
      );
    }

    if (snapshot.connections?.length) {
      await db.insert(workflowConnections).values(
        snapshot.connections.map((c) => ({
          id: c.id,
          workflowId,
          fromNodeId: c.fromNodeId,
          toNodeId: c.toNodeId,
          branch: c.branch as any,
          conditionLabel: c.conditionLabel,
          conditionConfig: c.conditionConfig,
          label: c.label,
          animated: c.animated ?? false,
          sortOrder: c.sortOrder ?? 0,
        })),
      );
    }

    if (snapshot.variables?.length) {
      await db.insert(workflowVariables).values(
        snapshot.variables.map((v) => ({
          id: v.id,
          workflowId,
          name: v.name,
          description: v.description,
          variableType: v.variableType,
          defaultValue: v.defaultValue,
          isInput: v.isInput ?? false,
          isOutput: v.isOutput ?? false,
        })),
      );
    }

    // Update workflow metadata
    const [updated] = await db
      .update(workflows)
      .set({
        name: snapshot.name,
        description: snapshot.description,
        icon: snapshot.icon,
        color: snapshot.color,
        viewportX: snapshot.viewportX ?? 0,
        viewportY: snapshot.viewportY ?? 0,
        viewportZoom: snapshot.viewportZoom ?? 1,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId))
      .returning();

    this.logger.log(
      `Rolled back workflow ${workflowId} to version ${versionNumber}`,
    );

    return updated;
  }

  // ============================================================================
  // Duplication & Templates
  // ============================================================================

  /**
   * Duplicate a workflow
   */
  async duplicateWorkflow(
    userId: number,
    workflowId: string,
    dto?: DuplicateWorkflowDto,
  ): Promise<Workflow> {
    const workflow = await this.getWorkflow(userId, workflowId, true);
    await this.verifyTeamAccess(userId, workflow.teamId, ['owner', 'admin']);

    const newName = dto?.name ?? `${workflow.name} (Copy)`;

    // Create new workflow
    const [newWorkflow] = await db
      .insert(workflows)
      .values({
        teamId: workflow.teamId,
        createdBy: userId,
        name: newName,
        description: workflow.description,
        icon: workflow.icon,
        color: workflow.color,
        status: 'draft',
        version: 1,
        isExclusive: workflow.isExclusive,
        priority: workflow.priority,
        maxExecutionsPerChat: workflow.maxExecutionsPerChat,
        triggerConfig: workflow.triggerConfig,
        viewportX: workflow.viewportX,
        viewportY: workflow.viewportY,
        viewportZoom: workflow.viewportZoom,
      })
      .returning();

    // Map old node IDs to new node IDs
    const nodeIdMap = new Map<string, string>();

    // Copy nodes
    if (workflow.nodes?.length) {
      for (const node of workflow.nodes) {
        const [newNode] = await db
          .insert(workflowNodes)
          .values({
            workflowId: newWorkflow.id,
            nodeType: node.nodeType,
            positionX: node.positionX,
            positionY: node.positionY,
            label: node.label,
            description: node.description,
            config: node.config,
            aiInstructions: node.aiInstructions,
            aiTone: node.aiTone,
            aiGoal: node.aiGoal,
            allowedKbTemplates: node.allowedKbTemplates,
            continueOnError: node.continueOnError,
          })
          .returning();

        nodeIdMap.set(node.id, newNode.id);
      }
    }

    // Copy connections (with remapped node IDs)
    if (workflow.connections?.length) {
      await db.insert(workflowConnections).values(
        workflow.connections.map((conn) => ({
          workflowId: newWorkflow.id,
          fromNodeId: nodeIdMap.get(conn.fromNodeId) ?? conn.fromNodeId,
          toNodeId: nodeIdMap.get(conn.toNodeId) ?? conn.toNodeId,
          branch: conn.branch,
          conditionLabel: conn.conditionLabel,
          conditionConfig: conn.conditionConfig,
          label: conn.label,
          animated: conn.animated,
          sortOrder: conn.sortOrder,
        })),
      );
    }

    // Copy variables
    if (workflow.variables?.length) {
      await db.insert(workflowVariables).values(
        workflow.variables.map((v) => ({
          workflowId: newWorkflow.id,
          name: v.name,
          description: v.description,
          variableType: v.variableType,
          defaultValue: v.defaultValue,
          isInput: v.isInput,
          isOutput: v.isOutput,
        })),
      );
    }

    this.logger.log(`Duplicated workflow ${workflowId} to ${newWorkflow.id}`);

    return newWorkflow;
  }

  /**
   * Export workflow as JSON
   */
  async exportWorkflow(
    userId: number,
    workflowId: string,
  ): Promise<WorkflowDefinition> {
    const workflow = await this.getWorkflow(userId, workflowId, true);

    return {
      version: workflow.version,
      name: workflow.name,
      description: workflow.description ?? undefined,
      icon: workflow.icon ?? undefined,
      color: workflow.color ?? undefined,
      nodes:
        workflow.nodes?.map((n) => ({
          id: n.id,
          nodeType: n.nodeType,
          positionX: n.positionX,
          positionY: n.positionY,
          label: n.label ?? undefined,
          description: n.description ?? undefined,
          config: n.config as Record<string, unknown>,
          aiInstructions: n.aiInstructions ?? undefined,
          aiTone: n.aiTone ?? undefined,
          aiGoal: n.aiGoal ?? undefined,
          allowedKbTemplates: (n.allowedKbTemplates as string[]) ?? undefined,
          onErrorNodeId: n.onErrorNodeId ?? undefined,
          continueOnError: n.continueOnError ?? undefined,
        })) ?? [],
      connections:
        workflow.connections?.map((c) => ({
          id: c.id,
          fromNodeId: c.fromNodeId,
          toNodeId: c.toNodeId,
          branch: c.branch as
            | 'default'
            | 'true'
            | 'false'
            | 'timeout'
            | 'error',
          conditionLabel: c.conditionLabel ?? undefined,
          conditionConfig: c.conditionConfig as
            | Record<string, unknown>
            | undefined,
          label: c.label ?? undefined,
          animated: c.animated ?? undefined,
          sortOrder: c.sortOrder ?? undefined,
        })) ?? [],
      variables:
        workflow.variables?.map((v) => ({
          id: v.id,
          name: v.name,
          description: v.description ?? undefined,
          variableType: v.variableType,
          defaultValue: v.defaultValue ?? undefined,
          isInput: v.isInput ?? undefined,
          isOutput: v.isOutput ?? undefined,
        })) ?? [],
      viewportX: workflow.viewportX ?? undefined,
      viewportY: workflow.viewportY ?? undefined,
      viewportZoom: workflow.viewportZoom ?? undefined,
    };
  }

  /**
   * Import workflow from JSON
   */
  async importWorkflow(
    userId: number,
    teamId: number,
    definition: WorkflowDefinition,
    name?: string,
  ): Promise<Workflow> {
    await this.verifyTeamAccess(userId, teamId, ['owner', 'admin']);

    const workflowName = name ?? definition.name;

    // Create workflow
    const [workflow] = await db
      .insert(workflows)
      .values({
        teamId,
        createdBy: userId,
        name: workflowName,
        description: definition.description,
        icon: definition.icon ?? 'workflow',
        color: definition.color ?? '#3b82f6',
        status: 'draft',
        version: 1,
        viewportX: definition.viewportX ?? 0,
        viewportY: definition.viewportY ?? 0,
        viewportZoom: definition.viewportZoom ?? 1,
      })
      .returning();

    // Map imported IDs to new IDs
    const nodeIdMap = new Map<string, string>();

    // Create nodes
    if (definition.nodes?.length) {
      for (const nodeDef of definition.nodes) {
        const [node] = await db
          .insert(workflowNodes)
          .values({
            workflowId: workflow.id,
            nodeType: nodeDef.nodeType as any,
            positionX: nodeDef.positionX,
            positionY: nodeDef.positionY,
            label: nodeDef.label,
            description: nodeDef.description,
            config: nodeDef.config,
            aiInstructions: nodeDef.aiInstructions,
            aiTone: nodeDef.aiTone,
            aiGoal: nodeDef.aiGoal,
            allowedKbTemplates: nodeDef.allowedKbTemplates ?? [],
            continueOnError: nodeDef.continueOnError ?? false,
          })
          .returning();

        nodeIdMap.set(nodeDef.id, node.id);
      }
    }

    // Create connections
    if (definition.connections?.length) {
      await db.insert(workflowConnections).values(
        definition.connections.map((connDef) => ({
          workflowId: workflow.id,
          fromNodeId: nodeIdMap.get(connDef.fromNodeId) ?? connDef.fromNodeId,
          toNodeId: nodeIdMap.get(connDef.toNodeId) ?? connDef.toNodeId,
          branch: connDef.branch as any,
          conditionLabel: connDef.conditionLabel,
          conditionConfig: connDef.conditionConfig,
          label: connDef.label,
          animated: connDef.animated ?? false,
          sortOrder: connDef.sortOrder ?? 0,
        })),
      );
    }

    // Create variables
    if (definition.variables?.length) {
      await db.insert(workflowVariables).values(
        definition.variables.map((varDef) => ({
          workflowId: workflow.id,
          name: varDef.name,
          description: varDef.description,
          variableType: varDef.variableType,
          defaultValue: varDef.defaultValue,
          isInput: varDef.isInput ?? false,
          isOutput: varDef.isOutput ?? false,
        })),
      );
    }

    this.logger.log(`Imported workflow as ${workflow.id}`);

    return workflow;
  }

  // ============================================================================
  // Versioning
  // ============================================================================

  /**
   * Get workflow version history
   */
  async getWorkflowVersions(
    userId: number,
    workflowId: string,
  ): Promise<WorkflowVersion[]> {
    const workflow = await this.getWorkflow(userId, workflowId, false);
    await this.verifyTeamAccess(userId, workflow.teamId);

    const versions = await db.query.workflowVersions.findMany({
      where: eq(workflowVersions.workflowId, workflowId),
      orderBy: [desc(workflowVersions.version)],
    });

    return versions;
  }

  /**
   * Restore a previous workflow version
   */
  async restoreWorkflowVersion(
    userId: number,
    workflowId: string,
    version: number,
  ): Promise<Workflow> {
    const workflow = await this.getWorkflow(userId, workflowId, false);
    await this.verifyTeamAccess(userId, workflow.teamId, ['owner', 'admin']);

    const versionRecord = await db.query.workflowVersions.findFirst({
      where: and(
        eq(workflowVersions.workflowId, workflowId),
        eq(workflowVersions.version, version),
      ),
    });

    if (!versionRecord) {
      throw new NotFoundException(`Version ${version} not found`);
    }

    const definition = versionRecord.snapshot as WorkflowDefinition;

    // Clear existing nodes/connections/variables
    await db
      .delete(workflowConnections)
      .where(eq(workflowConnections.workflowId, workflowId));
    await db
      .delete(workflowNodes)
      .where(eq(workflowNodes.workflowId, workflowId));
    await db
      .delete(workflowVariables)
      .where(eq(workflowVariables.workflowId, workflowId));

    // Recreate from definition
    const nodeIdMap = new Map<string, string>();

    if (definition.nodes?.length) {
      for (const nodeDef of definition.nodes) {
        const [node] = await db
          .insert(workflowNodes)
          .values({
            workflowId,
            nodeType: nodeDef.nodeType as any,
            positionX: nodeDef.positionX,
            positionY: nodeDef.positionY,
            label: nodeDef.label,
            description: nodeDef.description,
            config: nodeDef.config,
            aiInstructions: nodeDef.aiInstructions,
            aiTone: nodeDef.aiTone,
            aiGoal: nodeDef.aiGoal,
            allowedKbTemplates: nodeDef.allowedKbTemplates ?? [],
            continueOnError: nodeDef.continueOnError ?? false,
          })
          .returning();
        nodeIdMap.set(nodeDef.id, node.id);
      }
    }

    if (definition.connections?.length) {
      await db.insert(workflowConnections).values(
        definition.connections.map((c) => ({
          workflowId,
          fromNodeId: nodeIdMap.get(c.fromNodeId) ?? c.fromNodeId,
          toNodeId: nodeIdMap.get(c.toNodeId) ?? c.toNodeId,
          branch: c.branch as any,
          conditionLabel: c.conditionLabel,
          conditionConfig: c.conditionConfig,
          label: c.label,
          animated: c.animated ?? false,
          sortOrder: c.sortOrder ?? 0,
        })),
      );
    }

    if (definition.variables?.length) {
      await db.insert(workflowVariables).values(
        definition.variables.map((v) => ({
          workflowId,
          name: v.name,
          description: v.description,
          variableType: v.variableType,
          defaultValue: v.defaultValue,
          isInput: v.isInput ?? false,
          isOutput: v.isOutput ?? false,
        })),
      );
    }

    // Update workflow
    const [updated] = await db
      .update(workflows)
      .set({
        version: workflow.version + 1,
        viewportX: definition.viewportX ?? 0,
        viewportY: definition.viewportY ?? 0,
        viewportZoom: definition.viewportZoom ?? 1,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId))
      .returning();

    this.logger.log(`Restored workflow ${workflowId} to version ${version}`);

    return updated;
  }

  // ============================================================================
  // Execution Management
  // ============================================================================

  /**
   * List workflow executions
   */
  async listExecutions(
    userId: number,
    teamId: number,
    query: ListExecutionsQueryDto,
  ): Promise<{ executions: any[]; total: number }> {
    await this.verifyTeamAccess(userId, teamId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: SQL<unknown>[] = [];

    // Filter by team workflows
    const teamWorkflows = await db.query.workflows.findMany({
      where: eq(workflows.teamId, teamId),
      columns: { id: true },
    });
    const workflowIds = teamWorkflows.map((w) => w.id);

    if (workflowIds.length === 0) {
      return { executions: [], total: 0 };
    }

    conditions.push(inArray(workflowExecutions.workflowId, workflowIds));

    if (query.workflowId) {
      conditions.push(eq(workflowExecutions.workflowId, query.workflowId));
    }

    if (query.chatId) {
      conditions.push(eq(workflowExecutions.chatId, query.chatId));
    }

    if (query.status) {
      conditions.push(
        eq(
          workflowExecutions.status,
          query.status as
            | 'running'
            | 'waiting'
            | 'completed'
            | 'failed'
            | 'cancelled'
            | 'timeout',
        ),
      );
    }

    const [executions, countResult] = await Promise.all([
      db.query.workflowExecutions.findMany({
        where: and(...conditions),
        orderBy: [desc(workflowExecutions.startedAt)],
        limit,
        offset,
        with: {
          workflow: {
            columns: { name: true, icon: true, color: true },
          },
        },
      }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(workflowExecutions)
        .where(and(...conditions)),
    ]);

    return {
      executions,
      total: Number(countResult[0]?.count ?? 0),
    };
  }

  /**
   * Get a single execution with logs
   */
  async getExecution(userId: number, executionId: string): Promise<any> {
    const execution = await db.query.workflowExecutions.findFirst({
      where: eq(workflowExecutions.id, executionId),
      with: {
        workflow: true,
        logs: {
          orderBy: [desc(workflowExecutionLogs.executedAt)],
        },
      },
    });

    if (!execution) {
      throw new NotFoundException(`Execution not found: ${executionId}`);
    }

    await this.verifyTeamAccess(userId, execution.workflow.teamId);

    return execution;
  }

  /**
   * Get execution logs
   */
  async getExecutionLogs(userId: number, executionId: string): Promise<any[]> {
    const execution = await db.query.workflowExecutions.findFirst({
      where: eq(workflowExecutions.id, executionId),
      with: { workflow: true },
    });

    if (!execution) {
      throw new NotFoundException(`Execution not found: ${executionId}`);
    }

    await this.verifyTeamAccess(userId, execution.workflow.teamId);

    const logs = await db.query.workflowExecutionLogs.findMany({
      where: eq(workflowExecutionLogs.executionId, executionId),
      orderBy: [workflowExecutionLogs.executedAt],
    });

    return logs;
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  /**
   * Get analytics for a specific workflow
   */
  async getWorkflowAnalytics(
    userId: number,
    workflowId: string,
    query: WorkflowAnalyticsQueryDto,
  ): Promise<any> {
    const workflow = await this.getWorkflow(userId, workflowId, false);
    await this.verifyTeamAccess(userId, workflow.teamId);

    const periodDays =
      query.period === 'today'
        ? 1
        : query.period === 'week'
          ? 7
          : query.period === 'month'
            ? 30
            : 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const executions = await db.query.workflowExecutions.findMany({
      where: and(
        eq(workflowExecutions.workflowId, workflowId),
        sql`${workflowExecutions.startedAt} >= ${startDate}`,
      ),
    });

    const completed = executions.filter((e) => e.status === 'completed');
    const failed = executions.filter((e) => e.status === 'failed');

    return {
      workflowId,
      period: query.period ?? 'all',
      totalExecutions: executions.length,
      completedExecutions: completed.length,
      failedExecutions: failed.length,
      successRate:
        executions.length > 0
          ? (completed.length / executions.length) * 100
          : 0,
      avgDurationMs:
        completed.length > 0
          ? completed.reduce((sum, e) => sum + (e.totalDurationMs ?? 0), 0) /
            completed.length
          : 0,
      uniqueChats: new Set(executions.map((e) => e.chatId)).size,
    };
  }

  /**
   * Get overview analytics for all workflows
   */
  async getOverviewAnalytics(
    userId: number,
    teamId: number,
    query: WorkflowAnalyticsQueryDto,
  ): Promise<any> {
    await this.verifyTeamAccess(userId, teamId);

    const periodDays =
      query.period === 'today'
        ? 1
        : query.period === 'week'
          ? 7
          : query.period === 'month'
            ? 30
            : 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const teamWorkflows = await db.query.workflows.findMany({
      where: eq(workflows.teamId, teamId),
    });

    const workflowIds = teamWorkflows.map((w) => w.id);

    if (workflowIds.length === 0) {
      return {
        period: query.period ?? 'all',
        totalWorkflows: 0,
        activeWorkflows: 0,
        totalExecutions: 0,
        completedExecutions: 0,
        failedExecutions: 0,
        successRate: 0,
      };
    }

    const executions = await db.query.workflowExecutions.findMany({
      where: and(
        inArray(workflowExecutions.workflowId, workflowIds),
        sql`${workflowExecutions.startedAt} >= ${startDate}`,
      ),
    });

    const completed = executions.filter((e) => e.status === 'completed');
    const failed = executions.filter((e) => e.status === 'failed');

    return {
      period: query.period ?? 'all',
      totalWorkflows: teamWorkflows.length,
      activeWorkflows: teamWorkflows.filter((w) => w.status === 'active')
        .length,
      totalExecutions: executions.length,
      completedExecutions: completed.length,
      failedExecutions: failed.length,
      successRate:
        executions.length > 0
          ? (completed.length / executions.length) * 100
          : 0,
    };
  }

  // ============================================================================
  // Chat Workflow State
  // ============================================================================

  /**
   * Get workflow state for a chat
   */
  async getChatWorkflowState(userId: number, chatId: string): Promise<any> {
    const teamId = await this.getUserTeamId(userId);
    await this.verifyTeamAccess(userId, teamId);

    const state = await db.query.workflowChatState.findFirst({
      where: eq(workflowChatState.chatId, chatId),
      with: {
        activeWorkflow: true,
        currentNode: true,
      },
    });

    return state ?? null;
  }

  /**
   * Reset workflow state for a chat
   */
  async resetChatWorkflowState(
    userId: number,
    chatId: string,
  ): Promise<{ success: boolean }> {
    const teamId = await this.getUserTeamId(userId);
    await this.verifyTeamAccess(userId, teamId, ['owner', 'admin']);

    await db
      .update(workflowChatState)
      .set({
        activeWorkflowId: null,
        activeExecutionId: null,
        currentNodeId: null,
        currentAiInstructions: null,
        currentAiTone: null,
        currentAiGoal: null,
        allowedKbTemplates: null,
        isPaused: false,
        pausedAt: null,
        pausedBy: null,
        pauseReason: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowChatState.chatId, chatId));

    this.logger.log(`Reset workflow state for chat ${chatId}`);

    return { success: true };
  }

  // ============================================================================
  // Template Management
  // ============================================================================

  /**
   * List all template categories
   */
  async listTemplateCategories(): Promise<WorkflowTemplateCategory[]> {
    return db.query.workflowTemplateCategories.findMany({
      orderBy: (table) => [asc(table.sortOrder), asc(table.name)],
    });
  }

  /**
   * Create a new template category
   */
  async createTemplateCategory(
    dto: CreateWorkflowTemplateCategoryDto,
  ): Promise<WorkflowTemplateCategory> {
    const [category] = await db
      .insert(workflowTemplateCategories)
      .values({
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();

    this.logger.log(`Created template category: ${category.id}`);
    return category;
  }

  /**
   * Update a template category
   */
  async updateTemplateCategory(
    categoryId: string,
    dto: UpdateWorkflowTemplateCategoryDto,
  ): Promise<WorkflowTemplateCategory> {
    const existing = await db.query.workflowTemplateCategories.findFirst({
      where: eq(workflowTemplateCategories.id, categoryId),
    });

    if (!existing) {
      throw new NotFoundException('Template category not found');
    }

    const updateData: Partial<WorkflowTemplateCategory> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;

    const [updated] = await db
      .update(workflowTemplateCategories)
      .set(updateData)
      .where(eq(workflowTemplateCategories.id, categoryId))
      .returning();

    return updated;
  }

  /**
   * Delete a template category
   */
  async deleteTemplateCategory(
    categoryId: string,
  ): Promise<{ success: boolean }> {
    const existing = await db.query.workflowTemplateCategories.findFirst({
      where: eq(workflowTemplateCategories.id, categoryId),
    });

    if (!existing) {
      throw new NotFoundException('Template category not found');
    }

    // Set categoryId to null for all templates in this category
    await db
      .update(workflowTemplates)
      .set({ categoryId: null })
      .where(eq(workflowTemplates.categoryId, categoryId));

    await db
      .delete(workflowTemplateCategories)
      .where(eq(workflowTemplateCategories.id, categoryId));

    this.logger.log(`Deleted template category: ${categoryId}`);
    return { success: true };
  }

  /**
   * List all workflow templates
   */
  async listTemplates(
    query?: ListWorkflowTemplatesQueryDto,
  ): Promise<WorkflowTemplate[]> {
    const conditions: SQL[] = [];

    if (query?.categoryId) {
      conditions.push(eq(workflowTemplates.categoryId, query.categoryId));
    }

    if (query?.featuredOnly) {
      conditions.push(eq(workflowTemplates.isFeatured, true));
    }

    if (query?.search) {
      conditions.push(
        sql`(
          ${workflowTemplates.name} ILIKE ${`%${query.search}%`}
          OR ${workflowTemplates.description} ILIKE ${`%${query.search}%`}
        )`,
      );
    }

    return db.query.workflowTemplates.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        category: true,
      },
      orderBy: (table) => [desc(table.isFeatured), desc(table.useCount)],
    });
  }

  /**
   * Get a single template by ID
   */
  async getTemplate(templateId: string): Promise<WorkflowTemplate> {
    const template = await db.query.workflowTemplates.findFirst({
      where: eq(workflowTemplates.id, templateId),
      with: {
        category: true,
      },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;
  }

  /**
   * Create a new workflow template
   */
  async createTemplate(
    dto: CreateWorkflowTemplateDto,
  ): Promise<WorkflowTemplate> {
    // Validate category if provided
    if (dto.categoryId) {
      const category = await db.query.workflowTemplateCategories.findFirst({
        where: eq(workflowTemplateCategories.id, dto.categoryId),
      });
      if (!category) {
        throw new BadRequestException('Invalid category ID');
      }
    }

    const [template] = await db
      .insert(workflowTemplates)
      .values({
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        previewImageUrl: dto.previewImageUrl,
        definition: dto.definition,
        isFeatured: dto.isFeatured ?? false,
      })
      .returning();

    this.logger.log(`Created workflow template: ${template.id}`);
    return template;
  }

  /**
   * Update a workflow template
   */
  async updateTemplate(
    templateId: string,
    dto: UpdateWorkflowTemplateDto,
  ): Promise<WorkflowTemplate> {
    const existing = await db.query.workflowTemplates.findFirst({
      where: eq(workflowTemplates.id, templateId),
    });

    if (!existing) {
      throw new NotFoundException('Template not found');
    }

    // Validate category if provided
    if (dto.categoryId) {
      const category = await db.query.workflowTemplateCategories.findFirst({
        where: eq(workflowTemplateCategories.id, dto.categoryId),
      });
      if (!category) {
        throw new BadRequestException('Invalid category ID');
      }
    }

    const updateData: Partial<WorkflowTemplate> = {
      updatedAt: new Date(),
    };
    if (dto.categoryId !== undefined) updateData.categoryId = dto.categoryId;
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.previewImageUrl !== undefined)
      updateData.previewImageUrl = dto.previewImageUrl;
    if (dto.definition !== undefined)
      updateData.definition = dto.definition as any;
    if (dto.isFeatured !== undefined) updateData.isFeatured = dto.isFeatured;

    const [updated] = await db
      .update(workflowTemplates)
      .set(updateData)
      .where(eq(workflowTemplates.id, templateId))
      .returning();

    return updated;
  }

  /**
   * Delete a workflow template
   */
  async deleteTemplate(templateId: string): Promise<{ success: boolean }> {
    const existing = await db.query.workflowTemplates.findFirst({
      where: eq(workflowTemplates.id, templateId),
    });

    if (!existing) {
      throw new NotFoundException('Template not found');
    }

    await db
      .delete(workflowTemplates)
      .where(eq(workflowTemplates.id, templateId));

    this.logger.log(`Deleted workflow template: ${templateId}`);
    return { success: true };
  }

  /**
   * Create a workflow from a template
   */
  async createWorkflowFromTemplate(
    userId: number,
    templateId: string,
    dto?: UseWorkflowTemplateDto,
  ): Promise<Workflow> {
    const teamId = await this.getUserTeamId(userId);
    await this.verifyTeamAccess(userId, teamId, ['owner', 'admin']);

    const template = await this.getTemplate(templateId);
    const definition =
      template.definition as CreateWorkflowTemplateDto['definition'];

    // Increment use count
    await db
      .update(workflowTemplates)
      .set({
        useCount: sql`${workflowTemplates.useCount} + 1`,
      })
      .where(eq(workflowTemplates.id, templateId));

    // Create the workflow
    const workflowName = dto?.name || `${template.name} (Copy)`;

    // Check for duplicate name
    const existingCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(workflows)
      .where(
        and(
          eq(workflows.teamId, teamId),
          ilike(workflows.name, `${workflowName}%`),
        ),
      );

    const finalName =
      existingCount[0]?.count > 0
        ? `${workflowName} ${existingCount[0].count + 1}`
        : workflowName;

    const [workflow] = await db
      .insert(workflows)
      .values({
        teamId,
        createdBy: userId,
        name: finalName,
        description: template.description,
        icon: template.icon,
        status: 'draft',
        version: 1,
      })
      .returning();

    // Generate new IDs mapping for nodes
    const nodeIdMapping = new Map<string, string>();

    // Create nodes
    if (definition.nodes && definition.nodes.length > 0) {
      const nodeValues = definition.nodes.map((node) => {
        const newNodeId = crypto.randomUUID();
        nodeIdMapping.set(node.id, newNodeId);

        return {
          id: newNodeId,
          workflowId: workflow.id,
          nodeType: node.nodeType as WorkflowNode['nodeType'],
          label: node.label,
          description: node.description,
          config: node.config,
          positionX: node.positionX,
          positionY: node.positionY,
        };
      });

      await db.insert(workflowNodes).values(nodeValues);
    }

    // Create connections with remapped node IDs
    if (definition.connections && definition.connections.length > 0) {
      const connectionValues = definition.connections.map((conn) => ({
        id: crypto.randomUUID(),
        workflowId: workflow.id,
        fromNodeId: nodeIdMapping.get(conn.fromNodeId) || conn.fromNodeId,
        toNodeId: nodeIdMapping.get(conn.toNodeId) || conn.toNodeId,
        branch: conn.branch || 'default',
        conditionLabel: conn.label,
      }));

      await db.insert(workflowConnections).values(connectionValues);
    }

    // Create variables
    if (definition.variables && definition.variables.length > 0) {
      const variableValues = definition.variables.map((variable) => ({
        id: crypto.randomUUID(),
        workflowId: workflow.id,
        name: variable.name,
        variableType: variable.type || 'string',
        defaultValue: variable.defaultValue,
        isInput: variable.scope === 'input',
        isOutput: variable.scope === 'output',
        description: variable.description,
      }));

      await db.insert(workflowVariables).values(variableValues);
    }

    this.logger.log(
      `Created workflow ${workflow.id} from template ${templateId}`,
    );
    return workflow;
  }
}
