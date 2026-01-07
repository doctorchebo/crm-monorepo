/**
 * Guardrail Alert Gateway
 * WebSocket gateway for real-time guardrail alert notifications
 *
 * Features:
 * - Real-time alert delivery to connected clients
 * - Per-user room management
 * - Alert acknowledgment handling
 */

import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  GuardrailAlertPayload,
  GuardrailAlertService,
} from './guardrail-alert.service';

interface AuthenticatedSocket extends Socket {
  userId?: number;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'guardrail-alerts',
})
export class GuardrailAlertGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GuardrailAlertGateway.name);
  private readonly userSockets = new Map<number, Set<string>>();

  constructor(private readonly alertService: GuardrailAlertService) {}

  afterInit(): void {
    this.logger.log('Guardrail Alert Gateway initialized');
  }

  handleConnection(client: AuthenticatedSocket): void {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    // Remove from user socket mapping
    if (client.userId) {
      const sockets = this.userSockets.get(client.userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }
    }
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /**
   * Handle user authentication/subscription
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { userId: number },
  ): { success: boolean; message: string } {
    const { userId } = data;

    if (!userId) {
      return { success: false, message: 'userId is required' };
    }

    // Store socket mapping
    client.userId = userId;
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);

    // Join user-specific room
    client.join(`user:${userId}`);

    this.logger.log(`User ${userId} subscribed to guardrail alerts`);

    return { success: true, message: 'Subscribed to guardrail alerts' };
  }

  /**
   * Handle alert acknowledgment
   */
  @SubscribeMessage('acknowledge')
  async handleAcknowledge(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { alertId: string },
  ): Promise<{ success: boolean }> {
    const { alertId } = data;

    if (!client.userId) {
      return { success: false };
    }

    const success = await this.alertService.markAsRead(alertId, client.userId);
    return { success };
  }

  /**
   * Handle alert dismissal
   */
  @SubscribeMessage('dismiss')
  async handleDismiss(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { alertId: string },
  ): Promise<{ success: boolean }> {
    const { alertId } = data;

    if (!client.userId) {
      return { success: false };
    }

    const success = await this.alertService.dismissAlert(
      alertId,
      client.userId,
    );
    return { success };
  }

  /**
   * Handle request for unread count
   */
  @SubscribeMessage('getUnreadCount')
  async handleGetUnreadCount(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<{ count: number }> {
    if (!client.userId) {
      return { count: 0 };
    }

    const count = await this.alertService.getUnreadCount(client.userId);
    return { count };
  }

  /**
   * Handle request for recent alerts
   */
  @SubscribeMessage('getRecentAlerts')
  async handleGetRecentAlerts(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data?: { limit?: number; unreadOnly?: boolean },
  ): Promise<{ alerts: GuardrailAlertPayload[] }> {
    if (!client.userId) {
      return { alerts: [] };
    }

    const alerts = await this.alertService.getAlertsForUser(client.userId, {
      limit: data?.limit || 20,
      unreadOnly: data?.unreadOnly,
    });

    return {
      alerts: alerts.map((a) => ({
        id: a.id,
        alertType: a.alertType as any,
        severity: a.severity as any,
        title: a.title,
        message: a.message,
        chatId: a.chatId || undefined,
        senderId: a.senderId || undefined,
        createdAt: a.createdAt!,
      })),
    };
  }

  /**
   * Handle mark all as read
   */
  @SubscribeMessage('markAllRead')
  async handleMarkAllRead(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<{ success: boolean; count: number }> {
    if (!client.userId) {
      return { success: false, count: 0 };
    }

    const count = await this.alertService.markAllAsRead(client.userId);
    return { success: true, count };
  }

  /**
   * Event listener for guardrail alerts - sends to WebSocket clients
   */
  @OnEvent('guardrail.alert')
  handleGuardrailAlert(event: {
    userId: number;
    payload: GuardrailAlertPayload;
  }): void {
    const { userId, payload } = event;

    // Send to user's room
    this.server.to(`user:${userId}`).emit('alert', payload);

    this.logger.debug(
      `Sent guardrail alert to user ${userId}: ${payload.alertType}`,
    );
  }

  /**
   * Send a custom alert to a specific user
   */
  sendAlertToUser(userId: number, payload: GuardrailAlertPayload): void {
    this.server.to(`user:${userId}`).emit('alert', payload);
  }

  /**
   * Broadcast an alert to all connected users (for system-wide alerts)
   */
  broadcastAlert(payload: GuardrailAlertPayload): void {
    this.server.emit('alert', payload);
  }
}
