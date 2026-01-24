/**
 * Workflow Controller
 * REST API endpoints for workflow management
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import {
  BulkTransitionChatsDto,
  ChatCompletionDto,
  ClassifyMessageDto,
  CreateRuleDto,
  CreateStageDto,
  GetChatsByStageDto,
  GetUsageStatsDto,
  GetViolationLogsDto,
  InitializeChatWorkflowDto,
  PauseAIDto,
  ReorderStagesDto,
  RequestHandoffDto,
  ResolveHandoffDto,
  RunAllSimulationsDto,
  RunSimulationDto,
  SetChatAiOverrideDto,
  SetStageAiSettingsDto,
  TransitionChatDto,
  UpdateAiConfigurationDto,
  UpdateRuleDto,
  UpdateStageDto,
  SendReviewedAiResponseDto,
  DiscardPendingReviewDto,
} from './dto';
import {
  AiActionLoggerService,
  AiConfigurationService,
  AntiBanSafeguardService,
  GuardrailAlertService,
  HandoffService,
  LLMService,
  PolicySimulationService,
  RateLimiterService,
  RuleEngineService,
  StageService,
  UsageThrottleService,
  UsageTrackingService,
  WorkflowEngineService,
} from './services';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(
    private readonly workflowEngine: WorkflowEngineService,
    private readonly stageService: StageService,
    private readonly ruleEngineService: RuleEngineService,
    private readonly handoffService: HandoffService,
    private readonly llmService: LLMService,
    private readonly policySimulationService: PolicySimulationService,
    private readonly antiBanService: AntiBanSafeguardService,
    private readonly rateLimiter: RateLimiterService,
    private readonly actionLogger: AiActionLoggerService,
    private readonly alertService: GuardrailAlertService,
    private readonly usageTracking: UsageTrackingService,
    private readonly usageThrottle: UsageThrottleService,
    private readonly aiConfigService: AiConfigurationService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  // ==========================================================================
  // Workflow Summary & Status
  // ==========================================================================

  @Get('summary')
  async getWorkflowSummary(
    @Req() req: any,
    @Query('senderId') senderId?: number,
  ) {
    const userId = req.user.userId;
    return this.workflowEngine.getWorkflowSummary(userId, senderId);
  }

  @Get('chat/:chatId/status')
  async getChatWorkflowStatus(
    @Req() req: any,
    @Param('chatId') chatId: string,
  ) {
    const userId = req.user.userId;
    return this.workflowEngine.getChatWorkflowStatus(chatId, userId);
  }

  @Post('chat/initialize')
  @HttpCode(HttpStatus.CREATED)
  async initializeChatWorkflow(
    @Req() req: any,
    @Body() dto: InitializeChatWorkflowDto,
  ) {
    const userId = req.user.userId;
    await this.workflowEngine.initializeChatWorkflow(dto.chatId, userId, {
      initialStageId: dto.initialStageId,
      metadata: dto.metadata,
    });
    return { success: true, message: 'Workflow initialized' };
  }

  // ==========================================================================
  // Stage Management
  // ==========================================================================

  @Get('stages')
  async getStages(@Req() req: any) {
    const userId = req.user.userId;
    return this.stageService.getStages(userId);
  }

  @Get('stages/:stageId')
  async getStage(@Param('stageId') stageId: string) {
    return this.stageService.getStageById(stageId);
  }

  @Post('stages')
  @HttpCode(HttpStatus.CREATED)
  async createStage(@Req() req: any, @Body() dto: CreateStageDto) {
    const userId = req.user.userId;
    return this.stageService.createStage(userId, dto);
  }

  @Patch('stages/:stageId')
  async updateStage(
    @Req() req: any,
    @Param('stageId') stageId: string,
    @Body() dto: UpdateStageDto,
  ) {
    const userId = req.user.userId;
    return this.stageService.updateStage(stageId, userId, dto);
  }

  @Delete('stages/:stageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStage(@Req() req: any, @Param('stageId') stageId: string) {
    const userId = req.user.userId;
    await this.stageService.deleteStage(stageId, userId);
  }

  @Post('stages/reorder')
  @HttpCode(HttpStatus.OK)
  async reorderStages(@Req() req: any, @Body() dto: ReorderStagesDto) {
    const userId = req.user.userId;
    await this.stageService.reorderStages(userId, dto.stageIds);
    return { success: true, message: 'Stages reordered' };
  }

  @Post('stages/initialize-defaults')
  @HttpCode(HttpStatus.CREATED)
  async initializeDefaultStages(@Req() req: any) {
    const userId = req.user.userId;
    await this.stageService.initializeDefaultStages(userId);
    return { success: true, message: 'Default stages created' };
  }

  @Get('stages/:stageId/chats')
  async getChatsByStage(
    @Req() req: any,
    @Param('stageId') stageId: string,
    @Query() query: GetChatsByStageDto,
  ) {
    const userId = req.user.userId;
    return this.stageService.getChatsByStage(
      stageId,
      userId,
      query.limit,
      query.offset,
    );
  }

  // ==========================================================================
  // Chat Transitions
  // ==========================================================================

  @Post('chat/transition')
  @HttpCode(HttpStatus.OK)
  async transitionChat(@Req() req: any, @Body() dto: TransitionChatDto) {
    const userId = req.user.userId;
    await this.stageService.transitionChat(
      dto.chatId,
      userId,
      dto.toStageId,
      dto.reason || 'Manual transition',
      dto.metadata,
    );
    return { success: true, message: 'Chat transitioned' };
  }

  @Post('chat/bulk-transition')
  @HttpCode(HttpStatus.OK)
  async bulkTransitionChats(
    @Req() req: any,
    @Body() dto: BulkTransitionChatsDto,
  ) {
    const userId = req.user.userId;
    const results = await Promise.allSettled(
      dto.chatIds.map((chatId) =>
        this.stageService.transitionChat(
          chatId,
          userId,
          dto.toStageId,
          dto.reason || 'Bulk transition',
        ),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    return {
      success: failed === 0,
      message: `Transitioned ${succeeded}/${dto.chatIds.length} chats`,
      succeeded,
      failed,
    };
  }

  @Get('chat/:chatId/history')
  async getChatStageHistory(@Param('chatId') chatId: string) {
    return this.stageService.getStageHistory(chatId);
  }

  // ==========================================================================
  // Rule Management
  // ==========================================================================

  @Get('rules')
  async getRules(@Req() req: any) {
    const userId = req.user.userId;
    return this.ruleEngineService.getRules(userId);
  }

  @Get('rules/:ruleId')
  async getRule(@Req() req: any, @Param('ruleId') ruleId: string) {
    const userId = req.user.userId;
    return this.ruleEngineService.getRule(ruleId, userId);
  }

  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  async createRule(@Req() req: any, @Body() dto: CreateRuleDto) {
    const userId = req.user.userId;

    // Convert DTO conditions to service format
    const firstCondition = dto.conditions?.[0];
    const conditionType = firstCondition?.type || 'keyword';

    // Build the conditions object based on condition type
    let conditions: any;
    if (firstCondition?.keyword) {
      conditions = {
        type: 'keyword',
        config: {
          keywords: firstCondition.keyword.keywords,
          matchMode: firstCondition.keyword.matchAll ? 'all' : 'any',
          caseSensitive: firstCondition.keyword.caseSensitive ?? false,
        },
      };
    } else if (firstCondition?.sentiment) {
      conditions = {
        type: 'sentiment',
        config: {
          sentiment: firstCondition.sentiment.value,
          threshold: (firstCondition.sentiment.minConfidence ?? 0.5) * 100,
        },
      };
    } else if (firstCondition?.category) {
      conditions = {
        type: 'category',
        config: {
          categories: firstCondition.category.categories,
          matchMode: 'any',
        },
      };
    } else if (firstCondition?.intent) {
      conditions = {
        type: 'intent',
        config: {
          intents: firstCondition.intent.intents,
          matchMode: 'any',
        },
      };
    } else {
      conditions = {
        type: 'keyword',
        config: { keywords: [], matchMode: 'any', caseSensitive: false },
      };
    }

    return this.ruleEngineService.createRule(userId, {
      name: dto.name,
      description: dto.description,
      fromStageId: dto.fromStageId,
      toStageId: dto.toStageId,
      conditionType: conditionType as any,
      conditions,
      priority: dto.priority,
    });
  }

  @Patch('rules/:ruleId')
  async updateRule(
    @Req() req: any,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateRuleDto,
  ) {
    const userId = req.user.userId;

    // Build update request
    const updateRequest: any = {
      name: dto.name,
      description: dto.description,
      fromStageId: dto.fromStageId,
      toStageId: dto.toStageId,
      priority: dto.priority,
      isActive: dto.enabled,
    };

    // Convert conditions if provided
    if (dto.conditions && dto.conditions.length > 0) {
      const firstCondition = dto.conditions[0];
      if (firstCondition?.keyword) {
        updateRequest.conditionType = 'keyword';
        updateRequest.conditions = {
          type: 'keyword',
          config: {
            keywords: firstCondition.keyword.keywords,
            matchMode: firstCondition.keyword.matchAll ? 'all' : 'any',
            caseSensitive: firstCondition.keyword.caseSensitive ?? false,
          },
        };
      }
    }

    return this.ruleEngineService.updateRule(ruleId, userId, updateRequest);
  }

  @Delete('rules/:ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRule(@Req() req: any, @Param('ruleId') ruleId: string) {
    const userId = req.user.userId;
    await this.ruleEngineService.deleteRule(ruleId, userId);
  }

  @Patch('rules/:ruleId/toggle')
  async toggleRule(@Req() req: any, @Param('ruleId') ruleId: string) {
    const userId = req.user.userId;
    const rule = await this.ruleEngineService.getRule(ruleId, userId);
    if (!rule) {
      return { success: false, message: 'Rule not found' };
    }

    await this.ruleEngineService.updateRule(ruleId, userId, {
      isActive: !rule.isActive,
    });
    return { success: true, enabled: !rule.isActive };
  }

  // ==========================================================================
  // Handoff Management
  // ==========================================================================

  @Get('handoffs/pending')
  async getPendingHandoffs(@Req() req: any) {
    const userId = req.user.userId;
    return this.handoffService.getChatsAwaitingHandoff(userId);
  }

  @Post('handoffs/request')
  @HttpCode(HttpStatus.CREATED)
  async requestHandoff(@Req() req: any, @Body() dto: RequestHandoffDto) {
    const userId = req.user.userId;
    await this.handoffService.requestHandoff(userId, {
      chatId: dto.chatId,
      reason: dto.reason,
    });
    return { success: true, message: 'Handoff requested' };
  }

  @Post('handoffs/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveHandoff(@Req() req: any, @Body() dto: ResolveHandoffDto) {
    const userId = req.user.userId;
    await this.handoffService.resolveHandoff({
      chatId: dto.chatId,
      userId,
      resumeAi: dto.resumeAI,
      resolution: dto.resolution,
    });
    return { success: true, message: 'Handoff resolved' };
  }

  @Post('ai/pause')
  @HttpCode(HttpStatus.OK)
  async pauseAI(@Req() req: any, @Body() dto: PauseAIDto) {
    const userId = req.user.userId;
    await this.handoffService.pauseAI(dto.chatId, userId);
    return { success: true, message: 'AI paused' };
  }

  @Post('ai/resume/:chatId')
  @HttpCode(HttpStatus.OK)
  async resumeAI(@Req() req: any, @Param('chatId') chatId: string) {
    const userId = req.user.userId;
    await this.handoffService.resumeAI(chatId, userId);

    // Trigger AI response for any pending customer message
    // Run in background to avoid blocking the response
    this.whatsAppService
      .triggerAiResponseForResume(chatId, userId)
      .catch((err) => {
        console.error(
          `Error triggering AI response on resume for chat ${chatId}:`,
          err,
        );
      });

    return { success: true, message: 'AI resumed' };
  }

  @Get('ai/status/:chatId')
  async getAIStatus(@Param('chatId') chatId: string) {
    const result = await this.handoffService.canAISend(chatId);
    return {
      chatId,
      aiEnabled: result.canSend,
      aiConfigEnabled: result.configEnabled, // New field for UI config visibility
      reason: result.reason,
      isRateLimited: result.isRateLimited,
      rateLimitReset: result.rateLimitReset,
      rateLimitCurrentCount: result.rateLimitCurrentCount,
      rateLimitMaxCount: result.rateLimitMaxCount,
    };
  }

  // ==========================================================================
  // AI/LLM Operations
  // ==========================================================================

  @Post('ai/classify')
  @HttpCode(HttpStatus.OK)
  async classifyMessage(@Req() req: any, @Body() dto: ClassifyMessageDto) {
    const userId = req.user.userId;
    return this.llmService.classifyMessage(dto.content, {}, { userId });
  }

  @Post('ai/chat')
  @HttpCode(HttpStatus.OK)
  async chatCompletion(@Req() req: any, @Body() dto: ChatCompletionDto) {
    const userId = req.user.userId;
    const response = await this.llmService.chat({
      userId,
      operationType: 'chat',
      messages: dto.messages,
      temperature: dto.temperature,
      maxTokens: dto.maxTokens,
    });
    return { response: response.content };
  }

  @Get('ai/usage')
  async getUsageStats(@Req() req: any, @Query() query: GetUsageStatsDto) {
    const userId = req.user.userId;
    return this.llmService.getUsageStats(userId, {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  // ==========================================================================
  // Policy Simulation
  // ==========================================================================

  @Get('simulation/scenarios')
  async getSimulationScenarios() {
    return this.policySimulationService.getAvailableScenarios();
  }

  @Post('simulation/run')
  @HttpCode(HttpStatus.OK)
  async runSimulation(@Req() req: any, @Body() dto: RunSimulationDto) {
    const userId = req.user.userId;
    return this.policySimulationService.runSimulation(
      userId,
      dto.scenarioName,
      {
        chatId: dto.chatId,
        senderId: dto.senderId,
      },
    );
  }

  @Post('simulation/run-all')
  @HttpCode(HttpStatus.OK)
  async runAllSimulations(@Req() req: any, @Body() dto: RunAllSimulationsDto) {
    const userId = req.user.userId;
    return this.policySimulationService.runAllSimulations(userId, {
      chatId: dto.chatId,
      senderId: dto.senderId,
    });
  }

  @Get('violations')
  async getViolationLogs(@Req() req: any, @Query() query: GetViolationLogsDto) {
    const userId = req.user.userId;
    return this.policySimulationService.getViolationLogs(userId, {
      limit: query.limit,
      includeSimulated: query.includeSimulated,
      severity: query.severity,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
    });
  }

  @Get('violations/stats')
  async getViolationStats(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user.userId;
    return this.policySimulationService.getViolationStats(userId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  // ==========================================================================
  // Anti-Ban Safeguards
  // ==========================================================================

  @Post('safeguards/validate')
  @HttpCode(HttpStatus.OK)
  async validateBeforeSend(
    @Req() req: any,
    @Body()
    dto: {
      chatId: string;
      senderId?: number;
      messageText?: string;
      isAiGenerated: boolean;
      templateId?: string;
      templateName?: string;
      templateVariables?: Record<string, unknown>;
      mediaSize?: number;
      mediaType?: string;
      classification?: {
        category?: string;
        intent?: string;
        sentiment?: string;
        confidence?: number;
      };
    },
  ) {
    const userId = req.user.userId;
    return this.antiBanService.validateBeforeSend({
      userId,
      chatId: dto.chatId,
      senderId: dto.senderId,
      messageText: dto.messageText,
      isAiGenerated: dto.isAiGenerated,
      templateId: dto.templateId,
      templateName: dto.templateName,
      templateVariables: dto.templateVariables,
      mediaSize: dto.mediaSize,
      mediaType: dto.mediaType,
      classification: dto.classification,
    });
  }

  @Post('safeguards/record-sent')
  @HttpCode(HttpStatus.OK)
  async recordMessageSent(
    @Req() req: any,
    @Body()
    dto: {
      chatId: string;
      senderId?: number;
      messageText?: string;
      isAiGenerated: boolean;
      templateId?: string;
      templateName?: string;
      templateVariables?: Record<string, unknown>;
      classification?: {
        category?: string;
        intent?: string;
        sentiment?: string;
        confidence?: number;
      };
      embeddingUsed?: boolean;
      embeddingModel?: string;
    },
  ) {
    const userId = req.user.userId;
    const logId = await this.antiBanService.recordMessageSent({
      userId,
      chatId: dto.chatId,
      senderId: dto.senderId,
      messageText: dto.messageText,
      isAiGenerated: dto.isAiGenerated,
      templateId: dto.templateId,
      templateName: dto.templateName,
      templateVariables: dto.templateVariables,
      classification: dto.classification,
      embeddingUsed: dto.embeddingUsed,
      embeddingModel: dto.embeddingModel,
    });
    return { success: true, logId };
  }

  @Post('safeguards/record-inbound')
  @HttpCode(HttpStatus.OK)
  async recordInboundMessage(
    @Req() req: any,
    @Body()
    dto: {
      chatId: string;
      messageText: string;
      messageId?: string;
      senderId?: number;
      classification?: {
        category: string;
        intent?: string;
        sentiment: string;
        confidence: number;
      };
    },
  ) {
    const userId = req.user.userId;
    await this.antiBanService.recordInboundMessage(
      userId,
      dto.chatId,
      dto.messageText,
      {
        messageId: dto.messageId,
        senderId: dto.senderId,
        classification: dto.classification,
      },
    );
    return { success: true };
  }

  // ==========================================================================
  // Rate Limits
  // ==========================================================================

  @Get('safeguards/rate-limit/:chatId')
  async getRateLimitStatus(
    @Req() req: any,
    @Param('chatId') chatId: string,
    @Query('senderId') senderId?: number,
  ) {
    const userId = req.user.userId;
    const status = await this.rateLimiter.checkRateLimit(userId, chatId, {
      senderId,
    });
    return status;
  }

  @Get('safeguards/session-window/:chatId')
  async getSessionWindowStatus(
    @Req() req: any,
    @Param('chatId') chatId: string,
    @Query('senderId') senderId?: number,
  ) {
    const userId = req.user.userId;
    return this.rateLimiter.isSessionWindowValid(userId, chatId, senderId);
  }

  @Post('safeguards/block-chat')
  @HttpCode(HttpStatus.OK)
  async blockChat(
    @Req() req: any,
    @Body()
    dto: {
      chatId: string;
      reason: string;
      durationHours?: number;
    },
  ) {
    const userId = req.user.userId;
    await this.rateLimiter.blockChat(
      userId,
      dto.chatId,
      dto.reason,
      dto.durationHours ? { hours: dto.durationHours } : undefined,
    );
    return { success: true, message: 'Chat blocked' };
  }

  @Post('safeguards/unblock-chat')
  @HttpCode(HttpStatus.OK)
  async unblockChat(@Req() req: any, @Body() dto: { chatId: string }) {
    const userId = req.user.userId;
    await this.rateLimiter.unblockChat(userId, dto.chatId);
    return { success: true, message: 'Chat unblocked' };
  }

  // ==========================================================================
  // AI Action Logs
  // ==========================================================================

  @Get('safeguards/ai-actions')
  async getAiActionLogs(
    @Req() req: any,
    @Query('chatId') chatId?: string,
    @Query('senderId') senderId?: number,
    @Query('actionType') actionType?: string,
    @Query('guardrailOnly') guardrailOnly?: boolean,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const userId = req.user.userId;
    return this.actionLogger.getActions(userId, {
      chatId,
      senderId,
      actionType: actionType as any,
      guardrailTriggeredOnly: guardrailOnly,
      limit,
      offset,
    });
  }

  @Get('safeguards/ai-actions/summary')
  async getAiActionSummary(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user.userId;
    return this.actionLogger.getActionSummary(userId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  // ==========================================================================
  // Guardrail Alerts
  // ==========================================================================

  @Get('safeguards/alerts')
  async getAlerts(
    @Req() req: any,
    @Query('unreadOnly') unreadOnly?: boolean,
    @Query('alertType') alertType?: string,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.userId;
    return this.alertService.getAlerts(userId, {
      unreadOnly,
      alertType: alertType as any,
      limit,
    });
  }

  @Get('safeguards/alerts/unread-count')
  async getUnreadAlertCount(@Req() req: any) {
    const userId = req.user.userId;
    const count = await this.alertService.getUnreadCount(userId);
    return { count };
  }

  @Patch('safeguards/alerts/:alertId/read')
  async markAlertAsRead(@Req() req: any, @Param('alertId') alertId: string) {
    const userId = req.user.userId;
    await this.alertService.markAsRead(alertId, userId);
    return { success: true };
  }

  @Patch('safeguards/alerts/:alertId/dismiss')
  async dismissAlert(@Req() req: any, @Param('alertId') alertId: string) {
    const userId = req.user.userId;
    await this.alertService.dismissAlert(alertId, userId);
    return { success: true };
  }

  @Patch('safeguards/alerts/mark-all-read')
  async markAllAlertsAsRead(@Req() req: any) {
    const userId = req.user.userId;
    await this.alertService.markAllAsRead(userId);
    return { success: true };
  }

  // ==========================================================================
  // Failure Simulations
  // ==========================================================================

  @Post('safeguards/simulate/unapproved-template')
  @HttpCode(HttpStatus.OK)
  async simulateUnapprovedTemplate(
    @Req() req: any,
    @Body() dto: { chatId: string; templateName: string },
  ) {
    const userId = req.user.userId;
    return this.antiBanService.simulateUnapprovedTemplateOutsideWindow(
      userId,
      dto.chatId,
      dto.templateName,
    );
  }

  @Post('safeguards/simulate/high-frequency')
  @HttpCode(HttpStatus.OK)
  async simulateHighFrequency(
    @Req() req: any,
    @Body() dto: { chatId: string; messageCount: number },
  ) {
    const userId = req.user.userId;
    return this.antiBanService.simulateHighFrequencyBlock(
      userId,
      dto.chatId,
      dto.messageCount,
    );
  }

  @Post('safeguards/simulate/media-limit')
  @HttpCode(HttpStatus.OK)
  async simulateMediaLimit(
    @Req() req: any,
    @Body() dto: { chatId: string; mediaType: string; sizeMb: number },
  ) {
    const userId = req.user.userId;
    return this.antiBanService.simulateMediaLimitExceeded(
      userId,
      dto.chatId,
      dto.mediaType,
      dto.sizeMb,
    );
  }

  @Post('safeguards/simulate/all')
  @HttpCode(HttpStatus.OK)
  async runAllSafeguardSimulations(
    @Req() req: any,
    @Body() dto: { chatId: string },
  ) {
    const userId = req.user.userId;
    return this.antiBanService.runAllSimulations(userId, dto.chatId);
  }

  // ==========================================================================
  // Usage Tracking & Billing
  // ==========================================================================

  @Get('usage/summary')
  async getUsageSummary(
    @Req() req: any,
    @Query('period') period?: 'daily' | 'weekly' | 'monthly' | 'all',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user.userId;
    return this.usageTracking.getUsageSummary(userId, {
      period,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('usage/status')
  async getUsageStatus(@Req() req: any) {
    const userId = req.user.userId;
    return this.usageTracking.getUsageStatus(userId);
  }

  @Get('usage/chat/:chatId')
  async getChatUsage(
    @Param('chatId') chatId: string,
    @Query('limit') limit?: number,
  ) {
    return this.usageTracking.getChatUsage(chatId, { limit });
  }

  @Post('usage/limits')
  @HttpCode(HttpStatus.CREATED)
  async setUsageLimit(
    @Req() req: any,
    @Body()
    dto: {
      limitType: 'tokens' | 'cost' | 'requests';
      limitPeriod: 'daily' | 'weekly' | 'monthly' | 'total';
      limitValue: number;
      warningThreshold?: number;
      actionOnLimit?: 'pause' | 'notify' | 'block';
    },
  ) {
    const userId = req.user.userId;
    const limitId = await this.usageTracking.setLimit(
      userId,
      dto.limitType,
      dto.limitPeriod,
      dto.limitValue,
      {
        warningThreshold: dto.warningThreshold,
        actionOnLimit: dto.actionOnLimit,
      },
    );
    return { success: true, limitId };
  }

  @Delete('usage/limits/:limitType/:limitPeriod')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeUsageLimit(
    @Req() req: any,
    @Param('limitType') limitType: string,
    @Param('limitPeriod') limitPeriod: string,
  ) {
    const userId = req.user.userId;
    await this.usageTracking.removeLimit(userId, limitType, limitPeriod);
  }

  // ==========================================================================
  // Throttling & AI Control
  // ==========================================================================

  @Get('throttle/status')
  async getThrottleStatus(@Req() req: any) {
    const userId = req.user.userId;
    return this.usageThrottle.getDashboardStatus(userId);
  }

  @Post('throttle/check')
  @HttpCode(HttpStatus.OK)
  async checkBeforeAiOperation(@Req() req: any) {
    const userId = req.user.userId;
    return this.usageThrottle.checkBeforeAiOperation(userId);
  }

  @Post('throttle/pause-chat')
  @HttpCode(HttpStatus.OK)
  async pauseAiForChat(
    @Req() req: any,
    @Body() dto: { chatId: string; reason?: string },
  ) {
    const userId = req.user.userId;
    await this.usageThrottle.pauseAiForChat(
      dto.chatId,
      userId,
      dto.reason || 'Manually paused',
    );
    return { success: true, message: 'AI paused for chat' };
  }

  @Post('throttle/resume-chat')
  @HttpCode(HttpStatus.OK)
  async resumeAiForChat(@Req() req: any, @Body() dto: { chatId: string }) {
    const userId = req.user.userId;
    await this.usageThrottle.resumeAiForChat(dto.chatId, userId);
    return { success: true, message: 'AI resumed for chat' };
  }

  @Post('throttle/pause-all')
  @HttpCode(HttpStatus.OK)
  async pauseAllAi(@Req() req: any, @Body() dto: { reason?: string }) {
    const userId = req.user.userId;
    const pausedCount = await this.usageThrottle.pauseAllAi(
      userId,
      dto.reason || 'Manually paused all AI',
    );
    return { success: true, pausedCount };
  }

  // ==========================================================================
  // Handoff Notifications
  // ==========================================================================

  @Get('handoff/notifications')
  async getPendingNotifications(@Req() req: any) {
    const userId = req.user.userId;
    return this.usageThrottle.getPendingNotifications(userId);
  }

  @Patch('handoff/notifications/:notificationId/acknowledge')
  async acknowledgeNotification(
    @Req() req: any,
    @Param('notificationId') notificationId: string,
  ) {
    const userId = req.user.userId;
    const success = await this.usageThrottle.acknowledgeNotification(
      notificationId,
      userId,
    );
    return { success };
  }

  @Patch('handoff/notifications/:notificationId/resolve')
  async resolveNotification(
    @Req() req: any,
    @Param('notificationId') notificationId: string,
    @Body() dto: { resolution: string },
  ) {
    const userId = req.user.userId;
    const success = await this.usageThrottle.resolveNotification(
      notificationId,
      userId,
      dto.resolution,
    );
    return { success };
  }

  @Get('handoff/chat/:chatId/status')
  async getHandoffStatus(@Param('chatId') chatId: string) {
    return this.handoffService.getHandoffStatus(chatId);
  }

  // ==========================================================================
  // AI Configuration Management
  // ==========================================================================

  /**
   * Get available AI configuration options (tones, styles, formalities)
   */
  @Get('ai-config/options')
  async getAiConfigOptions() {
    return {
      tones: this.aiConfigService.getToneOptions(),
      styles: this.aiConfigService.getStyleOptions(),
      formalities: this.aiConfigService.getFormalityOptions(),
    };
  }

  /**
   * Get user's AI configuration
   */
  @Get('ai-config')
  async getUserAiConfig(@Req() req: any) {
    const userId = req.user.userId;
    return this.aiConfigService.getUserConfiguration(userId);
  }

  /**
   * Update user's AI configuration
   */
  @Patch('ai-config')
  async updateUserAiConfig(
    @Req() req: any,
    @Body() dto: UpdateAiConfigurationDto,
  ) {
    const userId = req.user.userId;
    return this.aiConfigService.updateUserConfiguration(userId, dto);
  }

  /**
   * Get resolved AI configuration for a specific chat
   * Returns merged config from user defaults + stage settings + chat overrides
   */
  @Get('ai-config/resolved/:chatId')
  async getResolvedAiConfig(@Req() req: any, @Param('chatId') chatId: string) {
    const userId = req.user.userId;
    return this.aiConfigService.resolveConfiguration(userId, chatId);
  }

  /**
   * Get all chat AI overrides for the user
   */
  @Get('ai-config/chat-overrides')
  async getUserChatOverrides(@Req() req: any) {
    const userId = req.user.userId;
    return this.aiConfigService.getUserChatOverrides(userId);
  }

  /**
   * Get specific chat AI override
   */
  @Get('ai-config/chat-overrides/:chatId')
  async getChatOverride(@Param('chatId') chatId: string) {
    return this.aiConfigService.getChatOverride(chatId);
  }

  /**
   * Set or update chat AI override
   */
  @Post('ai-config/chat-overrides')
  @HttpCode(HttpStatus.OK)
  async setChatOverride(@Req() req: any, @Body() dto: SetChatAiOverrideDto) {
    const userId = req.user.userId;
    return this.aiConfigService.setChatOverride(dto.chatId, userId, dto);
  }

  /**
   * Delete chat AI override (reverts to defaults)
   */
  @Delete('ai-config/chat-overrides/:chatId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteChatOverride(@Param('chatId') chatId: string) {
    await this.aiConfigService.deleteChatOverride(chatId);
  }

  /**
   * Get all workflow stage AI settings for the user
   */
  @Get('ai-config/stage-settings')
  async getUserStageSettings(@Req() req: any) {
    const userId = req.user.userId;
    return this.aiConfigService.getUserStageSettings(userId);
  }

  /**
   * Get specific workflow stage AI settings
   */
  @Get('ai-config/stage-settings/:stageId')
  async getStageSettings(@Param('stageId') stageId: string) {
    return this.aiConfigService.getStageSettings(stageId);
  }

  /**
   * Set or update workflow stage AI settings
   */
  @Post('ai-config/stage-settings')
  @HttpCode(HttpStatus.OK)
  async setStageSettings(@Req() req: any, @Body() dto: SetStageAiSettingsDto) {
    const userId = req.user.userId;
    return this.aiConfigService.setStageSettings(dto.stageId, userId, dto);
  }

  /**
   * Delete workflow stage AI settings
   */
  @Delete('ai-config/stage-settings/:stageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStageSettings(@Param('stageId') stageId: string) {
    await this.aiConfigService.deleteStageSettings(stageId);
  }

  // ==========================================================================
  // AI Review Endpoints
  // ==========================================================================

  /**
   * Send a reviewed AI response
   */
  @Post('ai/send-reviewed')
  @HttpCode(HttpStatus.OK)
  async sendReviewedAiResponse(
    @Req() req: any,
    @Body() dto: SendReviewedAiResponseDto,
  ) {
    const userId = req.user.userId;
    await this.workflowEngine.sendReviewedAiResponse(
      userId,
      dto.chatId,
      dto.content,
      dto.mediaAttachment,
      dto.interactiveData,
    );
    return { success: true };
  }

  /**
   * Discard a pending AI review
   */
  @Post('ai/discard-pending')
  @HttpCode(HttpStatus.OK)
  async discardPendingReview(
    @Req() req: any,
    @Body() dto: DiscardPendingReviewDto,
  ) {
    // We just log this action for analytics
    this.actionLogger.logAction({
      userId: req.user.userId,
      chatId: dto.chatId,
      actionType: 'auto_reply',
      actionStatus: 'blocked',
      guardrailTriggered: true,
      guardrailType: 'manual_pause',
      guardrailReason: 'User discarded review',
      metadata: { source: 'review_panel' },
    });

    // Also emit stop typing to be safe
    // Since we don't have direct access to gateway here easily without injecting it,
    // we rely on frontend clearing state. But ideally backend should conform logic.
    // For now logging is sufficient.
    return { success: true };
  }

  /**
   * Get AI status for a specific chat (enabled, paused, rate limited)
   */
  @Get('ai/status/:chatId')
  async getAiStatus(@Param('chatId') chatId: string) {
    return this.workflowEngine.getAIStatus(chatId);
  }

  @Post('ai/regenerate')
  @HttpCode(HttpStatus.OK)
  async regenerateAiResponse(@Body() dto: { chatId: string }) {
    await this.workflowEngine.regenerateResponse(dto.chatId);
    return { success: true, message: 'Renegeration triggered' };
  }
}
