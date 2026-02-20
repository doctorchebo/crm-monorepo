/**
 * AI Chatbot Controller
 *
 * Handles all AI-related endpoints under the /ai prefix.
 */

import { JwtAuthGuard } from '@modules/auth/auth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SystemAdminGuard } from '@shared/guards/system-admin.guard';

// AI infrastructure services (now local to this module)
import { AiActionLoggerService } from './services/ai-action-logger.service';
import { AiConfigurationService } from './services/ai-configuration.service';
import { AntiBanSafeguardService } from './services/anti-ban-safeguard.service';
import { GuardrailAlertService } from './services/guardrail-alert.service';
import { HandoffService } from './services/handoff.service';
import { LLMService } from './services/llm.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { SystemAiPromptsService } from './services/system-ai-prompts.service';
import { UsageThrottleService } from './services/usage-throttle.service';
import { UsageTrackingService } from './services/usage-tracking.service';

// Local
import {
  ChatCompletionDto,
  ClassifyMessageDto,
  DiscardPendingReviewDto,
  PauseAIDto,
  RequestHandoffDto,
  ResolveHandoffDto,
  ResumeAIDto,
  SendReviewedAiResponseDto,
  SetChatAiOverrideDto,
  UpdateAiConfigurationDto,
  UpdateGoalPromptDto,
  UpdateSystemSettingDto,
} from './dto/ai-chatbot.dto';
import { AiChatbotService } from './services/ai-chatbot.service';

