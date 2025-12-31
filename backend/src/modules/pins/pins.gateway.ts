import { Injectable, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PinnedMessageResponseDto } from './dto/pin.dto';

/**
 * Pins WebSocket Gateway
 * Emits real-time pin updates to connected clients
 *
 * Events:
 * - pin:added - Emitted when a message is pinned
 * - pin:removed - Emitted when a message is unpinned
 * - pin:expired - Emitted when a pin expires
 */
@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
})
export class PinsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(PinsGateway.name);
  private connectedClients = new Set<string>();

  handleConnection(socket: Socket): void {
    this.connectedClients.add(socket.id);
    this.logger.debug(
      `Pins client connected: ${socket.id}. Total: ${this.connectedClients.size}`,
    );
  }

  handleDisconnect(socket: Socket): void {
    this.connectedClients.delete(socket.id);
    this.logger.debug(
      `Pins client disconnected: ${socket.id}. Total: ${this.connectedClients.size}`,
    );
  }

  /**
   * Emit pin added event to all connected clients
   */
  emitPinAdded(pin: PinnedMessageResponseDto): void {
    if (this.connectedClients.size === 0) {
      return;
    }

    this.logger.debug(
      `📡 Emitting pin:added for message ${pin.messageId} in chat ${pin.chatId} to ${this.connectedClients.size} clients`,
    );

    this.server.emit('pin:added', {
      ...pin,
      pinnedAt:
        pin.pinnedAt instanceof Date
          ? pin.pinnedAt.toISOString()
          : pin.pinnedAt,
      expiresAt:
        pin.expiresAt instanceof Date
          ? pin.expiresAt.toISOString()
          : pin.expiresAt,
    });
  }

  /**
   * Emit pin removed event to all connected clients
   */
  emitPinRemoved(data: {
    messageId: string;
    chatId: string;
    reason: 'unpinned' | 'expired' | 'replaced';
  }): void {
    if (this.connectedClients.size === 0) {
      return;
    }

    this.logger.debug(
      `📡 Emitting pin:removed for message ${data.messageId} in chat ${data.chatId} (${data.reason}) to ${this.connectedClients.size} clients`,
    );

    this.server.emit('pin:removed', {
      messageId: data.messageId,
      chatId: data.chatId,
      reason: data.reason,
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
export let pinsGatewayInstance: PinsGateway;

export function setPinsGateway(gateway: PinsGateway): void {
  pinsGatewayInstance = gateway;
}
