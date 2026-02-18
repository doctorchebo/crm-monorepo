import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  type CalendarSyncConnection,
  calendarSyncConnections,
  type CalendarSyncLog,
  calendarSyncLogs,
  type NewCalendarSyncConnection,
} from '../../../database/calendar.schema';
import * as schema from '../../../database/schema';
import {
  CreateSyncConnectionDto,
  InitiateOAuthDto,
  ManualSyncDto,
  OAuthCallbackDto,
  UpdateSyncConnectionDto,
} from '../dto';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    @Inject('DATABASE_CONNECTION')
    private db: NodePgDatabase<typeof schema>,
    private configService: ConfigService,
  ) {}

  /**
   * Get OAuth configuration for a provider
   */
  getOAuthConfig(provider: 'google' | 'outlook' | 'apple'): OAuthConfig {
    switch (provider) {
      case 'google':
        return {
          clientId: this.configService.get('GOOGLE_CALENDAR_CLIENT_ID', ''),
          clientSecret: this.configService.get(
            'GOOGLE_CALENDAR_CLIENT_SECRET',
            '',
          ),
          redirectUri: this.configService.get(
            'GOOGLE_CALENDAR_REDIRECT_URI',
            '',
          ),
          scopes: [
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/calendar.events',
          ],
        };
      case 'outlook':
        return {
          clientId: this.configService.get('OUTLOOK_CALENDAR_CLIENT_ID', ''),
          clientSecret: this.configService.get(
            'OUTLOOK_CALENDAR_CLIENT_SECRET',
            '',
          ),
          redirectUri: this.configService.get(
            'OUTLOOK_CALENDAR_REDIRECT_URI',
            '',
          ),
          scopes: ['Calendars.ReadWrite', 'offline_access'],
        };
      case 'apple':
        return {
          clientId: this.configService.get('APPLE_CALENDAR_CLIENT_ID', ''),
          clientSecret: this.configService.get(
            'APPLE_CALENDAR_CLIENT_SECRET',
            '',
          ),
          redirectUri: this.configService.get(
            'APPLE_CALENDAR_REDIRECT_URI',
            '',
          ),
          scopes: ['calendar'],
        };
      default:
        throw new BadRequestException(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(dto: InitiateOAuthDto, userId: number): string {
    const config = this.getOAuthConfig(dto.provider);

    // Generate state token for security (should include userId and calendarId)
    const state = Buffer.from(
      JSON.stringify({
        userId,
        provider: dto.provider,
        calendarId: dto.calendarId,
        timestamp: Date.now(),
      }),
    ).toString('base64');

    let authUrl: string;

    switch (dto.provider) {
      case 'google':
        authUrl =
          `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${config.clientId}&` +
          `redirect_uri=${encodeURIComponent(dto.redirectUri || config.redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(config.scopes.join(' '))}&` +
          `access_type=offline&` +
          `prompt=consent&` +
          `state=${state}`;
        break;

      case 'outlook':
        authUrl =
          `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
          `client_id=${config.clientId}&` +
          `redirect_uri=${encodeURIComponent(dto.redirectUri || config.redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(config.scopes.join(' '))}&` +
          `state=${state}`;
        break;

      case 'apple':
        // Apple Sign In flow is different
        authUrl =
          `https://appleid.apple.com/auth/authorize?` +
          `client_id=${config.clientId}&` +
          `redirect_uri=${encodeURIComponent(dto.redirectUri || config.redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(config.scopes.join(' '))}&` +
          `state=${state}`;
        break;

      default:
        throw new BadRequestException(`Unsupported provider: ${dto.provider}`);
    }

    return authUrl;
  }

  /**
   * Handle OAuth callback and create sync connection
   */
  async handleOAuthCallback(
    dto: OAuthCallbackDto,
    userId: number,
  ): Promise<CalendarSyncConnection> {
    // Decode and validate state
    let stateData: any;
    try {
      stateData = JSON.parse(Buffer.from(dto.state, 'base64').toString());
    } catch {
      throw new BadRequestException('Invalid state parameter');
    }

    if (stateData.userId !== userId) {
      throw new BadRequestException('State mismatch');
    }

    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(dto.provider, dto.code);

    // Create sync connection
    return this.createConnection(userId, {
      provider: dto.provider,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      calendarId: stateData.calendarId,
      syncEnabled: true,
      syncDirection: 'two_way',
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(
    provider: 'google' | 'outlook' | 'apple',
    code: string,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: Date }> {
    const config = this.getOAuthConfig(provider);

    // In production, make actual API calls to exchange code
    // This is a placeholder implementation
    this.logger.log(`Exchanging code for tokens with ${provider}`);

    // TODO: Implement actual token exchange for each provider
    // For now, return placeholder
    return {
      accessToken: `placeholder_access_token_${Date.now()}`,
      refreshToken: `placeholder_refresh_token_${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
  }

  /**
   * Create a sync connection
   */
  async createConnection(
    userId: number,
    dto: CreateSyncConnectionDto,
  ): Promise<CalendarSyncConnection> {
    const connectionData: NewCalendarSyncConnection = {
      userId,
      linkedCalendarId: dto.calendarId,
      provider: dto.provider,
      providerAccountId: dto.externalCalendarId,
      providerEmail: dto.externalCalendarName,
      accessToken: dto.accessToken || '',
      refreshToken: dto.refreshToken,
      syncDirection: dto.syncDirection || 'bidirectional',
      status: 'active',
    };

    const [created] = await this.db
      .insert(calendarSyncConnections)
      .values(connectionData)
      .returning();

    // Log the connection creation
    await this.logSync(created.id, 'connected', {
      message: `Connected to ${dto.provider}`,
    });

    return created;
  }

  /**
   * Get all sync connections for a user
   */
  async getConnections(userId: number): Promise<CalendarSyncConnection[]> {
    return this.db
      .select()
      .from(calendarSyncConnections)
      .where(eq(calendarSyncConnections.userId, userId))
      .orderBy(desc(calendarSyncConnections.createdAt));
  }

  /**
   * Get a sync connection by ID
   */
  async getConnection(
    connectionId: string,
    userId: number,
  ): Promise<CalendarSyncConnection> {
    const [connection] = await this.db
      .select()
      .from(calendarSyncConnections)
      .where(
        and(
          eq(calendarSyncConnections.id, connectionId),
          eq(calendarSyncConnections.userId, userId),
        ),
      );

    if (!connection) {
      throw new NotFoundException('Sync connection not found');
    }

    return connection;
  }

  /**
   * Update a sync connection
   */
  async updateConnection(
    connectionId: string,
    userId: number,
    dto: UpdateSyncConnectionDto,
  ): Promise<CalendarSyncConnection> {
    await this.getConnection(connectionId, userId);

    const updateData: Partial<CalendarSyncConnection> = {
      updatedAt: new Date(),
    };

    if (dto.syncEnabled !== undefined)
      updateData.status = dto.syncEnabled ? 'active' : 'revoked';
    if (dto.syncDirection) updateData.syncDirection = dto.syncDirection;

    const [updated] = await this.db
      .update(calendarSyncConnections)
      .set(updateData)
      .where(eq(calendarSyncConnections.id, connectionId))
      .returning();

    return updated;
  }

  /**
   * Delete a sync connection
   */
  async deleteConnection(connectionId: string, userId: number): Promise<void> {
    await this.getConnection(connectionId, userId);

    await this.db
      .delete(calendarSyncConnections)
      .where(eq(calendarSyncConnections.id, connectionId));
  }

  /**
   * Trigger a manual sync
   */
  async triggerSync(userId: number, dto: ManualSyncDto): Promise<void> {
    if (dto.connectionId) {
      const connection = await this.getConnection(dto.connectionId, userId);
      await this.syncConnection(connection, dto.fullSync);
    } else if (dto.calendarId) {
      // Sync all connections for a calendar
      const connections = await this.db
        .select()
        .from(calendarSyncConnections)
        .where(
          and(
            eq(calendarSyncConnections.userId, userId),
            eq(calendarSyncConnections.linkedCalendarId, dto.calendarId),
            eq(calendarSyncConnections.status, 'active'),
          ),
        );

      for (const connection of connections) {
        await this.syncConnection(connection, dto.fullSync);
      }
    } else {
      // Sync all user connections
      const connections = await this.db
        .select()
        .from(calendarSyncConnections)
        .where(
          and(
            eq(calendarSyncConnections.userId, userId),
            eq(calendarSyncConnections.status, 'active'),
          ),
        );

      for (const connection of connections) {
        await this.syncConnection(connection, dto.fullSync);
      }
    }
  }

  /**
   * Sync a single connection
   */
  private async syncConnection(
    connection: CalendarSyncConnection,
    fullSync: boolean = false,
  ): Promise<void> {
    this.logger.log(
      `Syncing connection ${connection.id} (${connection.provider})`,
    );

    const startTime = new Date();

    try {
      // Refresh token if needed
      if (connection.expiresAt && connection.expiresAt < new Date()) {
        await this.refreshTokens(connection);
      }

      // Perform sync based on direction
      let eventsCreated = 0;
      let eventsUpdated = 0;
      let eventsDeleted = 0;

      switch (connection.syncDirection) {
        case 'one_way_import':
          // Import events from external calendar
          const imported = await this.importExternalEvents(
            connection,
            fullSync,
          );
          eventsCreated = imported.created;
          eventsUpdated = imported.updated;
          break;

        case 'one_way_export':
          // Export events to external calendar
          const exported = await this.exportLocalEvents(connection, fullSync);
          eventsCreated = exported.created;
          eventsUpdated = exported.updated;
          break;

        case 'two_way':
          // Bidirectional sync
          const importResult = await this.importExternalEvents(
            connection,
            fullSync,
          );
          const exportResult = await this.exportLocalEvents(
            connection,
            fullSync,
          );
          eventsCreated = importResult.created + exportResult.created;
          eventsUpdated = importResult.updated + exportResult.updated;
          break;
      }

      // Update last sync time
      await this.db
        .update(calendarSyncConnections)
        .set({
          lastSyncAt: new Date(),
          lastSyncError: null,
        })
        .where(eq(calendarSyncConnections.id, connection.id));

      // Log success
      await this.logSync(connection.id, 'success', {
        duration: Date.now() - startTime.getTime(),
        eventsCreated,
        eventsUpdated,
        eventsDeleted,
        fullSync,
      });
    } catch (error) {
      this.logger.error(`Sync failed for connection ${connection.id}:`, error);

      // Update failure status
      await this.db
        .update(calendarSyncConnections)
        .set({
          lastSyncAt: new Date(),
          lastSyncError:
            error instanceof Error ? error.message : 'Unknown error',
        })
        .where(eq(calendarSyncConnections.id, connection.id));

      // Log failure
      await this.logSync(connection.id, 'failed', {
        duration: Date.now() - startTime.getTime(),
        error: error instanceof Error ? error.message : 'Unknown error',
        fullSync,
      });

      throw error;
    }
  }

  /**
   * Refresh OAuth tokens
   */
  private async refreshTokens(
    connection: CalendarSyncConnection,
  ): Promise<void> {
    if (!connection.refreshToken) {
      throw new Error('No refresh token available');
    }

    // TODO: Implement actual token refresh for each provider
    this.logger.log(`Refreshing tokens for connection ${connection.id}`);

    const newTokens = {
      accessToken: `refreshed_access_token_${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };

    await this.db
      .update(calendarSyncConnections)
      .set({
        accessToken: newTokens.accessToken,
        expiresAt: newTokens.expiresAt,
      })
      .where(eq(calendarSyncConnections.id, connection.id));
  }

  /**
   * Import events from external calendar
   */
  private async importExternalEvents(
    connection: CalendarSyncConnection,
    fullSync: boolean,
  ): Promise<{ created: number; updated: number }> {
    // TODO: Implement actual import from each provider
    this.logger.log(`Importing events from ${connection.provider}`);

    // Placeholder - in production, fetch events from provider API
    return { created: 0, updated: 0 };
  }

  /**
   * Export events to external calendar
   */
  private async exportLocalEvents(
    connection: CalendarSyncConnection,
    fullSync: boolean,
  ): Promise<{ created: number; updated: number }> {
    // TODO: Implement actual export to each provider
    this.logger.log(`Exporting events to ${connection.provider}`);

    // Placeholder - in production, push events to provider API
    return { created: 0, updated: 0 };
  }

  /**
   * Log a sync operation
   */
  private async logSync(
    connectionId: string,
    status: 'started' | 'success' | 'failed' | 'connected',
    details: Record<string, any>,
  ): Promise<CalendarSyncLog> {
    const [log] = await this.db
      .insert(calendarSyncLogs)
      .values({
        connectionId,
        operation: details.fullSync ? 'full_sync' : 'incremental_sync',
        direction: 'import',
        status: status === 'started' ? 'success' : status,
        eventsCreated: details.eventsCreated || 0,
        eventsUpdated: details.eventsUpdated || 0,
        eventsDeleted: details.eventsDeleted || 0,
        errorMessage: details.error,
        durationMs: details.duration,
      })
      .returning();

    return log;
  }

  /**
   * Get sync logs for a connection
   */
  async getSyncLogs(
    connectionId: string,
    userId: number,
    limit: number = 20,
  ): Promise<CalendarSyncLog[]> {
    // Verify access
    await this.getConnection(connectionId, userId);

    return this.db
      .select()
      .from(calendarSyncLogs)
      .where(eq(calendarSyncLogs.connectionId, connectionId))
      .orderBy(desc(calendarSyncLogs.createdAt))
      .limit(limit);
  }
}
