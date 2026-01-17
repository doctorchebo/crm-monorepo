/**
 * Interactive Response Handler
 * Handles interactive message responses (button/list clicks) from WhatsApp
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { AIReplyService } from '@modules/ai-reply/services';
import { HandoffService } from '../handoff.service';
import type {
  ProcessMessageInput,
  ProcessMessageResult,
  AiResponseResult,
} from '../../types/workflow-engine.types';

// ============================================================================
// Media Role Descriptions
// ============================================================================

const MEDIA_ROLE_DESCRIPTIONS: Record<string, string> = {
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

@Injectable()
export class InteractiveResponseHandler {
  private readonly logger = new Logger(InteractiveResponseHandler.name);

  constructor(
    private readonly handoffService: HandoffService,
    @Optional()
    private readonly aiReplyService?: AIReplyService,
  ) {}

  /**
   * Handle interactive response (button/list clicks)
   *
   * When a user clicks an interactive button or list item, this method
   * processes the response and generates an appropriate action.
   */
  async handleInteractiveResponse(
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

    // Guard: Check if AI can send messages (paused/disabled/handoff)
    const canAiStatus = await this.handoffService.canAISend(chatId);
    if (!canAiStatus.canSend) {
      this.logger.warn(
        `[Interactive] AI cannot respond to interaction. Reason: ${canAiStatus.reason}`,
      );
      return {
        success: true,
        aiResponse: {
          content: '',
          confidence: 0,
          shouldSend: false,
          requiresHandoff: false,
        },
      };
    }

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
          '¡Perfecto! Para agendar la firma, ¿qué día y horario te convendría mejor?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),

      // Handoff CTA
      talk_to_agent: async () => {
        await this.handoffService.requestHandoff(userId, {
          chatId,
          reason: 'Customer requested to talk to an agent via interactive CTA',
          messageId: input.messageId,
        });
        return {
          content:
            '¡Por supuesto! Te comunico con un agente de nuestro equipo. Un momento, por favor.',
          confidence: 1.0,
          shouldSend: true,
          requiresHandoff: true,
        };
      },

      // Text response CTAs
      compare_options: async () => ({
        content:
          '¡Con gusto te ayudo a comparar opciones! ¿Qué aspectos son más importantes para ti? (precio, ubicación, tamaño, amenidades)',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      answer_questions: async () => ({
        content:
          '¡Claro! Estoy aquí para resolver todas tus dudas. ¿Qué te gustaría saber?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      request_callback: async () => ({
        content:
          'Entendido, un miembro de nuestro equipo te llamará pronto. ¿Cuál es el mejor número y horario para contactarte?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      get_more_info: async () => ({
        content:
          '¿Qué información adicional te gustaría conocer? Puedo ayudarte con precios, disponibilidad, características, ubicación, y más.',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      ask_question: async () => ({
        content: '¡Pregunta lo que quieras! Estoy aquí para ayudarte.',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),

      // Information seeking intents
      request_more_info: async () => ({
        content:
          '¿Qué información adicional te interesa? Puedo compartirte detalles sobre características, precios, amenidades, o ubicación.',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      request_specific_detail: async () => ({
        content:
          '¡Claro! ¿Sobre qué aspecto específico te gustaría más información?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      request_clarification: async () => ({
        content:
          'Con gusto te aclaro cualquier duda. ¿Qué punto te gustaría que te explique mejor?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      request_comparison: async () => ({
        content:
          '¡Por supuesto! ¿Qué opciones te gustaría comparar? Te puedo ayudar con precios, tamaños, ubicaciones o características.',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      request_alternatives: async () => ({
        content:
          '¡Claro! Déjame mostrarte otras opciones disponibles. ¿Tienes alguna preferencia específica?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),

      // Media request intents
      request_photos: async () =>
        this.prepareMediaResponse(['hero_image', 'gallery_image']),
      request_video: async () =>
        this.prepareMediaResponse(['video_tour', 'promotional_video']),
      request_documents: async () =>
        this.prepareMediaResponse(['brochure', 'specification_sheet']),
      request_pricing: async () => this.prepareMediaResponse(['price_sheet']),
      request_floor_plans: async () =>
        this.prepareMediaResponse(['floor_plan']),

      // Action intents
      get_location: async () => this.prepareMediaResponse(['map']),
      contact_agent: async () => {
        await this.handoffService.requestHandoff(userId, {
          chatId,
          reason:
            'Customer requested to contact an agent via interactive intent',
          messageId: input.messageId,
        });
        return {
          content:
            'Te comunico con un agente de inmediato. ¿Hay algo específico que quieras que le mencione?',
          confidence: 1.0,
          shouldSend: true,
          requiresHandoff: true,
        };
      },

      // Conversation flow intents
      explore_topic: async () => ({
        content:
          '¡Con gusto! ¿Qué tema te interesa explorar? Puedo ayudarte con información detallada.',
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
          'Entiendo tu preocupación. ¿Podrías contarme más para poder ayudarte mejor?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
      general_followup: async () => ({
        content: '¿En qué más puedo ayudarte hoy?',
        confidence: 1.0,
        shouldSend: true,
        requiresHandoff: false,
      }),
    };

    // Check if we have a handler for this action
    if (actionId && actionHandlers[actionId]) {
      const aiResponse = await actionHandlers[actionId]();
      return {
        success: true,
        aiResponse,
        handoffRequested: aiResponse?.requiresHandoff,
      };
    }

    // If no specific handler, try to use AIReplyService for dynamic response
    if (this.aiReplyService && actionTitle) {
      this.logger.log(
        `[Interactive] No specific handler for "${actionId}", using AI for dynamic response with context: "${actionTitle}"`,
      );

      try {
        const aiReply = await this.aiReplyService.generateReply({
          chatId,
          userId,
          senderId,
          autoSend: false,
          userPrompt: `The customer clicked a button labeled "${actionTitle}". Respond helpfully to this action.`,
        });

        if (aiReply && aiReply.generatedText) {
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
      } catch (error: unknown) {
        this.logger.warn(
          `[Interactive] Dynamic CTA AI response failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

  /**
   * Prepare a media response based on requested media roles
   */
  private async prepareMediaResponse(
    mediaRoles: string[],
  ): Promise<AiResponseResult> {
    const descriptions = mediaRoles
      .map((role) => MEDIA_ROLE_DESCRIPTIONS[role] || role)
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
}
