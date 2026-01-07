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
 * │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
 * │  │ LLMService  │  │ StageService │  │ RuleEngineService   │  │
 * │  │ - classify  │  │ - CRUD       │  │ - evaluate rules    │  │
 * │  │ - chat      │  │ - transition │  │ - match conditions  │  │
 * │  │ - usage     │  │ - history    │  │ - AI classification │  │
 * │  └─────────────┘  └──────────────┘  └─────────────────────┘  │
 * │  ┌─────────────┐  ┌─────────────────────────────────────────┐│
 * │  │HandoffSvc   │  │ PolicySimulationService                 ││
 * │  │ - request   │  │ - ban risk detection                    ││
 * │  │ - resolve   │  │ - rate limit checks                     ││
 * │  │ - pause/go  │  │ - violation logging                     ││
 * │  └─────────────┘  └─────────────────────────────────────────┘│
 * └──────────────────────────────────────────────────────────────┘
 */

import { db } from '@database/db.connection';
import { chatStageAssignments, contacts, messages } from '@database/schema';
import {
  AIReplyService,
  InteractiveMessageService,
} from '@modules/ai-reply/services';
import { AIReplyInteractiveData } from '@modules/ai-reply/types';
import { RetrievalService } from '@modules/knowledge-base/services';
import { MediaOrchestratorService } from '@modules/knowledge-base/services/media-orchestrator.service';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { EvaluateRulesRequest, WorkflowStageConfig } from '../types';
import { HandoffService } from './handoff.service';
import { ClassificationResult, LLMService } from './llm.service';
import { PolicySimulationService } from './policy-simulation.service';
import { RuleEngineService } from './rule-engine.service';
import { StageService } from './stage.service';

// ============================================================================
// Types
// ============================================================================

export interface ProcessMessageInput {
  chatId: string;
  messageId: string;
  messageContent: string;
  senderId: number;
  userId: number;
  isFromCustomer: boolean;
  /** Interactive response data when user clicks a button or list item */
  interactiveResponse?: {
    type: 'button_reply' | 'list_reply';
    buttonId?: string;
    buttonTitle?: string;
    rowId?: string;
    rowTitle?: string;
    rowDescription?: string;
  };
}

export interface ProcessMessageResult {
  success: boolean;
  classification?: ClassificationResult;
  stageTransition?: {
    from: WorkflowStageConfig | null;
    to: WorkflowStageConfig;
    reason: string;
    ruleId?: string;
    ruleName?: string;
  };
  aiResponse?: {
    content: string;
    confidence: number;
    shouldSend: boolean;
    requiresHandoff: boolean;
    /** Media attachment to send with the response */
    mediaAttachment?: {
      mediaId: string;
      objectId: string;
      objectName: string;
      s3Key: string;
      s3Bucket: string;
      fileName: string;
      mimeType: string;
      caption: string | null;
      mediaType: 'image' | 'video' | 'audio' | 'document';
    };
    /** Interactive CTA data for the response (dynamic buttons) */
    interactiveData?: AIReplyInteractiveData;
  };
  handoffRequested?: boolean;
  policyCheck?: {
    passed: boolean;
    warnings: string[];
  };
  error?: string;
}

export interface WorkflowSummary {
  totalChats: number;
  byStage: Array<{
    stageId: string;
    stageName: string;
    count: number;
    color: string;
  }>;
  pendingHandoffs: number;
  aiPaused: number;
  recentTransitions: number;
}

export interface ChatWorkflowStatus {
  chatId: string;
  currentStage: WorkflowStageConfig | null;
  handoffStatus: {
    isPending: boolean;
    requestedAt?: Date;
    reason?: string;
  };
  aiEnabled: boolean;
  lastTransition?: {
    from: string;
    to: string;
    reason: string;
    timestamp: Date;
  };
  classification?: ClassificationResult;
}

// ============================================================================
// Configuration
// ============================================================================

