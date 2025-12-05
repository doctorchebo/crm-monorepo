import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * WebSocket Gateway for real-time notes updates
 * Emits events when notes are created, updated, or deleted
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: 'notes',
})
export class NotesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotesGateway.name);
  private connectedUsers = new Map<string, string[]>(); // userId -> socketIds

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Clean up user tracking
    for (const [userId, socketIds] of this.connectedUsers.entries()) {
      const index = socketIds.indexOf(client.id);
      if (index > -1) {
        socketIds.splice(index, 1);
        if (socketIds.length === 0) {
          this.connectedUsers.delete(userId);
        }
      }
    }
  }

  /**
   * Emit note created event to all users in a chat
   */
  emitNoteCreated(chatId: string, note: any) {
    this.server.emit(`note:created:${chatId}`, {
      type: 'note:created',
      chatId,
      note,
      timestamp: new Date(),
    });

    this.logger.debug(`Note created event emitted for chat ${chatId}`);
  }

  /**
   * Emit note deleted event to all users in a chat
   */
  emitNoteDeleted(chatId: string, noteId: number) {
    this.server.emit(`note:deleted:${chatId}`, {
      type: 'note:deleted',
      chatId,
      noteId,
      timestamp: new Date(),
    });

    this.logger.debug(`Note deleted event emitted for chat ${chatId}`);
  }

  /**
   * Track user connection for targeted broadcasts
   */
  trackUserConnection(userId: string, socketId: string) {
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, []);
    }
    const sockets = this.connectedUsers.get(userId)!;
    sockets.push(socketId);
  }
}
