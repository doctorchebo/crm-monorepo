/**
 * Handoff Notification Gateway
 * WebSocket gateway for real-time handoff and usage notifications
 *
 * Features:
 * - Real-time intervention alerts
 * - Usage limit warnings
 * - AI pause/resume notifications
 * - User-specific subscription rooms
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

// ============================================================================
// Types
// ============================================================================

export interface HandoffNotificationPayload {
  id?: string;
  type:
    | 'intervention_required'
    | 'ai_paused'
    | 'ai_resumed'
    | 'limit_warning'
    | 'limit_exceeded'
    | 'handoff_request'
    | 'handoff_resolved';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  chatId?: string;
  aiReason?: string;
  suggestedAction?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ThrottleNotificationPayload {
  userId: number;
  type: 'limit_warning' | 'limit_exceeded' | 'ai_paused' | 'ai_resumed';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  metadata?: Record<string, unknown>;
}

@Injectable()
@WebSocketGateway({
  namespace: 'handoff-notifications',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class HandoffNotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(HandoffNotificationGateway.name);

  @WebSocketServer()
  server: Server;

  // Track user subscriptions
  private userSockets: Map<number, Set<string>> = new Map();

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    // Remove from all user rooms
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
        break;
      }
    }
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /**
   * Subscribe to handoff notifications for a user
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: number },
  ): void {
    const { userId } = data;
    const room = `user:${userId}`;

    client.join(room);

    // Track socket
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)?.add(client.id);

    this.logger.debug(`Client ${client.id} subscribed to ${room}`);

    client.emit('subscribed', {
      room,
      userId,
      timestamp: new Date(),
    });
  }

  /**
   * Unsubscribe from notifications
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: number },
  ): void {
    const { userId } = data;
    const room = `user:${userId}`;

    client.leave(room);
    this.userSockets.get(userId)?.delete(client.id);

    this.logger.debug(`Client ${client.id} unsubscribed from ${room}`);
  }

  /**
   * Acknowledge a handoff notification
   */
  @SubscribeMessage('acknowledge')
  handleAcknowledge(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: string; userId: number },
  ): void {
    const room = `user:${data.userId}`;

    // Broadcast acknowledgment to all user's clients
    this.server.to(room).emit('notification:acknowledged', {
      notificationId: data.notificationId,
      acknowledgedBy: client.id,
      timestamp: new Date(),
    });
  }

  /**
   * Handle handoff resolution from client
   */
  @SubscribeMessage('resolve')
  handleResolve(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      notificationId: string;
      userId: number;
      chatId: string;
      resolution: string;
      resumeAi: boolean;
    },
  ): void {
    const room = `user:${data.userId}`;

    // Broadcast resolution to all user's clients
    this.server.to(room).emit('notification:resolved', {
      notificationId: data.notificationId,
      chatId: data.chatId,
      resolution: data.resolution,
      resumeAi: data.resumeAi,
      resolvedBy: client.id,
      timestamp: new Date(),
    });
  }

  /**
   * Get connection status
   */
  @SubscribeMessage('status')
  handleStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: number },
  ): void {
    const connectedClients = this.userSockets.get(data.userId)?.size || 0;

    client.emit('status:response', {
      userId: data.userId,
      connectedClients,
      yourClientId: client.id,
      timestamp: new Date(),
    });
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Handle handoff notification events
   */
  @OnEvent('handoff.notification')
  handleHandoffNotification(payload: {
    userId: number;
    notification: HandoffNotificationPayload;
  }): void {
    const room = `user:${payload.userId}`;

    this.server.to(room).emit('notification:handoff', {
      ...payload.notification,
      timestamp: payload.notification.timestamp || new Date(),
    });

    this.logger.debug(
      `Sent handoff notification to user ${payload.userId}: ${payload.notification.type}`,
    );
  }

  /**
   * Handle throttle notification events (from UsageThrottleService)
   */
  @OnEvent('throttle.notification')
  handleThrottleNotification(payload: ThrottleNotificationPayload): void {
    const room = `user:${payload.userId}`;

    this.server.to(room).emit('notification:throttle', {
      type: payload.type,
      title: payload.title,
      message: payload.message,
      severity: payload.severity,
      metadata: payload.metadata,
      timestamp: new Date(),
    });

    this.logger.debug(
      `Sent throttle notification to user ${payload.userId}: ${payload.type}`,
    );
  }

  /**
   * Handle AI pause events
   */
  @OnEvent('ai.paused')
  handleAiPaused(payload: {
    userId: number;
    chatId: string;
    reason: string;
  }): void {
    const room = `user:${payload.userId}`;

    this.server.to(room).emit('notification:ai-status', {
      type: 'paused',
      chatId: payload.chatId,
      reason: payload.reason,
      timestamp: new Date(),
    });
  }

  /**
   * Handle AI resume events
   */
  @OnEvent('ai.resumed')
  handleAiResumed(payload: { userId: number; chatId: string }): void {
    const room = `user:${payload.userId}`;

    this.server.to(room).emit('notification:ai-status', {
      type: 'resumed',
      chatId: payload.chatId,
      timestamp: new Date(),
    });
  }

  /**
   * Handle intervention required events
   */
  @OnEvent('intervention.required')
  handleInterventionRequired(payload: {
    userId: number;
    chatId: string;
    messageId?: string;
    reason: string;
    aiConfidence: number;
    suggestedAction?: string;
  }): void {
    const room = `user:${payload.userId}`;

    this.server.to(room).emit('notification:intervention', {
      type: 'intervention_required',
      priority: payload.aiConfidence < 50 ? 'high' : 'medium',
      chatId: payload.chatId,
      messageId: payload.messageId,
      reason: payload.reason,
      aiConfidence: payload.aiConfidence,
      suggestedAction: payload.suggestedAction,
      timestamp: new Date(),
    });

    this.logger.log(
      `Intervention required for chat ${payload.chatId}: ${payload.reason}`,
    );
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Send notification to a specific user
   */
  sendToUser(userId: number, event: string, payload: unknown): void {
    const room = `user:${userId}`;
    this.server.to(room).emit(event, payload);
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: number): boolean {
    return (this.userSockets.get(userId)?.size || 0) > 0;
  }

  /**
   * Get count of connected clients for a user
   */
  getUserClientCount(userId: number): number {
    return this.userSockets.get(userId)?.size || 0;
  }
}
