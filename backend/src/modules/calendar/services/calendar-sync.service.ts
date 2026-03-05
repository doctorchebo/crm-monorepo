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

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
}

export interface SyncConnectionResponse {
  connectionId: string;
  provider: string;
  externalAccountId: string;
  externalCalendarId: string | null;
  syncDirection: string;
  syncFrequency: string;
  isActive: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  tokenExpiresAt: string | null;
  linkedCalendarId: string | null;
  createdAt: string;
  updatedAt: string;
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
            'https://www.googleapis.com/auth/userinfo.email',
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
    const redirectUri = dto.redirectUri || config.redirectUri;

    const state = Buffer.from(
      JSON.stringify({
        userId,
        provider: dto.provider,
        calendarId: dto.calendarId,
        syncDirection: dto.syncDirection || 'two_way',
        syncFrequency: dto.syncFrequency || 'every_15_minutes',
        redirectUri,
        timestamp: Date.now(),
      }),
    ).toString('base64');

    switch (dto.provider) {
      case 'google':
        return (
          `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(config.clientId)}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(config.scopes.join(' '))}&` +
          `access_type=offline&` +
          `prompt=consent&` +
          `state=${encodeURIComponent(state)}`
        );

      case 'outlook':
        return (
          `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
          `client_id=${encodeURIComponent(config.clientId)}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(config.scopes.join(' '))}&` +
          `state=${encodeURIComponent(state)}`
        );

      case 'apple':
        return (
          `https://appleid.apple.com/auth/authorize?` +
          `client_id=${encodeURIComponent(config.clientId)}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(config.scopes.join(' '))}&` +
          `state=${encodeURIComponent(state)}`
        );