const AI_CONFIDENCE_THRESHOLD = 0.7;
const AUTO_HANDOFF_CATEGORIES = ['complaint', 'urgent', 'legal', 'refund'];
const HANDOFF_KEYWORDS = [
  'hablar con humano',
  'agente',
  'persona real',
  'speak to human',
  'real person',
];

@Injectable()
export class WorkflowEngineService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    private readonly llmService: LLMService,
    private readonly stageService: StageService,
    private readonly ruleEngineService: RuleEngineService,
    private readonly handoffService: HandoffService,
    private readonly policySimulationService: PolicySimulationService,
    private readonly retrievalService: RetrievalService,
    @Optional()
    private readonly mediaOrchestratorService?: MediaOrchestratorService,
    @Optional()
    private readonly aiReplyService?: AIReplyService,
    @Optional()
    private readonly interactiveMessageService?: InteractiveMessageService,
  ) {}

  async onModuleInit(): Promise<void> {
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
        return this.handleInteractiveResponse(input, interactiveResponse);
      }

      // Step 1: Classify the message using AI
      const classification = await this.classifyMessage(messageContent, userId);
      this.logger.debug(
        `Message classified: ${JSON.stringify(classification)}`,
      );

      // Step 2: Check for explicit handoff request
      const handoffRequested = this.checkHandoffRequest(messageContent);
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
            // STEP 1: Pre-check media availability BEFORE generating AI response
            // This allows the AI to know it will have media to send
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
            const contactLanguage = await this.getContactLanguage(chatId);

            if (this.mediaOrchestratorService) {
              try {
                this.logger.debug(
                  `[Media Pre-check] Checking media availability for chat ${chatId} (language: ${contactLanguage || 'not set'})`,
                );

                const preCheckResult =
                  await this.mediaOrchestratorService.preCheckMediaAvailability(
                    {
                      query: messageContent,
                      chatId,
                      userId,
                      isFirstAiMessage: aiMessageCount === 0,
                      lastMessageHadMedia,
                      aiMessageCount,
                      conversationContext,
                      chatLanguage: contactLanguage || undefined,
                    },
                  );

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
                  `[Media Pre-check] Error (non-critical): ${preCheckError.message}`,
                );
              }
            }

            // STEP 2: Generate AI response WITH media context
            this.logger.log(`[AI Response] Calling LLM for chat ${chatId}...`);
            const response = await this.generateAIResponse(
              chatId,
              messageContent,
              classification,
              userId,
              mediaPreCheck, // Pass media context to AI
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
                  const mediaType = this.getWhatsAppMediaType(media.mimeType);

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
                  `[Media Selection] Error selecting media (non-critical): ${mediaError.message}`,
                );
                // Continue without media - text response is still valid
              }
            }

            // STEP 4: Generate interactive CTAs for proactive engagement
            // This creates dynamic follow-up suggestions like ChatGPT does after every response
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
                      new Date(b.timestamp).getTime() -
                      new Date(a.timestamp).getTime(),
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
                  `[Interactive CTAs] Error generating CTAs (non-critical): ${ctaError.message}`,
                );
                // Continue without interactive CTAs - text response is still valid
              }
            }

            aiResponse = {
              content: response,
              confidence: classification.confidence,
              shouldSend: true,
              requiresHandoff: false,
              mediaAttachment,
              interactiveData,
            };
          } catch (error) {
            // Check if AI is disabled for this chat (via chat_ai_overrides)
            if (error?.message === 'AI_DISABLED_FOR_CHAT') {
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
   * Handle interactive response (button/list clicks)
   *
   * When a user clicks an interactive button or list item, this method
   * processes the response and generates an appropriate action.
   */
  private async handleInteractiveResponse(
    input: ProcessMessageInput,
    interactiveResponse: NonNullable<
      ProcessMessageInput['interactiveResponse']
    >,
  ): Promise<ProcessMessageResult> {
    const { chatId, userId, senderId } = input;
    const actionId = interactiveResponse.buttonId || interactiveResponse.rowId;
    const actionTitle =
      interactiveResponse.buttonTitle || interactiveResponse.rowTitle;

    this.logger.log(
      `[Interactive] Processing ${interactiveResponse.type}: id=${actionId}, title=${actionTitle}`,
    );

    // Map action IDs to response types
    const actionHandlers: Record<
      string,
      () => Promise<ProcessMessageResult['aiResponse']>
    > = {
      // Media CTAs - send specific media
      send_brochure: async () => this.prepareMediaResponse(['brochure']),
      send_price_sheet: async () => this.prepareMediaResponse(['price_sheet']),
      send_photos: async () =>
        this.prepareMediaResponse(['hero_image', 'gallery_image']),
      send_video_tour: async () =>
        this.prepareMediaResponse(['video_tour', 'promotional_video']),
      send_floor_plan: async () => this.prepareMediaResponse(['floor_plan']),
      send_specifications: async () =>
        this.prepareMediaResponse(['specification_sheet']),
      send_overview: async () =>
        this.prepareMediaResponse(['brochure', 'hero_image']),
      send_location_info: async () =>
        this.prepareMediaResponse(['map', 'gallery_image']),
      send_proposal: async () =>
        this.prepareMediaResponse(['brochure', 'specification_sheet']),
      send_contract: async () => this.prepareMediaResponse(['legal_document']),

      // Scheduling CTAs
      schedule_viewing: async () => ({
        content:
          '¡Excelente! Me encantaría programar una visita para ti. ¿Qué fechas y horarios te funcionan mejor?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      schedule_call: async () => ({
        content:
          'Con gusto te agendo una llamada con nuestro equipo. ¿Cuál es el mejor horario para contactarte?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      schedule_signing: async () => ({
        content:
          '¡Perfecto! Vamos a agendar la firma del contrato. ¿Qué fechas tienes disponibles?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),

      // Handoff CTA
      talk_to_agent: async () => {
        await this.handoffService.requestHandoff(userId, {
          chatId,
          reason: 'Customer requested to speak with an agent via CTA button',
          messageId: input.messageId,
        });
        return {
          content:
            'Te comunico con uno de nuestros representantes de ventas. Un momento por favor.',
          confidence: 1.0,
          shouldSend: true,
          requiresHandoff: true,
        };
      },

      // Text response CTAs
      compare_options: async () => ({
        content:
          'Con gusto te ayudo a comparar nuestras opciones disponibles. ¿Qué aspectos específicos te gustaría comparar? (por ejemplo: precio, tamaño, ubicación, amenidades)',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      answer_questions: async () => ({
        content:
          '¡Por supuesto! ¿Qué preguntas tienes? Estoy aquí para ayudarte con cualquier detalle sobre nuestras propiedades.',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      request_callback: async () => ({
        content:
          'Te agendo una llamada de vuelta. ¿Cuál es tu número de contacto preferido y el mejor horario para llamarte?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      get_more_info: async () => ({
        content: '¿Qué información específica te gustaría conocer más?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      ask_question: async () => ({
        content:
          'Claro, adelante con tu pregunta. ¡Haré lo posible por ayudarte!',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),

      // ========================================================================
      // DYNAMIC CTA INTENT HANDLERS
      // These handle clicks on AI-generated contextual CTAs
      // ========================================================================

      // Information seeking intents
      request_more_info: async () => ({
        content: '¿Qué información específica te gustaría conocer más?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      request_specific_detail: async () => ({
        content:
          '¿Qué detalle específico te gustaría que te explique con más profundidad?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      request_clarification: async () => ({
        content:
          '¡Por supuesto! ¿Qué punto te gustaría que te aclare o explique mejor?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      request_comparison: async () => ({
        content:
          'Con gusto te ayudo a comparar opciones. ¿Qué características o aspectos te gustaría comparar?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      request_alternatives: async () => ({
        content:
          '¿Te gustaría conocer otras alternativas? ¿Tienes algún requisito específico que debamos considerar?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),

      // Media request intents
      request_photos: async () =>
        this.prepareMediaResponse(['hero_image', 'gallery_image']),
      request_video: async () =>
        this.prepareMediaResponse(['video_tour', 'promotional_video']),
      request_documents: async () => this.prepareMediaResponse(['brochure']),
      request_pricing: async () => this.prepareMediaResponse(['price_sheet']),
      request_floor_plans: async () =>
        this.prepareMediaResponse(['floor_plan']),

      // Action intents
      get_location: async () =>
        this.prepareMediaResponse(['map', 'gallery_image']),
      contact_agent: async () => {
        await this.handoffService.requestHandoff(userId, {
          chatId,
          reason:
            'Customer requested to contact an agent via dynamic CTA button',
          messageId: input.messageId,
        });
        return {
          content:
            'Te comunico con uno de nuestros representantes. Un momento por favor.',
          confidence: 1.0,
          shouldSend: true,
          requiresHandoff: true,
        };
      },

      // Conversation flow intents
      explore_topic: async () => ({
        content:
          '¿Qué aspecto de este tema te gustaría explorar con más detalle?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      confirm_interest: async () => ({
        content:
          '¡Excelente! Me alegra que estés interesado. ¿Cuál sería el siguiente paso que te gustaría dar?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      express_concern: async () => ({
        content:
          'Entiendo que tengas algunas inquietudes. ¿Qué te preocupa específicamente? Estoy aquí para ayudarte a resolver cualquier duda.',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      general_followup: async () => ({
        content: '¿En qué más puedo ayudarte?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
    };

    // Find and execute the handler
    const handler = actionId ? actionHandlers[actionId] : undefined;

    if (handler) {
      const aiResponse = await handler();
      return {
        success: true,
        aiResponse,
        handoffRequested: aiResponse?.requiresHandoff,
      };
    }

    // Check if this is a dynamic CTA that should be processed as a user query
    // Dynamic CTAs have IDs that start with 'dynamic_cta_' or 'fallback_'
    // In these cases, treat the button title as the user's intent
    if (
      actionId &&
      (actionId.startsWith('dynamic_cta_') || actionId.startsWith('fallback_'))
    ) {
      this.logger.log(
        `[Interactive] Dynamic CTA clicked: "${actionTitle}". Generating contextual response.`,
      );

      // Generate an AI response based on the button title as user input
      // This effectively converts the button click into a natural conversation
      if (this.aiReplyService) {
        try {
          const aiReply = await this.aiReplyService.generateReply({
            chatId,
            userId,
            senderId,
            userPrompt: actionTitle || 'Tell me more', // Use button title as user's query
            autoSend: false, // Don't auto-send, let the workflow handle it
            includeMedia: true,
            includeInteractiveCTAs: true,
          });

          if (aiReply.success && aiReply.generatedText) {
            return {
              success: true,
              aiResponse: {
                content: aiReply.generatedText,
                confidence: 1.0,
                shouldSend: true,
                requiresHandoff: false,
                // Map media attachment if present
                mediaAttachment: aiReply.mediaAttachment
                  ? {
                      mediaId: aiReply.mediaAttachment.mediaId,
                      objectId: aiReply.mediaAttachment.objectId,
                      objectName: aiReply.mediaAttachment.objectName,
                      s3Key: aiReply.mediaAttachment.s3Key,
                      s3Bucket: aiReply.mediaAttachment.s3Bucket,
                      fileName: aiReply.mediaAttachment.fileName,
                      mimeType: aiReply.mediaAttachment.mimeType,
                      caption: aiReply.mediaAttachment.caption ?? null,
                      mediaType: aiReply.mediaAttachment.whatsAppMediaType as
                        | 'image'
                        | 'video'
                        | 'audio'
                        | 'document',
                    }
                  : undefined,
                interactiveData: aiReply.interactiveData,
              },
            };
          }
        } catch (error) {
          this.logger.warn(
            `[Interactive] Dynamic CTA AI response failed: ${error.message}`,
          );
        }
      }

      // Fallback if AI response fails or service not available
      return {
        success: true,
        aiResponse: {
          content: `¡Con gusto te ayudo con eso! ¿Podrías darme más detalles sobre "${actionTitle}"?`,
          confidence: 0.8,
          shouldSend: true,
          requiresHandoff: false,
        },
      };
    }

    // Default response for unknown actions
    this.logger.warn(
      `[Interactive] Unknown action ID: ${actionId}. Generating generic response.`,
    );
    return {
      success: true,
      aiResponse: {
        content: '¡Gracias por tu interés! ¿En qué más puedo ayudarte?',
        confidence: 0.8,
        shouldSend: true,
        requiresHandoff: false,
      },
    };
  }

  /**
   * Prepare a media response based on requested media roles
   */
  private async prepareMediaResponse(
    mediaRoles: string[],
  ): Promise<ProcessMessageResult['aiResponse']> {
    // For now, return a text response indicating media will be sent
    // The actual media selection happens in the WhatsApp service layer
    // This could be enhanced to pre-select media and include it in the response
    const roleDescriptions: Record<string, string> = {
      brochure: 'el brochure',
      price_sheet: 'la lista de precios',
      hero_image: 'fotos destacadas',
      gallery_image: 'fotos de la galería',
      video_tour: 'el video tour',
      promotional_video: 'el video promocional',
      floor_plan: 'el plano',
      specification_sheet: 'las especificaciones',
      map: 'el mapa de ubicación',
      legal_document: 'el documento',
    };

    const descriptions = mediaRoles
      .map((role) => roleDescriptions[role] || role)
      .join(' y ');

    return {
      content: `Aquí te envío ${descriptions}. ¿Te gustaría saber algo más?`,
      confidence: 1.0,
      shouldSend: true,
      requiresHandoff: false,
      // Note: mediaAttachment would be populated by MediaOrchestratorService
      // when this response is processed in WhatsApp service
    };
  }

  /**
   * Classify a message using AI
   */
  private async classifyMessage(
    content: string,
    userId: number,
  ): Promise<ClassificationResult> {
    try {
      const result = await this.llmService.classifyMessage(
        content,
        {},
        { userId },
      );
      return result;
    } catch (error) {
      this.logger.warn('Failed to classify message, using defaults');
      return {
        category: 'general',
        sentiment: 'neutral',
        sentimentScore: 0,
        keywords: [],
        confidence: 50,
        requiresHandoff: false,
      };
    }
  }

  /**
   * Generate AI response based on context
   * Includes Knowledge Base retrieval for relevant information
   * Now includes media context so AI knows when media will be attached
   */
  private async generateAIResponse(
    chatId: string,
    customerMessage: string,
    classification: ClassificationResult,
    userId: number,
    mediaContext?: {
      willHaveMedia: boolean;
      mediaDescription: string | null;
      mediaType: 'image' | 'video' | 'document' | 'audio' | null;
      mediaFileName: string | null;
      aiInstructions: string | null;
    },
  ): Promise<string> {
    // Get conversation history
    const recentMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp))
      .limit(10);

    // Get current stage for context
    const stageAssignment = await this.stageService.getChatStage(chatId);
    let stageName = 'New';
    if (stageAssignment?.stageId) {
      const stage = await this.stageService.getStageById(
        stageAssignment.stageId,
      );
      stageName = stage?.name || 'Unknown';
    }

    // Build conversation context for KB retrieval
    // This helps match generic queries like "what's the price?" to specific KB items
    const conversationContext =
      this.buildConversationContextForRetrieval(recentMessages);

    // Retrieve relevant knowledge from KB
    let knowledgeContext = '';
    let hasKnowledgeBase = false;
    try {
      const kbResponse = await this.retrievalService.retrieveByObject(
        userId,
        customerMessage,
        {
          topK: 5,
          minSimilarity: 0.15, // Lower threshold for text-embedding-3-large with 1536 dims
          conversationContext, // Include conversation context for better matching
        },
      );

      if (kbResponse.results.length > 0) {
        hasKnowledgeBase = true;
        this.logger.log(
          `[KB Retrieval] Found ${kbResponse.results.length} relevant KB results for query: "${customerMessage.substring(0, 50)}..."`,
        );

        // Format KB results into structured context with clear data sections
        const kbContextParts = kbResponse.results.map((result, index) => {
          // Log each result for debugging
          this.logger.debug(
            `[KB Result ${index + 1}] ${result.objectName} (similarity: ${result.similarity.toFixed(3)}): ${result.content.substring(0, 100)}...`,
          );
          return `### ${result.templateName}: ${result.objectName}\n${result.content}`;
        });

        knowledgeContext = `

==========================================================================
KNOWLEDGE BASE DATA - USE THIS INFORMATION TO ANSWER THE CUSTOMER
==========================================================================

${kbContextParts.join('\n\n---\n\n')}

==========================================================================
END OF KNOWLEDGE BASE DATA
==========================================================================`;
      } else {
        this.logger.debug(
          `[KB Retrieval] No KB results found for query: "${customerMessage.substring(0, 50)}..."`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `[KB Retrieval] Failed to retrieve KB context: ${error.message}`,
      );
      // Continue without KB context - don't fail the response
    }

    // Build system prompt with explicit instructions for KB data usage and media context
    const systemPrompt = this.buildSystemPrompt(
      stageName,
      classification,
      knowledgeContext,
      hasKnowledgeBase,
      mediaContext,
    );

    // Build context messages
    const chatMessages = [
      {
        role: 'system' as const,
        content: systemPrompt,
      },
      ...recentMessages.reverse().map((msg) => ({
        role: (msg.direction === 'outbound' ? 'assistant' : 'user') as
          | 'assistant'
          | 'user',
        content: msg.text || '',
      })),
      {
        role: 'user' as const,
        content: customerMessage,
      },
    ];

    const response = await this.llmService.chat({
      userId,
      chatId,
      operationType: 'chat',
      messages: chatMessages,
      maxTokens: 512, // Increased to allow for more detailed responses with KB data
      temperature: 0.7,
    });

    return response.content;
  }

  /**
   * Build the system prompt for AI responses
   * Includes specific instructions based on whether KB data and media are available
   */
  private buildSystemPrompt(
    stageName: string,
    classification: ClassificationResult,
    knowledgeContext: string,
    hasKnowledgeBase: boolean,
    mediaContext?: {
      willHaveMedia: boolean;
      mediaDescription: string | null;
      mediaType: 'image' | 'video' | 'document' | 'audio' | null;
      mediaFileName: string | null;
      aiInstructions: string | null;
    },
  ): string {
    const basePrompt = `You are a friendly and professional sales assistant.
The customer is in the "${stageName}" stage of the process.
Message classification: category=${classification.category}, intent=${classification.intent || 'unknown'}, sentiment=${classification.sentiment}.`;

    // Build media context instructions if media will be attached
    let mediaInstructions = '';
    if (mediaContext?.willHaveMedia && mediaContext.mediaType) {
      const mediaTypeLabel = this.getMediaTypeLabel(mediaContext.mediaType);

      // Include AI instructions if available
      const aiGuidance = mediaContext.aiInstructions
        ? `\nWHEN TO SEND THIS MEDIA: ${mediaContext.aiInstructions}`
        : '';

      mediaInstructions = `

==========================================================================
MEDIA ATTACHMENT - IMPORTANT
==========================================================================

A ${mediaTypeLabel} WILL be automatically attached to your response.
Media: "${mediaContext.mediaDescription || mediaContext.mediaFileName}"${aiGuidance}

CRITICAL INSTRUCTIONS FOR MEDIA:
1. DO NOT say you "cannot provide images" or "cannot send attachments" - YOU ARE SENDING ONE.
2. DO NOT say "I'll have an agent send you an image" - YOU ARE SENDING IT NOW.
3. Reference the attached ${mediaTypeLabel} naturally in your response.
4. Examples of good responses with ${mediaTypeLabel}:
   - "Here's the ${mediaTypeLabel} you requested..."
   - "I'm sharing a ${mediaTypeLabel} that shows..."
   - "Please see the attached ${mediaTypeLabel} for..."
   - "Take a look at this ${mediaTypeLabel}..."
5. Keep your text response concise since the ${mediaTypeLabel} provides visual context.${
        mediaContext.aiInstructions
          ? `
6. Follow the "WHEN TO SEND THIS MEDIA" guidance above to determine if this media is appropriate for the current conversation context.`
          : ''
      }
==========================================================================`;
    }

    if (hasKnowledgeBase) {
      return `${basePrompt}
${mediaInstructions}

CRITICAL INSTRUCTIONS - READ CAREFULLY:
1. KNOWLEDGE BASE DATA IS PROVIDED BELOW. You MUST use this data to answer the customer's question.
2. Include SPECIFIC details from the knowledge base: prices, locations, features, amenities, areas, etc.
3. DO NOT say "I cannot provide specific details" if the data is in the knowledge base below.
4. DO NOT say "an agent will provide more details" if the information is already available below.
5. Format your response clearly with the actual data values from the knowledge base.
6. If asked about price, location, bedrooms, amenities, or features - QUOTE THE EXACT VALUES from the data.
7. Be helpful and comprehensive - share all relevant information the customer might need.

RESPONSE FORMAT:
- Be conversational but informative
- Include specific numbers, prices, locations when available
- If multiple properties/items match, briefly mention each with key details
${knowledgeContext}`;
    }

    // No KB data available
    return `${basePrompt}
${mediaInstructions}

INSTRUCTIONS:
1. No specific product/service information is available in the knowledge base for this query.
2. Provide a helpful general response.
${!mediaContext?.willHaveMedia ? "3. If the customer is asking for specific details you don't have, let them know an agent will contact them shortly with more information." : "3. Use the attached media to help answer the customer's query."}
4. Keep responses friendly and professional.`;
  }

  /**
   * Get a human-readable label for media type
   */
  private getMediaTypeLabel(
    mediaType: 'image' | 'video' | 'document' | 'audio',
  ): string {
    switch (mediaType) {
      case 'image':
        return 'image';
      case 'video':
        return 'video';
      case 'audio':
        return 'audio file';
      case 'document':
        return 'document';
      default:
        return 'file';
    }
  }

  /**
   * Build conversation context for KB retrieval.
   * Extracts relevant information from recent messages to help match
   * generic queries (like "what's the price?") to specific KB items.
   */
  private buildConversationContextForRetrieval(
    recentMessages: Array<{ text: string | null; direction: string }>,
  ): string {
    if (!recentMessages || recentMessages.length === 0) {
      return '';
    }

    // Focus on the most recent messages that might contain entity mentions
    const relevantMessages = recentMessages
      .filter((msg) => msg.text && msg.text.length > 5)
      .slice(0, 6) // Last 6 messages
      .map((msg) => {
        const prefix = msg.direction === 'outbound' ? 'Assistant' : 'Customer';
        return `${prefix}: ${msg.text}`;
      });

    return relevantMessages.join('\n');
  }

  /**
   * Check if message contains explicit handoff request
   */
  private checkHandoffRequest(content: string): boolean {
    const lowerContent = content.toLowerCase();
    return HANDOFF_KEYWORDS.some((keyword) => lowerContent.includes(keyword));
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

      for (const scenarioName of scenarios) {
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

  /**
   * Get workflow summary for a user/sender
   */
  async getWorkflowSummary(
    userId: number,
    senderId?: number,
  ): Promise<WorkflowSummary> {
    // Get all stages
    const stages = await this.stageService.getStages(userId);

    // Get stage assignments count - note: chatStageAssignments doesn't have userId
    // We need to get all assignments and filter by stage
    let allAssignments: any[] = [];
    try {
      allAssignments = await db.select().from(chatStageAssignments);
    } catch (error) {
      this.logger.debug(`Could not query stage assignments: ${error}`);
    }

    // Count by stage (only stages belonging to this user)
    const stageIds = new Set(stages.map((s) => s.id));
    const userAssignments = allAssignments.filter(
      (a) => a.stageId && stageIds.has(a.stageId),
    );

    // Count by stage
    const byStage = stages.map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      count: userAssignments.filter((a) => a.stageId === stage.id).length,
      color: stage.color,
    }));

    // Get pending handoffs
    const pendingHandoffs =
      await this.handoffService.getChatsAwaitingHandoff(userId);

    // Get AI paused count
    const aiPausedAssignments = userAssignments.filter(
      (a) => a.aiPaused === true,
    );

    // Get recent transitions (last 24h)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentTransitions = userAssignments.filter(
      (a) => a.updatedAt && new Date(a.updatedAt) > yesterday,
    ).length;

    return {
      totalChats: userAssignments.length,
      byStage,
      pendingHandoffs: pendingHandoffs.length,
      aiPaused: aiPausedAssignments.length,
      recentTransitions,
    };
  }

  /**
   * Get detailed workflow status for a specific chat
   */
  async getChatWorkflowStatus(
    chatId: string,
    userId: number,
  ): Promise<ChatWorkflowStatus> {
    // Get current stage
    const assignment = await this.stageService.getChatStage(chatId);
    let currentStage: WorkflowStageConfig | null = null;

    if (assignment?.stageId) {
      currentStage = await this.stageService.getStageById(assignment.stageId);
    }

    // Get handoff status
    const pendingHandoffs =
      await this.handoffService.getChatsAwaitingHandoff(userId);
    const handoff = pendingHandoffs.find((h) => h.chatId === chatId);

    // Check AI status
    const canAIResult = await this.handoffService.canAISend(chatId);

    // Get last classification from recent message processing
    const [lastMessage] = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp))
      .limit(1);

    let classification: ClassificationResult | undefined;
    if (lastMessage?.text && lastMessage.direction === 'inbound') {
      classification = await this.classifyMessage(lastMessage.text, userId);
    }

    return {
      chatId,
      currentStage,
      handoffStatus: {
        isPending: !!handoff,
        requestedAt: handoff?.handoffRequestedAt || undefined,
        reason: handoff?.handoffReason || undefined,
      },
      aiEnabled: canAIResult.canSend,
      lastTransition: assignment?.updatedAt
        ? {
            from: 'Previous',
            to: currentStage?.name || 'Unknown',
            reason: 'Stage transition',
            timestamp: new Date(assignment.updatedAt),
          }
        : undefined,
      classification,
    };
  }

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
        const classification = await this.classifyMessage(
          lastCustomerMessage.text,
          userId,
        );
        results.set(chatId, classification);
      }
    }

    return results;
  }

  /**
   * Get contact's preferred language for a chat
   * Fetches the contact by participant phone and returns their language preference
   */
  private async getContactLanguage(chatId: string): Promise<string | null> {
    try {
      // Get the most recent inbound message to find the contact's phone number
      const recentInboundMsg = await db
        .select({ sender: messages.sender })
        .from(messages)
        .where(eq(messages.chatId, chatId))
        .orderBy(desc(messages.timestamp))
        .limit(1);

      if (!recentInboundMsg || recentInboundMsg.length === 0) {
        return null;
      }

      // Fetch contact by phone number
      const contactRecord = await db
        .select({ language: contacts.language })
        .from(contacts)
        .where(eq(contacts.phoneNumber, recentInboundMsg[0].sender))
        .limit(1);

      return contactRecord?.[0]?.language || null;
    } catch (error) {
      this.logger.warn(
        `[Contact Language] Failed to fetch language for chat ${chatId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Convert MIME type to WhatsApp media type
   */
  private getWhatsAppMediaType(
    mimeType: string,
  ): 'image' | 'video' | 'audio' | 'document' {
    if (mimeType.startsWith('image/')) {
      return 'image';
    }
    if (mimeType.startsWith('video/')) {
      return 'video';
    }
    if (mimeType.startsWith('audio/')) {
      return 'audio';
    }
    // Everything else (PDF, docs, etc.) is a document
    return 'document';
  }
}
