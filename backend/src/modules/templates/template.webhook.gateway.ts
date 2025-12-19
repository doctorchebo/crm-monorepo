/**
 * Template Status WebSocket Gateway
 *
 * Provides real-time template status updates to connected clients.
 * When Meta sends a webhook notification about template status changes,
 * this gateway broadcasts the update to all connected frontend clients.
 *
 * Events:
 * - template:status - Emitted when a template status changes (approved, rejected, etc.)
 * - template:statuses - Emitted with batch of status updates
 *
 * Usage from frontend:
 * ```typescript
 * const socket = io('http://localhost:3000');
 * socket.on('template:status', (update) => {
 *   console.log('Template status changed:', update);
 *   // Update UI, show notification, etc.
 * });
 * ```
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Template status update event payload
 */
export interface TemplateStatusUpdateEvent {
  templateId: string;
  templateName: string;
  language: string;
  status: string;
  reason?: string;
  timestamp: Date;
  localeId?: string; // Our internal locale ID if available
}

/**
 * Template quality update event payload
 */
export interface TemplateQualityUpdateEvent {
  templateId: string;
  templateName: string;
  qualityRating: 'high' | 'medium' | 'low';
  timestamp: Date;
}

// Global instance for access from other services
export let templateWebhookGatewayInstance: TemplateWebhookGateway;

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  namespace: '/templates', // Separate namespace for template events
})
export class TemplateWebhookGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(TemplateWebhookGateway.name);
  private connectedClients = new Map<string, { connectedAt: Date }>();

  /**
   * Initialize gateway and set global instance
   */
  afterInit(_server: Server): void {
    templateWebhookGatewayInstance = this;
    this.logger.log('Template WebSocket Gateway initialized');
  }

  /**
   * Handle client connection
   */
  handleConnection(socket: Socket): void {
    this.connectedClients.set(socket.id, { connectedAt: new Date() });
    this.logger.log(
      `📱 Template client connected: ${socket.id}. Total: ${this.connectedClients.size}`,
    );
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(socket: Socket): void {
    this.connectedClients.delete(socket.id);
    this.logger.log(
      `📴 Template client disconnected: ${socket.id}. Total: ${this.connectedClients.size}`,
    );
  }

  /**
   * Get the number of connected clients
   */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Emit a single template status update to all connected clients
   *
   * @param update - The status update to emit
   */
  emitTemplateStatusUpdate(update: TemplateStatusUpdateEvent): void {
    if (this.connectedClients.size === 0) {
      this.logger.debug('No clients connected, skipping emit');
      return;
    }

    this.logger.log(
      `📡 Emitting template status update: ${update.templateName} → ${update.status} to ${this.connectedClients.size} clients`,
    );

    this.server.emit('template:status', {
      ...update,
      timestamp: update.timestamp.toISOString(),
    });
  }

  /**
   * Emit batch template status updates to all connected clients
   *
   * @param updates - Array of status updates
   */
  emitTemplateStatusUpdates(updates: TemplateStatusUpdateEvent[]): void {
    if (this.connectedClients.size === 0 || updates.length === 0) {
      return;
    }

    this.logger.log(
      `📡 Emitting ${updates.length} template status updates to ${this.connectedClients.size} clients`,
    );

    this.server.emit(
      'template:statuses',
      updates.map((update) => ({
        ...update,
        timestamp: update.timestamp.toISOString(),
      })),
    );
  }

  /**
   * Emit template quality rating update
   *
   * @param update - The quality update to emit
   */
  emitTemplateQualityUpdate(update: TemplateQualityUpdateEvent): void {
    if (this.connectedClients.size === 0) {
      return;
    }

    this.logger.log(
      `📡 Emitting template quality update: ${update.templateName} → ${update.qualityRating}`,
    );

    this.server.emit('template:quality', {
      ...update,
      timestamp: update.timestamp.toISOString(),
    });
  }

  /**
   * Emit a custom event to a specific client
   *
   * @param socketId - The client socket ID
   * @param event - Event name
   * @param data - Event payload
   */
  emitToClient(socketId: string, event: string, data: any): void {
    const client = this.connectedClients.get(socketId);
    if (!client) {
      this.logger.warn(`Client ${socketId} not found`);
      return;
    }

    this.server.to(socketId).emit(event, data);
  }
}

/**
 * Utility function to set the gateway instance (for use in module initialization)
 */
export function setTemplateWebhookGatewayInstance(
  gateway: TemplateWebhookGateway,
): void {
  templateWebhookGatewayInstance = gateway;
}
