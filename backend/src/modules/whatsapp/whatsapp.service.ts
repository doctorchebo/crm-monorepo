import { db } from '@database/db.connection';
import {
  Chat,
  chats,
  contacts,
  customerReactions,
  Message,
  messages,
  senders,
  teamMembers,
  templateLocales,
  templateMedia,
} from '@database/schema';
import { AiChatbotService } from '@modules/ai-chatbot/services/ai-chatbot.service';
import { RateLimiterService } from '@modules/ai-chatbot/services/rate-limiter.service';
import { MessageMemoryIntegration } from '@modules/ai-memory/services/message-memory-integration.service';
import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { MetaCloudAPIConfigService } from '@shared/services/meta-cloud-api.config';
import { S3Service } from '@shared/services/s3.service';
import { withRetry } from '@shared/utils/retry.util';
import { and, asc, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import { ChatVisibilityService } from '../chats/services/chat-visibility.service';
import { reactionsGatewayInstance } from '../reactions/reactions.gateway';
import { MessagingProviderFactory } from '../templates/providers/provider.factory';
import { TemplateParserService } from '../templates/services/template-parser.service';
import { TemplatesService } from '../templates/services/templates.service';
import { VariableResolutionService } from '../templates/services/variable-resolution.service';
import { ThumbnailQueueService } from '../thumbnail/thumbnail-queue.service';
import {
  supportsThumbnail,
  ThumbnailJobData,
} from '../thumbnail/thumbnail.types';
import {
  INTERACTIVE_MESSAGE_ERRORS,
  sanitizeFooterText,
  validateListMessage,
  validateReplyButtonMessage,
} from './constants';
import { OutboundMessageDto } from './dto/outbound-message.dto';
import { SendTemplateDto } from './dto/send-template.dto';
import { AudioConverterService } from './services/audio-converter.service';
import { ConversationWindowService } from './services/conversation-window.service';
import { MediaService } from './services/media.service';
import {
  CloudAPIInboundMessage,
  CloudAPISendMessageResponse,
  CloudAPIWebhookPayload,
  MediaMetadata,
  NormalizedCloudAPIMessage,
} from './types/cloud-api.types';
import { generateReplyPreview, ReplyPreview } from './types/reply.types';
import {
  buildCloudAPIUrl,
  cleanPhoneNumber,
  extractWebhookUpdates,
  generateChatId,
  getCloudAPIHeaders,
  mapCloudAPIMessageType,
  mapCloudAPIStatus,
  parseWebhookPayload,
  validateCloudAPIMessage,
  verifyWebhookSignature,
} from './utils/cloud-api.utils';
import { whatsAppGatewayInstance } from './whatsapp.gateway';

/**
 * WhatsApp Cloud API Service
 * Replaces Twilio integration with direct WhatsApp Business Cloud API
 *
 * Features:
 * - Send text and media messages via Cloud API
 * - Receive and store inbound messages and media
 * - Track message delivery status
 * - Handle webhook verification
 * - Support for future chat history sync
 */
@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);

  private readonly metaAccessToken: string;
  private readonly metaVerifyToken: string;
  private readonly metaAppSecret: string | undefined;
  private readonly wabaId: string | undefined;

  private aiChatbot: AiChatbotService;
  private templatesService: TemplatesService;
  private providerFactory: MessagingProviderFactory;
  private variableResolutionService: VariableResolutionService;
  private templateParserService: TemplateParserService;

  constructor(
    private configService: ConfigService,
    private metaCloudAPIConfig: MetaCloudAPIConfigService,
    private mediaService: MediaService,
    private thumbnailQueueService: ThumbnailQueueService,
    private audioConverterService: AudioConverterService,
    private s3Service: S3Service,
    private conversationWindowService: ConversationWindowService,
    private rateLimiter: RateLimiterService,
    private moduleRef: ModuleRef,
    @Optional() private memoryIntegration: MessageMemoryIntegration,
    @Inject(forwardRef(() => ChatVisibilityService))
    private chatVisibilityService: ChatVisibilityService,
  ) {
    this.metaAccessToken =
      this.configService.getOrThrow<string>('META_ACCESS_TOKEN');
    this.metaVerifyToken =
      this.configService.getOrThrow<string>('META_VERIFY_TOKEN');
    this.metaAppSecret = this.configService.get<string>('META_APP_SECRET');
    this.wabaId = this.configService.get<string>('META_WABA_ID');

    if (!this.metaAccessToken || !this.metaVerifyToken) {
      this.logger.error('Missing required Meta Cloud API credentials');
      throw new Error('Missing META_ACCESS_TOKEN, or META_VERIFY_TOKEN');
    }

    this.logger.log('Cloud API Service initialized');
  }

  // ... (previous methods)

  // getChats removed via architectural unification. Use ChatsService.findByTeam() instead.

  async onModuleInit() {
    try {
      this.aiChatbot = await this.moduleRef.get(AiChatbotService, {
        strict: false,
      });
    } catch (error) {
      this.logger.warn(
        'Failed to resolve AiChatbotService lazily - this is expected in some test environments',
      );
    }

    // Lazy-resolve template services from TemplatesModule (imported via forwardRef)
    this.resolveTemplateServices();
  }

  /**
   * Resolve template-related services from the NestJS DI container.
   * These are imported via forwardRef(() => TemplatesModule) to avoid
   * circular dependency issues.
   */
  private resolveTemplateServices(): void {
    try {
      this.templatesService = this.moduleRef.get(TemplatesService, {
        strict: false,
      });
    } catch (error) {
      this.logger.warn(`Could not resolve TemplatesService: ${error.message}`);
    }

    try {
      this.providerFactory = this.moduleRef.get(MessagingProviderFactory, {
        strict: false,
      });
    } catch (error) {
      this.logger.warn(
        `Could not resolve MessagingProviderFactory: ${error.message}`,
      );
    }

    try {
      this.variableResolutionService = this.moduleRef.get(
        VariableResolutionService,
        { strict: false },
      );
    } catch (error) {
      this.logger.warn(
        `Could not resolve VariableResolutionService: ${error.message}`,
      );
    }

    try {
      this.templateParserService = this.moduleRef.get(TemplateParserService, {
        strict: false,
      });
    } catch (error) {
      this.logger.warn(
        `Could not resolve TemplateParserService: ${error.message}`,
      );
    }
  }

  /**
   * Verify webhook challenge from Meta
   * Meta sends GET request with hub.mode, hub.verify_token, hub.challenge
   * We must echo back the challenge to confirm webhook URL
   *
   * @param hubMode - Should be 'subscribe'
   * @param hubVerifyToken - Token provided by us (should match META_VERIFY_TOKEN)
   * @param hubChallenge - Challenge string to echo back
   * @returns challenge if verification succeeds, null otherwise
   */
  verifyWebhookChallenge(
    hubMode: string,
    hubVerifyToken: string,
    hubChallenge: string,
  ): string | null {
    console.log('=== WEBHOOK CHALLENGE VERIFICATION ===');
    console.log('Received hubMode:', hubMode);
    console.log('Received hubVerifyToken:', hubVerifyToken);
    console.log('Expected metaVerifyToken:', this.metaVerifyToken);
    console.log('Token match:', hubVerifyToken === this.metaVerifyToken);
    console.log('Mode match:', hubMode === 'subscribe');

    if (hubMode === 'subscribe' && hubVerifyToken === this.metaVerifyToken) {
      console.log('âœ… Webhook challenge verified successfully');
      this.logger.log('Webhook challenge verified successfully');
      return hubChallenge;
    }

    console.log('âŒ Webhook challenge verification failed');
    this.logger.warn('Webhook challenge verification failed');
    return null;
  }

  /**
   * Handle webhook callback from Meta
   * Verifies signature and processes message/status updates
   *
   * @param payload - Raw request body
   * @param signature - X-Hub-Signature-256 header
   * @returns Processed webhook data
   */
  async handleWebhookCallback(
    payload: string,
    signature: string,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // Verify webhook signature if app secret is available
      if (this.metaAppSecret) {
        // Debug signature verification
        console.log('=== WEBHOOK SIGNATURE DEBUG ===');
        console.log('Payload length:', payload.length);
        console.log('Payload preview:', payload.substring(0, 100));
        console.log('Signature from header:', signature);
        console.log('App secret available:', !!this.metaAppSecret);

        const isValid = verifyWebhookSignature(
          payload,
          signature,
          this.metaAppSecret,
        );

        console.log('Signature valid:', isValid);

        if (!isValid) {
          this.logger.warn('Invalid webhook signature');
          return { success: false, message: 'Invalid signature' };
        }
      } else {
        console.log(
          'âš ï¸  META_APP_SECRET not configured - skipping signature verification',
        );
        this.logger.warn(
          'âš ï¸  META_APP_SECRET not configured - skipping signature verification for webhook',
        );
      }

      // Parse webhook payload
      const webhookPayload = JSON.parse(payload);
      const parsed = parseWebhookPayload(webhookPayload);

      if (!parsed.valid) {
        this.logger.warn('Invalid webhook payload', parsed.errors);
        return { success: false, message: 'Invalid payload' };
      }

      // Extract updates from webhook
      const {
        messages: inboundMessages,
        statuses,
        contacts: webhookContacts,
      } = extractWebhookUpdates(webhookPayload);

      // Extract phone_number_id from webhook metadata
      // The webhook structure is: entry[0].changes[0].value.metadata.phone_number_id
      let phoneNumberId: string | undefined;
      if (
        webhookPayload.entry &&
        webhookPayload.entry.length > 0 &&
        webhookPayload.entry[0].changes &&
        webhookPayload.entry[0].changes.length > 0
      ) {
        phoneNumberId =
          webhookPayload.entry[0].changes[0].value.metadata?.phone_number_id;
      }

      console.log('Extracted phone_number_id from webhook:', phoneNumberId);

      // Find the sender (phoneNumberId should map to a sender in the database)
      let senderId: number | undefined;

      // First, try to match by phoneNumberId
      if (phoneNumberId) {
        this.logger.log(
          `Looking up sender for phone_number_id: ${phoneNumberId}`,
        );
        const sender = await db.query.senders.findFirst({
          where: eq(senders.phoneNumberId, phoneNumberId),
        });
        if (sender) {
          senderId = sender.id;
          this.logger.log(
            `Found sender by phoneNumberId: ${sender.id} for phone_number_id: ${phoneNumberId}`,
          );
        } else {
          this.logger.warn(
            `No sender found with phoneNumberId: ${phoneNumberId}. Checking if we can match by phone number from webhook...`,
          );
        }
      } else {
        this.logger.warn('No phone_number_id in webhook metadata');
      }

      // If phoneNumberId lookup failed, try to extract phone number from webhook and match
      if (!senderId) {
        this.logger.log(
          'Attempting fallback: matching by phone number from webhook',
        );
        // Try to extract the recipient phone number from the webhook
        // This is in: webhookPayload.entry[0].changes[0].value.metadata.phone_number
        let recipientPhone: string | undefined;
        if (
          webhookPayload.entry &&
          webhookPayload.entry.length > 0 &&
          webhookPayload.entry[0].changes &&
          webhookPayload.entry[0].changes.length > 0
        ) {
          recipientPhone =
            webhookPayload.entry[0].changes[0].value.metadata?.phone_number;
        }

        console.log('Extracted phone_number from webhook:', recipientPhone);

        if (recipientPhone) {
          this.logger.log(
            `Looking up sender by phone number: ${recipientPhone}`,
          );
          const sender = await db.query.senders.findFirst({
            where: eq(senders.phoneNumber, recipientPhone),
          });
          if (sender) {
            senderId = sender.id;
            this.logger.log(
              `Found sender by phone number: ${sender.id} (${recipientPhone})`,
            );
            // Update the sender with the phoneNumberId from this webhook
            if (phoneNumberId) {
              await db
                .update(senders)
                .set({ phoneNumberId })
                .where(eq(senders.id, sender.id));
              this.logger.log(
                `Updated sender ${sender.id} with phoneNumberId: ${phoneNumberId}`,
              );
            }
          } else {
            this.logger.warn(
              `No sender found with phone number: ${recipientPhone}`,
            );
          }
        } else {
          this.logger.warn('Could not extract phone_number from webhook');
        }
      }

      // Debug: Log what we extracted
      console.log('=== WEBHOOK EXTRACTION DEBUG ===');
      console.log('Inbound messages count:', inboundMessages.length);
      console.log(
        'Inbound messages:',
        JSON.stringify(inboundMessages, null, 2),
      );
      console.log('Statuses count:', statuses.length);
      console.log('Contacts count:', webhookContacts.length);
      console.log('Phone number ID:', phoneNumberId);
      console.log('Resolved sender ID:', senderId);

      // Process inbound messages
      for (const message of inboundMessages) {
        try {
          console.log(`Processing inbound message: ${message.id}`);
          await this.handleInboundMessage(message, webhookPayload, senderId);
          console.log(`Successfully processed message: ${message.id}`);
        } catch (error) {
          this.logger.error(
            `Error processing inbound message ${message.id}:`,
            error,
          );
          console.error(`Error details:`, error);
        }
      }

      // Process status updates
      for (const status of statuses) {
        try {
          // Log full status object to capture error details when status is 'failed'
          if (status.status === 'failed') {
            console.log(
              `âŒ FAILED STATUS DETAILS:`,
              JSON.stringify(status, null, 2),
            );
          }
          await this.handleMessageStatus(
            status.id,
            status.status,
            status.timestamp,
            status.errors, // Pass error details for failed messages
          );
        } catch (error) {
          this.logger.error(
            `Error processing status for message ${status.id}:`,
            error,
          );
        }
      }

      // Process contact updates (future: contact syncing)
      if (webhookContacts.length > 0) {
        this.logger.debug(`Received ${webhookContacts.length} contact updates`);
        // TODO: Sync contact information when enabled
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Error handling webhook callback:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Send a text message via Cloud API
   * Stores message metadata locally
   *
   * @param messageDto - Recipient phone, message body, and sender ID
   * @returns Response with message ID and status
   */
  async sendMessage(
    messageDto: OutboundMessageDto,
    userId?: number,
  ): Promise<any> {
    try {
      const recipientPhone = cleanPhoneNumber(messageDto.to);

      // Validate that either body or attachments are provided
      const hasBody = messageDto.body && messageDto.body.trim().length > 0;
      const hasAttachments =
        messageDto.attachments && messageDto.attachments.length > 0;

      if (!hasBody && !hasAttachments) {
        throw new Error('Message body or attachments are required');
      }

      // Determine which sender this message is from
      let senderId: number | undefined = messageDto.senderId;
      let senderPhoneNumber: string | undefined = messageDto.businessPhone;

      // If senderId provided, look up sender details
      if (senderId) {
        const sender = await db.query.senders.findFirst({
          where: eq(senders.id, senderId),
        });
        if (!sender) {
          throw new Error(`Sender with ID ${senderId} not found`);
        }
        senderPhoneNumber = sender.phoneNumber;
      }
      // If businessPhone provided, look up sender by phone number
      else if (senderPhoneNumber) {
        const sender = await db.query.senders.findFirst({
          where: eq(senders.phoneNumber, senderPhoneNumber),
        });
        if (!sender) {
          throw new Error(
            `Sender with phone number ${senderPhoneNumber} not found`,
          );
        }
        senderId = sender.id;
      }
      // If neither provided, use the first sender (user's default)
      else {
        const sender = await db.query.senders.findFirst();
        if (!sender) {
          throw new Error(
            'No senders configured. Please add a WhatsApp sender first.',
          );
        }
        senderId = sender.id;
        senderPhoneNumber = sender.phoneNumber;
      }

      // Type guard: ensure senderPhoneNumber is defined
      if (!senderPhoneNumber) {
        throw new Error('Unable to determine sender phone number');
      }

      // Type guard: ensure senderId is defined
      if (!senderId) {
        throw new Error('Unable to determine sender ID');
      }

      // Look up sender's phoneNumberId
      const senderRecord = await db.query.senders.findFirst({
        where: eq(senders.id, senderId),
      });

      if (!senderRecord) {
        throw new Error(`Sender with ID ${senderId} not found`);
      }

      const phoneNumberId = senderRecord.phoneNumberId;
      if (!phoneNumberId) {
        throw new Error(
          `Sender ${senderId} (${senderPhoneNumber}) does not have a phoneNumberId set. ` +
            `Please verify the sender in the UI and try again.`,
        );
      }

      this.logger.log(
        `Sending message from sender ${senderId} (${senderPhoneNumber}) with phoneNumberId ${senderRecord.phoneNumberId} to ${recipientPhone}`,
      );

      // Generate chat ID using the sender's phone number
      const chatId = generateChatId(senderPhoneNumber, recipientPhone);

      // Ensure chat exists with the correct sender (outbound message - no notification needed)
      const { chat } = await this.getOrCreateChat(
        chatId,
        senderPhoneNumber,
        recipientPhone,
        senderId,
      );

      // Check assignment restriction
      if (userId && chat.assignedTo && chat.assignedTo !== userId) {
        throw new ForbiddenException('Chat is assigned to another team member');
      }

      // ========================================================================
      // CRITICAL: Enforce 24-hour conversation window rule
      // This prevents WABA bans from sending messages outside the allowed window
      // ========================================================================
      const windowValidation =
        await this.conversationWindowService.validateFreeFormMessage(chatId);

      if (!windowValidation.isValid) {
        this.logger.error(
          `Conversation window validation failed for chat ${chatId}: ${windowValidation.errorMessage}`,
        );
        throw new BadRequestException({
          statusCode: 400,
          error: 'CONVERSATION_WINDOW_VIOLATION',
          errorCode: windowValidation.errorCode,
          message: windowValidation.errorMessage,
          windowStatus: windowValidation.windowStatus,
        });
      }

      this.logger.log(
        `Conversation window valid for chat ${chatId}. Time remaining: ${Math.round(windowValidation.windowStatus.timeRemainingMs / 60000)}m`,
      );

      let waMessageId: string;

      // Handle reply context if this is a reply
      let replyContext: { message_id: string } | undefined;
      let replyPreview: ReplyPreview | undefined;

      if (messageDto.replyToMessageId) {
        // Validate that the message being replied to exists and is in the same chat
        const originalMessage = await db.query.messages.findFirst({
          where: eq(messages.messageId, messageDto.replyToMessageId),
        });

        if (!originalMessage) {
          this.logger.warn(
            `Reply target message not found: ${messageDto.replyToMessageId}`,
          );
          // Don't fail - continue without reply context
        } else if (originalMessage.chatId !== chatId) {
          this.logger.warn(
            `Cross-chat reply attempt blocked: ${messageDto.replyToMessageId}`,
          );
          // Don't fail - continue without reply context
        } else {
          // Generate reply preview from original message
          const senderName =
            originalMessage.direction === 'outbound'
              ? 'You'
              : await this.getContactNameForReply(originalMessage.sender);

          replyPreview = generateReplyPreview(
            {
              messageId: originalMessage.messageId,
              text: originalMessage.text,
              type: originalMessage.type,
              direction: originalMessage.direction as 'inbound' | 'outbound',
              sender: originalMessage.sender,
              attachments: originalMessage.attachments as any[],
              isDeleted: originalMessage.isDeleted || false,
            },
            senderName,
          );

          // For Cloud API, we need to find the WhatsApp message ID (wamid)
          // It could be stored in messageId directly, or in mediaUrl with 'wa:' prefix for outbound media
          let waReplyId = originalMessage.messageId;
          if (originalMessage.mediaUrl?.startsWith('wa:')) {
            waReplyId = originalMessage.mediaUrl.substring(3);
          }

          replyContext = { message_id: waReplyId };
          this.logger.log(
            `Sending reply to message: ${messageDto.replyToMessageId} (WhatsApp ID: ${waReplyId})`,
          );
        }
      }

      // If there are attachments, don't send a text message via Cloud API
      // The media will be sent separately via sendMedia endpoint with the caption
      // This avoids sending duplicate messages (text + document with text)
      if (hasAttachments) {
        // Generate a placeholder message ID - the real one will come from sendMedia
        waMessageId = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.logger.log(
          `Message has attachments - skipping Cloud API text send. Placeholder ID: ${waMessageId}`,
        );
      } else {
        // No attachments - send text message via Cloud API
        const message: any = {
          messaging_product: 'whatsapp' as const,
          to: recipientPhone,
          type: 'text' as const,
          text: {
            preview_url: true,
            body: messageDto.body || '',
          },
        };

        // Add reply context if this is a reply
        if (replyContext) {
          message.context = replyContext;
        }

        // Validate message
        const validation = validateCloudAPIMessage(message);
        if (!validation.valid) {
          throw new Error(`Invalid message: ${validation.errors.join(', ')}`);
        }

        // Send via Cloud API using the sender's phoneNumberId
        const response = await this.sendCloudAPIMessage(message, phoneNumberId);

        if (!response.messages || response.messages.length === 0) {
          throw new Error('No message ID returned from Cloud API');
        }

        waMessageId = response.messages[0].id;
      }

      this.logger.log(
        `Message processed. ID: ${waMessageId}, To: ${recipientPhone}`,
      );

      // Store message metadata
      await this.storeOutboundMessage({
        waMessageId,
        chatId,
        from: senderPhoneNumber,
        to: recipientPhone,
        body: messageDto.body,
        attachments: messageDto.attachments,
        userId,
        senderId,
        replyToMessageId: messageDto.replyToMessageId,
        replyPreview,
      });

      // Emit WebSocket event for real-time UI update
      // This is critical for AI-generated messages and messages sent from other tabs/devices
      if (whatsAppGatewayInstance) {
        whatsAppGatewayInstance.emitMessage({
          messageId: waMessageId,
          chatId,
          sender: senderPhoneNumber,
          text: messageDto.body || '',
          type: hasAttachments ? 'media' : 'text',
          timestamp: new Date(),
          direction: 'outbound',
          status: 'sent',
          attachments: messageDto.attachments,
          replyToMessageId: messageDto.replyToMessageId,
          replyPreview,
        });
      }

      return {
        success: true,
        messageId: waMessageId,
        to: recipientPhone,
        status: 'sent',
        replyToMessageId: messageDto.replyToMessageId,
      };
    } catch (error) {
      this.logger.error(`Error sending message: ${error.message}`, error);
      throw new Error(`Failed to send WhatsApp message: ${error.message}`);
    }
  }

  /**
   * Send a proper WhatsApp template message via Cloud API.
   *
   * Unlike `sendMessage()` which sends `type: 'text'` payloads, this method
   * sends `type: 'template'` payloads. This is critical because:
   *
   * 1. **24-hour window bypass**: Approved templates can be sent at any time,
   *    even outside the 24-hour conversation window.
   * 2. **Meta compliance**: Template messages must use the template API format
   *    to be recognized by Meta as template messages.
   * 3. **Analytics**: Template messages are tracked separately by Meta for
   *    quality scoring and billing.
   *
   * Supports both **named** variables (`customer.first_name`) from custom
   * templates and **positional** variables (`1`, `2`) from library templates.
   *
   * @param dto - Template send payload with template ID, locale, and variables
   * @param userId - The authenticated user performing the send
   * @returns Success response with WhatsApp message ID
   */
  async sendTemplateMessage(
    dto: SendTemplateDto,
    userId?: number,
  ): Promise<{
    success: boolean;
    messageId?: string;
    to: string;
    status: string;
  }> {
    try {
      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // 1. Validate that template services are available
      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (!this.templatesService) {
        throw new BadRequestException(
          'Template services are not available. Cannot send template messages.',
        );
      }
      if (!this.providerFactory) {
        throw new BadRequestException(
          'Messaging provider is not available. Cannot send template messages.',
        );
      }

      const recipientPhone = cleanPhoneNumber(dto.to);

      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // 2. Resolve sender
      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const senderRecord = await db.query.senders.findFirst({
        where: eq(senders.id, dto.senderId),
      });
      if (!senderRecord) {
        throw new BadRequestException(
          `Sender with ID ${dto.senderId} not found`,
        );
      }

      const phoneNumberId = senderRecord.phoneNumberId;
      if (!phoneNumberId) {
        throw new BadRequestException(
          `Sender ${dto.senderId} does not have a phoneNumberId configured. ` +
            `Please verify the sender setup.`,
        );
      }

      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // 3. Load template + locale
      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const template = await this.templatesService.getTemplate(dto.templateId);
      const localeData = template.locales?.find(
        (l: any) => l.locale === dto.locale,
      );

      if (!localeData) {
        throw new BadRequestException(
          `Locale "${dto.locale}" not found for template "${template.displayName || template.name}"`,
        );
      }

      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // 4. Validate approval status
      // CRITICAL: Never send non-approved templates to Meta's API. They will be
      // rejected and could flag the account. This is a safety guardrail.
      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const isApproved = localeData.approvalStatus === 'approved';

      if (!isApproved) {
        const statusDisplay = localeData.approvalStatus || 'unknown';
        this.logger.warn(
          `Blocked attempt to send non-approved template "${template.name}" ` +
            `(locale: ${dto.locale}, status: ${statusDisplay})`,
        );
        throw new BadRequestException({
          statusCode: 400,
          error: 'TEMPLATE_NOT_APPROVED',
          errorCode: 'TEMPLATE_NOT_APPROVED',
          message:
            `Cannot send template: Template "${template.displayName || template.name}" ` +
            `is not approved (current status: ${statusDisplay}). ` +
            `Only approved templates can be sent via WhatsApp. ` +
            `Please wait for the template to be approved by Meta.`,
          templateStatus: statusDisplay,
        });
      }

      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // 5. Conversation window validation
      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const chatId =
        dto.chatId ?? generateChatId(senderRecord.phoneNumber, recipientPhone);

      // Ensure chat exists
      const { chat } = await this.getOrCreateChat(
        chatId,
        senderRecord.phoneNumber,
        recipientPhone,
        dto.senderId,
      );

      // Check assignment restriction
      if (userId && chat.assignedTo && chat.assignedTo !== userId) {
        throw new ForbiddenException('Chat is assigned to another team member');
      }

      const windowValidation =
        await this.conversationWindowService.validateTemplateMessage(
          chatId,
          isApproved,
        );

      if (!windowValidation.isValid) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'CONVERSATION_WINDOW_VIOLATION',
          errorCode: windowValidation.errorCode,
          message: windowValidation.errorMessage,
          windowStatus: windowValidation.windowStatus,
        });
      }

      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // 6. Determine variable format and build provider variables
      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const isPositional = localeData.parameterFormat === 'positional';
      let providerVariables: Record<string, string>;

      if (isPositional) {
        // Library templates: variables are already keyed by position ("1", "2")
        // The provider expects them keyed by positional name too
        providerVariables = dto.variables;
      } else {
        // Custom templates: variables are keyed by name ("customer.first_name")
        // The parser will convert named â†’ positional in convertToProviderFormat
        providerVariables = dto.variables;
      }

      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // 6.5 Resolve media header URLs from original S3 files
      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // The frontend passes thumbnail/preview URLs for media header variables.
      // Meta downloads the file from the URL we provide, so we must generate
      // a fresh presigned URL pointing to the ORIGINAL file (not the thumbnail).
      // This runs server-side to guarantee the URL is always valid.
      const headerFormat = (localeData.headerFormat || '').toUpperCase();
      const MEDIA_HEADER_FORMATS = ['IMAGE', 'VIDEO', 'DOCUMENT'];

      if (MEDIA_HEADER_FORMATS.includes(headerFormat)) {
        await this.resolveOriginalMediaUrl(
          localeData.id,
          headerFormat,
          providerVariables,
        );
      }

      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // 7. Send via Meta Cloud API provider
      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const provider = this.providerFactory.getDefaultProvider();

      this.logger.log(
        `[SEND-TEMPLATE] Sending "${template.name}" via ${provider.providerName}` +
          ` | locale=${localeData.locale}` +
          ` | phoneNumberId=${phoneNumberId}` +
          ` | headerFormat=${localeData.headerFormat ?? 'none'}` +
          ` | hasComponents=${!!localeData.components}` +
          ` | parameterFormat=${localeData.parameterFormat}` +
          ` | variables=${JSON.stringify(providerVariables)}`,
      );

      const sendResult = await provider.sendTemplateMessage({
        to: recipientPhone,
        templateName: template.name,
        language: localeData.locale,
        variables: providerVariables,
        locale: localeData,
        phoneNumberId,
      });

      if (!sendResult.success) {
        this.logger.error(
          `Failed to send template message: ${sendResult.error}`,
        );
        throw new BadRequestException(
          sendResult.error || 'Failed to send template message',
        );
      }

      const waMessageId = sendResult.messageId || `tmpl-${Date.now()}`;

      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // 8. Render the resolved body for storage/display
      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      let resolvedBody = localeData.body;
      if (this.templateParserService) {
        resolvedBody = this.templateParserService.renderTemplate(
          localeData.body,
          dto.variables,
        );
      }

      // Resolve header text with variables (if text header)
      let resolvedHeader = localeData.header || null;
      if (
        resolvedHeader &&
        this.templateParserService &&
        resolvedHeader.includes('{{')
      ) {
        resolvedHeader = this.templateParserService.renderTemplate(
          resolvedHeader,
          dto.variables,
        );
      }

      // Build complete template metadata for storage and real-time display
      const templateMetadata: Record<string, any> = {
        templateId: dto.templateId,
        templateName: template.name,
        templateDisplayName: template.displayName || template.name,
        locale: dto.locale,
        variables: dto.variables,
        source: template.source || 'custom',
        header: resolvedHeader,
        headerFormat: localeData.headerFormat || null,
        footer: localeData.footer || null,
        buttons: localeData.buttons || [],
        components: localeData.components || null,
      };

      // Store the original S3 key so the frontend can request a fresh
      // presigned URL for document/media downloads in chat bubbles.
      if (MEDIA_HEADER_FORMATS.includes(headerFormat)) {
        const headerMedia = await db.query.templateMedia.findFirst({
          where: and(
            eq(templateMedia.localeId, localeData.id),
            eq(templateMedia.componentType, 'header'),
            eq(templateMedia.uploadStatus, 'completed'),
          ),
          columns: { originalS3Key: true, s3Key: true },
        });
        if (headerMedia) {
          templateMetadata.headerMediaS3Key =
            headerMedia.originalS3Key || headerMedia.s3Key;
          // Store thumbnail S3 key separately so the bubble can show
          // a poster image while the video loads.
          if (
            headerMedia.s3Key &&
            headerMedia.s3Key !== headerMedia.originalS3Key
          ) {
            templateMetadata.headerThumbnailS3Key = headerMedia.s3Key;
          }
        }
      }

      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // 9. Store outbound message with template metadata in a single insert
      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      await this.storeOutboundMessage({
        waMessageId,
        chatId,
        from: senderRecord.phoneNumber,
        to: recipientPhone,
        body: resolvedBody,
        userId,
        senderId: dto.senderId,
        replyToMessageId: dto.replyToMessageId,
        messageType: 'template',
        metadata: templateMetadata,
      });

      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // 10. Emit WebSocket event for real-time UI update
      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (whatsAppGatewayInstance) {
        whatsAppGatewayInstance.emitMessage({
          messageId: waMessageId,
          chatId,
          sender: senderRecord.phoneNumber,
          text: resolvedBody,
          type: 'template',
          timestamp: new Date(),
          direction: 'outbound',
          status: 'sent',
          replyToMessageId: dto.replyToMessageId,
          metadata: templateMetadata,
        });
      }

      this.logger.log(
        `Template message sent successfully. Template: ${template.name}, Locale: ${dto.locale}, To: ${recipientPhone}, MessageId: ${waMessageId}`,
      );

      return {
        success: true,
        messageId: waMessageId,
        to: recipientPhone,
        status: 'sent',
      };
    } catch (error) {
      this.logger.error(
        `Error sending template message: ${error.message}`,
        error,
      );

      // Re-throw known exceptions as-is
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to send template message: ${error.message}`,
      );
    }
  }

  /**
   * Resolve a fresh presigned URL for the original media file stored in S3.
   *
   * At template creation, the original file is uploaded to both Meta (for
   * approval) and S3 (permanent storage, tracked via `originalS3Key`). The
   * `s3Key` column is later overwritten to point at a thumbnail for UI
   * preview.
   *
   * Meta downloads the file from the URL we provide each time a template
   * message is sent, so we must supply a non-expired presigned URL that
   * points to the original file, not the thumbnail.
   *
   * This method mutates `variables` in-place, replacing the media header
   * variable with a fresh URL.
   */
  /**
   * Resolves a fresh presigned URL for the original media file of a template locale.
   *
   * Strategy (priority order):
   * 1. templateMedia.originalS3Key (set during upload for new templates)
   * 2. templateMedia.s3Key that is NOT a thumbnail (legacy originals)
   * 3. templateLocales.components.header.link â€” extract S3 key from stored presigned URL
   *
   * Each candidate is verified in S3 via HEAD before use.
   * On first success, backfills originalS3Key for future lookups.
   * Mutates `variables` in place with the fresh presigned URL.
   */
  private async resolveOriginalMediaUrl(
    localeId: string,
    headerFormat: string,
    variables: Record<string, string>,
  ): Promise<void> {
    const HEADER_VAR_MAP: Record<string, string> = {
      IMAGE: 'header_image',
      VIDEO: 'header_video',
      DOCUMENT: 'header_document',
    };
    const varKey = HEADER_VAR_MAP[headerFormat];
    if (!varKey) return;

    try {
      // â”€â”€ Gather candidate S3 keys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const candidateKeys: string[] = [];
      let needsBackfill = false;

      // Source 1 & 2: templateMedia records (no status filter â€” record may
      // still be 'pending' if Lambda hasn't finished thumbnailing yet)
      const mediaRecords = await db
        .select({
          id: templateMedia.id,
          s3Key: templateMedia.s3Key,
          originalS3Key: templateMedia.originalS3Key,
        })
        .from(templateMedia)
        .where(
          and(
            eq(templateMedia.localeId, localeId),
            eq(templateMedia.componentType, 'header'),
          ),
        )
        .orderBy(desc(templateMedia.createdAt))
        .limit(5);

      for (const rec of mediaRecords) {
        if (rec.originalS3Key) candidateKeys.push(rec.originalS3Key);
        // s3Key that doesn't look like a thumbnail IS the original
        if (rec.s3Key && !rec.s3Key.includes('_thumb')) {
          candidateKeys.push(rec.s3Key);
        }
      }

      if (mediaRecords.length > 0 && !mediaRecords[0].originalS3Key) {
        needsBackfill = true;
      }

      // Source 3: components.header.link from the locale row
      const [locale] = await db
        .select({ components: templateLocales.components })
        .from(templateLocales)
        .where(eq(templateLocales.id, localeId))
        .limit(1);

      const headerLink = (locale?.components as Record<string, any>)?.header
        ?.link;
      if (typeof headerLink === 'string' && headerLink.length > 0) {
        const extracted = this.extractS3KeyFromPresignedUrl(headerLink);
        if (extracted) {
          if (!extracted.includes('_thumb')) {
            // Non-thumbnail key â€” use directly
            candidateKeys.push(extracted);
          } else {
            // Thumbnail key â€” derive possible original file keys
            // e.g. "path/file_thumb.jpg" â†’ "path/file.mp4", "path/file.mp4.mp4"
            const basePath = extracted.replace(/_thumb\.[^.]+$/, '');
            const extMap: Record<string, string[]> = {
              VIDEO: ['.mp4', '.mp4.mp4', '.mov', '.avi'],
              DOCUMENT: ['.pdf', '.doc', '.docx'],
              IMAGE: ['.jpg', '.jpeg', '.png', '.webp'],
            };
            for (const ext of extMap[headerFormat] || []) {
              candidateKeys.push(basePath + ext);
            }
          }
        }
      }

      // â”€â”€ Try each candidate until one exists in S3 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const seen = new Set<string>();
      let resolvedKey: string | null = null;

      for (const key of candidateKeys) {
        if (seen.has(key)) continue;
        seen.add(key);
        if (await this.s3Service.objectExists(key)) {
          resolvedKey = key;
          break;
        }
      }

      if (!resolvedKey) {
        this.logger.warn(
          `[SEND-TEMPLATE] No original media found in S3 for locale ${localeId} ` +
            `(format=${headerFormat}, candidates=${[...seen].join(', ') || 'none'}). ` +
            `Sending with frontend-provided URL.`,
        );
        return;
      }

      // â”€â”€ Generate fresh presigned URL (1 hour) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const { url: freshUrl } =
        await this.s3Service.generatePresignedDownloadUrl(resolvedKey, {
          expiresIn: 3600,
        });

      variables[varKey] = freshUrl;

      this.logger.log(
        `[SEND-TEMPLATE] Resolved original media: ${resolvedKey} â†’ fresh URL for ${varKey}`,
      );

      // Best-effort backfill originalS3Key for future sends
      if (needsBackfill && mediaRecords.length > 0) {
        db.update(templateMedia)
          .set({ originalS3Key: resolvedKey })
          .where(eq(templateMedia.id, mediaRecords[0].id))
          .execute()
          .catch(() => {});
      }
    } catch (error) {
      this.logger.error(
        `[SEND-TEMPLATE] Failed to resolve media URL for locale ${localeId}: ${error.message}`,
      );
      // Don't throw â€” let the send proceed with whatever URL the frontend provided.
    }
  }

  /**
   * Extracts the S3 object key from a presigned URL.
   * Handles virtual-hosted-style: https://bucket.s3.region.amazonaws.com/key?params
   * and path-style: https://s3.region.amazonaws.com/bucket/key?params
   */
  private extractS3KeyFromPresignedUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      let path = decodeURIComponent(parsed.pathname);
      if (path.startsWith('/')) path = path.slice(1);
      // Path-style: hostname starts with s3. â€” first segment is the bucket
      if (
        parsed.hostname.startsWith('s3.') ||
        parsed.hostname.startsWith('s3-')
      ) {
        const idx = path.indexOf('/');
        if (idx > 0) path = path.slice(idx + 1);
      }
      return path || null;
    } catch {
      return null;
    }
  }

  /**
   * Send a reaction to a message via WhatsApp Cloud API
   *
   * IMPORTANT LIMITATION (from Meta's official documentation):
   * "Use the POST endpoint to apply an emoji reaction on a message you have
   * received from a WhatsApp user."
   *
   * This means the Cloud API ONLY supports reactions on INBOUND messages
   * (messages sent by customers TO the business). The API will accept requests
   * for outbound messages without error, but the reaction will NOT be delivered
   * to the customer's WhatsApp app.
   *
   * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/reaction-messages
   *
   * The caller (ReactionsService) should check message direction before calling
   * this method to avoid unnecessary API calls.
   *
   * To remove a reaction, pass an empty string as the emoji.
   *
   * @param senderId - The sender ID to determine which phoneNumberId to use
   * @param recipientPhone - The WhatsApp user's phone number
   * @param targetMessageWaId - The WhatsApp message ID (wamid) to react to
   * @param emoji - The emoji to use for the reaction (empty string to remove)
   * @returns Response with the reaction message ID
   */
  async sendReaction(
    senderId: number,
    recipientPhone: string,
    targetMessageWaId: string,
    emoji: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const cleanedPhone = cleanPhoneNumber(recipientPhone);

      // Look up sender's phoneNumberId
      const senderRecord = await db.query.senders.findFirst({
        where: eq(senders.id, senderId),
      });

      if (!senderRecord) {
        throw new Error(`Sender with ID ${senderId} not found`);
      }

      if (!senderRecord.phoneNumberId) {
        throw new Error(
          `Sender ${senderId} does not have a phoneNumberId set. ` +
            `Please verify the sender in the UI and try again.`,
        );
      }

      this.logger.log(
        `Sending reaction ${emoji || '(remove)'} to message ${targetMessageWaId} for recipient ${cleanedPhone}`,
      );

      // Build reaction message payload
      const message = {
        messaging_product: 'whatsapp' as const,
        recipient_type: 'individual' as const,
        to: cleanedPhone,
        type: 'reaction' as const,
        reaction: {
          message_id: targetMessageWaId,
          emoji: emoji, // Empty string removes the reaction
        },
      };

      // Send via Cloud API
      const response = await this.sendCloudAPIMessage(
        message,
        senderRecord.phoneNumberId,
      );

      this.logger.log(
        `Reaction sent successfully. Response message ID: ${response.messages?.[0]?.id}`,
      );

      return {
        success: true,
        messageId: response.messages?.[0]?.id,
      };
    } catch (error) {
      this.logger.error(`Error sending reaction: ${error.message}`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send a location message via WhatsApp Cloud API
   *
   * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/location-messages
   *
   * Location messages allow sharing a geographic location with:
   * - Latitude and longitude (required)
   * - Location name (optional, e.g., "Philz Coffee")
   * - Address (optional, e.g., "101 Forest Ave, Palo Alto, CA 94301")
   *
   * @param senderId - The sender ID to determine which phoneNumberId to use
   * @param recipientPhone - The WhatsApp user's phone number
   * @param latitude - Latitude in decimal degrees
   * @param longitude - Longitude in decimal degrees
   * @param name - Optional location name
   * @param address - Optional full address string
   * @param replyToMessageId - Optional message ID to reply to
   * @param userId - Optional user ID for authorization
   * @returns Response with the location message ID
   */
  async sendLocation(
    senderId: number,
    recipientPhone: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string,
    replyToMessageId?: string,
    userId?: number,
  ): Promise<{
    success: boolean;
    messageId?: string;
    chatId?: string;
    error?: string;
  }> {
    try {
      const cleanedPhone = cleanPhoneNumber(recipientPhone);

      // Look up sender's phoneNumberId and phone number
      const senderRecord = await db.query.senders.findFirst({
        where: eq(senders.id, senderId),
      });

      if (!senderRecord) {
        throw new Error(`Sender with ID ${senderId} not found`);
      }

      if (!senderRecord.phoneNumberId) {
        throw new Error(
          `Sender ${senderId} does not have a phoneNumberId set. ` +
            `Please verify the sender in the UI and try again.`,
        );
      }

      const senderPhoneNumber = senderRecord.phoneNumber;

      // Generate chat ID and validate conversation window
      const chatId = generateChatId(senderPhoneNumber, cleanedPhone);

      // Ensure chat exists with the correct sender
      const { chat } = await this.getOrCreateChat(
        chatId,
        senderPhoneNumber,
        cleanedPhone,
        senderId,
      );

      // Check assignment restriction
      if (userId && chat.assignedTo && chat.assignedTo !== userId) {
        throw new ForbiddenException('Chat is assigned to another team member');
      }

      // Enforce 24-hour conversation window rule
      const windowValidation =
        await this.conversationWindowService.validateFreeFormMessage(chatId);

      if (!windowValidation.isValid) {
        this.logger.error(
          `Conversation window validation failed for location to ${cleanedPhone}: ${windowValidation.errorMessage}`,
        );
        throw new BadRequestException({
          statusCode: 400,
          error: 'CONVERSATION_WINDOW_VIOLATION',
          errorCode: windowValidation.errorCode,
          message: windowValidation.errorMessage,
          windowStatus: windowValidation.windowStatus,
        });
      }

      this.logger.log(
        `Sending location (${latitude}, ${longitude}) to ${cleanedPhone} from sender ${senderId}`,
      );

      // Build location message payload per Meta Cloud API spec
      const message: any = {
        messaging_product: 'whatsapp' as const,
        recipient_type: 'individual' as const,
        to: cleanedPhone,
        type: 'location' as const,
        location: {
          latitude: latitude.toString(), // Meta API expects strings
          longitude: longitude.toString(),
          ...(name && { name }),
          ...(address && { address }),
        },
      };

      // Handle reply context if this is a reply
      let replyPreview: ReplyPreview | undefined;
      if (replyToMessageId) {
        const originalMessage = await db.query.messages.findFirst({
          where: eq(messages.messageId, replyToMessageId),
        });

        if (originalMessage && originalMessage.chatId === chatId) {
          const senderName =
            originalMessage.direction === 'outbound'
              ? 'You'
              : await this.getContactNameForReply(originalMessage.sender);

          replyPreview = generateReplyPreview(
            {
              messageId: originalMessage.messageId,
              text: originalMessage.text,
              type: originalMessage.type,
              direction: originalMessage.direction as 'inbound' | 'outbound',
              sender: originalMessage.sender,
              attachments: originalMessage.attachments as any[],
              isDeleted: originalMessage.isDeleted || false,
            },
            senderName,
          );

          // For Cloud API, include context for reply
          let waReplyId = originalMessage.messageId;
          if (originalMessage.mediaUrl?.startsWith('wa:')) {
            waReplyId = originalMessage.mediaUrl.substring(3);
          }

          message.context = { message_id: waReplyId };
          this.logger.log(`Sending location as reply to: ${replyToMessageId}`);
        }
      }

      // Send via Cloud API
      const response = await this.sendCloudAPIMessage(
        message,
        senderRecord.phoneNumberId,
      );

      if (!response.messages || response.messages.length === 0) {
        throw new Error('No message ID returned from Cloud API');
      }

      const waMessageId = response.messages[0].id;

      this.logger.log(`Location message sent successfully. ID: ${waMessageId}`);

      // Build location text preview for storage and display
      const locationPreview = name
        ? `ðŸ“ ${name}${address ? ` - ${address}` : ''}`
        : `ðŸ“ Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

      // Store location message with metadata
      const now = new Date();
      await db.insert(messages).values({
        messageId: waMessageId,
        chatId,
        source: 'whatsapp',
        sender: senderPhoneNumber,
        type: 'location',
        text: locationPreview,
        attachments: [],
        direction: 'outbound',
        status: 'pending',
        timestamp: now,
        updatedAt: now,
        replyToMessageId: replyToMessageId || null,
        replyPreview: replyPreview || null,
        metadata: {
          location: {
            latitude,
            longitude,
            name: name || null,
            address: address || null,
          },
        },
      });

      // Update chat's last message info
      await db
        .update(chats)
        .set({
          lastMessage: locationPreview,
          lastMessageType: 'location',
          lastMessageTime: now,
          lastActivityType: 'message',
          updatedAt: now,
        })
        .where(eq(chats.chatId, chatId));

      // Emit WebSocket event for real-time UI update
      if (whatsAppGatewayInstance) {
        whatsAppGatewayInstance.emitMessage({
          messageId: waMessageId,
          chatId,
          sender: senderPhoneNumber,
          text: locationPreview,
          type: 'location',
          timestamp: now,
          direction: 'outbound',
          status: 'sent',
          metadata: {
            location: {
              latitude,
              longitude,
              name: name || undefined,
              address: address || undefined,
            },
          },
          replyToMessageId,
          replyPreview,
        });
      }

      return {
        success: true,
        messageId: waMessageId,
        chatId,
      };
    } catch (error) {
      this.logger.error(`Error sending location: ${error.message}`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send media message via Cloud API
   * Supports image, video, audio, document
   *
   * For multi-media messages, each attachment is sent as a separate WhatsApp message
   * (WhatsApp Cloud API limitation). The attachmentId parameter is used to track
   * which specific attachment was sent and update its status/waMessageId.
   *
   * @param recipientPhone - Recipient phone number
   * @param mediaType - Type of media (image, video, audio, document)
   * @param mediaUrl - URL of media file
   * @param caption - Optional caption for media
   * @param senderId - Optional sender ID to determine which phoneNumberId to use
   * @param fileName - Optional filename for documents (required for WhatsApp to display correct name)
   * @param originalMessageId - The parent message ID that contains this attachment
   * @param attachmentId - The specific attachment ID within the message (for multi-media messages)
   * @returns Response with message ID
   */
  async sendMedia(
    recipientPhone: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    mediaUrl: string,
    caption?: string,
    senderId?: number,
    fileName?: string,
    originalMessageId?: string,
    attachmentId?: string,
    userId?: number,
  ): Promise<any> {
    try {
      const cleanedPhone = cleanPhoneNumber(recipientPhone);

      // ========================================================================
      // CRITICAL: Enforce 24-hour conversation window rule for media messages
      // ========================================================================
      if (senderId) {
        const sender = await db.query.senders.findFirst({
          where: eq(senders.id, senderId),
        });
        if (sender) {
          const chatId = generateChatId(sender.phoneNumber, cleanedPhone);

          // Check assignment restriction
          if (userId) {
            const chat = await db.query.chats.findFirst({
              where: eq(chats.chatId, chatId),
            });
            if (chat && chat.assignedTo && chat.assignedTo !== userId) {
              throw new ForbiddenException(
                'Chat is assigned to another team member',
              );
            }
          }

          const windowValidation =
            await this.conversationWindowService.validateFreeFormMessage(
              chatId,
            );

          if (!windowValidation.isValid) {
            this.logger.error(
              `Conversation window validation failed for media to ${cleanedPhone}: ${windowValidation.errorMessage}`,
            );
            throw new BadRequestException({
              statusCode: 400,
              error: 'CONVERSATION_WINDOW_VIOLATION',
              errorCode: windowValidation.errorCode,
              message: windowValidation.errorMessage,
              windowStatus: windowValidation.windowStatus,
            });
          }
        }
      }

      let finalMediaUrl = mediaUrl;

      // For audio, check if conversion is needed (webm -> ogg for WhatsApp compatibility)
      if (mediaType === 'audio' && originalMessageId) {
        const convertedUrl = await this.convertAudioIfNeeded(
          originalMessageId,
          senderId,
        );
        if (convertedUrl) {
          finalMediaUrl = convertedUrl;
          this.logger.log(
            `Audio converted for WhatsApp compatibility. Using converted URL.`,
          );
        }
      }

      const mediaPayload: any = {
        link: finalMediaUrl,
      };

      // Add caption if provided and supported
      if (caption && ['image', 'video', 'document'].includes(mediaType)) {
        mediaPayload.caption = caption;
      }

      // Add filename for documents (required by WhatsApp Cloud API to display correct name)
      if (mediaType === 'document' && fileName) {
        mediaPayload.filename = fileName;
      }

      const message = {
        messaging_product: 'whatsapp' as const,
        to: cleanedPhone,
        type: mediaType,
        [mediaType]: mediaPayload,
      };

      // Validate message
      const validation = validateCloudAPIMessage(message);
      if (!validation.valid) {
        throw new Error(`Invalid message: ${validation.errors.join(', ')}`);
      }

      // Look up phoneNumberId if senderId provided
      let phoneNumberIdToUse: string | undefined;
      if (senderId) {
        const sender = await db.query.senders.findFirst({
          where: eq(senders.id, senderId),
        });
        if (sender && sender.phoneNumberId) {
          phoneNumberIdToUse = sender.phoneNumberId;
        }
      }

      // Send via Cloud API
      const response = await this.sendCloudAPIMessage(
        message,
        phoneNumberIdToUse,
      );

      if (!response.messages || response.messages.length === 0) {
        throw new Error('No message ID returned from Cloud API');
      }

      const waMessageId = response.messages[0].id;
      this.logger.log(
        `Media message sent successfully. ID: ${waMessageId}, Type: ${mediaType}`,
      );

      // If originalMessageId provided, update the existing database message
      // For multi-media messages, update the specific attachment's status and waMessageId
      if (originalMessageId) {
        try {
          // Get current message to update attachments
          const currentMessage = await db.query.messages.findFirst({
            where: eq(messages.messageId, originalMessageId),
          });

          if (currentMessage) {
            const currentAttachments =
              (currentMessage.attachments as any[]) || [];
            let allAttachmentsSent = true;

            // Update the specific attachment's status and waMessageId
            const updatedAttachments = currentAttachments.map((att: any) => {
              if (attachmentId && att.id === attachmentId) {
                return {
                  ...att,
                  status: 'success',
                  waMessageId: waMessageId, // Store WhatsApp message ID for this specific attachment
                };
              }
              // Check if any attachments are still pending
              if (att.status !== 'success') {
                allAttachmentsSent = false;
              }
              return att;
            });

            // Check if all attachments are now sent (after this update)
            const hasMultipleAttachments = currentAttachments.length > 1;
            const allSentAfterUpdate = updatedAttachments.every(
              (att: any) =>
                att.status === 'success' ||
                (attachmentId && att.id === attachmentId),
            );

            // Build the update data
            const updateData: any = {
              attachments: updatedAttachments,
              updatedAt: new Date(),
            };

            // Only update message status to 'sent' when all attachments are sent
            // For single attachment messages, update immediately
            // For multi-attachment messages, wait until all are sent
            if (!hasMultipleAttachments || allSentAfterUpdate) {
              updateData.status = 'sent';
              updateData.sentAt = new Date();
              // Store the first attachment's WhatsApp ID in mediaUrl for webhook lookups
              // For multi-media, we now track individual waMessageIds in each attachment
              if (!currentMessage.mediaUrl && waMessageId) {
                updateData.mediaUrl = `wa:${waMessageId}`;
              }
            }

            await db
              .update(messages)
              .set(updateData)
              .where(eq(messages.messageId, originalMessageId));

            this.logger.log(
              `Updated message ${originalMessageId} attachment ${attachmentId || 'all'} with WhatsApp ID: ${waMessageId}`,
            );

            // Emit status update via WebSocket using original messageId
            // Include attachment-level info for granular UI updates
            if (whatsAppGatewayInstance) {
              // Emit attachment-specific update for multi-media tracking
              whatsAppGatewayInstance.emitAttachmentStatus({
                messageId: originalMessageId,
                attachmentId: attachmentId || '',
                status: 'sent',
                waMessageId: waMessageId,
              });

              // Also emit message status if all attachments are sent
              if (!hasMultipleAttachments || allSentAfterUpdate) {
                whatsAppGatewayInstance.emitMessageStatus(
                  originalMessageId,
                  'sent',
                );
              }
            }
          }
        } catch (updateError) {
          this.logger.warn(
            `Failed to update message ${originalMessageId}: ${updateError.message}`,
          );
        }
      }

      return {
        success: true,
        messageId: originalMessageId || waMessageId,
        waMessageId: waMessageId,
        to: cleanedPhone,
        type: mediaType,
        status: 'sent',
      };
    } catch (error) {
      this.logger.error(`Error sending media: ${error.message}`, error);
      throw new Error(`Failed to send media: ${error.message}`);
    }
  }

  /**
   * Send an interactive button message via WhatsApp Cloud API
   *
   * Interactive button messages allow users to tap quick reply buttons.
   * When a user taps a button, a webhook is sent with button_reply type.
   *
   * CRITICAL: Interactive messages can ONLY be sent within the 24-hour conversation window.
   * This method validates the window before sending and will throw an error if outside the window.
   *
   * Limitations are enforced via centralized validation in @see interactive-message.constants.ts:
   * - MAX_REPLY_BUTTONS (3): Maximum buttons per message
   * - MAX_BUTTON_TITLE_LENGTH (20): Maximum characters per button title
   * - MAX_BODY_TEXT_LENGTH (1024): Maximum body text characters
   * - MAX_FOOTER_TEXT_LENGTH (60): Maximum footer text characters
   *
   * @see https://developers.facebook.com/docs/whatsapp/guides/interactive-messages/
   *
   * @param senderId - The sender ID to determine which phoneNumberId to use
   * @param recipientPhone - The recipient's phone number
   * @param bodyText - Main message body text
   * @param buttons - Array of buttons (max 3)
   * @param footerText - Optional footer text
   * @param headerText - Optional header text
   * @returns Response with message ID
   * @throws BadRequestException if outside conversation window or validation fails
   */
  async sendInteractiveButtons(
    senderId: number,
    recipientPhone: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    footerText?: string,
    headerText?: string,
    options?: { isAiGenerated?: boolean },
  ): Promise<{
    success: boolean;
    messageId?: string;
    waMessageId?: string;
    error?: string;
  }> {
    try {
      const cleanedPhone = cleanPhoneNumber(recipientPhone);

      // Validate message content using centralized validation
      const validation = validateReplyButtonMessage(bodyText, buttons, {
        headerText,
        footerText,
      });

      if (!validation.isValid) {
        const errorMessages = validation.errors
          .map((e) => e.message)
          .join('; ');
        throw new Error(`Invalid interactive button message: ${errorMessages}`);
      }

      // Look up sender's phoneNumberId
      const senderRecord = await db.query.senders.findFirst({
        where: eq(senders.id, senderId),
      });

      if (!senderRecord) {
        throw new Error(`Sender with ID ${senderId} not found`);
      }

      if (!senderRecord.phoneNumberId) {
        throw new Error(
          `Sender ${senderId} does not have a phoneNumberId set.`,
        );
      }

      // Validate conversation window - CRITICAL: Interactive messages can ONLY be sent within 24-hour window
      const chatId = generateChatId(senderRecord.phoneNumber, cleanedPhone);
      const windowValidation =
        await this.conversationWindowService.validateFreeFormMessage(chatId);

      if (!windowValidation.isValid) {
        this.logger.error(
          `Conversation window validation failed for interactive button message to ${cleanedPhone}: ${windowValidation.errorMessage}`,
        );
        throw new BadRequestException({
          statusCode: 400,
          error: 'CONVERSATION_WINDOW_VIOLATION',
          errorCode: windowValidation.errorCode,
          message:
            windowValidation.errorCode === 'NO_CUSTOMER_MESSAGES'
              ? INTERACTIVE_MESSAGE_ERRORS.NO_CUSTOMER_MESSAGES
              : INTERACTIVE_MESSAGE_ERRORS.OUTSIDE_CONVERSATION_WINDOW,
          windowStatus: windowValidation.windowStatus,
        });
      }

      // Build interactive message payload
      const message: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanedPhone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: bodyText,
          },
          action: {
            buttons: buttons.map((btn) => ({
              type: 'reply',
              reply: {
                id: btn.id,
                title: btn.title,
              },
            })),
          },
        },
      };

      // Add optional header
      if (headerText) {
        message.interactive.header = {
          type: 'text',
          text: headerText,
        };
      }

      // Add optional footer (sanitized via centralized function)
      if (footerText) {
        message.interactive.footer = {
          text: sanitizeFooterText(footerText),
        };
      }

      // Send via Cloud API
      const response = await this.sendCloudAPIMessage(
        message,
        senderRecord.phoneNumberId,
      );

      if (!response.messages || response.messages.length === 0) {
        throw new Error('No message ID returned from Cloud API');
      }

      const waMessageId = response.messages[0].id;
      this.logger.log(
        `Interactive button message sent successfully. ID: ${waMessageId}`,
      );

      // Store message in database
      const messageId = await this.storeOutboundMessage({
        waMessageId,
        chatId,
        from: senderRecord.phoneNumber,
        to: cleanedPhone,
        body: bodyText,
        attachments: undefined,
        userId: senderRecord.userId,
        senderId,
        isInteractive: true,
        interactiveType: 'button',
        interactiveData: { buttons, footerText, headerText },
        isAiGenerated: options?.isAiGenerated ?? false,
      });

      // Emit WebSocket event for real-time UI update
      // CRITICAL: Without this, messages won't appear in UI until page refresh
      if (whatsAppGatewayInstance) {
        whatsAppGatewayInstance.emitMessage({
          messageId: waMessageId,
          chatId,
          sender: senderRecord.phoneNumber,
          text: bodyText,
          type: 'interactive',
          timestamp: new Date(),
          direction: 'outbound',
          status: 'sent',
          metadata: {
            interactiveType: 'button',
            interactiveData: {
              buttons,
              footerText,
              headerText,
            },
          },
          isAiGenerated: options?.isAiGenerated ?? false,
        });
      }

      return {
        success: true,
        messageId,
        waMessageId,
      };
    } catch (error) {
      this.logger.error(
        `Error sending interactive buttons: ${error.message}`,
        error,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send an interactive list message via WhatsApp Cloud API
   *
   * Interactive list messages display a button that opens a list of options.
   * Users can select one item from the list.
   *
   * CRITICAL: Interactive messages can ONLY be sent within the 24-hour conversation window.
   * This method validates the window before sending and will throw an error if outside the window.
   *
   * Limitations are enforced via centralized validation in @see interactive-message.constants.ts:
   * - MAX_LIST_SECTIONS (10): Maximum sections per message
   * - MAX_ROWS_PER_SECTION (10): Maximum rows per section
   * - MAX_LIST_BUTTON_TEXT_LENGTH (20): Maximum button text characters
   * - MAX_LIST_ROW_TITLE_LENGTH (24): Maximum row title characters
   * - MAX_LIST_ROW_DESCRIPTION_LENGTH (72): Maximum row description characters
   *
   * @see https://developers.facebook.com/docs/whatsapp/guides/interactive-messages/
   *
   * @param senderId - The sender ID to determine which phoneNumberId to use
   * @param recipientPhone - The recipient's phone number
   * @param bodyText - Main message body text
   * @param buttonText - Text on the button that opens the list
   * @param sections - List sections with rows
   * @param footerText - Optional footer text
   * @param headerText - Optional header text
   * @returns Response with message ID
   * @throws BadRequestException if outside conversation window or validation fails
   */
  async sendInteractiveList(
    senderId: number,
    recipientPhone: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{
      title?: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    footerText?: string,
    headerText?: string,
  ): Promise<{
    success: boolean;
    messageId?: string;
    waMessageId?: string;
    error?: string;
  }> {
    try {
      const cleanedPhone = cleanPhoneNumber(recipientPhone);

      // Validate message content using centralized validation
      const validation = validateListMessage(bodyText, buttonText, sections, {
        headerText,
        footerText,
      });

      if (!validation.isValid) {
        const errorMessages = validation.errors
          .map((e) => e.message)
          .join('; ');
        throw new Error(`Invalid interactive list message: ${errorMessages}`);
      }

      // Look up sender's phoneNumberId
      const senderRecord = await db.query.senders.findFirst({
        where: eq(senders.id, senderId),
      });

      if (!senderRecord) {
        throw new Error(`Sender with ID ${senderId} not found`);
      }

      if (!senderRecord.phoneNumberId) {
        throw new Error(
          `Sender ${senderId} does not have a phoneNumberId set.`,
        );
      }

      // Validate conversation window - CRITICAL: Interactive messages can ONLY be sent within 24-hour window
      const chatId = generateChatId(senderRecord.phoneNumber, cleanedPhone);
      const windowValidation =
        await this.conversationWindowService.validateFreeFormMessage(chatId);

      if (!windowValidation.isValid) {
        this.logger.error(
          `Conversation window validation failed for interactive list message to ${cleanedPhone}: ${windowValidation.errorMessage}`,
        );
        throw new BadRequestException({
          statusCode: 400,
          error: 'CONVERSATION_WINDOW_VIOLATION',
          errorCode: windowValidation.errorCode,
          message:
            windowValidation.errorCode === 'NO_CUSTOMER_MESSAGES'
              ? INTERACTIVE_MESSAGE_ERRORS.NO_CUSTOMER_MESSAGES
              : INTERACTIVE_MESSAGE_ERRORS.OUTSIDE_CONVERSATION_WINDOW,
          windowStatus: windowValidation.windowStatus,
        });
      }

      // Build interactive message payload
      const message: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanedPhone,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: {
            text: bodyText,
          },
          action: {
            button: buttonText,
            sections: sections.map((section) => ({
              title: section.title,
              rows: section.rows.map((row) => ({
                id: row.id,
                title: row.title,
                description: row.description,
              })),
            })),
          },
        },
      };

      // Add optional header
      if (headerText) {
        message.interactive.header = {
          type: 'text',
          text: headerText,
        };
      }

      // Add optional footer (sanitized via centralized function)
      if (footerText) {
        message.interactive.footer = {
          text: sanitizeFooterText(footerText),
        };
      }

      // Send via Cloud API
      const response = await this.sendCloudAPIMessage(
        message,
        senderRecord.phoneNumberId,
      );

      if (!response.messages || response.messages.length === 0) {
        throw new Error('No message ID returned from Cloud API');
      }

      const waMessageId = response.messages[0].id;
      this.logger.log(
        `Interactive list message sent successfully. ID: ${waMessageId}`,
      );

      // Store message in database
      const messageId = await this.storeOutboundMessage({
        waMessageId,
        chatId,
        from: senderRecord.phoneNumber,
        to: cleanedPhone,
        body: bodyText,
        attachments: undefined,
        userId: senderRecord.userId,
        senderId,
        isInteractive: true,
        interactiveType: 'list',
        interactiveData: { buttonText, sections, footerText, headerText },
      });

      // Emit WebSocket event for real-time UI update
      // CRITICAL: Without this, messages won't appear in UI until page refresh
      if (whatsAppGatewayInstance) {
        whatsAppGatewayInstance.emitMessage({
          messageId: waMessageId,
          chatId,
          sender: senderRecord.phoneNumber,
          text: bodyText,
          type: 'interactive',
          timestamp: new Date(),
          direction: 'outbound',
          status: 'sent',
          metadata: {
            interactiveType: 'list',
            interactiveData: {
              buttonText,
              sections,
              footerText,
              headerText,
            },
          },
        });
      }

      return {
        success: true,
        messageId,
        waMessageId,
      };
    } catch (error) {
      this.logger.error(
        `Error sending interactive list: ${error.message}`,
        error,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Convert audio to WhatsApp-compatible format if needed
   * Downloads webm audio from S3, converts to ogg/opus, uploads back to S3
   * @returns New presigned URL for converted audio, or null if no conversion needed
   */
  private async convertAudioIfNeeded(
    messageId: string,
    senderId?: number,
  ): Promise<string | null> {
    try {
      // Get message to find attachment info
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message || !message.attachments) {
        return null;
      }

      const attachments = message.attachments as any[];
      const audioAttachment = attachments.find((a) => a.type === 'audio');

      if (!audioAttachment) {
        return null;
      }

      // Check if conversion is needed (webm format)
      const mimeType = audioAttachment.mimeType || '';
      if (!this.audioConverterService.needsConversion(mimeType)) {
        this.logger.log(
          `Audio format ${mimeType} is WhatsApp-compatible, no conversion needed`,
        );
        return null;
      }

      // Check if already converted (look for converted s3Key)
      if (audioAttachment.convertedS3Key) {
        this.logger.log(
          `Using previously converted audio: ${audioAttachment.convertedS3Key}`,
        );
        const downloadData = await this.s3Service.generatePresignedDownloadUrl(
          audioAttachment.convertedS3Key,
          { expiresIn: 3600 },
        );
        return downloadData.url;
      }

      this.logger.log(
        `Converting audio from ${mimeType} to ogg/opus for WhatsApp compatibility`,
      );

      // Download original audio from S3
      const originalBuffer = await this.s3Service.downloadFile(
        audioAttachment.s3Key,
      );
      if (!originalBuffer) {
        this.logger.error(
          `Failed to download audio from S3: ${audioAttachment.s3Key}`,
        );
        return null;
      }

      // Convert to ogg/opus
      const converted = await this.audioConverterService.convertToOggOpus(
        originalBuffer,
        mimeType,
      );

      // Generate new S3 key for converted file
      const originalKey = audioAttachment.s3Key;
      const convertedKey = originalKey.replace(/\.[^.]+$/, '.ogg');

      // Upload converted file to S3
      await this.s3Service.uploadFile(
        convertedKey,
        converted.buffer,
        converted.mimeType,
      );

      this.logger.log(`Converted audio uploaded to S3: ${convertedKey}`);

      // Update attachment in database with converted file info
      const updatedAttachments = attachments.map((a) => {
        if (a.id === audioAttachment.id) {
          return {
            ...a,
            convertedS3Key: convertedKey,
            convertedMimeType: converted.mimeType,
          };
        }
        return a;
      });

      await db
        .update(messages)
        .set({ attachments: updatedAttachments as any })
        .where(eq(messages.messageId, messageId));

      // Generate presigned URL for converted file
      const downloadData = await this.s3Service.generatePresignedDownloadUrl(
        convertedKey,
        { expiresIn: 3600 },
      );

      return downloadData.url;
    } catch (error) {
      this.logger.error(`Error converting audio: ${error.message}`, error);
      // Return null to fall back to original URL (may fail on WhatsApp side)
      return null;
    }
  }

  /**
   * Upload media to WhatsApp Cloud API servers
   *
   * WhatsApp requires media to be uploaded to their servers before sending.
   * This method:
   * 1. Downloads the file from S3 using a presigned URL
   * 2. Uploads the binary data to WhatsApp's media endpoint
   * 3. Returns the WhatsApp media_id for use in messages
   *
   * Note: Image normalization (CMYK to RGB, 8-bit conversion) is now handled
   * at KB media upload time, ensuring all stored images are already WhatsApp-compatible.
   *
   * @param s3Key - S3 object key for the media file
   * @param mimeType - MIME type of the media (e.g., 'image/jpeg')
   * @param phoneNumberId - WhatsApp phone number ID to associate the upload with
   * @returns WhatsApp media_id
   * @private
   */
  private async uploadMediaToWhatsApp(
    s3Key: string,
    mimeType: string,
    phoneNumberId: string,
  ): Promise<string> {
    this.logger.log(
      `[Media Upload] Uploading ${s3Key} (${mimeType}) to WhatsApp...`,
    );

    try {
      // 1. Download the file from S3
      const fileBuffer = await this.s3Service.downloadFile(s3Key);

      if (!fileBuffer) {
        throw new Error(`Failed to download file from S3: ${s3Key}`);
      }

      // 2. Upload to WhatsApp Cloud API
      const url = buildCloudAPIUrl(
        phoneNumberId,
        'media',
        'v20.0',
        this.metaAccessToken,
        this.metaAppSecret,
      );

      // Create form data with the file
      const formData = new FormData();
      // Convert Buffer to Uint8Array for Blob compatibility
      const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
      formData.append('file', blob, s3Key.split('/').pop() || 'media');
      formData.append('messaging_product', 'whatsapp');
      formData.append('type', mimeType);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.metaAccessToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `WhatsApp media upload failed: ${response.status} ${JSON.stringify(errorData)}`,
        );
      }

      const result = await response.json();
      const mediaId = result.id;

      if (!mediaId) {
        throw new Error('No media_id returned from WhatsApp upload');
      }

      this.logger.log(
        `[Media Upload] Successfully uploaded ${s3Key} to WhatsApp, mediaId: ${mediaId}`,
      );

      return mediaId;
    } catch (error) {
      this.logger.error(
        `[Media Upload] Failed to upload ${s3Key}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Internal method: Send message via Cloud API HTTP endpoint with retry
   *
   * IMPORTANT: Uses exponential backoff with max 3 retries to prevent:
   * - Infinite retry loops that can cause WABA bans
   * - Rate limiting issues with Meta's API
   *
   * @private
   */
  private async sendCloudAPIMessage(
    message: any,
    phoneNumberId?: string,
  ): Promise<CloudAPISendMessageResponse> {
    // Use provided phoneNumberId, or fall back to default (for backward compatibility)
    const actualPhoneNumberId = phoneNumberId!;
    // Include appsecret_proof in URL when app secret is available (required by Meta)
    const url = buildCloudAPIUrl(
      actualPhoneNumberId,
      'messages',
      'v20.0',
      this.metaAccessToken,
      this.metaAppSecret,
    );
    const headers = getCloudAPIHeaders(this.metaAccessToken);

    const result = await withRetry(
      async () => {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(message),
        });

        if (!response.ok) {
          const errorData = await response.json();
          const error = new Error(
            `Cloud API error: ${response.status} ${JSON.stringify(errorData)}`,
          );
          // Attach status for retry logic classification
          (error as any).response = {
            status: response.status,
            data: errorData,
          };
          throw error;
        }

        return await response.json();
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        logger: this.logger,
        operationName: 'sendCloudAPIMessage',
      },
    );

    if (!result.success) {
      this.logger.error(
        `Cloud API request failed permanently after ${result.attempts} attempts: ${result.error?.message}`,
      );
      throw result.error;
    }

    return result.result;
  }

  /**
   * Retrieve detailed message status with full delivery tracking
   *
   * Returns the complete status lifecycle for a message:
   * - Current status (pending, sent, delivered, read, failed)
   * - Timestamp for each status transition
   * - Full status history for debugging
   *
   * Note: Status updates come via Meta Cloud API webhooks.
   * This method returns the current state from our local database.
   *
   * @param messageId - Cloud API message ID (wamid)
   * @returns Comprehensive message status information with history
   */
  async getMessageStatus(messageId: string) {
    try {
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        throw new Error(`Message not found: ${messageId}`);
      }

      // Build status history based on timestamp progression
      const statusHistory: Array<{
        status: string;
        timestamp: string;
        failureReason?: string;
      }> = [];

      // Pending status (implicit, message created)
      statusHistory.push({
        status: 'pending',
        timestamp: message.timestamp.toISOString(),
      });

      // Track each status transition
      if (message.sentAt) {
        statusHistory.push({
          status: 'sent',
          timestamp: message.sentAt.toISOString(),
        });
      }

      if (message.deliveredAt) {
        statusHistory.push({
          status: 'delivered',
          timestamp: message.deliveredAt.toISOString(),
        });
      }

      if (message.readAt) {
        statusHistory.push({
          status: 'read',
          timestamp: message.readAt.toISOString(),
        });
      }

      if (message.status === 'failed' && message.failedReason) {
        statusHistory.push({
          status: 'failed',
          timestamp:
            message.updatedAt?.toISOString() || new Date().toISOString(),
          failureReason: message.failedReason,
        });
      }

      return {
        messageId,
        direction: message.direction,
        currentStatus: message.status,
        sentAt: message.sentAt?.toISOString() || null,
        deliveredAt: message.deliveredAt?.toISOString() || null,
        readAt: message.readAt?.toISOString() || null,
        failedReason: message.failedReason || null,
        statusHistory: statusHistory,
        updatedAt: message.updatedAt?.toISOString() || new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Error retrieving message status: ${error.message}`,
        error,
      );
      throw new Error(`Failed to retrieve message status: ${error.message}`);
    }
  }

  /**
   * Handle inbound WhatsApp message webhook
   * Processes message from Cloud API webhook
   * @param message - Inbound message from webhook
   * @param webhookPayload - Full webhook payload for metadata
   * @private
   */
  private async handleInboundMessage(
    message: CloudAPIInboundMessage,
    webhookPayload: CloudAPIWebhookPayload,
    senderId?: number,
  ): Promise<void> {
    try {
      console.log('=== HANDLE INBOUND MESSAGE ===');
      console.log('Raw message:', JSON.stringify(message, null, 2));

      // === SKIP UNSUPPORTED MESSAGE TYPES ===
      // WhatsApp Cloud API sends type: "unsupported" for messages it cannot process
      // (e.g., album metadata, ephemeral messages, etc.). These are error notifications,
      // not actual content, so we skip storing them to avoid "[Message type not supported]" bubbles.
      // Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
      if (message.type === 'unsupported') {
        this.logger.log(
          `[Inbound] Skipping unsupported message type. ID: ${message.id}, Errors: ${JSON.stringify(message.errors || [])}`,
        );
        console.log(
          `â­ï¸ SKIPPED: Unsupported message type ${message.id} - this is a Cloud API error notification, not actual content`,
        );
        return; // Don't create a message bubble for unsupported types
      }

      const senderPhone = cleanPhoneNumber(message.from);

      console.log('Sender phone:', senderPhone);
      console.log('Message ID:', message.id);
      console.log('Sender ID from webhook:', senderId);
      const messageId = message.id;

      // === DEDUPLICATION CHECK ===
      // Meta may retry webhooks, so check if we already have this message
      const existingMessage = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
        columns: { id: true, messageId: true },
      });

      if (existingMessage) {
        this.logger.warn(
          `âš ï¸ Duplicate message detected: ${messageId} (already stored). ` +
            `This is likely a Meta webhook retry. Skipping.`,
        );
        console.log(
          `ðŸ”„ DUPLICATE: Message ${messageId} already exists - this is a Meta webhook retry`,
        );
        return; // Skip processing - already handled
      }

      // Get sender details to get the business phone
      let sender: any = null;
      if (senderId) {
        sender = await db.query.senders.findFirst({
          where: eq(senders.id, senderId),
        });
      }

      if (!sender) {
        this.logger.error(
          `No sender found for ID ${senderId}. Cannot process message.`,
        );
        throw new Error(
          `Sender not found for message. SenderId: ${senderId}, MessageId: ${messageId}`,
        );
      }

      const businessPhone = sender.phoneNumber;

      console.log('Business phone:', businessPhone);

      // Generate chat ID
      const chatId = generateChatId(businessPhone, senderPhone);
      console.log('Generated chat ID:', chatId);

      // Ensure chat exists - capture if this is a newly created chat (customer initiated)
      const { chat, isNewChat } = await this.getOrCreateChat(
        chatId,
        businessPhone,
        senderPhone,
        senderId,
      );
      console.log('Chat created/retrieved:', {
        chatId: chat.chatId,
        id: chat.id,
        senderId: chat.senderId,
        isNewChat,
      });

      // If this is a new chat (customer initiated conversation), emit chat:new event
      // This notifies the frontend to add the chat to the list and show notifications
      if (isNewChat && whatsAppGatewayInstance) {
        whatsAppGatewayInstance.emitChatCreated({
          chatId: chat.chatId,
          businessPhone: chat.businessPhone,
          participantPhone: chat.participantPhone,
          participantName: chat.participantName || chat.participantPhone,
          senderId: chat.senderId!,
          userId: chat.userId || undefined,
          isActive: chat.isActive ?? true,
          unreadCount: 0, // Will be updated by updateChatLastMessage
          createdAt: chat.createdAt || new Date(),
        });
      }

      // Determine message type and extract content
      const messageType = mapCloudAPIMessageType(message.type);
      let textContent = '';
      let mediaMetadata: MediaMetadata | undefined;
      let contactsData:
        | {
            type: 'contacts';
            contacts: Array<{
              name: {
                formatted_name?: string;
                first_name?: string;
                last_name?: string;
                middle_name?: string;
                prefix?: string;
                suffix?: string;
              };
              phones?: Array<{
                phone: string;
                type?: string;
                wa_id?: string;
              }>;
              emails?: any[];
              addresses?: any[];
              org?: any;
              birthday?: string;
              urls?: any[];
            }>;
          }
        | undefined;

      switch (message.type) {
        case 'text':
          textContent = message.text?.body || '';
          break;
        case 'image':
          mediaMetadata = {
            type: 'image',
            mimeType: message.image?.mime_type || 'image/jpeg',
            sha256: message.image?.sha256 || '',
            mediaId: message.image?.id || '',
            caption: message.image?.caption,
          };
          // Only show caption text, images are self-explanatory
          textContent = message.image?.caption || '';
          break;
        case 'video': {
          // Log FULL video message payload to debug GIF detection
          // WhatsApp Cloud API sends GIFs as video messages with animated=true flag
          this.logger.log(
            `[Inbound Video] FULL PAYLOAD: ${JSON.stringify(message.video, null, 2)}`,
          );
          this.logger.log(
            `[Inbound Video] message.type=${message.type}, animated=${message.video?.animated}, mime_type=${message.video?.mime_type}, id=${message.video?.id}`,
          );
          // Also log the entire message object to see all available fields
          this.logger.log(
            `[Inbound Video] FULL MESSAGE: ${JSON.stringify(message, null, 2)}`,
          );
          const isGif = message.video?.animated === true;
          mediaMetadata = {
            type: isGif ? 'gif' : 'video',
            mimeType: message.video?.mime_type || 'video/mp4',
            sha256: message.video?.sha256 || '',
            mediaId: message.video?.id || '',
            caption: message.video?.caption,
            isAnimated: isGif,
          };
          // Only show caption text, videos and GIFs are self-explanatory
          textContent = message.video?.caption || '';
          break;
        }
        case 'sticker':
          // Handle sticker messages (static or animated webp)
          this.logger.log(
            `[Inbound Sticker] animated=${message.sticker?.animated}, mime_type=${message.sticker?.mime_type}, id=${message.sticker?.id}`,
          );
          mediaMetadata = {
            type: 'sticker',
            mimeType: message.sticker?.mime_type || 'image/webp',
            sha256: message.sticker?.sha256 || '',
            mediaId: message.sticker?.id || '',
            isAnimated: message.sticker?.animated === true,
          };
          // Stickers don't have caption text
          textContent = '';
          break;
        case 'audio':
          // Log audio message details to debug voice note detection
          this.logger.log(
            `[Inbound Audio] voice=${message.audio?.voice}, mime_type=${message.audio?.mime_type}, id=${message.audio?.id}`,
          );
          mediaMetadata = {
            type: 'audio',
            mimeType: message.audio?.mime_type || 'audio/mpeg',
            sha256: message.audio?.sha256 || '',
            mediaId: message.audio?.id || '',
            isVoiceNote: message.audio?.voice === true, // WhatsApp sets voice=true for PTT messages
          };
          // Don't show text for audio messages - the audio bubble is self-explanatory
          textContent = '';
          break;
        case 'document':
          mediaMetadata = {
            type: 'document',
            mimeType: message.document?.mime_type || 'application/octet-stream',
            sha256: message.document?.sha256 || '',
            mediaId: message.document?.id || '',
            filename: message.document?.filename,
          };
          // Don't include filename in text - it will be shown separately in the attachment display
          textContent = '';
          break;
        case 'button':
          textContent = message.button?.text || '[Button]';
          break;
        case 'interactive':
          // Handle interactive message responses (button_reply / list_reply)
          // These are sent when user clicks an interactive button or list item
          if (message.interactive?.type === 'button_reply') {
            const buttonReply = message.interactive.button_reply;
            textContent = buttonReply?.title || '[Button clicked]';
            this.logger.log(
              `[Interactive] Button reply: id=${buttonReply?.id}, title=${buttonReply?.title}`,
            );
            // Store button context in metadata for AI processing
            mediaMetadata = {
              type: 'interactive_response',
              mimeType: 'application/json',
              sha256: '',
              mediaId: '',
              interactiveType: 'button_reply',
              interactiveData: JSON.stringify({
                type: 'button_reply',
                buttonId: buttonReply?.id,
                buttonTitle: buttonReply?.title,
              }),
            };
          } else if (message.interactive?.type === 'list_reply') {
            const listReply = message.interactive.list_reply;
            textContent = listReply?.title || '[List item selected]';
            this.logger.log(
              `[Interactive] List reply: id=${listReply?.id}, title=${listReply?.title}, description=${listReply?.description}`,
            );
            // Store list context in metadata for AI processing
            mediaMetadata = {
              type: 'interactive_response',
              mimeType: 'application/json',
              sha256: '',
              mediaId: '',
              interactiveType: 'list_reply',
              interactiveData: JSON.stringify({
                type: 'list_reply',
                rowId: listReply?.id,
                rowTitle: listReply?.title,
                rowDescription: listReply?.description,
              }),
            };
          } else {
            textContent = '[Interactive message]';
          }
          break;
        case 'contacts':
          // Handle incoming contacts message
          const contacts = message.contacts || [];
          const contactNames = contacts
            .map(
              (c: any) =>
                c.name?.formatted_name || c.name?.first_name || 'Contact',
            )
            .join(', ');
          textContent =
            contacts.length === 1
              ? `Contact: ${contactNames}`
              : `${contacts.length} contacts: ${contactNames}`;
          // Store contacts data separately (not in mediaMetadata which is for files)
          contactsData = {
            type: 'contacts',
            contacts: contacts.map((c: any) => ({
              name: {
                formatted_name: c.name?.formatted_name,
                first_name: c.name?.first_name,
                last_name: c.name?.last_name,
                middle_name: c.name?.middle_name,
                prefix: c.name?.prefix,
                suffix: c.name?.suffix,
              },
              phones: c.phones?.map((p: any) => ({
                phone: p.phone,
                type: p.type,
                wa_id: p.wa_id,
              })),
              emails: c.emails,
              addresses: c.addresses,
              org: c.org,
              birthday: c.birthday,
              urls: c.urls,
            })),
          };
          break;
        case 'reaction':
          // Reactions are handled separately - they don't create new messages
          // They react to existing messages from the customer
          await this.handleInboundReaction(
            message,
            chatId,
            senderPhone,
            sender,
          );
          // Return early - reactions don't follow the normal message flow
          return;
        case 'location':
          // Handle location messages with full metadata storage
          const locationData = message.location;
          if (locationData) {
            textContent = locationData.name
              ? `ðŸ“ ${locationData.name}${locationData.address ? ` - ${locationData.address}` : ''}`
              : `ðŸ“ Location: ${locationData.latitude}, ${locationData.longitude}`;
          } else {
            textContent = 'ðŸ“ Location shared';
          }
          break;
        case 'order':
          // Handle order messages (WhatsApp Business)
          textContent = 'ðŸ›’ Order received';
          break;
        case 'system':
          // Handle system messages (group changes, etc.)
          textContent = message.system?.body || '[System message]';
          break;
        // Note: 'unsupported' type is handled early in handleInboundMessage() with an early return
        // since unsupported messages are Cloud API error notifications, not actual content
        default:
          // Log unknown message types for debugging
          this.logger.warn(
            `[Inbound] Unknown message type: ${message.type}. Full message: ${JSON.stringify(message, null, 2)}`,
          );
          textContent = `[Unsupported message type: ${message.type || 'unknown'}]`;
      }

      // Handle reply context from incoming message
      let replyToMessageId: string | undefined;
      let replyPreview: ReplyPreview | undefined;

      if (message.context?.id) {
        // This is a reply - try to find the original message
        this.logger.log(`Inbound message is a reply to: ${message.context.id}`);

        // Look up original message by WhatsApp ID (could be messageId or stored in mediaUrl with 'wa:' prefix)
        const originalMessage = await db.query.messages.findFirst({
          where: or(
            eq(messages.messageId, message.context.id),
            eq(messages.mediaUrl, `wa:${message.context.id}`),
          ),
        });

        if (originalMessage) {
          replyToMessageId = originalMessage.messageId;

          // Generate reply preview from the original message
          const senderName =
            originalMessage.direction === 'outbound'
              ? 'You'
              : await this.getContactNameForReply(originalMessage.sender);

          replyPreview = generateReplyPreview(
            {
              messageId: originalMessage.messageId,
              text: originalMessage.text,
              type: originalMessage.type,
              direction: originalMessage.direction as 'inbound' | 'outbound',
              sender: originalMessage.sender,
              attachments: originalMessage.attachments as any[],
              isDeleted: originalMessage.isDeleted || false,
            },
            senderName,
          );

          this.logger.log(
            `Found original message for reply: ${originalMessage.messageId}`,
          );
        } else {
          // Original message not found - create unavailable preview
          this.logger.warn(
            `Original message not found for reply context: ${message.context.id}`,
          );
          replyPreview = {
            messageId: message.context.id,
            senderType: 'customer',
            senderName: message.context.from || 'Unknown',
            type: 'text',
            text: 'Message unavailable',
            unavailable: true,
          };
        }
      }

      // For media messages, use the media type (gif, sticker, video, etc.)
      // Otherwise use the mapped message type
      const finalMessageType = mediaMetadata?.type || messageType;

      // Extract location data if this is a location message
      const locationData =
        message.type === 'location' && message.location
          ? {
              latitude: message.location.latitude,
              longitude: message.location.longitude,
              name: message.location.name,
              address: message.location.address,
              url: message.location.url,
            }
          : undefined;

      // Store inbound message
      await this.storeInboundMessage({
        waMessageId: messageId,
        chatId,
        source: 'whatsapp',
        sender: senderPhone,
        type: finalMessageType,
        text: textContent,
        mediaMetadata,
        contactsData,
        direction: 'inbound',
        status: 'delivered',
        timestamp: new Date(parseInt(message.timestamp) * 1000),
        waPhoneNumberId: businessPhone,
        // AI memory context
        userId: chat.userId ?? undefined,
        senderId: senderId,
        replyToMessageId,
        replyPreview,
        locationData,
      });

      console.log('Message stored successfully:', {
        messageId,
        chatId,
      });

      // Update chat with last message preview and type
      await this.updateChatLastMessage(chatId, textContent, finalMessageType);
      console.log('Chat updated with last message');

      this.logger.log(
        `Inbound message stored. From: ${senderPhone}, Type: ${messageType}, ID: ${messageId}`,
      );

      // ðŸ”¥ EMIT MESSAGE VIA WEBSOCKET
      // Notify all connected clients of the new message in real-time
      // Fetch the stored message to get the complete attachment data (including s3Key)
      if (whatsAppGatewayInstance) {
        const messageTimestamp = new Date(parseInt(message.timestamp) * 1000);

        // Fetch the stored message to get complete attachment data
        const storedMessage = await db.query.messages.findFirst({
          where: eq(messages.messageId, messageId),
        });

        // Use the complete attachment data from the database
        const attachments =
          storedMessage?.attachments && Array.isArray(storedMessage.attachments)
            ? (storedMessage.attachments as any[]).map((att) => ({
                id: att.id,
                type: att.type,
                mediaId: att.id, // For backwards compatibility
                fileName: att.fileName,
                mimeType: att.mimeType,
                size: att.size,
                s3Key: att.s3Key,
                thumbnailKey: att.thumbnailKey,
                thumbnailStatus: att.thumbnailStatus,
                width: att.width,
                height: att.height,
                blurhash: att.blurhash,
                duration: att.duration,
                status: att.status,
                isVoiceNote: att.isVoiceNote || false,
                isAnimated: att.isAnimated || false,
              }))
            : undefined;

        whatsAppGatewayInstance.emitMessage({
          messageId,
          chatId,
          sender: senderPhone,
          text: textContent,
          type: messageType,
          timestamp: messageTimestamp,
          attachments,
          // Include reply data for real-time updates
          replyToMessageId,
          replyPreview,
          // Include location metadata for location messages
          metadata: locationData ? { location: locationData } : undefined,
        });
      }

      // === AI CHATBOT INTEGRATION ===
      // Trigger AI agent for inbound customer messages
      if (chat.userId && senderId) {
        try {
          this.logger.log(`[AI] Processing inbound message for chat ${chatId}`);

          // Extract interactive response data if this was a button/list click
          let interactiveResponse:
            | {
                type: 'button_reply' | 'list_reply';
                buttonId?: string;
                buttonTitle?: string;
                rowId?: string;
                rowTitle?: string;
                rowDescription?: string;
              }
            | undefined;

          // Check if this is an interactive response (stored in mediaMetadata)
          const interactiveMeta = mediaMetadata as any;
          if (
            interactiveMeta?.interactiveType &&
            interactiveMeta?.interactiveData
          ) {
            try {
              const parsed = JSON.parse(interactiveMeta.interactiveData);
              if (parsed.type === 'button_reply') {
                interactiveResponse = {
                  type: 'button_reply',
                  buttonId: parsed.buttonId,
                  buttonTitle: parsed.buttonTitle,
                };
              } else if (parsed.type === 'list_reply') {
                interactiveResponse = {
                  type: 'list_reply',
                  rowId: parsed.rowId,
                  rowTitle: parsed.rowTitle,
                  rowDescription: parsed.rowDescription,
                };
              }
              this.logger.log(
                `[AI] Interactive response detected: ${JSON.stringify(interactiveResponse)}`,
              );
            } catch (e) {
              this.logger.warn(
                `[AI] Failed to parse interactive response data: ${e}`,
              );
            }
          }

          const aiResult = await this.aiChatbot.processMessage({
            chatId,
            messageId,
            messageContent: textContent,
            senderId,
            userId: chat.userId,
            isFromCustomer: true,
            interactiveResponse,
          });

          if (aiResult.success) {
            this.logger.debug(`[AI] Message processed for chat ${chatId}`);

            // Check if AI generated a response that should be sent
            if (
              aiResult.aiResponse?.shouldSend &&
              aiResult.aiResponse.content
            ) {
              this.logger.log(
                `[AI] Response to send: "${aiResult.aiResponse.content.substring(0, 50)}..."`,
              );

              try {
                if (!sender?.phoneNumberId) {
                  throw new Error(
                    `Sender ${senderId} does not have a phoneNumberId configured`,
                  );
                }

                await this.dispatchAiResponse(
                  chatId,
                  senderPhone,
                  businessPhone,
                  sender.phoneNumberId,
                  aiResult.aiResponse,
                  chat.userId ?? undefined,
                  senderId,
                  sender,
                );
              } catch (sendError) {
                this.logger.error(
                  `[AI] Failed to send AI response: ${sendError}`,
                );
              } finally {
                if (whatsAppGatewayInstance) {
                  whatsAppGatewayInstance.emitAITypingStop(chatId);
                }
              }
            }

            if (aiResult.handoffRequested) {
              this.logger.log(`[AI] Handoff requested for chat ${chatId}`);
            }

            // Emit typing stop if AI didn't send a response
            if (
              !aiResult.aiResponse?.shouldSend ||
              !aiResult.aiResponse?.content
            ) {
              if (whatsAppGatewayInstance) {
                whatsAppGatewayInstance.emitAITypingStop(chatId);
              }
            }
          } else {
            this.logger.warn(
              `[AI] Message processing failed: ${aiResult.error}`,
            );
            if (whatsAppGatewayInstance) {
              whatsAppGatewayInstance.emitAITypingStop(chatId);
            }
          }
        } catch (aiError) {
          this.logger.error(`[AI] Error processing message: ${aiError}`);
          if (whatsAppGatewayInstance) {
            whatsAppGatewayInstance.emitAITypingStop(chatId);
          }
        }
      } else {
        this.logger.debug(
          `[AI] Skipping AI processing - no userId (${chat.userId}) or senderId (${senderId})`,
        );
      }
    } catch (error) {
      this.logger.error('Error handling inbound message:', error);
      throw error;
    }
  }

  /**
   * Manually trigger AI response for a chat (used when Resuming AI)
   * Reprocesses the last customer message and dispatches a response if AI generates one.
   */
  /**
   * Trigger AI response generation for a chat when resuming from handoff/pause.
   *
   * @param chatId - The chat ID to generate response for
   * @param userId - The user ID (owner of the chat)
   */
  async triggerAiResponseForResume(
    chatId: string,
    userId: number,
  ): Promise<void> {
    try {
      this.logger.log(`[Resume AI] Triggering AI response for chat ${chatId}`);

      // 1. Get Chat details
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      if (!chat) {
        this.logger.warn(`[Resume AI] Chat not found: ${chatId}`);
        return;
      }

      // 2. Get Last Message (must be inbound)
      const lastMessage = await db.query.messages.findFirst({
        where: eq(messages.chatId, chatId),
        orderBy: desc(messages.timestamp),
      });

      if (!lastMessage || lastMessage.direction !== 'inbound') {
        this.logger.log(
          `[Resume AI] Last message was not inbound or undefined. No reply needed.`,
        );
        return;
      }

      // 3. Get Sender details (for phoneNumberId)
      const sender = await db.query.senders.findFirst({
        where: eq(senders.id, chat.senderId),
      });

      if (!sender || !sender.phoneNumberId) {
        this.logger.error(
          `[Resume AI] Sender configuration missing for chat ${chatId}`,
        );
        return;
      }

      // 4. Call AI Chatbot
      this.logger.log(
        `[Resume AI] Processing message ${lastMessage.messageId} for AI response...`,
      );

      const aiResult = await this.aiChatbot.processMessage({
        chatId,
        messageId: lastMessage.messageId,
        messageContent: lastMessage.text || '',
        senderId: chat.senderId,
        userId,
        isFromCustomer: true,
      });

      // 5. Dispatch Response
      if (
        aiResult.success &&
        aiResult.aiResponse?.shouldSend &&
        aiResult.aiResponse.content
      ) {
        this.logger.log(`[Resume AI] Response generated. Dispatching...`);
        await this.dispatchAiResponse(
          chatId,
          lastMessage.sender, // recipient phone (customer)
          chat.businessPhone,
          sender.phoneNumberId,
          aiResult.aiResponse,
          userId,
          chat.senderId,
          sender,
        );
      } else {
        this.logger.log(
          `[Resume AI] No response generated or shouldSend=false.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[Resume AI] Error triggering response: ${error.message}`,
        error,
      );
    }
  }

  /**
   * Internal helper: Dispatch AI Response (Text, Media, or Interactive) via Cloud API
   */
  private async dispatchAiResponse(
    chatId: string,
    recipientPhone: string,
    businessPhone: string,
    phoneNumberId: string,
    aiResponse: {
      content: string;
      interactiveData?: any;
      mediaAttachment?: any;
    },
    userId: number | undefined,
    senderId: number,
    sender: any,
  ): Promise<void> {
    // Check if we have a media attachment to send
    const mediaAttachment = aiResponse.mediaAttachment;

    // STEP 0: Record Rate Limit Usage
    // We record this BEFORE trying to send to ensure we account for the attempt
    // regardless of whether the specific API call succeeds (fail-safe accounting)
    if (userId) {
      // Should always be present for AI responses
      await this.rateLimiter.recordMessage(userId, chatId, {
        isAiMessage: true,
        senderId,
      });
    }

    if (mediaAttachment) {
      // Send media with the text as caption or as a separate message
      this.logger.log(
        `[AI] Sending media attachment: ${mediaAttachment.fileName} (${mediaAttachment.mediaType})`,
      );

      // Upload media to WhatsApp servers first to get a media_id
      // This is more reliable than using presigned URLs
      const whatsappMediaId = await this.uploadMediaToWhatsApp(
        mediaAttachment.s3Key,
        mediaAttachment.mimeType,
        phoneNumberId,
      );

      // Prepare text response (sent first if media doesn't support caption)
      const aiResponseText = aiResponse.content;

      // For documents/videos/images, we can include caption with the media
      const mediaSupportsCaption = ['image', 'video', 'document'].includes(
        mediaAttachment.mediaType,
      );

      // WhatsApp caption limits:
      // - Images: 1024 characters
      // - Videos: 1024 characters
      // - Documents: 1024 characters (filename is separate)
      const MAX_CAPTION_LENGTH = 1024;

      // Determine caption: use AI response text or media's built-in caption
      // Truncate if needed to stay within WhatsApp's limits
      let caption: string | undefined;
      let textToSendSeparately: string | undefined;

      if (mediaSupportsCaption && aiResponseText) {
        if (aiResponseText.length <= MAX_CAPTION_LENGTH) {
          caption = aiResponseText;
        } else {
          // Caption too long - send text separately, media without caption
          this.logger.warn(
            `[AI] AI response (${aiResponseText.length} chars) exceeds caption limit (${MAX_CAPTION_LENGTH}). Sending text separately.`,
          );
          textToSendSeparately = aiResponseText;
          caption = undefined; // Don't include caption with media
        }
      }

      // Send text first if media doesn't support caption OR if caption was too long
      if (textToSendSeparately || (!mediaSupportsCaption && aiResponseText)) {
        const textToSend = textToSendSeparately || aiResponseText;
        const textMessage = {
          messaging_product: 'whatsapp' as const,
          to: recipientPhone,
          type: 'text' as const,
          text: {
            preview_url: true,
            body: textToSend,
          },
        };

        const textResponse = await this.sendCloudAPIMessage(
          textMessage,
          phoneNumberId,
        );

        const textMessageId = textResponse.messages?.[0]?.id;
        if (textMessageId) {
          // Store text message
          await this.storeOutboundMessage({
            waMessageId: textMessageId,
            chatId,
            from: businessPhone,
            to: recipientPhone,
            body: textToSend,
            userId: userId,
            senderId,
            isAiGenerated: true,
          });
        }
      }

      // Construct media message using WhatsApp media_id (not URL)
      const mediaPayload: any = {
        id: whatsappMediaId, // Use uploaded media ID instead of link
      };

      if (caption) {
        mediaPayload.caption = caption;
      }

      if (mediaAttachment.mediaType === 'document') {
        mediaPayload.filename = mediaAttachment.fileName;
      }

      const mediaMessage = {
        messaging_product: 'whatsapp' as const,
        to: recipientPhone,
        type: mediaAttachment.mediaType,
        [mediaAttachment.mediaType]: mediaPayload,
      };

      // Debug: Log the exact message being sent
      this.logger.debug(
        `[Media Message] Sending to WhatsApp: ${JSON.stringify(mediaMessage, null, 2)}`,
      );

      const mediaResponse = await this.sendCloudAPIMessage(
        mediaMessage,
        phoneNumberId,
      );

      const mediaMessageId = mediaResponse.messages?.[0]?.id;
      if (!mediaMessageId) {
        throw new Error('No message ID returned from Cloud API for media');
      }

      this.logger.log(
        `[AI] AI media response sent successfully to ${recipientPhone} with ID: ${mediaMessageId}`,
      );

      // Build a proper AttachmentMetadata object that includes all required fields
      // This ensures the frontend can display and stream the media correctly
      const attachmentData = {
        id: mediaAttachment.mediaId,
        type: mediaAttachment.mediaType,
        fileName: mediaAttachment.fileName,
        mimeType: mediaAttachment.mimeType,
        s3Key: mediaAttachment.s3Key, // Required for media streaming
        size: 0, // KB media doesn't track size, but field is required
        uploadedAt: new Date().toISOString(),
        status: 'success' as const,
      };

      // Store the media message in the database
      await this.storeOutboundMessage({
        waMessageId: mediaMessageId,
        chatId,
        from: businessPhone,
        to: recipientPhone,
        body: caption || '',
        attachments: [attachmentData],
        userId: userId,
        senderId,
        isAiGenerated: true,
      });

      // Update chat with last message preview
      await this.updateChatLastMessage(
        chatId,
        caption || `[${mediaAttachment.mediaType}]`,
        mediaAttachment.mediaType,
      );

      // Emit message via WebSocket for real-time UI update
      if (whatsAppGatewayInstance) {
        whatsAppGatewayInstance.emitMessage({
          messageId: mediaMessageId,
          chatId,
          sender: businessPhone,
          text: caption || '',
          type: mediaAttachment.mediaType,
          timestamp: new Date(),
          direction: 'outbound',
          status: 'sent',
          attachments: [attachmentData],
        });
      }

      // STEP: Send interactive CTA buttons AFTER media message
      const interactiveData = aiResponse.interactiveData;

      if (
        interactiveData?.enabled &&
        interactiveData.buttons &&
        interactiveData.buttons.length > 0
      ) {
        this.logger.log(
          `[AI] Sending CTA buttons after media: ${interactiveData.buttons.map((b: any) => b.title).join(', ')}`,
        );

        try {
          const interactiveResult = await this.sendInteractiveButtons(
            senderId,
            recipientPhone,
            'What would you like to do next?', // Simple followup text
            interactiveData.buttons,
            interactiveData.footerText,
            undefined, // headerText
            { isAiGenerated: true },
          );

          if (!interactiveResult.success) {
            this.logger.warn(
              `[AI] CTA buttons after media failed (${interactiveResult.error}). This is non-critical.`,
            );
          } else {
            this.logger.log(`[AI] CTA buttons sent successfully after media`);
          }
        } catch (ctaError) {
          this.logger.warn(
            `[AI] Error sending CTA buttons after media: ${ctaError.message}. Continuing.`,
          );
        }
      }
    } else {
      // No media - check if we should send interactive buttons or plain text
      const interactiveData = aiResponse.interactiveData;

      if (
        interactiveData?.enabled &&
        interactiveData.buttons &&
        interactiveData.buttons.length > 0
      ) {
        // Send interactive button message with CTAs
        this.logger.log(
          `[AI] Sending AI response WITH interactive CTAs: ${interactiveData.buttons.map((b: any) => b.title).join(', ')}`,
        );

        const interactiveResult = await this.sendInteractiveButtons(
          senderId,
          recipientPhone,
          aiResponse.content,
          interactiveData.buttons,
          interactiveData.footerText,
          undefined, // headerText
          { isAiGenerated: true },
        );

        if (!interactiveResult.success) {
          // If interactive message fails (e.g., outside window), fall back to plain text
          this.logger.warn(
            `[AI] Interactive message failed (${interactiveResult.error}), falling back to plain text`,
          );

          // Send as plain text
          const aiMessage = {
            messaging_product: 'whatsapp' as const,
            to: recipientPhone,
            type: 'text' as const,
            text: {
              preview_url: true,
              body: aiResponse.content,
            },
          };

          const response = await this.sendCloudAPIMessage(
            aiMessage,
            phoneNumberId,
          );

          const aiMessageId = response.messages?.[0]?.id;
          if (!aiMessageId) {
            throw new Error('No message ID returned from Cloud API');
          }

          this.logger.log(
            `[AI] AI response sent (plain text fallback) to ${recipientPhone} with ID: ${aiMessageId}`,
          );

          await this.storeOutboundMessage({
            waMessageId: aiMessageId,
            chatId,
            from: businessPhone,
            to: recipientPhone,
            body: aiResponse.content,
            userId: userId,
            senderId,
            isAiGenerated: true,
          });

          await this.updateChatLastMessage(chatId, aiResponse.content, 'text');

          if (whatsAppGatewayInstance) {
            whatsAppGatewayInstance.emitMessage({
              messageId: aiMessageId,
              chatId,
              sender: businessPhone,
              text: aiResponse.content,
              type: 'text',
              timestamp: new Date(),
              direction: 'outbound',
              status: 'sent',
            });
          }
        } else {
          // Interactive message sent successfully
          this.logger.log(
            `[AI] AI response with CTAs sent successfully to ${recipientPhone} with ID: ${interactiveResult.waMessageId}`,
          );

          // Update chat with last message preview
          await this.updateChatLastMessage(
            chatId,
            aiResponse.content,
            'interactive',
          );

          // Emit message via WebSocket for real-time UI update
          if (whatsAppGatewayInstance && interactiveResult.waMessageId) {
            whatsAppGatewayInstance.emitMessage({
              messageId: interactiveResult.waMessageId,
              chatId,
              sender: businessPhone,
              text: aiResponse.content,
              type: 'interactive',
              timestamp: new Date(),
              direction: 'outbound',
              status: 'sent',
            });
          }
        }
      } else {
        // Send plain text response (no interactive CTAs)
        const aiMessage = {
          messaging_product: 'whatsapp' as const,
          to: recipientPhone,
          type: 'text' as const,
          text: {
            preview_url: true,
            body: aiResponse.content,
          },
        };

        // Send message and capture response with WhatsApp message ID
        const response = await this.sendCloudAPIMessage(
          aiMessage,
          phoneNumberId,
        );

        // Extract the WhatsApp message ID from response
        const aiMessageId = response.messages?.[0]?.id;
        if (!aiMessageId) {
          throw new Error('No message ID returned from Cloud API');
        }

        this.logger.log(
          `[AI] AI response sent successfully to ${recipientPhone} with ID: ${aiMessageId}`,
        );

        await this.storeOutboundMessage({
          waMessageId: aiMessageId,
          chatId,
          from: businessPhone,
          to: recipientPhone,
          body: aiResponse.content,
          userId: userId,
          senderId,
          isAiGenerated: true,
        });

        await this.updateChatLastMessage(chatId, aiResponse.content, 'text');

        if (whatsAppGatewayInstance) {
          whatsAppGatewayInstance.emitMessage({
            messageId: aiMessageId,
            chatId,
            sender: businessPhone,
            text: aiResponse.content,
            type: 'text',
            timestamp: new Date(),
            direction: 'outbound',
            status: 'sent',
          });
        }
      }
    }
  }

  /**
   * Handle incoming reaction from a customer via WhatsApp webhook
   *
   * When a customer reacts to a message in their WhatsApp chat:
   * 1. We receive a webhook with type='reaction'
   * 2. The reaction.message_id is the wamid of the message being reacted to
   * 3. The reaction.emoji is the emoji (empty string means reaction removed)
   * 4. We store the reaction and emit a WebSocket event for real-time UI updates
   *
   * Note: Customer reactions are stored with userId=null to distinguish them
   * from CRM user reactions. The sender phone is stored in the userName field
   * for display purposes.
   *
   * @param message - The inbound message object with reaction data
   * @param chatId - The chat ID for this conversation
   * @param senderPhone - The customer's phone number
   * @param sender - The sender (business) record
   * @private
   */
  /**
   * Extract the unique message identifier (hex) from a WhatsApp wamid
   *
   * WhatsApp wamid format: wamid.<base64>
   * The base64 decodes to: header + phone_number + unique_message_id
   * The unique_message_id is typically the last 16 bytes (32 hex chars)
   *
   * Note: Base64 encoding shifts based on byte alignment, so we must decode
   * to raw bytes and extract the hex representation for reliable comparison.
   */
  private extractWamidUniqueId(wamid: string): string | null {
    if (!wamid.startsWith('wamid.')) {
      return null;
    }

    try {
      const base64Part = wamid.slice(6); // Remove 'wamid.' prefix
      const buffer = Buffer.from(base64Part, 'base64');

      // The unique message ID is the last 16 bytes (128-bit UUID-like identifier)
      // Convert to uppercase hex for consistent comparison
      const uniqueBytes = buffer.slice(-16);
      return uniqueBytes.toString('hex').toUpperCase();
    } catch (error) {
      this.logger.warn(`Failed to extract unique ID from wamid: ${wamid}`);
      return null;
    }
  }

  private async handleInboundReaction(
    message: CloudAPIInboundMessage,
    chatId: string,
    senderPhone: string,
    sender: any,
  ): Promise<void> {
    try {
      const reactionData = message.reaction;

      if (!reactionData) {
        this.logger.warn(
          `Reaction message received but no reaction data found: ${message.id}`,
        );
        return;
      }

      // reaction.message_id is the WhatsApp wamid of the message being reacted to
      // IMPORTANT: The wamid encodes the phone number from the perspective of the sender.
      // The same logical message has different wamid representations depending on perspective!
      // We extract the unique message identifier (last 16 bytes as hex) for reliable matching.
      const targetWamid = reactionData.message_id;
      const emoji = reactionData.emoji;

      this.logger.log(
        `[CustomerReaction] Received: ${emoji || '(removed)'} from ${senderPhone}`,
      );
      this.logger.log(`[CustomerReaction] Target wamid: ${targetWamid}`);
      this.logger.log(`[CustomerReaction] Chat: ${chatId}`);

      // Extract the unique message identifier from the wamid
      const targetUniqueId = this.extractWamidUniqueId(targetWamid);
      this.logger.log(
        `[CustomerReaction] Target unique ID (hex): ${targetUniqueId}`,
      );

      // Find the target message in our database
      let targetMessage: { messageId: string; chatId: string } | undefined;

      // Strategy 1: Exact messageId match (unlikely due to wamid perspective differences)
      targetMessage = await db.query.messages.findFirst({
        where: and(
          eq(messages.chatId, chatId),
          eq(messages.messageId, targetWamid),
        ),
        columns: { messageId: true, chatId: true },
      });

      if (targetMessage) {
        this.logger.log(
          `[CustomerReaction] âœ… Found by exact messageId: ${targetMessage.messageId}`,
        );
      }

      // Strategy 2: Match by mediaUrl with wa: prefix
      if (!targetMessage) {
        targetMessage = await db.query.messages.findFirst({
          where: and(
            eq(messages.chatId, chatId),
            eq(messages.mediaUrl, `wa:${targetWamid}`),
          ),
          columns: { messageId: true, chatId: true },
        });

        if (targetMessage) {
          this.logger.log(
            `[CustomerReaction] âœ… Found by exact mediaUrl: ${targetMessage.messageId}`,
          );
        }
      }

      // Strategy 3: Match by unique message ID (hex comparison)
      // This is the most reliable method as it handles wamid perspective differences
      if (!targetMessage && targetUniqueId) {
        // Get recent messages in this chat and compare unique IDs
        const recentMessages = await db.query.messages.findMany({
          where: eq(messages.chatId, chatId),
          columns: { messageId: true, chatId: true, mediaUrl: true },
          limit: 100, // Check last 100 messages
          orderBy: (messages, { desc }) => [desc(messages.timestamp)],
        });

        for (const msg of recentMessages) {
          // Check messageId (for inbound messages stored with wamid)
          const msgUniqueId = this.extractWamidUniqueId(msg.messageId);
          if (msgUniqueId === targetUniqueId) {
            targetMessage = { messageId: msg.messageId, chatId: msg.chatId };
            this.logger.log(
              `[CustomerReaction] âœ… Found by unique ID match (messageId): ${msg.messageId}`,
            );
            break;
          }

          // Check mediaUrl (for outbound messages with wa: prefix)
          if (msg.mediaUrl?.startsWith('wa:')) {
            const mediaWamid = msg.mediaUrl.slice(3); // Remove 'wa:' prefix
            const mediaUniqueId = this.extractWamidUniqueId(mediaWamid);
            if (mediaUniqueId === targetUniqueId) {
              targetMessage = { messageId: msg.messageId, chatId: msg.chatId };
              this.logger.log(
                `[CustomerReaction] âœ… Found by unique ID match (mediaUrl): ${msg.messageId}`,
              );
              break;
            }
          }
        }
      }

      // If still not found, log for debugging and return
      if (!targetMessage) {
        const recentMessages = await db.query.messages.findMany({
          where: eq(messages.chatId, chatId),
          columns: { messageId: true, mediaUrl: true },
          limit: 5,
          orderBy: (messages, { desc }) => [desc(messages.timestamp)],
        });

        // Log with unique IDs for debugging
        const debugInfo = recentMessages.map((m) => ({
          id: m.messageId.substring(0, 30) + '...',
          uniqueId: this.extractWamidUniqueId(m.messageId),
          mediaUniqueId: m.mediaUrl?.startsWith('wa:')
            ? this.extractWamidUniqueId(m.mediaUrl.slice(3))
            : null,
        }));

        this.logger.warn(
          `[CustomerReaction] âŒ Message not found. Target unique ID: ${targetUniqueId}`,
        );
        this.logger.warn(
          `[CustomerReaction] Recent messages: ${JSON.stringify(debugInfo)}`,
        );
        return; // Don't store orphan reactions
      }

      // Use our internal messageId for storage and frontend
      const internalMessageId = targetMessage.messageId;

      if (emoji === '' || !emoji) {
        // Customer removed their reaction
        this.logger.log(
          `[CustomerReaction] Removing reaction from message: ${internalMessageId}`,
        );

        await db
          .update(customerReactions)
          .set({
            emoji: null,
            isActive: false,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(customerReactions.messageId, internalMessageId),
              eq(customerReactions.senderPhone, senderPhone),
            ),
          );

        // Emit WebSocket event
        this.emitCustomerReactionEvent(
          chatId,
          internalMessageId,
          null,
          senderPhone,
          'removed',
        );

        this.logger.log(
          `[CustomerReaction] âœ… Removed reaction for message ${internalMessageId}`,
        );
      } else {
        // Customer added/updated their reaction
        this.logger.log(
          `[CustomerReaction] Adding ${emoji} to message: ${internalMessageId}`,
        );

        // Upsert the reaction
        await db
          .insert(customerReactions)
          .values({
            messageId: internalMessageId,
            waMessageId: targetWamid,
            chatId,
            senderPhone,
            emoji,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              customerReactions.messageId,
              customerReactions.senderPhone,
            ],
            set: {
              emoji,
              waMessageId: targetWamid,
              isActive: true,
              updatedAt: new Date(),
            },
          });

        // Emit WebSocket event
        this.emitCustomerReactionEvent(
          chatId,
          internalMessageId,
          emoji,
          senderPhone,
          'added',
        );

        // Update chat's last activity to show the reaction in chat list
        await this.updateChatLastActivityForReaction(
          chatId,
          internalMessageId,
          emoji,
        );

        this.logger.log(
          `[CustomerReaction] âœ… Saved reaction ${emoji} for message ${internalMessageId}`,
        );
      }
    } catch (error) {
      this.logger.error(`[CustomerReaction] Error: ${error.message}`, error);
    }
  }

  /**
   * Emit customer reaction event via WebSocket
   */
  private emitCustomerReactionEvent(
    chatId: string,
    messageId: string,
    emoji: string | null,
    senderPhone: string,
    action: 'added' | 'removed',
  ): void {
    const event = { chatId, messageId, emoji, senderPhone, action };

    if (reactionsGatewayInstance) {
      reactionsGatewayInstance.emitCustomerReaction(event);
    }
    if (whatsAppGatewayInstance) {
      whatsAppGatewayInstance.emitCustomerReaction(event);
    }
  }

  /**
   * Handle message delivery status webhook from Meta Cloud API
   *
   * Implements the full message lifecycle:
   * - pending: Initial state when message is queued
   * - sent: Message successfully sent to WhatsApp servers (âœ“)
   * - delivered: Message reached recipient device (âœ“âœ“)
   * - read: Message read by recipient (âœ“âœ“ in blue)
   * - failed: Delivery failed with error
   *
   * @param messageId - Cloud API message ID (wamid)
   * @param status - Status from Cloud API webhook
   * @param timestamp - Unix timestamp from webhook (optional, defaults to now)
   * @param errors - Error details array when status is 'failed'
   * @private
   */
  private async handleMessageStatus(
    messageId: string,
    status: string,
    timestamp?: string,
    errors?: Array<{
      code: number;
      title: string;
      message?: string;
      error_data?: any;
    }>,
  ): Promise<void> {
    try {
      if (!messageId || !status) {
        this.logger.warn(
          `Incomplete status webhook. MessageId: ${messageId}, Status: ${status}`,
        );
        return;
      }

      // Log error details for failed messages
      if (status === 'failed' && errors && errors.length > 0) {
        const errorInfo = errors
          .map((e) => `[${e.code}] ${e.title}: ${e.message || 'No details'}`)
          .join('; ');
        this.logger.error(`Message ${messageId} failed: ${errorInfo}`);
        console.log(
          `âŒ WhatsApp Error Details:`,
          JSON.stringify(errors, null, 2),
        );
      }

      console.log(
        `ðŸ”” STATUS WEBHOOK RECEIVED: messageId=${messageId}, status=${status}`,
      );

      const normalizedStatus = mapCloudAPIStatus(status);
      const statusTimestamp = timestamp
        ? new Date(parseInt(timestamp) * 1000)
        : new Date();

      // Find message to update - search by messageId or by WhatsApp ID stored in mediaUrl
      // Outbound attachment messages store WhatsApp ID in mediaUrl with 'wa:' prefix
      console.log(
        `ðŸ” Searching for message by messageId="${messageId}" OR mediaUrl="wa:${messageId}"`,
      );

      const msg = await db.query.messages.findFirst({
        where: or(
          eq(messages.messageId, messageId),
          eq(messages.mediaUrl, `wa:${messageId}`),
        ),
      });

      console.log(
        `ðŸ” Message found: ${msg ? `YES (id=${msg.id}, messageId=${msg.messageId}, mediaUrl=${msg.mediaUrl})` : 'NO'}`,
      );

      if (msg) {
        // Build update data based on status
        const updateData: Record<string, any> = {
          status: normalizedStatus,
          updatedAt: new Date(),
        };

        // Set timestamp fields based on status progression
        // This creates the double-tick visualization:
        switch (normalizedStatus) {
          case 'sent':
            updateData.sentAt = statusTimestamp;
            break;
          case 'delivered':
            // Once delivered, keep the original sentAt if it exists
            if (!msg.sentAt) {
              updateData.sentAt = statusTimestamp;
            }
            updateData.deliveredAt = statusTimestamp;
            break;
          case 'read':
            // Preserve previous timestamps
            if (!msg.sentAt) {
              updateData.sentAt = statusTimestamp;
            }
            if (!msg.deliveredAt) {
              updateData.deliveredAt = statusTimestamp;
            }
            updateData.readAt = statusTimestamp;
            break;
          case 'failed':
            // Keep timestamps but mark as failed
            // failedReason will be set from error data if provided
            break;
        }

        // Use the message's actual messageId (not the WhatsApp ID from webhook)
        // This ensures we update the correct record even if found by mediaUrl
        await db
          .update(messages)
          .set(updateData)
          .where(eq(messages.messageId, msg.messageId));

        this.logger.log(
          `Message status updated. ID: ${msg.messageId}, WhatsApp ID: ${messageId}, Status: ${normalizedStatus}, Timestamp: ${statusTimestamp.toISOString()}`,
        );

        // Log status progression for debugging
        console.log(`ðŸ“Š Message Status Update:
          ID: ${msg.messageId} (WhatsApp: ${messageId})
          Status: ${msg.status} â†’ ${normalizedStatus}
          Sent: ${msg.sentAt || 'pending'} â†’ ${updateData.sentAt || msg.sentAt || 'pending'}
          Delivered: ${msg.deliveredAt || 'pending'} â†’ ${updateData.deliveredAt || msg.deliveredAt || 'pending'}
          Read: ${msg.readAt || 'pending'} â†’ ${updateData.readAt || msg.readAt || 'pending'}
        `);

        // ðŸ”¥ EMIT STATUS UPDATE VIA WEBSOCKET
        // This replaces polling - all connected clients get real-time updates
        // Use the message's actual messageId so frontend can match it
        if (whatsAppGatewayInstance) {
          whatsAppGatewayInstance.emitMessageStatus(
            msg.messageId,
            normalizedStatus,
            statusTimestamp,
          );
        }
      } else {
        this.logger.debug(
          `Message not found for status update: ${messageId}. Status: ${status}`,
        );
        console.warn(
          `âš ï¸ Status update received for non-existent message: ${messageId}`,
        );
      }
    } catch (error) {
      this.logger.error('Error handling message status:', error);
      // Don't throw - status updates are non-critical
    }
  }

  /**
   * Store outbound message metadata in database
   * @private
   */
  /**
   * Store outbound message metadata in database
   * Initial status is 'pending' until Cloud API confirms 'sent'
   * @private
   */
  private async storeOutboundMessage(messageData: {
    waMessageId: string;
    chatId: string;
    from: string;
    to: string;
    body?: string;
    attachments?: Array<any>;
    userId?: number;
    senderId?: number;
    replyToMessageId?: string;
    replyPreview?: ReplyPreview;
    isAiGenerated?: boolean;
    isInteractive?: boolean;
    interactiveType?: 'button' | 'list' | 'product';
    interactiveData?: any;
    /** Explicit message type override (e.g. 'template') */
    messageType?: string;
    /** Explicit metadata override (e.g. template metadata) */
    metadata?: Record<string, any>;
  }): Promise<string> {
    try {
      const now = new Date();

      // Determine message type: explicit override > interactive > media > text
      let messageType = messageData.messageType || 'text';
      if (!messageData.messageType) {
        if (messageData.isInteractive) {
          messageType = 'interactive';
        } else if (
          messageData.attachments &&
          messageData.attachments.length > 0
        ) {
          messageType = 'media';
        }
      }

      // Build metadata: explicit override > interactive metadata > null
      let metadata: Record<string, any> | null = null;
      if (messageData.metadata) {
        metadata = messageData.metadata;
      } else if (messageData.isInteractive) {
        metadata = {
          interactiveType: messageData.interactiveType,
          interactiveData: messageData.interactiveData,
        };
      }

      await db.insert(messages).values({
        messageId: messageData.waMessageId,
        chatId: messageData.chatId,
        source: 'whatsapp',
        sender: messageData.from,
        type: messageType,
        text: messageData.body,
        attachments: messageData.attachments || [],
        direction: 'outbound',
        status: 'pending',
        timestamp: now,
        updatedAt: now,
        replyToMessageId: messageData.replyToMessageId || null,
        replyPreview: messageData.replyPreview || null,
        isAiGenerated: messageData.isAiGenerated ?? false,
        metadata,
      });

      this.logger.debug('Outbound message stored', messageData.waMessageId);
      console.log(
        `ðŸ’¾ Outbound message stored with pending status: ${messageData.waMessageId}`,
      );

      // Queue thumbnail generation for outbound media messages
      // This ensures thumbnails are ready when user views the chat, even for AI-generated messages
      if (messageData.attachments && messageData.attachments.length > 0) {
        for (const attachment of messageData.attachments) {
          // Only queue if we have an s3Key and the media type supports thumbnails
          if (attachment.s3Key && attachment.type) {
            const mediaType = attachment.type as string;
            // GIFs and stickers display directly - no thumbnail needed
            const needsThumbnail =
              mediaType === 'image' ||
              mediaType === 'video' ||
              mediaType === 'audio' ||
              mediaType === 'document';

            // Skip if this attachment came from staging - it already has a thumbnail job queued
            // Attachments from staging have a stagingId property set
            const hasExistingStagingThumbnail = !!(attachment as any).stagingId;

            if (
              needsThumbnail &&
              this.thumbnailQueueService &&
              !hasExistingStagingThumbnail
            ) {
              try {
                const thumbnailJobData: ThumbnailJobData = {
                  messageId: messageData.waMessageId,
                  attachmentId: attachment.id || attachment.s3Key,
                  s3Key: attachment.s3Key,
                  mediaType: mediaType as
                    | 'image'
                    | 'video'
                    | 'audio'
                    | 'document',
                  mimeType: attachment.mimeType || 'application/octet-stream',
                  chatId: messageData.chatId,
                  pathPrefix: 'outbound',
                };

                await this.thumbnailQueueService.queueThumbnailGeneration(
                  thumbnailJobData,
                );
                this.logger.log(
                  `[Outbound Media] âœ… Queued thumbnail generation for ${attachment.id || attachment.s3Key}`,
                );
              } catch (error) {
                this.logger.warn(
                  `[Outbound Media] âš ï¸ Failed to queue thumbnail generation: ${error.message}`,
                );
                // Don't fail the message storage - thumbnail will remain pending
              }
            } else if (hasExistingStagingThumbnail) {
              this.logger.debug(
                `[Outbound Media] Skipping thumbnail queue for ${attachment.id} - already handled by staging`,
              );
            }
          }
        }
      }

      // Store message in AI memory for long-term context (non-blocking)
      if (this.memoryIntegration && messageData.body) {
        this.memoryIntegration
          .storeMessage({
            userId: messageData.userId!,
            senderId: messageData.senderId,
            chatId: messageData.chatId,
            messageId: messageData.waMessageId,
            content: messageData.body,
            direction: 'outbound',
            participantPhone: messageData.to,
            timestamp: now,
          })
          .catch((err) => {
            this.logger.warn(
              `AI memory storage failed (outbound): ${err.message}`,
            );
          });
      }

      return messageData.waMessageId;
    } catch (error) {
      this.logger.error(`Error storing outbound message: ${error.message}`);
      // Don't throw - message already sent
      return messageData.waMessageId;
    }
  }

  /**
   * Store inbound message metadata in database
   * @private
   */
  private async storeInboundMessage(
    messageData: NormalizedCloudAPIMessage,
  ): Promise<void> {
    try {
      // Check if message already exists
      const existingMessage = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageData.waMessageId),
      });

      if (existingMessage) {
        console.log(
          `Message already exists: ${messageData.waMessageId} - skipping duplicate`,
        );
        this.logger.debug(
          'Message already exists, skipping duplicate:',
          messageData.waMessageId,
        );
        return;
      }

      // Convert media metadata to attachment object if present
      let s3Key = '';
      let detectedAsGif = false;

      // If there's media, download and cache it to S3 immediately
      // Meta's URLs expire after 5 minutes, so we must cache now
      if (messageData.mediaMetadata) {
        try {
          this.logger.log(
            `[Inbound Media] Starting to cache media: ${messageData.mediaMetadata.mediaId} (${messageData.mediaMetadata.mimeType})`,
          );
          const cacheResult =
            await this.mediaService.downloadAndCacheCloudAPIMedia(
              messageData.mediaMetadata.mediaId,
              messageData.mediaMetadata.mimeType || 'application/octet-stream',
              messageData.chatId, // Use chatId as the organization key
              messageData.mediaMetadata.filename,
            );

          s3Key = cacheResult.s3Key;
          detectedAsGif = cacheResult.isGif || false;

          if (s3Key) {
            this.logger.log(
              `[Inbound Media] âœ… Successfully cached media to S3: ${s3Key}`,
            );
          } else {
            this.logger.warn(
              `[Inbound Media] âš ï¸ Failed to cache media (will use cloud-api:// fallback): ${messageData.mediaMetadata.mediaId}`,
            );
          }

          // If video was detected as GIF, update the media type
          if (detectedAsGif && messageData.mediaMetadata.type === 'video') {
            this.logger.log(
              `[Inbound Media] ðŸŽ¬â†’ðŸ–¼ï¸ Video detected as GIF based on media analysis (no audio, short duration)`,
            );
            messageData.mediaMetadata.type = 'gif';
            messageData.type = 'gif';
          }
        } catch (error) {
          this.logger.error(
            `[Inbound Media] âŒ Exception while caching media: ${error.message}`,
            error,
          );
          // Continue without S3 cache - will fall back to cloud-api:// reference
        }
      }

      // Determine thumbnail status based on media type
      // GIFs and stickers don't need thumbnails - they play/display inline
      const mediaType = messageData.mediaMetadata?.type as
        | 'image'
        | 'video'
        | 'audio'
        | 'document'
        | 'sticker'
        | 'gif';
      const mimeType = messageData.mediaMetadata?.mimeType || '';
      const needsThumbnail =
        mediaType &&
        !['sticker', 'gif'].includes(mediaType) &&
        supportsThumbnail(mediaType as any, mimeType);
      const thumbnailStatus = needsThumbnail ? 'pending' : 'not-applicable';

      const attachments = messageData.mediaMetadata
        ? [
            {
              id: messageData.mediaMetadata.mediaId,
              type: messageData.mediaMetadata.type, // Use the actual media type (gif, sticker, video, etc.)
              fileName:
                messageData.mediaMetadata.filename ||
                `${messageData.mediaMetadata.type}_${messageData.mediaMetadata.mediaId}`,
              mimeType: messageData.mediaMetadata.mimeType || '',
              size: messageData.mediaMetadata.fileSize || 0,
              s3Key: s3Key, // Will be empty string if caching failed, that's ok
              thumbnailStatus: thumbnailStatus,
              status: 'success',
              uploadedAt: new Date().toISOString(),
              // Only use cloud-api:// as fallback if S3 caching failed
              mediaUrl: s3Key
                ? ''
                : `cloud-api://${messageData.mediaMetadata.mediaId}`,
              // Voice note flag for audio messages
              isVoiceNote: messageData.mediaMetadata.isVoiceNote || false,
              // Animated flag for stickers and gifs
              isAnimated: messageData.mediaMetadata.isAnimated || false,
            },
          ]
        : messageData.contactsData
          ? // For contacts, store the contact data in attachments as JSON
            messageData.contactsData
          : [];

      // Build metadata object for location and other structured data
      const messageMetadata: Record<string, any> = {};
      if (messageData.locationData) {
        messageMetadata.location = messageData.locationData;
      }

      await db.insert(messages).values({
        messageId: messageData.waMessageId,
        chatId: messageData.chatId,
        source: 'whatsapp',
        sender: messageData.sender,
        type: messageData.type,
        text: messageData.text,
        attachments: attachments ? (attachments as any) : [],
        direction: 'inbound',
        status: 'delivered',
        timestamp: messageData.timestamp,
        // Reply fields
        replyToMessageId: messageData.replyToMessageId || null,
        replyPreview: messageData.replyPreview || null,
        // Store location and other structured data in metadata
        metadata:
          Object.keys(messageMetadata).length > 0 ? messageMetadata : null,
      });

      // Queue thumbnail generation if media was cached to S3 and supports thumbnails
      // GIFs and stickers don't need thumbnails - they display directly
      if (s3Key && messageData.mediaMetadata && needsThumbnail) {
        try {
          const thumbnailJobData: ThumbnailJobData = {
            messageId: messageData.waMessageId,
            attachmentId: messageData.mediaMetadata.mediaId,
            s3Key: s3Key,
            mediaType: mediaType as 'image' | 'video' | 'audio' | 'document',
            mimeType: mimeType,
            chatId: messageData.chatId,
            pathPrefix: 'inbound',
          };

          await this.thumbnailQueueService.queueThumbnailGeneration(
            thumbnailJobData,
          );
          this.logger.log(
            `[Inbound Media] âœ… Queued thumbnail generation for ${messageData.mediaMetadata.mediaId}`,
          );
        } catch (error) {
          this.logger.warn(
            `[Inbound Media] âš ï¸ Failed to queue thumbnail generation: ${error.message}`,
          );
          // Don't fail the message storage - thumbnail will remain pending
        }
      }

      // Store message in AI memory for long-term context (non-blocking)
      if (this.memoryIntegration && messageData.text) {
        this.memoryIntegration
          .storeMessage({
            userId: messageData.userId!,
            senderId: messageData.senderId,
            chatId: messageData.chatId,
            messageId: messageData.waMessageId,
            content: messageData.text,
            direction: 'inbound',
            participantPhone: messageData.sender,
            timestamp: messageData.timestamp,
          })
          .catch((err) => {
            this.logger.warn(
              `AI memory storage failed (inbound): ${err.message}`,
            );
          });
      }

      // Store media attachment in AI memory for document/image processing (non-blocking)
      if (this.memoryIntegration && s3Key && messageData.mediaMetadata) {
        const contentType = this.mapMediaTypeToContentType(
          messageData.mediaMetadata.type,
        );
        if (contentType) {
          this.memoryIntegration
            .storeMediaAttachment({
              userId: messageData.userId!,
              senderId: messageData.senderId,
              chatId: messageData.chatId,
              messageId: messageData.waMessageId,
              s3Key: s3Key,
              mimeType:
                messageData.mediaMetadata.mimeType ||
                'application/octet-stream',
              filename: messageData.mediaMetadata.filename,
              fileSize: messageData.mediaMetadata.fileSize,
              contentType: contentType,
            })
            .catch((err) => {
              this.logger.warn(
                `AI memory media storage failed: ${err.message}`,
              );
            });
        }
      }

      this.logger.debug('Inbound message stored', messageData.waMessageId);
    } catch (error) {
      this.logger.error(`Error storing inbound message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Map WhatsApp media type to AI memory content type
   * Returns null for types that shouldn't be processed by AI memory
   * @private
   */
  private mapMediaTypeToContentType(
    mediaType: string,
  ): 'document' | 'image' | 'audio' | 'video' | null {
    switch (mediaType) {
      case 'document':
        return 'document';
      case 'image':
        return 'image';
      case 'audio':
        return 'audio';
      case 'video':
        return 'video';
      case 'gif':
      case 'sticker':
        // GIFs and stickers are not processed for AI memory
        return null;
      default:
        return null;
    }
  }

  /**
   * Get contact name for a phone number (for reply preview)
   * Falls back to phone number if no contact found
   * Handles phone number normalization (with or without + prefix)
   * @private
   */
  private async getContactNameForReply(phoneNumber: string): Promise<string> {
    try {
      // Normalize phone number - try both with and without + prefix
      const normalizedPhone = phoneNumber.replace(/^\+/, '');
      const phoneWithPlus = `+${normalizedPhone}`;

      const contact = await db.query.contacts.findFirst({
        where: and(
          or(
            eq(contacts.phoneNumber, phoneNumber),
            eq(contacts.phoneNumber, normalizedPhone),
            eq(contacts.phoneNumber, phoneWithPlus),
          ),
          eq(contacts.isActive, true),
        ),
      });

      if (contact) {
        return contact.lastName
          ? `${contact.firstName} ${contact.lastName}`
          : contact.firstName;
      }

      return phoneNumber;
    } catch (error) {
      this.logger.warn(
        `Error looking up contact name for ${phoneNumber}: ${error.message}`,
      );
      return phoneNumber;
    }
  }

  /**
   * Get or create a chat for two participants
   * Returns both the chat and whether it was newly created
   * @private
   */
  private async getOrCreateChat(
    chatId: string,
    businessPhone: string,
    participantPhone: string,
    senderId?: number,
  ): Promise<{ chat: Chat; isNewChat: boolean }> {
    try {
      // Validate that senderId is provided - we MUST know which sender this chat belongs to
      if (!senderId) {
        throw new Error(
          `Cannot create/retrieve chat without senderId. This indicates a webhook routing error.`,
        );
      }

      // Look up chat for that specific sender
      let chat = await db.query.chats.findFirst({
        where: and(eq(chats.chatId, chatId), eq(chats.senderId, senderId)),
      });

      if (!chat) {
        const sender = await db.query.senders.findFirst({
          where: eq(senders.id, senderId),
        });

        // Try to find contact name by phone number
        const participantName =
          await this.getContactNameForReply(participantPhone);

        // Get the user's team ID for proper access control
        let teamId: number | undefined;
        if (sender?.userId) {
          const membership = await db.query.teamMembers.findFirst({
            where: and(
              eq(teamMembers.userId, sender.userId),
              eq(teamMembers.isActive, true),
            ),
          });
          teamId = membership?.teamId;
          this.logger.debug(
            `[getOrCreateChat] Team lookup for userId ${sender.userId}: membership=${JSON.stringify(membership)}, teamId=${teamId}`,
          );
        } else {
          this.logger.warn(
            `[getOrCreateChat] No userId found for sender ${senderId}`,
          );
        }

        const [newChat] = await db
          .insert(chats)
          .values({
            chatId,
            businessPhone,
            participantPhone,
            participantName,
            senderId,
            userId: sender?.userId,
            teamId, // Associate chat with user's team for access control
            isActive: true,
          })
          .returning();

        this.logger.log(
          `Chat created: ${chatId} for sender ${senderId} with participant name: ${participantName}, teamId: ${teamId}`,
        );

        // Stage assignment happens via StageService if needed

        return { chat: newChat, isNewChat: true };
      }

      return { chat, isNewChat: false };
    } catch (error) {
      this.logger.error(`Error getting or creating chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update chat with latest message info and increment unread count for inbound messages
   * Also auto-unarchives the chat if it was archived (new activity restores chat to main list)
   * @private
   */
  private async updateChatLastMessage(
    chatId: string,
    lastMessage: string,
    lastMessageType?: string,
    isInbound: boolean = true,
  ): Promise<void> {
    try {
      const updateData: any = {
        lastMessage,
        lastMessageType: lastMessageType || 'text',
        lastMessageTime: new Date(),
        // Reset to message activity (in case previous activity was a reaction)
        lastActivityType: 'message',
        lastReactionEmoji: null,
        lastReactionIsOwn: false,
        lastReactedMessagePreview: null,
        updatedAt: new Date(),
        // Auto-unarchive: any new message activity (inbound or outbound) restores the chat
        isArchived: false,
        archivedAt: null,
      };

      // Only increment unread count for inbound messages
      if (isInbound) {
        updateData.unreadCount = sql`${chats.unreadCount} + 1`;
      }

      const [updatedChat] = await db
        .update(chats)
        .set(updateData)
        .where(eq(chats.chatId, chatId))
        .returning();

      // Emit chat update via WebSocket for real-time UI updates
      if (updatedChat && whatsAppGatewayInstance) {
        whatsAppGatewayInstance.emitChatUpdate({
          chatId,
          unreadCount: updatedChat.unreadCount,
          lastMessage: updatedChat.lastMessage || undefined,
          lastMessageType: updatedChat.lastMessageType || undefined,
          lastMessageTime: updatedChat.lastMessageTime || undefined,
          lastActivityType: 'message',
          lastReactionEmoji: null,
          lastReactionIsOwn: false,
          lastReactedMessagePreview: null,
        });

        // If the chat was archived, also emit the unarchive event
        if (whatsAppGatewayInstance.emitChatArchived) {
          whatsAppGatewayInstance.emitChatArchived(chatId, false);
        }
      }
    } catch (error) {
      this.logger.error(`Error updating chat last message: ${error.message}`);
      // Don't throw - not critical
    }
  }

  /**
   * Update chat's last activity to show a customer reaction in the chat list
   * Shows: "Reacted ðŸ‘ to: <message>"
   * @private
   */
  private async updateChatLastActivityForReaction(
    chatId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    try {
      // Get message preview for the reacted-to message
      const message = await db
        .select({
          text: messages.text,
          type: messages.type,
        })
        .from(messages)
        .where(eq(messages.messageId, messageId))
        .limit(1);

      let messagePreview = '';
      if (message[0]) {
        if (message[0].text?.trim()) {
          const text = message[0].text.trim();
          messagePreview =
            text.length > 50 ? text.substring(0, 50) + '...' : text;
        } else {
          // Type-based placeholder
          switch (message[0].type) {
            case 'image':
              messagePreview = 'ðŸ“· Photo';
              break;
            case 'video':
              messagePreview = 'ðŸŽ¥ Video';
              break;
            case 'audio':
            case 'voice':
              messagePreview = 'ðŸŽ¤ Voice message';
              break;
            case 'document':
              messagePreview = 'ðŸ“„ Document';
              break;
            case 'sticker':
              messagePreview = 'ðŸ·ï¸ Sticker';
              break;
            case 'gif':
              messagePreview = 'GIF';
              break;
            default:
              messagePreview = 'Message';
          }
        }
      }

      // Update the chat's last activity
      const [updatedChat] = await db
        .update(chats)
        .set({
          lastActivityType: 'reaction',
          lastReactionEmoji: emoji,
          lastReactionIsOwn: false, // Customer reaction, not CRM user
          lastReactedMessagePreview: messagePreview,
          lastMessageTime: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(chats.chatId, chatId))
        .returning();

      // Emit chat update via WebSocket for real-time UI updates
      if (updatedChat && whatsAppGatewayInstance) {
        whatsAppGatewayInstance.emitChatUpdate({
          chatId,
          unreadCount: updatedChat.unreadCount,
          lastMessage: updatedChat.lastMessage || undefined,
          lastMessageType: updatedChat.lastMessageType || undefined,
          lastMessageTime: updatedChat.lastMessageTime || undefined,
          lastActivityType: 'reaction',
          lastReactionEmoji: emoji,
          lastReactionIsOwn: false,
          lastReactedMessagePreview: messagePreview,
        });
      }

      this.logger.log(
        `[CustomerReaction] Updated chat ${chatId} last activity: Customer reacted ${emoji} to "${messagePreview}"`,
      );
    } catch (error) {
      this.logger.error(
        `[CustomerReaction] Error updating chat last activity: ${error.message}`,
        error,
      );
      // Don't throw - not critical
    }
  }

  /**
   * Save a note to a message
   * Multiple users can add notes to the same message
   */
  async saveNote(
    messageId: string,
    userId: number,
    note: string,
  ): Promise<any> {
    try {
      // TODO: Store note in database via notes service
      this.logger.log(`Note saved for message ${messageId} by user ${userId}`);
      return {
        success: true,
        messageId,
        userId,
        note,
      };
    } catch (error) {
      this.logger.error(`Error saving note: ${error.message}`, error);
      throw new Error(`Failed to save note: ${error.message}`);
    }
  }

  /**
   * Get all notes for a message
   */
  async getMessageNotes(messageId: string): Promise<any> {
    try {
      this.logger.debug(`Retrieving notes for message ${messageId}`);
      return {
        messageId,
        notes: [],
      };
    } catch (error) {
      this.logger.error(`Error retrieving message notes: ${error.message}`);
      throw new Error(`Failed to retrieve notes: ${error.message}`);
    }
  }

  /**
   * Get all messages for a user/team with optional filters
   */
  async getMessages(filters?: {
    sender?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<any> {
    try {
      this.logger.debug('Retrieving messages with filters', filters);
      return {
        messages: [],
        total: 0,
      };
    } catch (error) {
      this.logger.error(`Error retrieving messages: ${error.message}`);
      throw new Error(`Failed to retrieve messages: ${error.message}`);
    }
  }

  /**
   * Get all chats (conversations) for a user
   */
  async getChats(
    skip: number = 0,
    take: number = 20,
    userId: number,
  ): Promise<Chat[]> {
    try {
      // Get user's senders first
      const userSenders = await db.query.senders.findMany({
        where: eq(senders.userId, userId),
        columns: {
          phoneNumber: true,
        },
      });

      const phoneNumbers = userSenders.map((s) => s.phoneNumber);

      if (phoneNumbers.length === 0) {
        return [];
      }

      // Get chats for this user's senders with proper ordering
      // Sort by: 1) IS NULL DESC (puts NULL first), then 2) lastMessageTime DESC
      // Filter out archived chats
      const chatsData = await db.query.chats.findMany({
        where: and(
          eq(chats.isActive, true),
          eq(chats.isArchived, false),
          inArray(chats.businessPhone, phoneNumbers),
        ),
        orderBy: [
          // Sort by whether lastMessageTime IS NULL (NULL first), then by the time descending
          desc(sql`${chats.lastMessageTime} IS NULL`),
          desc(chats.lastMessageTime),
        ],
        limit: take,
        offset: skip,
      });

      return chatsData;
    } catch (error) {
      this.logger.error(`Error retrieving chats: ${error.message}`);
      throw new Error(`Failed to retrieve chats: ${error.message}`);
    }
  }

  /**
   * Get messages for a specific chat with pagination metadata
   */
  async getChatMessages(
    chatId: string,
    skip: number = 0,
    take: number = 50,
  ): Promise<{
    messages: Message[];
    hasMore: boolean;
    totalCount: number;
    nextCursor: number;
  }> {
    try {
      // Get total count for this chat
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.chatId, chatId));
      const totalCount = countResult[0]?.count || 0;

      // Get messages with one extra to determine if there are more
      const chatMessages = await db.query.messages.findMany({
        where: eq(messages.chatId, chatId),
        orderBy: desc(messages.timestamp),
        limit: take + 1,
        offset: skip,
      });

      // Check if there are more messages beyond this batch
      const hasMore = chatMessages.length > take;

      // Remove the extra message if it exists
      const resultMessages = hasMore
        ? chatMessages.slice(0, take)
        : chatMessages;

      return {
        messages: resultMessages,
        hasMore,
        totalCount,
        nextCursor: skip + resultMessages.length,
      };
    } catch (error) {
      this.logger.error(`Error retrieving chat messages: ${error.message}`);
      throw new Error(`Failed to retrieve chat messages: ${error.message}`);
    }
  }

  /**
   * Get newer messages for a specific chat (messages after a given timestamp)
   * Used for bidirectional infinite scroll when viewing pinned message context
   */
  async getNewerMessages(
    chatId: string,
    afterTimestamp: string,
    take: number = 50,
  ): Promise<{
    messages: Message[];
    hasMore: boolean;
  }> {
    try {
      const afterDate = new Date(afterTimestamp);

      // Get messages with timestamp > afterTimestamp, ordered by timestamp ASC (oldest first)
      // We want the NEXT batch of messages after the given timestamp
      const newerMessages = await db.query.messages.findMany({
        where: and(
          eq(messages.chatId, chatId),
          gt(messages.timestamp, afterDate),
        ),
        orderBy: asc(messages.timestamp),
        limit: take + 1,
      });

      // Check if there are more messages beyond this batch
      const hasMore = newerMessages.length > take;

      // Remove the extra message if it exists
      const resultMessages = hasMore
        ? newerMessages.slice(0, take)
        : newerMessages;

      return {
        messages: resultMessages,
        hasMore,
      };
    } catch (error) {
      this.logger.error(`Error retrieving newer messages: ${error.message}`);
      throw new Error(`Failed to retrieve newer messages: ${error.message}`);
    }
  }

  /**
   * Get phone number ID from Meta Cloud API
   * Queries the WABA's phone numbers to find the ID for a given phone number
   * This is needed when setting up a new sender number
   *
   * @param phoneNumber - WhatsApp Business phone number (e.g., +14155552671)
   * @returns Phone number ID from Meta Cloud API
   */
  async getPhoneNumberIdFromMeta(phoneNumber: string): Promise<string> {
    try {
      if (!this.wabaId) {
        throw new Error('META_WABA_ID not configured');
      }

      const url = this.metaCloudAPIConfig
        .getEndpoints()
        .getPhoneNumbers(this.wabaId);

      this.logger.debug(`Fetching phone numbers from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: this.metaCloudAPIConfig.getDefaultHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error('Meta API error:', errorData);
        throw new Error(
          `Failed to fetch phone numbers from Meta: ${response.status} ${JSON.stringify(errorData)}`,
        );
      }

      const data = (await response.json()) as any;
      const phoneNumbers = data.data || [];

      // Clean phone number for comparison (remove +, spaces, dashes, etc.)
      const cleanedPhone = phoneNumber.replace(/[^0-9]/g, '');

      this.logger.debug(
        `Looking for phone: ${cleanedPhone}, Available: ${JSON.stringify(phoneNumbers.map((p: any) => ({ id: p.id, display: p.display_phone_number })))}`,
      );

      // Find matching phone number - Meta returns display_phone_number with formatting
      const matchingPhone = phoneNumbers.find((pn: any) => {
        const metaPhone = (pn.display_phone_number || '').replace(
          /[^0-9]/g,
          '',
        );
        return metaPhone === cleanedPhone;
      });

      if (!matchingPhone) {
        throw new Error(
          `Phone number ${phoneNumber} not found in Meta WABA. Available numbers: ${phoneNumbers.map((p: any) => p.display_phone_number).join(', ')}`,
        );
      }

      this.logger.log(
        `Found phone number ID for ${phoneNumber}: ${matchingPhone.id}`,
      );
      return matchingPhone.id;
    } catch (error) {
      this.logger.error(`Error getting phone number ID from Meta:`, error);
      throw error;
    }
  }

  /**
   * Get all phone numbers from the WABA with full details
   * Returns comprehensive phone number data for sync operations
   *
   * @returns Array of phone numbers with all Meta-provided details
   */
  async getAllWabaPhoneNumbers(): Promise<
    Array<{
      id: string;
      phoneNumber: string;
      verifiedName?: string;
      qualityRating?: string;
      codeVerificationStatus?: string;
      nameStatus?: string;
      isOfficialBusinessAccount: boolean;
      messagingLimitTier?: string;
      accountMode?: string;
      lastOnboardedTime?: string;
    }>
  > {
    if (!this.wabaId) {
      throw new BadRequestException('META_WABA_ID not configured');
    }

    const url = this.metaCloudAPIConfig
      .getEndpoints()
      .getPhoneNumbers(this.wabaId);

    this.logger.debug(`Fetching all phone numbers from WABA: ${this.wabaId}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: this.metaCloudAPIConfig.getDefaultHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      this.logger.error('Failed to fetch phone numbers from Meta:', errorData);
      throw new BadRequestException(
        `Failed to fetch phone numbers: ${errorData.error?.message || response.statusText}`,
      );
    }

    const data = await response.json();
    const phoneNumbers = data.data || [];

    this.logger.log(`Retrieved ${phoneNumbers.length} phone numbers from WABA`);

    return phoneNumbers.map((pn: any) => ({
      id: pn.id,
      phoneNumber: this.normalizePhoneNumberFormat(pn.display_phone_number),
      verifiedName: pn.verified_name,
      qualityRating: pn.quality_rating,
      codeVerificationStatus: pn.code_verification_status,
      nameStatus: pn.name_status,
      isOfficialBusinessAccount: pn.is_official_business_account || false,
      messagingLimitTier: pn.messaging_limit_tier,
      accountMode: pn.account_mode,
      lastOnboardedTime: pn.last_onboarded_time,
    }));
  }

  /**
   * Get details for a specific phone number by its Meta ID
   *
   * @param phoneNumberId - Meta phone number ID
   * @returns Phone number details
   */
  async getPhoneNumberDetails(phoneNumberId: string): Promise<{
    id: string;
    phoneNumber: string;
    verifiedName?: string;
    qualityRating?: string;
    codeVerificationStatus?: string;
    nameStatus?: string;
    isOfficialBusinessAccount: boolean;
    messagingLimitTier?: string;
  }> {
    const url = this.metaCloudAPIConfig
      .getEndpoints()
      .getPhoneNumberDetails(phoneNumberId);

    this.logger.debug(`Fetching phone number details for: ${phoneNumberId}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: this.metaCloudAPIConfig.getDefaultHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      this.logger.error('Failed to fetch phone number details:', errorData);
      throw new BadRequestException(
        `Failed to fetch phone details: ${errorData.error?.message || response.statusText}`,
      );
    }

    const pn = await response.json();

    return {
      id: pn.id,
      phoneNumber: this.normalizePhoneNumberFormat(pn.display_phone_number),
      verifiedName: pn.verified_name,
      qualityRating: pn.quality_rating,
      codeVerificationStatus: pn.code_verification_status,
      nameStatus: pn.name_status,
      isOfficialBusinessAccount: pn.is_official_business_account || false,
      messagingLimitTier: pn.messaging_limit_tier,
    };
  }

  /**
   * Get the WABA ID configured for this service
   * Useful for admin/sync operations
   */
  getWabaId(): string | undefined {
    return this.wabaId;
  }

  private normalizePhoneNumberFormat(phone: string): string {
    if (!phone) return '';
    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, '');
    // Ensure it starts with +
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }
    return normalized;
  }

  /**
   * Edit a message (only within 15 minutes of sending)
   * Uses Meta Cloud API message update endpoint
   *
   * @param messageId - WhatsApp message ID (from messages.messageId)
   * @param newText - New message text
   * @param phoneNumberId - Phone number ID of the sender
   * @returns Updated message data
   */
  async editMessage(
    messageId: string,
    newText: string,
    phoneNumberId: string,
  ): Promise<any> {
    try {
      this.logger.log(
        `Editing message ${messageId} with new text via Cloud API`,
      );

      // First, get the message from database to check edit window
      const [dbMessage] = await db.query.messages.findMany({
        where: eq(messages.messageId, messageId),
        limit: 1,
      });

      if (!dbMessage) {
        throw new Error(`Message ${messageId} not found in database`);
      }

      if (dbMessage.direction !== 'outbound') {
        throw new Error('Can only edit outbound messages');
      }

      // Check if message is already deleted
      if (dbMessage.isDeleted) {
        throw new Error('Cannot edit a deleted message');
      }

      // Check 15-minute edit window (900 seconds)
      const messageAgeSeconds = Math.floor(
        (Date.now() - new Date(dbMessage.timestamp).getTime()) / 1000,
      );
      const EDIT_WINDOW_SECONDS = 15 * 60; // 15 minutes

      if (messageAgeSeconds > EDIT_WINDOW_SECONDS) {
        throw new Error(
          `Message cannot be edited. Edit window (15 minutes) has passed. Message is ${Math.floor(messageAgeSeconds / 60)} minutes old.`,
        );
      }

      // Call Meta Cloud API to edit message
      const url = this.metaCloudAPIConfig.getEndpoints().editMessage(messageId);

      const payload = {
        messaging_product: 'whatsapp',
        text: {
          body: newText,
          preview_url: true,
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: this.metaCloudAPIConfig.getDefaultHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error('Meta API edit error:', errorData);
        throw new Error(
          `Failed to edit message on Meta Cloud API: ${response.status} ${JSON.stringify(errorData)}`,
        );
      }

      const data = (await response.json()) as any;

      // Update database - store original text on first edit, then update the text
      await db
        .update(messages)
        .set({
          text: newText,
          editedAt: sql`CURRENT_TIMESTAMP`,
          originalText: dbMessage.originalText || dbMessage.text, // Store original only on first edit
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(messages.messageId, messageId));

      this.logger.log(`Message ${messageId} edited successfully`);

      return {
        success: true,
        messageId,
        newText,
        editedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error editing message: ${error.message}`, error);
      throw new Error(`Failed to edit message: ${error.message}`);
    }
  }

  /**
   * Send contacts via WhatsApp Cloud API
   * Sends one or more contacts as a contact card message
   *
   * @param to - Recipient phone number
   * @param contacts - Array of contacts to send
   * @param senderId - Optional sender ID to determine which phoneNumberId to use
   * @returns Response with message ID and status
   */
  async sendContacts(
    to: string,
    contacts: Array<{
      name: {
        formatted_name: string;
        first_name?: string;
        last_name?: string;
      };
      phones?: Array<{
        phone: string;
        type?: string;
        wa_id?: string;
      }>;
    }>,
    senderId?: number,
  ): Promise<any> {
    try {
      const recipientPhone = cleanPhoneNumber(to);

      if (!contacts || contacts.length === 0) {
        throw new Error('At least one contact is required');
      }

      // Determine which sender this message is from
      let senderRecord: any = null;
      let senderPhoneNumber: string;

      if (senderId) {
        senderRecord = await db.query.senders.findFirst({
          where: eq(senders.id, senderId),
        });
        if (!senderRecord) {
          throw new Error(`Sender with ID ${senderId} not found`);
        }
      } else {
        // Use first available sender
        senderRecord = await db.query.senders.findFirst();
        if (!senderRecord) {
          throw new Error(
            'No senders configured. Please add a WhatsApp sender first.',
          );
        }
      }

      senderPhoneNumber = senderRecord.phoneNumber;

      if (!senderRecord.phoneNumberId) {
        throw new Error(
          `Sender ${senderRecord.id} (${senderPhoneNumber}) does not have a phoneNumberId set.`,
        );
      }

      this.logger.log(
        `Sending ${contacts.length} contact(s) from sender ${senderRecord.id} (${senderPhoneNumber}) to ${recipientPhone}`,
      );

      // Generate chat ID
      const chatId = generateChatId(senderPhoneNumber, recipientPhone);

      // Ensure chat exists (outbound message - no notification needed for outbound-initiated chats)
      await this.getOrCreateChat(
        chatId,
        senderPhoneNumber,
        recipientPhone,
        senderRecord.id,
      ).then(({ chat }) => chat);

      // ========================================================================
      // CRITICAL: Enforce 24-hour conversation window rule for contact messages
      // ========================================================================
      const windowValidation =
        await this.conversationWindowService.validateFreeFormMessage(chatId);

      if (!windowValidation.isValid) {
        this.logger.error(
          `Conversation window validation failed for contacts to ${recipientPhone}: ${windowValidation.errorMessage}`,
        );
        throw new BadRequestException({
          statusCode: 400,
          error: 'CONVERSATION_WINDOW_VIOLATION',
          errorCode: windowValidation.errorCode,
          message: windowValidation.errorMessage,
          windowStatus: windowValidation.windowStatus,
        });
      }

      // Build Cloud API contacts message
      // For each contact phone, we need:
      // - phone: the display number (can include formatting)
      // - wa_id: the WhatsApp ID (clean number without + for API matching)
      const message = {
        messaging_product: 'whatsapp' as const,
        to: recipientPhone,
        type: 'contacts' as const,
        contacts: contacts.map((contact) => ({
          name: {
            formatted_name: contact.name.formatted_name,
            first_name: contact.name.first_name,
            last_name: contact.name.last_name,
          },
          phones: contact.phones?.map((phone) => {
            // Clean the phone number - remove all non-digit characters except leading +
            const cleanedPhone = phone.phone.replace(/[^\d+]/g, '');
            // wa_id should be digits only (no +)
            const waId =
              phone.wa_id || cleanedPhone.replace(/^\+/, '').replace(/\D/g, '');
            return {
              phone: cleanedPhone, // E.164 format for display
              type: phone.type || 'CELL',
              wa_id: waId, // WhatsApp ID for matching
            };
          }),
        })),
      };

      // Send via Cloud API
      const response = await this.sendCloudAPIMessage(
        message,
        senderRecord.phoneNumberId,
      );

      if (!response.messages || response.messages.length === 0) {
        throw new Error('No message ID returned from Cloud API');
      }

      const waMessageId = response.messages[0].id;
      this.logger.log(
        `Contacts message sent successfully. ID: ${waMessageId}, Count: ${contacts.length}`,
      );

      // Store message in database
      // Build contact summary for text field
      const contactNames = contacts
        .map((c) => c.name.formatted_name || c.name.first_name || 'Contact')
        .join(', ');
      const textSummary =
        contacts.length === 1
          ? `Contact: ${contactNames}`
          : `${contacts.length} contacts: ${contactNames}`;

      await db.insert(messages).values({
        messageId: waMessageId,
        chatId: chatId,
        source: 'whatsapp',
        sender: senderPhoneNumber,
        direction: 'outbound',
        text: textSummary,
        type: 'contacts',
        status: 'sent',
        sentAt: new Date(),
        timestamp: new Date(),
        // Store full contacts data in attachments field as JSON
        // Using contacts-specific format for frontend parsing
        attachments: JSON.stringify({
          type: 'contacts',
          contacts: contacts,
        }),
      });

      // Emit via WebSocket for real-time updates
      if (whatsAppGatewayInstance) {
        whatsAppGatewayInstance.emitMessage({
          messageId: waMessageId,
          chatId,
          sender: senderPhoneNumber,
          direction: 'outbound',
          text: textSummary,
          type: 'contacts',
          status: 'sent',
          timestamp: new Date(),
          attachments: undefined,
        });
      }

      return {
        success: true,
        messageId: waMessageId,
        to: recipientPhone,
        type: 'contacts',
        contactCount: contacts.length,
        status: 'sent',
      };
    } catch (error) {
      this.logger.error(`Error sending contacts: ${error.message}`, error);
      throw new Error(`Failed to send contacts: ${error.message}`);
    }
  }

  /**
   * Delete a message (soft delete - local only, Cloud API doesn't support message deletion)
   * The recipient will still see the message on their side
   * We only mark it as deleted in our database
   *
   * @param messageId - WhatsApp message ID (from messages.messageId)
   * @param phoneNumberId - Phone number ID of the sender
   * @returns Deletion confirmation
   */
  async deleteMessage(messageId: string, phoneNumberId: string): Promise<any> {
    try {
      this.logger.log(
        `Deleting message ${messageId} locally (Cloud API doesn't support message deletion)`,
      );

      // Get the message from database
      const [dbMessage] = await db.query.messages.findMany({
        where: eq(messages.messageId, messageId),
        limit: 1,
      });

      if (!dbMessage) {
        throw new Error(`Message ${messageId} not found in database`);
      }

      if (dbMessage.direction !== 'outbound') {
        throw new Error('Can only delete outbound messages');
      }

      // Check if already deleted
      if (dbMessage.isDeleted) {
        throw new Error('Message is already deleted');
      }

      // Soft delete in database only - Cloud API doesn't support message deletion
      // Preserve original for audit trail
      await db
        .update(messages)
        .set({
          isDeleted: true,
          deletedAt: sql`CURRENT_TIMESTAMP`,
          text: null, // Clear the text
          originalText: dbMessage.originalText || dbMessage.text, // Store original before deletion
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(messages.messageId, messageId));

      this.logger.log(
        `Message ${messageId} marked as deleted in database (recipient still sees the message)`,
      );

      return {
        success: true,
        messageId,
        deletedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error deleting message: ${error.message}`, error);
      throw new Error(`Failed to delete message: ${error.message}`);
    }
  }
}