// WhatsApp service (lazy resolution to avoid circular dependency at startup)
import { WhatsAppService } from '@modules/whatsapp/whatsapp.service';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiChatbotController {
  private readonly logger = new Logger(AiChatbotController.name);
  private whatsAppServiceInstance: WhatsAppService | null = null;

  constructor(
    private readonly aiChatbotService: AiChatbotService,
    private readonly handoffService: HandoffService,
    private readonly llmService: LLMService,
    private readonly rateLimiter: RateLimiterService,
    private readonly actionLogger: AiActionLoggerService,
    private readonly antiBanService: AntiBanSafeguardService,
    private readonly alertService: GuardrailAlertService,
    private readonly usageTracking: UsageTrackingService,
    private readonly usageThrottle: UsageThrottleService,
    private readonly aiConfigService: AiConfigurationService,
    private readonly systemAiPromptsService: SystemAiPromptsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Lazily resolve WhatsAppService to avoid circular dependency at startup.
   * Uses ModuleRef.get with strict:false to resolve across modules.
   */
  private getWhatsAppService(): WhatsAppService | null {
    if (!this.whatsAppServiceInstance) {
      try {
        this.whatsAppServiceInstance = this.moduleRef.get(WhatsAppService, {
          strict: false,
        });
      } catch (error) {
        this.logger.warn(`Failed to resolve WhatsAppService: ${error}`);
      }
    }
    return this.whatsAppServiceInstance;
  }

  // ==========================================================================
  // Handoff Management
  // ==========================================================================

  @Get('handoffs/pending')
  async getPendingHandoffs(@Req() req: any) {
    return this.handoffService.getChatsAwaitingHandoff(req.user.userId);
  }

  @Post('handoffs/request')
  @HttpCode(HttpStatus.CREATED)
  async requestHandoff(@Req() req: any, @Body() dto: RequestHandoffDto) {
    await this.handoffService.requestHandoff(req.user.userId, {
      chatId: dto.chatId,
      reason: dto.reason,
    });
    return { success: true, message: 'Handoff requested' };
  }

  @Post('handoffs/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveHandoff(@Req() req: any, @Body() dto: ResolveHandoffDto) {
    await this.handoffService.resolveHandoff({
      chatId: dto.chatId,
      userId: req.user.userId,
      resumeAi: dto.resumeAI,
      resolution: dto.resolution,
    });
    return { success: true, message: 'Handoff resolved' };
  }

  // ==========================================================================
  // AI Pause / Resume
  // ==========================================================================

  @Post('pause')
  @HttpCode(HttpStatus.OK)
  async pauseAI(@Req() req: any, @Body() dto: PauseAIDto) {
    await this.handoffService.pauseAI(dto.chatId, req.user.userId);
    return { success: true, message: 'AI paused' };
  }

  @Post('resume/:chatId')
  @HttpCode(HttpStatus.OK)
  async resumeAI(
    @Req() req: any,
    @Param('chatId') chatId: string,
    @Body() dto?: ResumeAIDto,
  ) {
    const userId = req.user.userId;

    this.logger.log(
      `[Resume AI] Resuming AI for chat ${chatId} with goal: ${dto?.goalType || 'none'}`,
    );

    await this.handoffService.resumeAI(
      chatId,
      userId,
      dto?.goalType,
      dto?.goalDescription,
    );

    // Trigger AI response for pending customer messages
    try {
      const whatsAppService = this.getWhatsAppService();
      if (whatsAppService) {
        this.logger.log(
          `[Resume AI] Triggering AI response for pending messages in chat ${chatId}`,
        );
        // Fire and forget - don't block the response
        whatsAppService
          .triggerAiResponseForResume(chatId, userId)
          .catch((err) => {
            this.logger.warn(
              `[Resume AI] Failed to trigger AI response: ${err.message}`,
            );
          });
      } else {
        this.logger.warn(
          '[Resume AI] WhatsAppService not available to trigger AI response',
        );
      }
    } catch (error) {
      this.logger.warn(`[Resume AI] Error triggering AI response: ${error}`);
    }

    return { success: true, message: 'AI resumed' };
  }

  // ==========================================================================
  // AI Status
  // ==========================================================================

  @Get('status/:chatId')
  async getAIStatus(@Param('chatId') chatId: string) {
    return this.aiChatbotService.getAIStatus(chatId);
  }

  // ==========================================================================
  // AI / LLM Operations
  // ==========================================================================

  @Post('classify')
  @HttpCode(HttpStatus.OK)
  async classifyMessage(@Req() req: any, @Body() dto: ClassifyMessageDto) {
    return this.llmService.classifyMessage(
      dto.content,
      {},
      { userId: req.user.userId },
    );
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chatCompletion(@Req() req: any, @Body() dto: ChatCompletionDto) {
    const response = await this.llmService.chat({
      userId: req.user.userId,
      operationType: 'chat',
      messages: dto.messages,
      temperature: dto.temperature,
      maxTokens: dto.maxTokens,
    });
    return { response: response.content };
  }

  // ==========================================================================
  // AI Review
  // ==========================================================================

  @Post('send-reviewed')
  @HttpCode(HttpStatus.OK)
  async sendReviewedAiResponse(
    @Req() req: any,
    @Body() dto: SendReviewedAiResponseDto,
  ) {
    await this.aiChatbotService.sendReviewedAiResponse(
      req.user.userId,
      dto.chatId,
      dto.content,
      dto.mediaAttachment,
      dto.interactiveData,
    );
    return { success: true };
  }

  @Post('discard-pending')
  @HttpCode(HttpStatus.OK)
  async discardPendingReview(
    @Req() req: any,
    @Body() dto: DiscardPendingReviewDto,
  ) {
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
    return { success: true };
  }

  @Post('regenerate')
  @HttpCode(HttpStatus.OK)
  async regenerateAiResponse(@Body() dto: { chatId: string }) {
    await this.aiChatbotService.regenerateResponse(dto.chatId);
    return { success: true, message: 'Regeneration triggered' };
  }

  // ==========================================================================
  // Safeguards — Anti-Ban
  // ==========================================================================

  @Post('safeguards/validate')
  @HttpCode(HttpStatus.OK)
  async validateBeforeSend(
    @Req() req: any,
    @Body()
    dto: {
      chatId: string;
      messageText: string;
      senderId: number;
      messageType?: string;
      isAiGenerated?: boolean;
      mediaUrl?: string;
      mediaMimeType?: string;
      mediaSizeBytes?: number;
    },
  ) {
    return this.antiBanService.validateBeforeSend({
      userId: req.user.userId,
      chatId: dto.chatId,
      messageText: dto.messageText,
      senderId: dto.senderId,
      isAiGenerated: dto.isAiGenerated ?? false,
      mediaType: dto.mediaMimeType,
      mediaSize: dto.mediaSizeBytes,
    });
  }

  @Post('safeguards/record-sent')
  @HttpCode(HttpStatus.OK)
  async recordMessageSent(
    @Req() req: any,
    @Body()
    dto: {
      chatId: string;
      messageText: string;
      messageId?: string;
      senderId?: number;
      messageType?: string;
      isAiGenerated?: boolean;
    },
  ) {
    await this.antiBanService.recordMessageSent({
      userId: req.user.userId,
      chatId: dto.chatId,
      messageText: dto.messageText,
      senderId: dto.senderId,
      isAiGenerated: dto.isAiGenerated ?? false,
    });
    return { success: true };
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
    await this.antiBanService.recordInboundMessage(
      req.user.userId,
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
    return this.rateLimiter.checkRateLimit(req.user.userId, chatId, {
      senderId,
    });
  }

  @Get('safeguards/session-window/:chatId')
  async getSessionWindowStatus(
    @Req() req: any,
    @Param('chatId') chatId: string,
    @Query('senderId') senderId?: number,
  ) {
    return this.rateLimiter.isSessionWindowValid(
      req.user.userId,
      chatId,
      senderId,
    );
  }

  @Post('safeguards/block-chat')
  @HttpCode(HttpStatus.OK)
  async blockChat(
    @Req() req: any,
    @Body() dto: { chatId: string; reason: string; durationHours?: number },
  ) {
    await this.rateLimiter.blockChat(
      req.user.userId,
      dto.chatId,
      dto.reason,
      dto.durationHours ? { hours: dto.durationHours } : undefined,
    );
    return { success: true, message: 'Chat blocked' };
  }

  @Post('safeguards/unblock-chat')
  @HttpCode(HttpStatus.OK)
  async unblockChat(@Req() req: any, @Body() dto: { chatId: string }) {
    await this.rateLimiter.unblockChat(req.user.userId, dto.chatId);
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
    return this.actionLogger.getActions(req.user.userId, {
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
    return this.actionLogger.getActionSummary(req.user.userId, {
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
    return this.alertService.getAlerts(req.user.userId, {
      unreadOnly,
      alertType: alertType as any,
      limit,
    });
  }

  @Get('safeguards/alerts/unread-count')
  async getUnreadAlertCount(@Req() req: any) {
    const count = await this.alertService.getUnreadCount(req.user.userId);
    return { count };
  }

  @Patch('safeguards/alerts/:alertId/read')
  async markAlertAsRead(@Req() req: any, @Param('alertId') alertId: string) {
    await this.alertService.markAsRead(alertId, req.user.userId);
    return { success: true };
  }

  @Patch('safeguards/alerts/:alertId/dismiss')
  async dismissAlert(@Req() req: any, @Param('alertId') alertId: string) {
    await this.alertService.dismissAlert(alertId, req.user.userId);
    return { success: true };
  }

  @Patch('safeguards/alerts/mark-all-read')
  async markAllAlertsAsRead(@Req() req: any) {
    await this.alertService.markAllAsRead(req.user.userId);
    return { success: true };
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
    return this.usageTracking.getUsageSummary(req.user.userId, {
      period,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('usage/status')
  async getUsageStatus(@Req() req: any) {
    return this.usageTracking.getUsageStatus(req.user.userId);
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
    const limitId = await this.usageTracking.setLimit(
      req.user.userId,
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
    await this.usageTracking.removeLimit(
      req.user.userId,
      limitType,
      limitPeriod,
    );
  }

  // ==========================================================================
  // Throttling & AI Control
  // ==========================================================================

  @Get('throttle/status')
  async getThrottleStatus(@Req() req: any) {
    return this.usageThrottle.getDashboardStatus(req.user.userId);
  }

  @Post('throttle/check')
  @HttpCode(HttpStatus.OK)
  async checkBeforeAiOperation(@Req() req: any) {
    return this.usageThrottle.checkBeforeAiOperation(req.user.userId);
  }

  @Post('throttle/pause-chat')
  @HttpCode(HttpStatus.OK)
  async pauseAiForChat(
    @Req() req: any,
    @Body() dto: { chatId: string; reason?: string },
  ) {
    await this.usageThrottle.pauseAiForChat(
      dto.chatId,
      req.user.userId,
      dto.reason || 'Manually paused',
    );
    return { success: true, message: 'AI paused for chat' };
  }

  @Post('throttle/resume-chat')
  @HttpCode(HttpStatus.OK)
  async resumeAiForChat(@Req() req: any, @Body() dto: { chatId: string }) {
    await this.usageThrottle.resumeAiForChat(dto.chatId, req.user.userId);
    return { success: true, message: 'AI resumed for chat' };
  }

  @Post('throttle/pause-all')
  @HttpCode(HttpStatus.OK)
  async pauseAllAi(@Req() req: any, @Body() dto: { reason?: string }) {
    const pausedCount = await this.usageThrottle.pauseAllAi(
      req.user.userId,
      dto.reason || 'Manually paused all AI',
    );
    return { success: true, pausedCount };
  }

  // ==========================================================================
  // Handoff Notifications
  // ==========================================================================

  @Get('handoff/notifications')
  async getPendingNotifications(@Req() req: any) {
    return this.usageThrottle.getPendingNotifications(req.user.userId);
  }

  @Patch('handoff/notifications/:notificationId/acknowledge')
  async acknowledgeNotification(
    @Req() req: any,
    @Param('notificationId') notificationId: string,
  ) {
    const success = await this.usageThrottle.acknowledgeNotification(
      notificationId,
      req.user.userId,
    );
    return { success };
  }

  @Patch('handoff/notifications/:notificationId/resolve')
  async resolveNotification(
    @Req() req: any,
    @Param('notificationId') notificationId: string,
    @Body() dto: { resolution: string },
  ) {
    const success = await this.usageThrottle.resolveNotification(
      notificationId,
      req.user.userId,
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

  @Get('config/options')
  async getAiConfigOptions() {
    return {
      tones: this.aiConfigService.getToneOptions(),
      styles: this.aiConfigService.getStyleOptions(),
      formalities: this.aiConfigService.getFormalityOptions(),
    };
  }

  @Get('config')
  async getUserAiConfig(@Req() req: any) {
    return this.aiConfigService.getUserConfiguration(req.user.userId);
  }

  @Patch('config')
  async updateUserAiConfig(
    @Req() req: any,
    @Body() dto: UpdateAiConfigurationDto,
  ) {
    return this.aiConfigService.updateUserConfiguration(
      req.user.userId,
      dto as any,
    );
  }

  @Get('config/resolved/:chatId')
  async getResolvedAiConfig(@Req() req: any, @Param('chatId') chatId: string) {
    return this.aiConfigService.resolveConfiguration(req.user.userId, chatId);
  }

  @Get('config/chat-overrides')
  async getUserChatOverrides(@Req() req: any) {
    return this.aiConfigService.getUserChatOverrides(req.user.userId);
  }

  @Get('config/chat-overrides/:chatId')
  async getChatOverride(@Param('chatId') chatId: string) {
    return this.aiConfigService.getChatOverride(chatId);
  }

  @Post('config/chat-overrides')
  @HttpCode(HttpStatus.OK)
  async setChatOverride(@Req() req: any, @Body() dto: SetChatAiOverrideDto) {
    return this.aiConfigService.setChatOverride(
      dto.chatId,
      req.user.userId,
      dto,
    );
  }

  @Delete('config/chat-overrides/:chatId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteChatOverride(@Param('chatId') chatId: string, @Req() req: any) {
    await this.aiConfigService.deleteChatOverride(chatId, req.user.userId);
  }

  // ==========================================================================
  // System AI Goal Prompts (System Admin Only)
  // ==========================================================================

  @Get('system/prompts')
  async getAllGoalPrompts() {
    return this.systemAiPromptsService.getAllGoalPrompts();
  }

  @Get('system/prompts/:goalType')
  async getGoalPrompt(@Param('goalType') goalType: string) {
    return this.systemAiPromptsService.getGoalPrompt(goalType);
  }

  @Patch('system/prompts/:goalType')
  @UseGuards(SystemAdminGuard)
  async updateGoalPrompt(
    @Req() req: any,
    @Param('goalType') goalType: string,
    @Body() dto: UpdateGoalPromptDto,
  ) {
    return this.systemAiPromptsService.updateGoalPrompt(
      req.user.userId,
      goalType,
      dto,
    );
  }

  @Post('system/prompts/:goalType/reset')
  @UseGuards(SystemAdminGuard)
  async resetGoalPromptToDefault(
    @Req() req: any,
    @Param('goalType') goalType: string,
  ) {
    return this.systemAiPromptsService.resetGoalPromptToDefault(
      req.user.userId,
      goalType,
    );
  }

  @Get('system/admin-check')
  async checkSystemAdmin(@Req() req: any) {
    const isAdmin = await this.systemAiPromptsService.isSystemAdmin(
      req.user.userId,
    );
    return { isSystemAdmin: isAdmin };
  }

  // ==========================================================================
  // System AI Settings (System Admin Only)
  // ==========================================================================

  @Get('system/settings')
  async getAllSystemSettings() {
    return this.systemAiPromptsService.getAllSettings();
  }

  @Get('system/settings/:settingKey')
  async getSystemSetting(@Param('settingKey') settingKey: string) {
    return this.systemAiPromptsService.getSetting(settingKey);
  }

  @Patch('system/settings/:settingKey')
  @UseGuards(SystemAdminGuard)
  async updateSystemSetting(
    @Req() req: any,
    @Param('settingKey') settingKey: string,
    @Body() dto: UpdateSystemSettingDto,
  ) {
    return this.systemAiPromptsService.updateSetting(req.user.userId, {
      settingKey,
      settingValue: dto.settingValue,
      description: dto.description,
    });
  }
}
