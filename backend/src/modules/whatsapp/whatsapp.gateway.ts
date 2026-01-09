/**
 * WhatsApp WebSocket Gateway
 * Emits real-time message status updates to connected clients
 *
 * Instead of polling for message status changes, clients connect via WebSocket
 * and receive instant status updates when Meta webhooks arrive.
 *
 * Events:
 * - message:status - Emitted when message status changes (sent, delivered, read, failed)
 * - message:statuses - Emitted with batch of status updates
 *
 * This eliminates the need for polling and provides real-time status updates.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
})
export class WhatsAppGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(WhatsAppGateway.name);
  private connectedClients = new Set<string>();

  /**
   * Handle client connection
   */
  handleConnection(socket: Socket): void {
    this.connectedClients.add(socket.id);
    this.logger.log(
      `Client connected: ${socket.id}. Total: ${this.connectedClients.size}`,
    );
    console.log(`✅ WebSocket client connected: ${socket.id}`);
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(socket: Socket): void {
    this.connectedClients.delete(socket.id);
    this.logger.log(
      `Client disconnected: ${socket.id}. Total: ${this.connectedClients.size}`,
    );
    console.log(`❌ WebSocket client disconnected: ${socket.id}`);
  }

  /**
   * Emit single message status update to all connected clients
   * Called by WhatsAppService.handleMessageStatus() when webhook arrives
   *
   * @param messageId - The WhatsApp message ID
   * @param status - New status (sent, delivered, read, failed)
   * @param timestamp - When status changed
   */
  emitMessageStatus(messageId: string, status: string, timestamp?: Date): void {
    if (this.connectedClients.size === 0) {
      return; // No clients connected
    }

    const statusUpdate = {
      messageId,
      status,
      timestamp: timestamp || new Date(),
    };

    console.log(
      `📡 Emitting status update: ${messageId} → ${status} to ${this.connectedClients.size} clients`,
    );

    // Emit to all connected clients
    this.server.emit('message:status', statusUpdate);
  }

  /**
   * Emit batch message status updates to all connected clients
   * More efficient when multiple messages have status changes
   *
   * @param updates - Array of status updates
   */
  emitMessageStatuses(
    updates: Array<{
      messageId: string;
      status: string;
      timestamp?: Date;
    }>,
  ): void {
    if (this.connectedClients.size === 0 || updates.length === 0) {
      return;
    }

    const statusUpdates = updates.map((update) => ({
      ...update,
      timestamp: update.timestamp || new Date(),
    }));

    console.log(
      `📡 Emitting ${updates.length} status updates to ${this.connectedClients.size} clients`,
    );

    // Emit batch to all connected clients
    this.server.emit('message:statuses', statusUpdates);
  }

  /**
   * Emit single inbound message to all connected clients
   * Called by WhatsAppService.handleInboundMessage() when webhook arrives
   *
   * @param message - The inbound message data
   */
  emitMessage(message: {
    messageId: string;
    chatId: string;
    sender: string;
    text: string;
    type: string;
    timestamp: Date;
    attachments?: any[];
    direction?: string;
    status?: string;
    replyToMessageId?: string;
    replyPreview?: any;
  }): void {
    if (this.connectedClients.size === 0) {
      return; // No clients connected
    }

    console.log(
      `📡 Emitting new message: ${message.messageId} in chat ${message.chatId} to ${this.connectedClients.size} clients`,
    );

    // Emit to all connected clients
    this.server.emit('message:new', {
      ...message,
      timestamp: message.timestamp.toISOString
        ? message.timestamp.toISOString()
        : message.timestamp,
    });
  }

  /**
   * Emit batch inbound messages to all connected clients
   * More efficient when multiple messages arrive at once
   *
   * @param messages - Array of inbound messages
   */
  emitMessages(
    messages: Array<{
      messageId: string;
      chatId: string;
      sender: string;
      text: string;
      type: string;
      timestamp: Date;
      attachments?: any[];
    }>,
  ): void {
    if (this.connectedClients.size === 0 || messages.length === 0) {
      return;
    }

    const messageData = messages.map((msg) => ({
      ...msg,
      timestamp: msg.timestamp.toISOString
        ? msg.timestamp.toISOString()
        : msg.timestamp,
    }));

    console.log(
      `📡 Emitting ${messages.length} new messages to ${this.connectedClients.size} clients`,
    );

    // Emit batch to all connected clients
    this.server.emit('message:batch', messageData);
  }

  /**
   * Emit thumbnail ready event to all connected clients
   * Called when thumbnail generation completes
   *
   * @param event - Thumbnail ready event data
   */
  emitThumbnailReady(event: {
    messageId: string;
    attachmentId: string;
    thumbnailKey: string;
    width: number;
    height: number;
    blurhash: string;
    duration?: number; // For PDFs: page count
  }): void {
    if (this.connectedClients.size === 0) {
      return; // No clients connected
    }

    console.log(
      `📡 Emitting thumbnail:ready for ${event.messageId}/${event.attachmentId} to ${this.connectedClients.size} clients`,
    );

    // Emit to all connected clients
    this.server.emit('thumbnail:ready', event);
  }

  /**
   * Emit batch thumbnail ready events to all connected clients
   * More efficient when multiple thumbnails complete at once
   *
   * @param events - Array of thumbnail ready events
   */
  emitThumbnailsBatch(
    events: Array<{
      messageId: string;
      attachmentId: string;
      thumbnailKey: string;
      width: number;
      height: number;
      blurhash: string;
    }>,
  ): void {
    if (this.connectedClients.size === 0 || events.length === 0) {
      return;
    }

    console.log(
      `📡 Emitting ${events.length} thumbnail:ready events to ${this.connectedClients.size} clients`,
    );

    // Emit batch to all connected clients
    this.server.emit('thumbnails:batch', events);
  }

  /**
   * Emit attachment status update to all connected clients
   * Called when an individual attachment's status changes (for multi-media messages)
   *
   * @param event - The attachment status update data
   */
  emitAttachmentStatus(event: {
    messageId: string;
    attachmentId: string;
    status: string;
    waMessageId?: string;
    timestamp?: Date;
  }): void {
    if (this.connectedClients.size === 0) {
      return; // No clients connected
    }

    console.log(
      `📡 Emitting attachment:status for ${event.messageId}/${event.attachmentId} → ${event.status} to ${this.connectedClients.size} clients`,
    );

    // Emit to all connected clients
    this.server.emit('attachment:status', {
      ...event,
      timestamp: event.timestamp?.toISOString() || new Date().toISOString(),
    });
  }

  /**
   * Emit chat update event to all connected clients
   * Called when chat metadata changes (unread count, last message, reactions, etc.)
   *
   * @param chatUpdate - The chat update data
   */
  emitChatUpdate(chatUpdate: {
    chatId: string;
    unreadCount: number;
    lastMessage?: string;
    lastMessageType?: string;
    lastMessageTime?: Date;
    // Last activity tracking for reactions
    lastActivityType?: string;
    lastReactionEmoji?: string | null;
    lastReactionIsOwn?: boolean;
    lastReactedMessagePreview?: string | null;
  }): void {
    if (this.connectedClients.size === 0) {
      return; // No clients connected
    }

    console.log(
      `📡 Emitting chat:update for ${chatUpdate.chatId} (unread: ${chatUpdate.unreadCount}, type: ${chatUpdate.lastMessageType || chatUpdate.lastActivityType || 'text'}) to ${this.connectedClients.size} clients`,
    );

    // Emit to all connected clients
    this.server.emit('chat:update', {
      ...chatUpdate,
      lastMessageTime: chatUpdate.lastMessageTime?.toISOString(),
    });
  }

  /**
   * Emit chat created event to all connected clients
   * Called when a new chat is created from an inbound message (customer initiated conversation)
   *
   * @param chat - The newly created chat data
   */
  emitChatCreated(chat: {
    chatId: string;
    businessPhone: string;
    participantPhone: string;
    participantName: string;
    senderId: number;
    userId?: number;
    isActive: boolean;
    unreadCount: number;
    lastMessage?: string;
    lastMessageType?: string;
    lastMessageTime?: Date;
    createdAt: Date;
  }): void {
    if (this.connectedClients.size === 0) {
      return; // No clients connected
    }

    console.log(
      `📡 Emitting chat:new for ${chat.chatId} (participant: ${chat.participantPhone}) to ${this.connectedClients.size} clients`,
    );

    // Emit to all connected clients
    this.server.emit('chat:new', {
      ...chat,
      lastMessageTime: chat.lastMessageTime?.toISOString(),
      createdAt: chat.createdAt.toISOString(),
    });
  }

  /**
   * Emit chat archived/unarchived event to all connected clients
   * Called when a chat's archive status changes
   *
   * @param chatId - The chat ID
   * @param isArchived - Whether the chat is now archived
   */
  emitChatArchived(chatId: string, isArchived: boolean): void {
    if (this.connectedClients.size === 0) {
      return; // No clients connected
    }

    console.log(
      `📡 Emitting chat:archived for ${chatId} (isArchived: ${isArchived}) to ${this.connectedClients.size} clients`,
    );

    // Emit to all connected clients
    this.server.emit('chat:archived', {
      chatId,
      isArchived,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit chat deleted event to all connected clients
   * Called when a chat is permanently deleted
   *
   * @param chatId - The chat ID that was deleted
   */
  emitChatDeleted(chatId: string): void {
    if (this.connectedClients.size === 0) {
      return; // No clients connected
    }

    console.log(
      `📡 Emitting chat:deleted for ${chatId} to ${this.connectedClients.size} clients`,
    );

    // Emit to all connected clients
    this.server.emit('chat:deleted', {
      chatId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit attachment updated event to all connected clients
   * Called when an attachment's s3Key is updated after upload completes
   *
   * @param data - The attachment update data
   */
  emitAttachmentUpdated(data: {
    messageId: string;
    chatId: string;
    attachmentId: string;
    s3Key: string;
    thumbnailStatus?: string;
  }): void {
    if (this.connectedClients.size === 0) {
      return; // No clients connected
    }

    console.log(
      `📡 Emitting attachment:updated for message ${data.messageId}, attachment ${data.attachmentId} to ${this.connectedClients.size} clients`,
    );

    // Emit to all connected clients
    this.server.emit('attachment:updated', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit customer reaction event to all connected clients
   * Called when a WhatsApp customer reacts to a message
   *
   * @param data - The customer reaction data
   */
  emitCustomerReaction(data: {
    chatId: string;
    messageId: string;
    emoji: string | null;
    senderPhone: string;
    action: 'added' | 'removed';
  }): void {
    if (this.connectedClients.size === 0) {
      return; // No clients connected
    }

    console.log(
      `📡 Emitting customer-reaction for message ${data.messageId} (${data.action}: ${data.emoji || 'removed'}) to ${this.connectedClients.size} clients`,
    );

    // Emit to all connected clients
    this.server.emit('customer-reaction', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get number of connected clients (for monitoring)
   */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Generic method to emit any event to all connected clients
   * Used by services that need to broadcast custom events
   *
   * @param eventName - The event name to emit
   * @param data - The data payload to send
   */
  emitToAllClients(eventName: string, data: unknown): void {
    if (this.connectedClients.size === 0) {
      return; // No clients connected
    }

    this.logger.debug(
      `📡 Emitting ${eventName} to ${this.connectedClients.size} clients`,
    );

    this.server.emit(eventName, data);
  }
}

/**
 * Export singleton instance
 * This allows other services to emit events
 */
export let whatsAppGatewayInstance: WhatsAppGateway;

export function setWhatsAppGateway(gateway: WhatsAppGateway): void {
  whatsAppGatewayInstance = gateway;
}
