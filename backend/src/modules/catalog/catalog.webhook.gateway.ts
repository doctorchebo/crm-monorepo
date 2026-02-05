import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Catalog Status Update Event
 * Emitted when a catalog item's status changes
 */
export interface CatalogStatusUpdateEvent {
  itemId: string;
  itemName: string;
  retailerId?: string;
  metaProductId?: string;
  previousStatus: string;
  newStatus: string;
  statusMessage?: string;
  timestamp: Date;
}

/**
 * Catalog WebSocket Gateway
 *
 * Provides real-time catalog status updates to connected clients.
 * This enables instant UI updates when:
 * - Meta webhooks notify us of status changes
 * - Manual status sync detects changes
 *
 * Architecture:
 * - Clients join team-specific rooms for targeted broadcasts
 * - Status updates are pushed immediately when detected
 * - Reduces/eliminates need for frontend polling
 */
@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/catalog',
})
export class CatalogWebhookGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CatalogWebhookGateway.name);
  private connectedClients = new Map<string, { teamId?: number }>();

  afterInit(_server: Server) {
    this.logger.log('✅ Catalog WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.connectedClients.set(client.id, {});

    // Listen for team subscription
    client.on('subscribe:team', (teamId: number) => {
      this.logger.log(`Client ${client.id} subscribed to team ${teamId}`);
      this.connectedClients.set(client.id, { teamId });
      client.join(`team:${teamId}`);
    });

    client.on('unsubscribe:team', (teamId: number) => {
      this.logger.log(`Client ${client.id} unsubscribed from team ${teamId}`);
      client.leave(`team:${teamId}`);
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  /**
   * Emit a catalog item status update to all connected clients in a team
   *
   * @param teamId - Team ID to target
   * @param event - Status update event data
   */
  emitStatusUpdate(teamId: number, event: CatalogStatusUpdateEvent): void {
    const room = `team:${teamId}`;

    this.logger.log(
      `📢 Emitting catalog status update to ${room}: ${event.itemName} → ${event.newStatus}`,
    );

    this.server.to(room).emit('catalog:status-update', {
      ...event,
      timestamp: event.timestamp.toISOString(),
    });
  }

  /**
   * Emit a batch of status updates (for bulk sync results)
   *
   * @param teamId - Team ID to target
   * @param events - Array of status update events
   */
  emitBatchStatusUpdate(
    teamId: number,
    events: CatalogStatusUpdateEvent[],
  ): void {
    if (events.length === 0) return;

    const room = `team:${teamId}`;

    this.logger.log(
      `📢 Emitting batch catalog status update to ${room}: ${events.length} items`,
    );

    this.server.to(room).emit('catalog:batch-status-update', {
      updates: events.map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
      count: events.length,
    });
  }

  /**
   * Get the number of connected clients
   */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Get clients subscribed to a specific team
   */
  getTeamSubscribers(teamId: number): number {
    let count = 0;
    for (const [_, data] of this.connectedClients) {
      if (data.teamId === teamId) count++;
    }
    return count;
  }
}
