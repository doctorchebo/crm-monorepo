/**
 * Workflow Engine Service
 * Main orchestrator that coordinates all workflow components
 *
 * This is the primary entry point for:
 * - Processing incoming messages through the workflow
 * - Automatic stage transitions based on rules
 * - AI categorization and response generation
 * - Human-AI handoff coordination
 *
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────┐
 * │                     WorkflowEngine                           │
 * │                   (Main Orchestrator)                        │
 * ├──────────────────────────────────────────────────────────────┤
 * │  ┌─────────────────────┐  ┌─────────────────────┐            │
 * │  │InteractiveHandler   │  │ AiResponseGenerator │            │
 * │  │ - button clicks     │  │ - classify          │            │
 * │  │ - list selections   │  │ - generate response │            │
 * │  └─────────────────────┘  └─────────────────────┘            │
 * │  ┌─────────────────────┐  ┌─────────────────────┐            │
 * │  │WorkflowStatusService│  │  Supporting Services │           │
 * │  │ - get summary       │  │ - StageService      │            │
 * │  │ - get AI status     │  │ - HandoffService    │            │
 * │  │ - regenerate        │  │ - RuleEngineService │            │
 * │  └─────────────────────┘  └─────────────────────┘            │
 * └──────────────────────────────────────────────────────────────┘
 */

import { db } from '@database/db.connection';
import { messages } from '@database/schema';
import {
  AIReplyService,
  InteractiveMessageService,
} from '@modules/ai-reply/services';
import { AIReplyInteractiveData } from '@modules/ai-reply/types';
import { MediaOrchestratorService } from '@modules/knowledge-base/services/media-orchestrator.service';
import { WhatsAppGateway } from '@modules/whatsapp/whatsapp.gateway';
import { WhatsAppService } from '@modules/whatsapp/whatsapp.service';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

// Types
import type { EvaluateRulesRequest, WorkflowStageConfig } from '../../types';
import {
  type ProcessMessageInput,
  type ProcessMessageResult,
  type WorkflowSummary,
  type ChatWorkflowStatus,
  type AiStatusResult,
  AI_CONFIDENCE_THRESHOLD,
  AUTO_HANDOFF_CATEGORIES,
} from '../../types/workflow-engine.types';

// Services
import { HandoffService } from '../handoff.service';
import { ClassificationResult } from '../llm.service';
import { PolicySimulationService } from '../policy-simulation.service';
import { RuleEngineService } from '../rule-engine.service';
import { AiConfigurationService } from '../ai-configuration.service';
import { RateLimiterService } from '../rate-limiter.service';
import { StageService } from '../stage.service';

// Workflow Engine components
import { InteractiveResponseHandler } from './interactive-response.handler';
import { AiResponseGenerator } from './ai-response.generator';
import { WorkflowStatusService } from './workflow-status.service';
import {
  checkHandoffRequest,
  getWhatsAppMediaType,
  getContactLanguage,
} from './workflow-utils';

// Re-export types for backward compatibility
export type {
  ProcessMessageInput,
  ProcessMessageResult,
  WorkflowSummary,
  ChatWorkflowStatus,
};

