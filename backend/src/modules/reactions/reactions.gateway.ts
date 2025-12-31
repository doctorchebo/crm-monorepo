import { Injectable, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Reactions WebSocket Gateway
 * Emits real-time reaction updates to connected clients
 *
 * Events:
 * - reaction:added - Emitted when a reaction is added or updated
 * - reaction:removed - Emitted when a reaction is removed
 */
@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
})
export class ReactionsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ReactionsGateway.name);
  private connectedClients = new Set<string>();

  handleConnection(socket: Socket): void {
    this.connectedClients.add(socket.id);
    this.logger.debug(
      `Reactions client connected: ${socket.id}. Total: ${this.connectedClients.size}`,
    );
  }

  handleDisconnect(socket: Socket): void {
    this.connectedClients.delete(socket.id);
    this.logger.debug(
      `Reactions client disconnected: ${socket.id}. Total: ${this.connectedClients.size}`,
    );
  }

  /**
   * Emit reaction added/updated event to all connected clients
   */
  emitReactionAdded(reaction: {
    id: number;
    messageId: string;
    userId: number;
    emoji: string;
    userName?: string;
    createdAt: Date | null;
    updatedAt: Date | null;
  }): void {
    if (this.connectedClients.size === 0) {
      return;
    }

    this.logger.debug(
      `📡 Emitting reaction:added for message ${reaction.messageId} to ${this.connectedClients.size} clients`,
    );

    this.server.emit('reaction:added', {
      ...reaction,
      createdAt: reaction.createdAt?.toISOString?.() || reaction.createdAt,
      updatedAt: reaction.updatedAt?.toISOString?.() || reaction.updatedAt,
    });
  }

  /**
   * Emit reaction removed event to all connected clients
   */
  emitReactionRemoved(data: { messageId: string; userId: number }): void {
    if (this.connectedClients.size === 0) {
      return;
    }

    this.logger.debug(
      `📡 Emitting reaction:removed for message ${data.messageId} to ${this.connectedClients.size} clients`,
    );

    this.server.emit('reaction:removed', {
      messageId: data.messageId,
      userId: data.userId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit customer reaction event to all connected clients
   * Customer reactions come from the WhatsApp user (the contact),
   * not from CRM users, so they have different payload structure.
   */
  emitCustomerReaction(data: {
    chatId: string;
    messageId: string;
    emoji: string | null;
    senderPhone: string;
    action: 'added' | 'removed';
  }): void {
    if (this.connectedClients.size === 0) {
      return;
    }

    this.logger.debug(
      `📡 Emitting customer-reaction for message ${data.messageId} to ${this.connectedClients.size} clients`,
    );

    this.server.emit('customer-reaction', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }
}

/**
 * Singleton instance for use in service
 */
export let reactionsGatewayInstance: ReactionsGateway;

export function setReactionsGateway(gateway: ReactionsGateway): void {
  reactionsGatewayInstance = gateway;
}
