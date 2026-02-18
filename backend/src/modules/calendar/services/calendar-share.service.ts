import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  calendars,
  type CalendarShare,
  calendarShares,
  type NewCalendarShare,
} from '../../../database/calendar.schema';
import * as schema from '../../../database/schema';
import { ShareCalendarDto } from '../dto';

@Injectable()
export class CalendarShareService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Share a calendar with another user
   */
  async shareCalendar(
    calendarId: string,
    ownerId: number,
    dto: ShareCalendarDto,
  ): Promise<CalendarShare> {
    // Verify calendar exists and user owns it
    const [calendar] = await this.db
      .select()
      .from(calendars)
      .where(eq(calendars.id, calendarId));

    if (!calendar) {
      throw new NotFoundException('Calendar not found');
    }

    if (calendar.userId !== ownerId) {
      throw new ForbiddenException('Only the calendar owner can share it');
    }

    const sharedWithUserId = Number(dto.userId);

    // Cannot share with yourself
    if (sharedWithUserId === ownerId) {
      throw new BadRequestException('Cannot share calendar with yourself');
    }

    // Check if already shared
    const [existingShare] = await this.db
      .select()
      .from(calendarShares)
      .where(
        and(
          eq(calendarShares.calendarId, calendarId),
          eq(calendarShares.sharedWithUserId, sharedWithUserId),
        ),
      );

    if (existingShare) {
      // Update existing share
      const [updated] = await this.db
        .update(calendarShares)
        .set({
          permissionLevel: dto.permission,
          canSeeDetails: dto.canInviteOthers ?? existingShare.canSeeDetails,
          updatedAt: new Date(),
        })
        .where(eq(calendarShares.id, existingShare.id))
        .returning();

      return updated;
    }

    // Create new share
    const newShare: NewCalendarShare = {
      calendarId,
      sharedWithUserId,
      sharedBy: ownerId,
      permissionLevel: dto.permission,
      canSeeDetails: dto.canInviteOthers ?? true,
    };

    const [created] = await this.db
      .insert(calendarShares)
      .values(newShare)
      .returning();

    return created;
  }

  /**
   * Remove calendar share
   */
  async unshareCalendar(
    calendarId: string,
    userId: number,
    sharedWithUserId: number,
  ): Promise<void> {
    // Verify calendar exists and user owns it
    const [calendar] = await this.db
      .select()
      .from(calendars)
      .where(eq(calendars.id, calendarId));

    if (!calendar) {
      throw new NotFoundException('Calendar not found');
    }

    if (calendar.userId !== userId) {
      throw new ForbiddenException('Only the calendar owner can manage shares');
    }

    await this.db
      .delete(calendarShares)
      .where(
        and(
          eq(calendarShares.calendarId, calendarId),
          eq(calendarShares.sharedWithUserId, sharedWithUserId),
        ),
      );
  }

  /**
   * Get all shares for a calendar
   */
  async getCalendarShares(
    calendarId: string,
    userId: number,
  ): Promise<CalendarShare[]> {
    // Verify calendar exists and user has access
    const [calendar] = await this.db
      .select()
      .from(calendars)
      .where(eq(calendars.id, calendarId));

    if (!calendar) {
      throw new NotFoundException('Calendar not found');
    }

    // Only owner or users with 'manage' permission can see shares
    if (calendar.userId !== userId) {
      const [share] = await this.db
        .select()
        .from(calendarShares)
        .where(
          and(
            eq(calendarShares.calendarId, calendarId),
            eq(calendarShares.sharedWithUserId, userId),
            eq(calendarShares.permissionLevel, 'manage'),
          ),
        );

      if (!share) {
        throw new ForbiddenException(
          'You do not have permission to view shares',
        );
      }
    }

    return this.db
      .select()
      .from(calendarShares)
      .where(eq(calendarShares.calendarId, calendarId));
  }

  /**
   * Check user's permission level for a calendar
   */
  async getUserPermission(
    calendarId: string,
    userId: number,
  ): Promise<'owner' | 'manage' | 'edit' | 'view' | null> {
    const [calendar] = await this.db
      .select()
      .from(calendars)
      .where(eq(calendars.id, calendarId));

    if (!calendar) {
      return null;
    }

    if (calendar.userId === userId) {
      return 'owner';
    }

    const [share] = await this.db
      .select()
      .from(calendarShares)
      .where(
        and(
          eq(calendarShares.calendarId, calendarId),
          eq(calendarShares.sharedWithUserId, userId),
        ),
      );

    return (share?.permissionLevel as 'manage' | 'edit' | 'view') || null;
  }

  /**
   * Check if user can edit events in a calendar
   */
  async canEditEvents(calendarId: string, userId: number): Promise<boolean> {
    const permission = await this.getUserPermission(calendarId, userId);
    return (
      permission === 'owner' || permission === 'manage' || permission === 'edit'
    );
  }

  /**
   * Check if user can view events in a calendar
   */
  async canViewEvents(calendarId: string, userId: number): Promise<boolean> {
    const permission = await this.getUserPermission(calendarId, userId);
    return permission !== null;
  }

  /**
   * Check if user can manage calendar settings
   */
  async canManageCalendar(
    calendarId: string,
    userId: number,
  ): Promise<boolean> {
    const permission = await this.getUserPermission(calendarId, userId);
    return permission === 'owner' || permission === 'manage';
  }

  /**
   * Get IDs of calendars the user can access
   */
  async getAccessibleCalendarIds(
    userId: number,
    teamId: number,
  ): Promise<string[]> {
    // Get owned calendars (calendars where user is the owner)
    const ownedCalendars = await this.db
      .select({ id: calendars.id })
      .from(calendars)
      .where(and(eq(calendars.userId, userId), eq(calendars.isActive, true)));

    // Get shared calendars (calendars shared with this user)
    const sharedCalendars = await this.db
      .select({ calendarId: calendarShares.calendarId })
      .from(calendarShares)
      .where(eq(calendarShares.sharedWithUserId, userId));

    // Get team calendars if user is team member
    const teamCalendars = await this.db
      .select({ id: calendars.id })
      .from(calendars)
      .where(
        and(
          eq(calendars.teamId, teamId),
          eq(calendars.visibility, 'team'),
          eq(calendars.isActive, true),
        ),
      );

    const ids = new Set([
      ...ownedCalendars.map((c) => c.id),
      ...sharedCalendars.map((c) => c.calendarId),
      ...teamCalendars.map((c) => c.id),
    ]);

    return Array.from(ids);
  }
}