@Injectable()
export class WorkflowEngineService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    // Core services
    private readonly stageService: StageService,
    private readonly ruleEngineService: RuleEngineService,
    private readonly handoffService: HandoffService,
    private readonly policySimulationService: PolicySimulationService,

    // Workflow engine components
    private readonly interactiveHandler: InteractiveResponseHandler,
    private readonly aiResponseGenerator: AiResponseGenerator,
    private readonly workflowStatusService: WorkflowStatusService,

    // Optional services
    @Optional()
    private readonly whatsappGateway?: WhatsAppGateway,
    @Optional()
    private readonly mediaOrchestratorService?: MediaOrchestratorService,
    @Optional()
    private readonly aiReplyService?: AIReplyService,
    @Optional()
    private readonly interactiveMessageService?: InteractiveMessageService,
    @Optional()
    private readonly aiConfigService?: AiConfigurationService,
    @Optional()
    private readonly rateLimiter?: RateLimiterService,
    @Inject(forwardRef(() => WhatsAppService))
    @Optional()
    private readonly whatsappService?: WhatsAppService,
  ) {}

  onModuleInit(): void {
    this.logger.log('Workflow Engine initialized');
    this.logger.log(
      `[Workflow Engine] MediaOrchestratorService: ${this.mediaOrchestratorService ? 'AVAILABLE' : 'NOT INJECTED'}`,
    );
    this.logger.log(
      `[Workflow Engine] InteractiveMessageService: ${this.interactiveMessageService ? 'AVAILABLE' : 'NOT INJECTED'}`,
    );
  }

  /**
   * Main entry point: Process an incoming message through the workflow
   */
  async processMessage(
    input: ProcessMessageInput,
  ): Promise<ProcessMessageResult> {
    const {
      chatId,
      messageContent,
      userId,
      isFromCustomer,
      interactiveResponse,
    } = input;

    try {
      // Only process customer messages for workflow logic
      if (!isFromCustomer) {
        return { success: true };
      }

      // Step 0: Handle interactive response (button/list clicks) if present
      // This takes priority over normal message processing
      if (interactiveResponse) {
        return this.interactiveHandler.handleInteractiveResponse(
          input,
          interactiveResponse,
        );
      }

      // Step 1: Classify the message using AI
      const classification = await this.aiResponseGenerator.classifyMessage(
        messageContent,
        userId,
      );
      this.logger.debug(
        `Message classified: ${JSON.stringify(classification)}`,
      );

      // Step 2: Check for explicit handoff request
      const handoffRequested = checkHandoffRequest(messageContent);
      if (handoffRequested) {
        await this.handoffService.requestHandoff(userId, {
          chatId,
          reason: 'Customer requested to speak with a human',
          messageId: input.messageId,
        });

        return {
          success: true,
          classification,
          handoffRequested: true,
          aiResponse: {
            content: 'Un momento, te comunico con un agente.',
            confidence: 1.0,
            shouldSend: true,
            requiresHandoff: true,
          },
        };
      }

      // Step 3: Check if AI should respond
      const canAIResult = await this.handoffService.canAISend(chatId);
      const canAI = canAIResult.canSend;

      // Log AI status for debugging
      this.logger.log(
        `[AI Check] Chat ${chatId}: canAI=${canAI}, reason=${canAIResult.reason || 'allowed'}`,
      );

      // RATE LIMIT AUTO-PAUSE LOGIC
      if (!canAI && canAIResult.isRateLimited) {
        this.logger.warn(
          `[Rate Limit] Rate limit exceeded for chat ${chatId}. Pausing AI automatically.`,
        );
        await this.handoffService.pauseAI(chatId, userId);

        // Emit WebSocket event to notify frontend
        this.whatsappGateway?.emitAIRateLimitExceeded({
          chatId,
          currentCount: canAIResult.rateLimitCurrentCount || 0,
          maxCount: canAIResult.rateLimitMaxCount || 0,
          resetTime: canAIResult.rateLimitReset,
        });
      }

      // Step 4: Get current stage assignment
      const currentAssignment = await this.stageService.getChatStage(chatId);
      const currentStageId = currentAssignment?.stageId ?? undefined;

      // Step 5: Evaluate workflow rules for stage transition
      const ruleRequest: EvaluateRulesRequest = {
        chatId,
        messageText: messageContent,
        messageId: input.messageId,
        currentStageId,
      };

      const ruleResult = await this.ruleEngineService.evaluateRules(
        userId,
        ruleRequest,
      );

      let stageTransition: ProcessMessageResult['stageTransition'];

      if (ruleResult.shouldTransition && ruleResult.bestMatch) {
        const targetStage = await this.stageService.getStageById(
          ruleResult.bestMatch.targetStageId,
        );

        if (targetStage) {
          // Perform the transition
          await this.stageService.transitionChat(
            chatId,
            userId,
            ruleResult.bestMatch.targetStageId,
            `Rule matched: ${ruleResult.bestMatch.ruleName}`,
            {
              ruleId: ruleResult.bestMatch.ruleId,
              messageId: input.messageId,
              classification,
            },
          );

          // Get the from stage details
          let fromStage: WorkflowStageConfig | null = null;
          if (currentStageId) {
            fromStage = await this.stageService.getStageById(currentStageId);
          }

          stageTransition = {
            from: fromStage,
            to: targetStage,
            reason: `Rule matched: ${ruleResult.bestMatch.ruleName}`,
            ruleId: ruleResult.bestMatch.ruleId,
            ruleName: ruleResult.bestMatch.ruleName,
          };

          this.logger.log(
            `Chat ${chatId} transitioned from ${fromStage?.name || 'unassigned'} to ${targetStage.name}`,
          );
        }
      }

      // Step 6: Determine AI response (if enabled)
      let aiResponse: ProcessMessageResult['aiResponse'];

      if (canAI) {
        this.logger.log(
          `[AI Response] Generating AI response for chat ${chatId}...`,
        );

        // Emit typing indicator start
        this.whatsappGateway?.emitAITypingStart(chatId);

        // Check for auto-handoff categories
        if (
          classification.category &&
          AUTO_HANDOFF_CATEGORIES.includes(
            classification.category.toLowerCase(),
          )
        ) {
          await this.handoffService.requestHandoff(userId, {
            chatId,
            reason: `High-priority category detected: ${classification.category}`,
            messageId: input.messageId,
          });

          aiResponse = {
            content:
              'Entiendo tu situación. Te comunico con un especialista que podrá ayudarte mejor.',
            confidence: classification.confidence,
            shouldSend: true,
            requiresHandoff: true,
          };
          this.logger.log(
            `[AI Response] Auto-handoff triggered for category: ${classification.category}`,
          );
        } else if (
          classification.confidence < AI_CONFIDENCE_THRESHOLD * 100 &&
          classification.confidence !== 50 // 50 is the default when classification fails - still try to respond
        ) {
          // Low confidence from actual classification - might need handoff
          this.logger.log(
            `[AI Response] Low confidence (${classification.confidence}), requesting handoff`,
          );
          aiResponse = {
            content: '',
            confidence: classification.confidence,
            shouldSend: false,
            requiresHandoff: true,
          };
        } else {
          // Generate AI response - handle AI disabled error gracefully
          try {
            aiResponse = await this.generateFullAIResponse(
              input,
              classification,
              chatId,
              userId,
              messageContent,
            );
          } catch (error: unknown) {
            // Check if AI is disabled for this chat (via chat_ai_overrides)
            if (
              error instanceof Error &&
              error.message === 'AI_DISABLED_FOR_CHAT'
            ) {
              this.logger.log(
                `[AI Response] AI is disabled for chat ${chatId} via configuration`,
              );
              aiResponse = {
                content: '',
                confidence: 0,
                shouldSend: false,
                requiresHandoff: false,
              };
            } else {
              // Log and re-throw other errors
              this.logger.error(
                `[AI Response] Error generating response for chat ${chatId}:`,
                error,
              );
              throw error;
            }
          }
        }
      } else {
        this.logger.log(
          `[AI Response] AI is disabled for chat ${chatId}, skipping response generation`,
        );
      }

      // Step 7: Policy check (non-blocking)
      const policyCheck = await this.runPolicyCheck(
        userId,
        chatId,
        input.senderId,
      );

      return {
        success: true,
        classification,
        stageTransition,
        aiResponse,
        handoffRequested,
        policyCheck,
      };
    } catch (error) {
      this.logger.error(`Error processing message for chat ${chatId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate a full AI response with media and interactive CTAs
   */
  private async generateFullAIResponse(
    input: ProcessMessageInput,
    classification: ClassificationResult,
    chatId: string,
    userId: number,
    messageContent: string,
  ): Promise<ProcessMessageResult['aiResponse']> {
    // STEP 1: Pre-check media availability BEFORE generating AI response
    let mediaPreCheck:
      | {
          willHaveMedia: boolean;
          mediaDescription: string | null;
          mediaType: 'image' | 'video' | 'document' | 'audio' | null;
          mediaFileName: string | null;
          aiInstructions: string | null;
        }
      | undefined;

    // Get conversation message count for guardrails
    const recentMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp))
      .limit(50);

    // Count only AI-generated outbound messages (matching guardrails logic)
    const aiMessageCount = recentMessages.filter(
      (m) => m.direction === 'outbound' && m.isAiGenerated === true,
    ).length;

    const lastOutboundMsg = recentMessages.find(
      (m) => m.direction === 'outbound' && m.isAiGenerated === true,
    );
    const lastMessageHadMedia = Boolean(
      lastOutboundMsg?.type && lastOutboundMsg.type !== 'text',
    );

    const conversationContext = recentMessages
      .slice(-5)
      .reverse()
      .map(
        (m) =>
          `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.text || '[media]'}`,
      )
      .join('\n');

    // Fetch contact's language preference
    const contactLanguage = await getContactLanguage(chatId);

    if (this.mediaOrchestratorService) {
      try {
        this.logger.debug(
          `[Media Pre-check] Checking media availability for chat ${chatId} (language: ${contactLanguage || 'not set'})`,
        );

        const preCheckResult =
          await this.mediaOrchestratorService.preCheckMediaAvailability({
            query: messageContent,
            chatId,
            userId,
            isFirstAiMessage: aiMessageCount === 0,
            lastMessageHadMedia,
            aiMessageCount,
            conversationContext,
            chatLanguage: contactLanguage || undefined,
          });

        if (preCheckResult.willHaveMedia) {
          mediaPreCheck = {
            willHaveMedia: true,
            mediaDescription: preCheckResult.mediaDescription,
            mediaType: preCheckResult.mediaType,
            mediaFileName: preCheckResult.mediaFileName,
            aiInstructions: preCheckResult.aiInstructions,
          };
          this.logger.log(
            `[Media Pre-check] Media WILL be available: ${preCheckResult.mediaType} - ${preCheckResult.mediaDescription}`,
          );
        } else {
          this.logger.debug(
            `[Media Pre-check] No media available: ${preCheckResult.blockedReason}`,
          );
        }
      } catch (preCheckError) {
        this.logger.warn(
          `[Media Pre-check] Error (non-critical): ${(preCheckError as Error).message}`,
        );
      }
    }

    // STEP 2: Generate AI response WITH media context
    this.logger.log(`[AI Response] Calling LLM for chat ${chatId}...`);
    const response = await this.aiResponseGenerator.generateAIResponse(
      chatId,
      messageContent,
      classification,
      userId,
      mediaPreCheck,
    );
    this.logger.log(
      `[AI Response] LLM response received: "${response.substring(0, 100)}..."`,
    );

    // STEP 3: Select the actual media (if pre-check indicated availability)
    let mediaAttachment:
      | {
          mediaId: string;
          objectId: string;
          objectName: string;
          s3Key: string;
          s3Bucket: string;
          fileName: string;
          mimeType: string;
          caption: string | null;
          mediaType: 'image' | 'video' | 'audio' | 'document';
        }
      | undefined;

    if (this.mediaOrchestratorService && mediaPreCheck?.willHaveMedia) {
      try {
        this.logger.debug(
          `[Media Selection] Selecting media for chat ${chatId}`,
        );

        const mediaResult =
          await this.mediaOrchestratorService.selectMediaForReply({
            query: messageContent,
            chatId,
            userId,
            messageId: input.messageId,
            isFirstAiMessage: aiMessageCount === 0,
            lastMessageHadMedia,
            aiMessageCount,
            conversationContext,
            chatLanguage: contactLanguage || undefined,
          });

        if (mediaResult.shouldSendMedia && mediaResult.selectedMedia) {
          const media = mediaResult.selectedMedia;
          this.logger.log(
            `[Media Selection] Selected media ${media.mediaId} (${media.fileName}) for chat ${chatId}`,
          );

          // Convert MIME type to WhatsApp media type
          const mediaType = getWhatsAppMediaType(media.mimeType);

          mediaAttachment = {
            mediaId: media.mediaId,
            objectId: media.objectId,
            objectName: media.objectName,
            s3Key: media.s3Key,
            s3Bucket: media.s3Bucket,
            fileName: media.fileName,
            mimeType: media.mimeType,
            caption: media.caption,
            mediaType,
          };
        } else {
          this.logger.warn(
            `[Media Selection] Pre-check said media available, but selection failed: ${mediaResult.reason}`,
          );
        }
      } catch (mediaError) {
        this.logger.warn(
          `[Media Selection] Error selecting media (non-critical): ${(mediaError as Error).message}`,
        );
        // Continue without media - text response is still valid
      }
    }

    // STEP 4: Generate interactive CTAs for proactive engagement
    let interactiveData: AIReplyInteractiveData | undefined;

    if (this.interactiveMessageService) {
      try {
        this.logger.debug(
          `[Interactive CTAs] Generating CTAs for chat ${chatId}`,
        );

        // Get the customer's last message for context
        const lastInboundMessage = recentMessages
          .filter((m) => m.direction === 'inbound')
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          )[0];

        const ctaResult =
          await this.interactiveMessageService.generateInteractiveCTAs({
            chatId,
            userId,
            conversationContext,
            maxCTAs: 3,
            includeMediaCTAs: true,
            // Dynamic CTA options - enables AI-generated contextual CTAs
            aiResponseText: response,
            customerMessage: lastInboundMessage?.text ?? undefined,
            hasMediaAttachment: !!mediaAttachment,
            mediaType: mediaAttachment?.mediaType,
            businessContext: 'real estate',
          });

        if (
          ctaResult.format !== 'none' &&
          ctaResult.buttons &&
          ctaResult.buttons.length > 0
        ) {
          interactiveData = {
            enabled: true,
            buttons: ctaResult.buttons,
            footerText:
              ctaResult.footerText ||
              this.interactiveMessageService.generateFooterText(
                ctaResult.funnelAnalysis.currentStage,
              ),
            funnelStage: ctaResult.funnelAnalysis.currentStage,
            reasoning: ctaResult.reasoning,
          };

          this.logger.log(
            `[Interactive CTAs] Generated ${ctaResult.buttons.length} CTAs: ${ctaResult.buttons.map((b) => b.title).join(', ')}`,
          );
        } else {
          this.logger.debug(
            `[Interactive CTAs] No CTAs generated: ${ctaResult.reasoning}`,
          );
        }
      } catch (ctaError) {
        this.logger.warn(
          `[Interactive CTAs] Error generating CTAs (non-critical): ${(ctaError as Error).message}`,
        );
        // Continue without interactive CTAs - text response is still valid
      }
    }

    const aiResponse: ProcessMessageResult['aiResponse'] = {
      content: response,
      confidence: classification.confidence,
      shouldSend: true,
      requiresHandoff: false,
      mediaAttachment,
      interactiveData,
    };

    // Check if "Review Before Send" is enabled for this chat
    if (this.aiConfigService && aiResponse.shouldSend && aiResponse.content) {
      const chatOverride = await this.aiConfigService.getChatOverride(chatId);

      if (chatOverride?.reviewBeforeSend) {
        this.logger.log(
          `[AI Response] "Review Before Send" enabled for chat ${chatId}. Emitting pending review event.`,
        );

        // Emit pending review event
        this.whatsappGateway?.emitAIPendingReview({
          chatId,
          content: aiResponse.content,
          mediaAttachment: aiResponse.mediaAttachment,
          interactiveData: aiResponse.interactiveData
            ? {
                type: 'button_reply', // Simplify for now, assuming all interactive are buttons/lists
                buttons: aiResponse.interactiveData.buttons.map((b) => ({
                  id: b.id,
                  title: b.title,
                })),
              }
            : undefined,
        });

        // DO NOT SEND the message
        aiResponse.shouldSend = false;
      }
    }

    return aiResponse;
  }

  /**
   * Run policy checks in background
   */
  private async runPolicyCheck(
    userId: number,
    chatId: string,
    senderId: number,
  ): Promise<{ passed: boolean; warnings: string[] }> {
    try {
      // Run quick simulations
      const scenarios = ['Rate Limit Burst', 'Ban Risk Scenarios'];
      const warnings: string[] = [];

      for (const _scenarioName of scenarios) {
        const result = await this.policySimulationService.runSimulation(
          userId,
          'Quality Rating Decline',
          { chatId, senderId },
        );

        if (!result.passed) {
          warnings.push(...result.recommendations);
        }
      }

      return {
        passed: warnings.length === 0,
        warnings,
      };
    } catch {
      return { passed: true, warnings: [] };
    }
  }

  // ============================================================================
  // Delegated Methods - These delegate to WorkflowStatusService
  // ============================================================================

  /**
   * Get workflow summary for a user/sender
   */
  async getWorkflowSummary(
    userId: number,
    senderId?: number,
  ): Promise<WorkflowSummary> {
    return this.workflowStatusService.getWorkflowSummary(userId, senderId);
  }

  /**
   * Get detailed workflow status for a specific chat
   */
  async getChatWorkflowStatus(
    chatId: string,
    userId: number,
  ): Promise<ChatWorkflowStatus> {
    return this.workflowStatusService.getChatWorkflowStatus(chatId, userId);
  }

  /**
   * Get formatted AI status for a chat
   */
  async getAIStatus(chatId: string): Promise<AiStatusResult> {
    return this.workflowStatusService.getAIStatus(chatId);
  }

  /**
   * Send a reviewed AI response (triggered manually after review)
   */
  async sendReviewedAiResponse(
    userId: number,
    chatId: string,
    content: string,
    mediaAttachment?: any,
    interactiveData?: any,
  ): Promise<void> {
    return this.workflowStatusService.sendReviewedAiResponse(
      userId,
      chatId,
      content,
      mediaAttachment,
      interactiveData,
    );
  }

  /**
   * Regenerate AI response for a chat
   */
  async regenerateResponse(chatId: string): Promise<void> {
    return this.workflowStatusService.regenerateResponse(chatId);
  }

  // ============================================================================
  // Workflow Management Methods
  // ============================================================================

  /**
   * Manually move a chat to a specific stage
   */
  async moveChatToStage(
    chatId: string,
    stageId: string,
    userId: number,
    reason: string,
  ): Promise<boolean> {
    try {
      await this.stageService.transitionChat(chatId, userId, stageId, reason, {
        manual: true,
        triggeredBy: 'user',
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to move chat ${chatId} to stage ${stageId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Initialize workflow for a new chat
   */
  async initializeChatWorkflow(
    chatId: string,
    userId: number,
    options?: {
      initialStageId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    // Get or create default stages
    let stages = await this.stageService.getStages(userId);

    if (stages.length === 0) {
      await this.stageService.initializeDefaultStages(userId);
      stages = await this.stageService.getStages(userId);
    }

    // Determine initial stage
    const initialStageId =
      options?.initialStageId ||
      stages.find((s) => s.isDefault)?.id ||
      stages[0]?.id;

    if (initialStageId) {
      await this.stageService.transitionChat(
        chatId,
        userId,
        initialStageId,
        'Workflow initialized',
        {
          isInitial: true,
          ...options?.metadata,
        },
      );
    }
  }

  /**
   * Bulk classify chats (useful for migration or batch processing)
   */
  async bulkClassifyChats(
    userId: number,
    chatIds: string[],
  ): Promise<Map<string, ClassificationResult>> {
    const results = new Map<string, ClassificationResult>();

    for (const chatId of chatIds) {
      // Get latest customer message
      const [lastCustomerMessage] = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, chatId))
        .orderBy(desc(messages.timestamp))
        .limit(1);

      if (
        lastCustomerMessage?.text &&
        lastCustomerMessage.direction === 'inbound'
      ) {
        const classification = await this.aiResponseGenerator.classifyMessage(
          lastCustomerMessage.text,
          userId,
        );
        results.set(chatId, classification);
      }
    }

    return results;
  }

  /**
   * Helper to check if AI processing should occur for a chat
   */
  async shouldProcessMessage(userId: number, chatId: string): Promise<boolean> {
    // 1. Check if AI is paused/handed off
    const canAIResult = await this.handoffService.canAISend(chatId);
    if (!canAIResult.canSend) {
      return false;
    }

    // 2. Check rate limits if enabled
    if (this.rateLimiter) {
      try {
        // We use checkRateLimit for pre-validation without incrementing
        // The actual increment happens after successful generation/send
        const rateLimitStatus = await this.rateLimiter.checkRateLimit(
          userId,
          chatId,
          { isAiMessage: true },
        );
        if (!rateLimitStatus.allowed) {
          return false;
        }
      } catch (e) {
        this.logger.error(`[RateLimit] Error checking limit for ${chatId}`, e);
        // Fail open or closed? Closed for safety
        return false;
      }
    }

    return true;
  }
}