      default:
        throw new BadRequestException(`Unsupported provider: ${dto.provider}`);
    }
  }

  /**
   * Handle OAuth callback and create sync connection
   */
  async handleOAuthCallback(
    dto: OAuthCallbackDto,
    userId: number,
  ): Promise<SyncConnectionResponse> {
    let stateData: {
      userId: number;
      provider: 'google' | 'outlook' | 'apple';
      calendarId?: string;
      syncDirection?: string;
      syncFrequency?: string;
      redirectUri?: string;
      timestamp: number;
    };

    try {
      stateData = JSON.parse(
        Buffer.from(dto.state, 'base64').toString('utf-8'),
      );
    } catch {
      throw new BadRequestException('Invalid state parameter');
    }

    if (stateData.userId !== userId) {
      throw new BadRequestException('State mismatch');
    }

    const provider = dto.provider || stateData.provider;
    const tokens = await this.exchangeCodeForTokens(
      provider,
      dto.code,
      stateData.redirectUri,
    );

    let providerAccountId: string | undefined;
    let providerEmail: string | undefined;

    if (provider === 'google') {
      const userInfo = await this.getGoogleUserInfo(tokens.accessToken);
      providerAccountId = userInfo.id;
      providerEmail = userInfo.email;
    }

    const connection = await this.createConnection(userId, {
      provider,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      externalCalendarId: providerAccountId,
      externalCalendarName: providerEmail,
      calendarId: stateData.calendarId,
      syncEnabled: true,
      syncDirection: (stateData.syncDirection as any) || 'two_way',
    });

    return this.mapConnection(connection);
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(
    provider: 'google' | 'outlook' | 'apple',
    code: string,
    redirectUri?: string,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date }> {
    const config = this.getOAuthConfig(provider);
    const effectiveRedirectUri = redirectUri || config.redirectUri;

    if (provider === 'google') {
      return this.exchangeGoogleCode(
        code,
        config.clientId,
        config.clientSecret,
        effectiveRedirectUri,
      );
    }

    throw new BadRequestException(
      `Token exchange for ${provider} is not yet implemented`,
    );
  }

  private async exchangeGoogleCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date }> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const data = (await response.json()) as GoogleTokenResponse;

    if (!response.ok || data.error) {
      this.logger.error(
        `Google token exchange failed: ${data.error_description || data.error}`,
      );
      throw new BadRequestException(
        `Google OAuth failed: ${data.error_description || 'token exchange error'}`,
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  private async getGoogleUserInfo(
    accessToken: string,
  ): Promise<GoogleUserInfo> {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) {
      this.logger.warn('Failed to fetch Google user info');
      return { id: '', email: '' };
    }

    return response.json() as Promise<GoogleUserInfo>;
  }

  /**
   * Create a sync connection (replaces existing one for same provider)
   */
  async createConnection(
    userId: number,
    dto: CreateSyncConnectionDto,
  ): Promise<CalendarSyncConnection> {
    // Enforce one connection per provider per user
    await this.db
      .delete(calendarSyncConnections)
      .where(
        and(
          eq(calendarSyncConnections.userId, userId),
          eq(calendarSyncConnections.provider, dto.provider),
        ),
      );

    const connectionData: NewCalendarSyncConnection = {
      userId,
      linkedCalendarId: dto.calendarId,
      provider: dto.provider,
      providerAccountId: dto.externalCalendarId,
      providerEmail: dto.externalCalendarName,
      accessToken: dto.accessToken || '',
      refreshToken: dto.refreshToken,
      syncDirection: dto.syncDirection || 'two_way',
      status: 'active',
    };

    const [created] = await this.db
      .insert(calendarSyncConnections)
      .values(connectionData)
      .returning();

    await this.logSync(created.id, 'connected', {
      message: `Connected to ${dto.provider}`,
    });

    return created;
  }

  /**
   * Get all sync connections for a user (mapped for frontend)
   */
  async getConnections(userId: number): Promise<SyncConnectionResponse[]> {
    const rows = await this.db
      .select()
      .from(calendarSyncConnections)
      .where(eq(calendarSyncConnections.userId, userId))
      .orderBy(desc(calendarSyncConnections.createdAt));

    return rows.map((r) => this.mapConnection(r));
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
  ): Promise<SyncConnectionResponse> {
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

    return this.mapConnection(updated);
  }

  /**
   * Trigger sync for a specific connection
   */
  async triggerConnectionSync(
    connectionId: string,
    userId: number,
  ): Promise<{ success: boolean; message: string }> {
    const connection = await this.getConnection(connectionId, userId);
    await this.syncConnection(connection);
    return { success: true, message: 'Sync completed' };
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

    const startTime = Date.now();

    try {
      // Refresh token if expiring within 5 minutes
      if (
        connection.expiresAt &&
        connection.expiresAt < new Date(Date.now() + 5 * 60 * 1000)
      ) {
        await this.refreshTokens(connection);
        const [refreshed] = await this.db
          .select()
          .from(calendarSyncConnections)
          .where(eq(calendarSyncConnections.id, connection.id));
        connection = refreshed;
      }

      let eventsCreated = 0;
      let eventsUpdated = 0;

      switch (connection.syncDirection) {
        case 'one_way_from_external': {
          const imported = await this.importExternalEvents(
            connection,
            fullSync,
          );
          eventsCreated = imported.created;
          eventsUpdated = imported.updated;
          break;
        }
        case 'one_way_to_external': {
          const exported = await this.exportLocalEvents(connection, fullSync);
          eventsCreated = exported.created;
          eventsUpdated = exported.updated;
          break;
        }
        case 'two_way':
        default: {
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
      }

      await this.db
        .update(calendarSyncConnections)
        .set({ lastSyncAt: new Date(), lastSyncError: null })
        .where(eq(calendarSyncConnections.id, connection.id));

      await this.logSync(connection.id, 'success', {
        duration: Date.now() - startTime,
        eventsCreated,
        eventsUpdated,
        fullSync,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Sync failed for connection ${connection.id}: ${message}`,
      );

      await this.db
        .update(calendarSyncConnections)
        .set({ lastSyncAt: new Date(), lastSyncError: message })
        .where(eq(calendarSyncConnections.id, connection.id));

      await this.logSync(connection.id, 'failed', {
        duration: Date.now() - startTime,
        error: message,
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
      throw new Error('No refresh token available – user must reconnect');
    }

    if (connection.provider !== 'google') {
      this.logger.warn(
        `Token refresh not implemented for ${connection.provider}`,
      );
      return;
    }

    const config = this.getOAuthConfig('google');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: connection.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    const data = (await response.json()) as GoogleTokenResponse;

    if (!response.ok || data.error) {
      this.logger.error(
        `Google token refresh failed: ${data.error_description || data.error}`,
      );
      await this.db
        .update(calendarSyncConnections)
        .set({ status: 'expired' })
        .where(eq(calendarSyncConnections.id, connection.id));
      throw new Error('Token refresh failed – user must reconnect');
    }

    await this.db
      .update(calendarSyncConnections)
      .set({
        accessToken: data.access_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        updatedAt: new Date(),
      })
      .where(eq(calendarSyncConnections.id, connection.id));
  }

  /**
   * Import events from Google Calendar (incremental or full)
   */
  private async importExternalEvents(
    connection: CalendarSyncConnection,
    fullSync: boolean,
  ): Promise<{ created: number; updated: number }> {
    if (connection.provider !== 'google') {
      this.logger.log(`Import not implemented for ${connection.provider}`);
      return { created: 0, updated: 0 };
    }

    const params = new URLSearchParams({
      maxResults: '250',
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    if (!fullSync && connection.syncToken) {
      params.set('syncToken', connection.syncToken);
    } else {
      params.set('timeMin', new Date().toISOString());
      params.set(
        'timeMax',
        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      );
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${connection.accessToken}` } },
    );

    if (response.status === 410) {
      // Sync token expired – fall back to full sync
      return this.importExternalEvents(
        { ...connection, syncToken: null },
        true,
      );
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Calendar API error: ${error}`);
    }

    const data = (await response.json()) as {
      items: Array<{ id: string }>;
      nextSyncToken?: string;
    };

    if (data.nextSyncToken) {
      await this.db
        .update(calendarSyncConnections)
        .set({ syncToken: data.nextSyncToken })
        .where(eq(calendarSyncConnections.id, connection.id));
    }

    const count = (data.items || []).length;
    this.logger.log(
      `Fetched ${count} events from Google Calendar for connection ${connection.id}`,
    );

    // TODO: Persist imported events into the local calendar events table
    return { created: count, updated: 0 };
  }

  /**
   * Export local events to external calendar
   */
  private async exportLocalEvents(
    connection: CalendarSyncConnection,
    _fullSync: boolean,
  ): Promise<{ created: number; updated: number }> {
    // TODO: Query local calendar events and push them to the provider
    this.logger.log(
      `Export to ${connection.provider} for connection ${connection.id} – not yet implemented`,
    );
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
    await this.getConnection(connectionId, userId);

    return this.db
      .select()
      .from(calendarSyncLogs)
      .where(eq(calendarSyncLogs.connectionId, connectionId))
      .orderBy(desc(calendarSyncLogs.createdAt))
      .limit(limit);
  }

  /**
   * Map a DB connection row to the frontend response shape
   */
  private mapConnection(c: CalendarSyncConnection): SyncConnectionResponse {
    return {
      connectionId: c.id,
      provider: c.provider,
      externalAccountId: c.providerAccountId || '',
      externalCalendarId: c.providerEmail || null,
      syncDirection: c.syncDirection || 'two_way',
      syncFrequency: 'every_15_minutes',
      isActive: c.status === 'active',
      lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
      lastSyncStatus: c.lastSyncError
        ? 'error'
        : c.lastSyncAt
          ? 'success'
          : null,
      tokenExpiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
      linkedCalendarId: c.linkedCalendarId || null,
      createdAt: c.createdAt ? c.createdAt.toISOString() : '',
      updatedAt: c.updatedAt ? c.updatedAt.toISOString() : '',
    };
  }
}
