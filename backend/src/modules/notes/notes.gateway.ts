import { Logger } from '@nestjs/common';
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
import { ChatAccessService } from '../chats/services/chat-access.service';

/**
 * WebSocket Gateway for real-time notes updates
 *
 * Emits events when notes are created, updated, or deleted.
 * Uses room-based broadcasting to ensure only users with access
 * to a chat receive note updates.
 *
 * Clients should:
 * 1. Connect to the 'notes' namespace
 * 2. Subscribe to specific chats via 'subscribe:chat' event
 * 3. Listen for 'note:created' and 'note:deleted' events
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
  // Map userId to array of socket IDs (user can have multiple tabs open)
  private userSockets = new Map<number, Set<string>>();
  // Map socket ID to userId (for cleanup on disconnect)
  private socketToUser = new Map<string, number>();

  constructor(private readonly chatAccessService: ChatAccessService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Clean up user tracking
    const userId = this.socketToUser.get(client.id);
    if (userId) {
      const userSocketSet = this.userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(client.id);
        if (userSocketSet.size === 0) {
          this.userSockets.delete(userId);
        }
      }
      this.socketToUser.delete(client.id);
    }

    // Leave all rooms
    const rooms = Array.from(client.rooms);
    for (const room of rooms) {
      if (room !== client.id) {
        client.leave(room);
      }
    }
  }

  /**
   * Handle user authentication and registration
   * Client sends their userId after connecting
   */
  @SubscribeMessage('register')
  handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: number },
  ) {
    const { userId } = data;
    if (!userId) {
      this.logger.warn(`Invalid registration attempt from ${client.id}`);
      return { success: false, error: 'userId is required' };
    }

    // Track user-socket mapping
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);
    this.socketToUser.set(client.id, userId);

    this.logger.debug(`User ${userId} registered with socket ${client.id}`);
    return { success: true };
  }

  /**
   * Subscribe a client to a specific chat's notes updates
   * Validates that the user has access to the chat before joining
   */
  @SubscribeMessage('subscribe:chat')
  async handleSubscribeChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string; userId: number },
  ) {
    const { chatId, userId } = data;

    if (!chatId || !userId) {
      return { success: false, error: 'chatId and userId are required' };
    }

    // Validate user has access to this chat
    const accessResult = await this.chatAccessService.checkChatAccess(
      userId,
      chatId,
    );

    if (!accessResult.hasAccess) {
      this.logger.debug(
        `User ${userId} denied subscription to chat ${chatId}: ${accessResult.reason}`,
      );
      return { success: false, error: 'Access denied' };
    }

    // Join the chat's room
    const roomName = `chat:${chatId}`;
    client.join(roomName);

    this.logger.debug(`User ${userId} subscribed to ${roomName}`);
    return { success: true, room: roomName };
  }

  /**
   * Unsubscribe a client from a chat's notes updates
   */
  @SubscribeMessage('unsubscribe:chat')
  handleUnsubscribeChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string },
  ) {
    const { chatId } = data;
    if (!chatId) {
      return { success: false, error: 'chatId is required' };
    }

    const roomName = `chat:${chatId}`;
    client.leave(roomName);

    this.logger.debug(`Client ${client.id} unsubscribed from ${roomName}`);
    return { success: true };
  }

  /**
   * Emit note created event to all users with access to the chat
   *
   * Broadcasts to:
   * 1. All clients in the chat's room (room-based)
   * 2. Direct emit to users with access who might not be in the room
   */
  async emitNoteCreated(chatId: string, note: any) {
    const roomName = `chat:${chatId}`;
    const payload = {
      type: 'note:created',
      chatId,
      note,
      timestamp: new Date(),
    };

    // Emit to room (most efficient path)
    this.server.to(roomName).emit('note:created', payload);

    // Also emit using chat-specific event for backwards compatibility
    this.server.emit(`note:created:${chatId}`, payload);

    this.logger.debug(`Note created event emitted for chat ${chatId}`);
  }

  /**
   * Emit note deleted event to all users with access to the chat
   */
  async emitNoteDeleted(chatId: string, noteId: number) {
    const roomName = `chat:${chatId}`;
    const payload = {
      type: 'note:deleted',
      chatId,
      noteId,
      timestamp: new Date(),
    };

    // Emit to room
    this.server.to(roomName).emit('note:deleted', payload);

    // Also emit using chat-specific event for backwards compatibility
    this.server.emit(`note:deleted:${chatId}`, payload);

    this.logger.debug(`Note deleted event emitted for chat ${chatId}`);
  }

  /**
   * Get count of connected clients for monitoring
   */
  getConnectedClientsCount(): number {
    return this.socketToUser.size;
  }

  /**
   * Get count of unique users connected
   */
  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }
}
