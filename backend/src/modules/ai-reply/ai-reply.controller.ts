/**
 * AI Reply Controller
 * REST API endpoints for AI-powered WhatsApp replies
 */

import { JwtAuthGuard } from '@modules/auth/auth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  AnalyzeConversationDto,
  ConversationAnalysisResponseDto,
  GenerateReplyDto,
  GenerateReplyResponseDto,
  RateLimitStatusDto,
  SelectTemplateDto,
  SettingsResponseDto,
  TemplateSelectionResponseDto,
  UpdateSettingsDto,
} from './dto';
import {
  AIReplyService,
  AIReplySettingsService,
  RateLimiterService,
  TemplateSelectorService,
} from './services';

// Extend Express Request type to include user
interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    email: string;
    name: string;
  };
}

@Controller('ai-reply')
@UseGuards(JwtAuthGuard)
export class AIReplyController {
  private readonly logger = new Logger(AIReplyController.name);

  constructor(
    private readonly aiReplyService: AIReplyService,
    private readonly settingsService: AIReplySettingsService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly templateSelectorService: TemplateSelectorService,
  ) {}

  // ============================================================================
  // Reply Generation
  // ============================================================================

  /**
   * Generate an AI reply for a chat
   * POST /ai-reply/generate
   */
  @Post('generate')
  async generateReply(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GenerateReplyDto,
    @Query('senderId') senderIdStr: string,
  ): Promise<GenerateReplyResponseDto> {
    const userId = req.user!.userId;
    const senderId = parseInt(senderIdStr, 10);

    if (!senderId || isNaN(senderId)) {
      return {
        success: false,
        error: 'senderId query parameter is required',
      };
    }

    this.logger.log(
      `Generating AI reply for chat ${dto.chatId}, user ${userId}, sender ${senderId}`,
    );

    const result = await this.aiReplyService.generateReply({
      chatId: dto.chatId,
      userId,
      senderId,
      userPrompt: dto.userPrompt,
      autoSend: dto.autoSend ?? false,
      replyToMessageId: dto.replyToMessageId,
      forceTemplate: dto.forceTemplate,
      specificTemplateId: dto.specificTemplateId,
      templateVariables: dto.templateVariables,
      includeMedia: dto.includeMedia,
    });

    return {
      success: result.success,
      generatedText: result.generatedText,
      templateUsed: result.templateUsed,
      mediaAttachment: result.mediaAttachment,
      messageId: result.messageId,
      mediaMessageId: result.mediaMessageId,
      error: result.error,
      warnings: result.warnings,
      analysis: result.analysis
        ? {
            isWithinWindow: result.analysis.isWithinWindow,
            windowTimeRemainingMs: result.analysis.windowTimeRemainingMs,
            messagesSentLastHour: result.analysis.messagesSentLastHour,
            messagesSentToday: result.analysis.messagesSentToday,
            decision: result.analysis.decision,
          }
        : undefined,
      usage: result.usage,
    };
  }

  /**
   * Analyze conversation to determine message type
   * POST /ai-reply/analyze
   */
  @Post('analyze')
  async analyzeConversation(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AnalyzeConversationDto,
    @Query('senderId') senderIdStr: string,
  ): Promise<ConversationAnalysisResponseDto> {
    const senderId = parseInt(senderIdStr, 10);

    if (!senderId || isNaN(senderId)) {
      throw new Error('senderId query parameter is required');
    }

    const analysis = await this.aiReplyService.analyzeConversation(
      dto.chatId,
      senderId,
    );

    return {
      isWithinWindow: analysis.isWithinWindow,
      windowTimeRemainingMs: analysis.windowTimeRemainingMs,
      lastCustomerMessageAt: analysis.lastCustomerMessageAt?.toISOString(),
      messagesSentLastHour: analysis.messagesSentLastHour,
      messagesSentToday: analysis.messagesSentToday,
      isRepetitiveContent: analysis.isRepetitiveContent,
      decision: analysis.decision,
      blockReason: analysis.blockReason,
      recommendedTemplateId: analysis.recommendedTemplateId,
    };
  }

  // ============================================================================
  // Settings Management
  // ============================================================================

  /**
   * Get AI reply settings for the current user
   * GET /ai-reply/settings
   */
  @Get('settings')
  async getSettings(
    @Req() req: AuthenticatedRequest,
  ): Promise<SettingsResponseDto> {
    const userId = req.user!.userId;
    return this.settingsService.getSettings(userId);
  }

  /**
   * Update AI reply settings
   * PUT /ai-reply/settings
   */
  @Put('settings')
  async updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateSettingsDto,
  ): Promise<SettingsResponseDto> {
    const userId = req.user!.userId;
    return this.settingsService.updateSettings(userId, dto as any);
  }

  /**
   * Reset AI reply settings to defaults
   * DELETE /ai-reply/settings
   */
  @Delete('settings')
  async resetSettings(
    @Req() req: AuthenticatedRequest,
  ): Promise<SettingsResponseDto> {
    const userId = req.user!.userId;
    return this.settingsService.resetToDefaults(userId);
  }

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  /**
   * Get rate limit status for a chat
   * GET /ai-reply/rate-limit/:chatId
   */
  @Get('rate-limit/:chatId')
  async getRateLimitStatus(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ): Promise<RateLimitStatusDto> {
    const userId = req.user!.userId;
    const status = await this.aiReplyService.getRateLimitStatus(chatId, userId);

    return {
      canSend: status.canSend,
      messagesLastHour: status.messagesLastHour,
      messagesToday: status.messagesToday,
      cooldownRemaining: status.cooldownRemaining,
      blockReason: status.blockReason,
      hourlyResetAt: new Date(
        Date.now() + (60 - new Date().getMinutes()) * 60 * 1000,
      ).toISOString(),
      dailyResetAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
    };
  }

  /**
   * Clear cooldown for a chat (admin override)
   * DELETE /ai-reply/rate-limit/:chatId/cooldown
   */
  @Delete('rate-limit/:chatId/cooldown')
  async clearCooldown(
    @Param('chatId') chatId: string,
  ): Promise<{ success: boolean }> {
    this.rateLimiterService.clearCooldown(chatId);
    return { success: true };
  }

  // ============================================================================
  // Template Selection
  // ============================================================================

  /**
   * Select the best template for a conversation
   * POST /ai-reply/select-template
   */
  @Post('select-template')
  async selectTemplate(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SelectTemplateDto,
  ): Promise<TemplateSelectionResponseDto> {
    const userId = req.user!.userId;

    const result = await this.templateSelectorService.selectTemplate(userId, {
      contextKeywords: dto.contextKeywords,
      language: dto.language,
      category: dto.category,
    });

    return result;
  }

  /**
   * Get all approved templates for the user
   * GET /ai-reply/templates/approved
   */
  @Get('templates/approved')
  async getApprovedTemplates(@Req() req: AuthenticatedRequest): Promise<any[]> {
    const userId = req.user!.userId;
    return this.templateSelectorService.getApprovedTemplates(userId);
  }
}
