import { db } from '@database/db.connection';
import { Chat, chats, Message, messages, senders } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaCloudAPIConfigService } from '@shared/services/meta-cloud-api.config';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { ThumbnailQueueService } from '../thumbnail/thumbnail-queue.service';
import {
  supportsThumbnail,
  ThumbnailJobData,
} from '../thumbnail/thumbnail.types';
import { OutboundMessageDto } from './dto/outbound-message.dto';
import { MediaService } from './services/media.service';
import {
  CloudAPIInboundMessage,
  CloudAPISendMessageResponse,
  CloudAPIWebhookPayload,
  MediaMetadata,
  NormalizedCloudAPIMessage,
} from './types/cloud-api.types';
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
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  private readonly metaPhoneNumberId: string;
  private readonly metaBusinessPhoneNumber: string;
  private readonly metaAccessToken: string;
  private readonly metaVerifyToken: string;
  private readonly metaAppSecret: string | undefined;
  private readonly wabaId: string | undefined;

  constructor(
    private configService: ConfigService,
    private metaCloudAPIConfig: MetaCloudAPIConfigService,
    private mediaService: MediaService,
    private thumbnailQueueService: ThumbnailQueueService,
  ) {
    this.metaPhoneNumberId = this.configService.getOrThrow<string>(
      'META_PHONE_NUMBER_ID',
    );
    this.metaBusinessPhoneNumber = this.configService.getOrThrow<string>(
      'META_BUSINESS_PHONE_NUMBER',
    );
    this.metaAccessToken =
      this.configService.getOrThrow<string>('META_ACCESS_TOKEN');
    this.metaVerifyToken =
      this.configService.getOrThrow<string>('META_VERIFY_TOKEN');
    this.metaAppSecret = this.configService.get<string>('META_APP_SECRET');
    this.wabaId = this.configService.get<string>('META_WABA_ID');

    if (
      !this.metaPhoneNumberId ||
      !this.metaBusinessPhoneNumber ||
      !this.metaAccessToken ||
      !this.metaVerifyToken
    ) {
      this.logger.error('Missing required Meta Cloud API credentials');
      throw new Error(
        'Missing META_PHONE_NUMBER_ID, META_BUSINESS_PHONE_NUMBER, META_ACCESS_TOKEN, or META_VERIFY_TOKEN',
      );
    }

    this.logger.log('Cloud API Service initialized');
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
      console.log('✅ Webhook challenge verified successfully');
      this.logger.log('Webhook challenge verified successfully');
      return hubChallenge;
    }

    console.log('❌ Webhook challenge verification failed');
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
          '⚠️  META_APP_SECRET not configured - skipping signature verification',
        );
        this.logger.warn(
          '⚠️  META_APP_SECRET not configured - skipping signature verification for webhook',
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
          await this.handleMessageStatus(
            status.id,
            status.status,
            status.timestamp,
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

      if (!senderRecord.phoneNumberId) {
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

      // Ensure chat exists with the correct sender
      await this.getOrCreateChat(
        chatId,
        senderPhoneNumber,
        recipientPhone,
        senderId,
      );

      let waMessageId: string;

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
        const message = {
          messaging_product: 'whatsapp' as const,
          to: recipientPhone,
          type: 'text' as const,
          text: {
            preview_url: true,
            body: messageDto.body || '',
          },
        };

        // Validate message
        const validation = validateCloudAPIMessage(message);
        if (!validation.valid) {
          throw new Error(`Invalid message: ${validation.errors.join(', ')}`);
        }

        // Send via Cloud API using the sender's phoneNumberId
        const response = await this.sendCloudAPIMessage(
          message,
          senderRecord.phoneNumberId,
        );

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
      });

      return {
        success: true,
        messageId: waMessageId,
        to: recipientPhone,
        status: 'sent',
      };
    } catch (error) {
      this.logger.error(`Error sending message: ${error.message}`, error);
      throw new Error(`Failed to send WhatsApp message: ${error.message}`);
    }
  }

  /**
   * Send media message via Cloud API
   * Supports image, video, audio, document
   *
   * @param recipientPhone - Recipient phone number
   * @param mediaType - Type of media (image, video, audio, document)
   * @param mediaUrl - URL of media file
   * @param caption - Optional caption for media
   * @param senderId - Optional sender ID to determine which phoneNumberId to use
   * @param fileName - Optional filename for documents (required for WhatsApp to display correct name)
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
  ): Promise<any> {
    try {
      const cleanedPhone = cleanPhoneNumber(recipientPhone);

      const mediaPayload: any = {
        link: mediaUrl,
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

      // If originalMessageId provided, update the existing database message status
      // NOTE: We keep the original messageId to avoid breaking thumbnail updates and other
      // operations that reference this ID. The WhatsApp message ID is stored in mediaUrl
      // field (prefixed with 'wa:') for webhook lookups.
      if (originalMessageId) {
        try {
          await db
            .update(messages)
            .set({
              status: 'sent',
              sentAt: new Date(),
              updatedAt: new Date(),
              // Store WhatsApp message ID in mediaUrl for webhook lookups
              mediaUrl: `wa:${waMessageId}`,
            })
            .where(eq(messages.messageId, originalMessageId));

          this.logger.log(
            `Updated message ${originalMessageId} with status 'sent' (WhatsApp ID: ${waMessageId})`,
          );

          // Emit status update via WebSocket using original messageId
          if (whatsAppGatewayInstance) {
            whatsAppGatewayInstance.emitMessageStatus(
              originalMessageId,
              'sent',
            );
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
   * Internal method: Send message via Cloud API HTTP endpoint
   * @private
   */
  private async sendCloudAPIMessage(
    message: any,
    phoneNumberId?: string,
  ): Promise<CloudAPISendMessageResponse> {
    // Use provided phoneNumberId, or fall back to default (for backward compatibility)
    const actualPhoneNumberId = phoneNumberId || this.metaPhoneNumberId;
    const url = buildCloudAPIUrl(actualPhoneNumberId, 'messages');
    const headers = getCloudAPIHeaders(this.metaAccessToken);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Cloud API error: ${response.status} ${JSON.stringify(errorData)}`,
        );
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Cloud API request failed:', error);
      throw error;
    }
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

      const senderPhone = cleanPhoneNumber(message.from);

      console.log('Sender phone:', senderPhone);
      console.log('Message ID:', message.id);
      console.log('Sender ID from webhook:', senderId);
      const messageId = message.id;

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

      // Ensure chat exists
      const chat = await this.getOrCreateChat(
        chatId,
        businessPhone,
        senderPhone,
        senderId,
      );
      console.log('Chat created/retrieved:', {
        chatId: chat.chatId,
        id: chat.id,
        senderId: chat.senderId,
      });

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
          textContent = message.image?.caption || '[Image]';
          break;
        case 'video':
          mediaMetadata = {
            type: 'video',
            mimeType: message.video?.mime_type || 'video/mp4',
            sha256: message.video?.sha256 || '',
            mediaId: message.video?.id || '',
            caption: message.video?.caption,
          };
          textContent = message.video?.caption || '[Video]';
          break;
        case 'audio':
          mediaMetadata = {
            type: 'audio',
            mimeType: message.audio?.mime_type || 'audio/mpeg',
            sha256: message.audio?.sha256 || '',
            mediaId: message.audio?.id || '',
          };
          textContent = '[Audio]';
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
          textContent = '[Interactive message]';
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
        default:
          textContent = '[Unsupported message type]';
      }

      // Store inbound message
      await this.storeInboundMessage({
        waMessageId: messageId,
        chatId,
        source: 'whatsapp',
        sender: senderPhone,
        type: messageType,
        text: textContent,
        mediaMetadata,
        contactsData,
        direction: 'inbound',
        status: 'delivered',
        timestamp: new Date(parseInt(message.timestamp) * 1000),
        waPhoneNumberId: businessPhone,
      });

      console.log('Message stored successfully:', {
        messageId,
        chatId,
      });

      // Update chat with last message preview
      await this.updateChatLastMessage(chatId, textContent);
      console.log('Chat updated with last message');

      this.logger.log(
        `Inbound message stored. From: ${senderPhone}, Type: ${messageType}, ID: ${messageId}`,
      );

      // 🔥 EMIT MESSAGE VIA WEBSOCKET
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
                thumbnailStatus: att.thumbnailStatus,
                status: att.status,
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
        });
      }

      // TODO: Trigger automation rules
    } catch (error) {
      this.logger.error('Error handling inbound message:', error);
      throw error;
    }
  }

  /**
   * Handle message delivery status webhook from Meta Cloud API
   *
   * Implements the full message lifecycle:
   * - pending: Initial state when message is queued
   * - sent: Message successfully sent to WhatsApp servers (✓)
   * - delivered: Message reached recipient device (✓✓)
   * - read: Message read by recipient (✓✓ in blue)
   * - failed: Delivery failed with error
   *
   * @param messageId - Cloud API message ID (wamid)
   * @param status - Status from Cloud API webhook
   * @param timestamp - Unix timestamp from webhook (optional, defaults to now)
   * @private
   */
  private async handleMessageStatus(
    messageId: string,
    status: string,
    timestamp?: string,
  ): Promise<void> {
    try {
      if (!messageId || !status) {
        this.logger.warn(
          `Incomplete status webhook. MessageId: ${messageId}, Status: ${status}`,
        );
        return;
      }

      console.log(
        `🔔 STATUS WEBHOOK RECEIVED: messageId=${messageId}, status=${status}`,
      );

      const normalizedStatus = mapCloudAPIStatus(status);
      const statusTimestamp = timestamp
        ? new Date(parseInt(timestamp) * 1000)
        : new Date();

      // Find message to update - search by messageId or by WhatsApp ID stored in mediaUrl
      // Outbound attachment messages store WhatsApp ID in mediaUrl with 'wa:' prefix
      console.log(
        `🔍 Searching for message by messageId="${messageId}" OR mediaUrl="wa:${messageId}"`,
      );

      const msg = await db.query.messages.findFirst({
        where: or(
          eq(messages.messageId, messageId),
          eq(messages.mediaUrl, `wa:${messageId}`),
        ),
      });

      console.log(
        `🔍 Message found: ${msg ? `YES (id=${msg.id}, messageId=${msg.messageId}, mediaUrl=${msg.mediaUrl})` : 'NO'}`,
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
        console.log(`📊 Message Status Update:
          ID: ${msg.messageId} (WhatsApp: ${messageId})
          Status: ${msg.status} → ${normalizedStatus}
          Sent: ${msg.sentAt || 'pending'} → ${updateData.sentAt || msg.sentAt || 'pending'}
          Delivered: ${msg.deliveredAt || 'pending'} → ${updateData.deliveredAt || msg.deliveredAt || 'pending'}
          Read: ${msg.readAt || 'pending'} → ${updateData.readAt || msg.readAt || 'pending'}
        `);

        // 🔥 EMIT STATUS UPDATE VIA WEBSOCKET
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
          `⚠️ Status update received for non-existent message: ${messageId}`,
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
  }): Promise<void> {
    try {
      const now = new Date();
      await db.insert(messages).values({
        messageId: messageData.waMessageId,
        chatId: messageData.chatId,
        source: 'whatsapp',
        sender: messageData.from, // Store the actual sender's phone number
        type:
          messageData.attachments && messageData.attachments.length > 0
            ? 'media'
            : 'text',
        text: messageData.body,
        attachments: messageData.attachments || [],
        direction: 'outbound',
        status: 'pending', // Start as pending, will update to 'sent' when Cloud API confirms
        timestamp: now,
        updatedAt: now,
      });

      this.logger.debug('Outbound message stored', messageData.waMessageId);
      console.log(
        `💾 Outbound message stored with pending status: ${messageData.waMessageId}`,
      );
    } catch (error) {
      this.logger.error(`Error storing outbound message: ${error.message}`);
      // Don't throw - message already sent
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

      // If there's media, download and cache it to S3 immediately
      // Meta's URLs expire after 5 minutes, so we must cache now
      if (messageData.mediaMetadata) {
        try {
          this.logger.log(
            `[Inbound Media] Starting to cache media: ${messageData.mediaMetadata.mediaId} (${messageData.mediaMetadata.mimeType})`,
          );
          s3Key = await this.mediaService.downloadAndCacheCloudAPIMedia(
            messageData.mediaMetadata.mediaId,
            messageData.mediaMetadata.mimeType || 'application/octet-stream',
            messageData.chatId, // Use chatId as the organization key
            messageData.mediaMetadata.filename,
          );
          if (s3Key) {
            this.logger.log(
              `[Inbound Media] ✅ Successfully cached media to S3: ${s3Key}`,
            );
          } else {
            this.logger.warn(
              `[Inbound Media] ⚠️ Failed to cache media (will use cloud-api:// fallback): ${messageData.mediaMetadata.mediaId}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `[Inbound Media] ❌ Exception while caching media: ${error.message}`,
            error,
          );
          // Continue without S3 cache - will fall back to cloud-api:// reference
        }
      }

      // Determine thumbnail status based on media type
      const mediaType = messageData.type as
        | 'image'
        | 'video'
        | 'audio'
        | 'document';
      const mimeType = messageData.mediaMetadata?.mimeType || '';
      const thumbnailStatus = supportsThumbnail(mediaType, mimeType)
        ? 'pending'
        : 'not-applicable';

      const attachments = messageData.mediaMetadata
        ? [
            {
              id: messageData.mediaMetadata.mediaId,
              type: messageData.type, // The type field contains 'image', 'video', etc.
              fileName:
                messageData.mediaMetadata.filename ||
                `${messageData.type}_${messageData.mediaMetadata.mediaId}`,
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
            },
          ]
        : messageData.contactsData
          ? // For contacts, store the contact data in attachments as JSON
            messageData.contactsData
          : [];

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
      });

      // Queue thumbnail generation if media was cached to S3 and supports thumbnails
      if (
        s3Key &&
        messageData.mediaMetadata &&
        supportsThumbnail(mediaType, mimeType)
      ) {
        try {
          const thumbnailJobData: ThumbnailJobData = {
            messageId: messageData.waMessageId,
            attachmentId: messageData.mediaMetadata.mediaId,
            s3Key: s3Key,
            mediaType: mediaType,
            mimeType: mimeType,
            chatId: messageData.chatId,
            pathPrefix: 'inbound',
          };

          await this.thumbnailQueueService.queueThumbnailGeneration(
            thumbnailJobData,
          );
          this.logger.log(
            `[Inbound Media] ✅ Queued thumbnail generation for ${messageData.mediaMetadata.mediaId}`,
          );
        } catch (error) {
          this.logger.warn(
            `[Inbound Media] ⚠️ Failed to queue thumbnail generation: ${error.message}`,
          );
          // Don't fail the message storage - thumbnail will remain pending
        }
      }

      this.logger.debug('Inbound message stored', messageData.waMessageId);
    } catch (error) {
      this.logger.error(`Error storing inbound message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get or create a chat for two participants
   * @private
   */
  private async getOrCreateChat(
    chatId: string,
    businessPhone: string,
    participantPhone: string,
    senderId?: number,
  ): Promise<Chat> {
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
        const [newChat] = await db
          .insert(chats)
          .values({
            chatId,
            businessPhone,
            participantPhone,
            participantName: participantPhone,
            senderId,
            userId: (
              await db.query.senders.findFirst({
                where: eq(senders.id, senderId),
              })
            )?.userId,
            isActive: true,
          })
          .returning();

        this.logger.log(`Chat created: ${chatId} for sender ${senderId}`);
        return newChat;
      }

      return chat;
    } catch (error) {
      this.logger.error(`Error getting or creating chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update chat with latest message info
   * @private
   */
  private async updateChatLastMessage(
    chatId: string,
    lastMessage: string,
  ): Promise<void> {
    try {
      await db
        .update(chats)
        .set({
          lastMessage,
          lastMessageTime: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(chats.chatId, chatId));
    } catch (error) {
      this.logger.error(`Error updating chat last message: ${error.message}`);
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
      const chatsData = await db.query.chats.findMany({
        where: and(
          eq(chats.isActive, true),
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
   * Get messages for a specific chat
   */
  async getChatMessages(
    chatId: string,
    skip: number = 0,
    take: number = 50,
  ): Promise<Message[]> {
    try {
      const chatMessages = await db.query.messages.findMany({
        where: eq(messages.chatId, chatId),
        orderBy: desc(messages.timestamp),
        limit: take,
        offset: skip,
      });

      return chatMessages;
    } catch (error) {
      this.logger.error(`Error retrieving chat messages: ${error.message}`);
      throw new Error(`Failed to retrieve chat messages: ${error.message}`);
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

      // Clean phone number for comparison
      const cleanedPhone = cleanPhoneNumber(phoneNumber);

      // Find matching phone number
      const matchingPhone = phoneNumbers.find((pn: any) => {
        const cleanedMeta = cleanPhoneNumber(pn.phone_number || '');
        return cleanedMeta === cleanedPhone;
      });

      if (!matchingPhone) {
        throw new Error(
          `Phone number ${phoneNumber} not found in Meta WABA. Available numbers: ${phoneNumbers.map((p: any) => p.phone_number).join(', ')}`,
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

      // Ensure chat exists
      await this.getOrCreateChat(
        chatId,
        senderPhoneNumber,
        recipientPhone,
        senderRecord.id,
      );

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
