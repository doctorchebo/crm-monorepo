import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  calendars,
  calendarShares,
  type Calendar,
  type NewCalendar,
} from '../../../database/calendar.schema';
import * as schema from '../../../database/schema';
import { CalendarQueryDto, CreateCalendarDto, UpdateCalendarDto } from '../dto';

@Injectable()
export class CalendarCrudService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Create a new calendar
   */
  async create(
    userId: number,
    teamId: number,
    dto: CreateCalendarDto,
  ): Promise<Calendar> {
    const calendarData: NewCalendar = {
      name: dto.name,
      description: dto.description,
      color: dto.color || '#3B82F6',
      timezone: dto.timezone || 'UTC',
      isDefault: dto.isDefault || false,
      userId,
      teamId,
    };

    // If this is set as default, unset other defaults first
    if (dto.isDefault) {
      await this.db
        .update(calendars)
        .set({ isDefault: false })
        .where(
          and(
            eq(calendars.userId, userId),
            eq(calendars.teamId, teamId),
            eq(calendars.isDefault, true),
          ),
        );
    }

    const [created] = await this.db
      .insert(calendars)
      .values(calendarData)
      .returning();

    return created;
  }

  /**
   * Get all calendars accessible by a user
   */
  async findAllForUser(
    userId: number,
    teamId: number,
    query: CalendarQueryDto = {},
  ): Promise<Calendar[]> {
    const conditions = [
      eq(calendars.teamId, teamId),
      eq(calendars.isActive, true),
    ];

    // Build query based on options
    if (query.includeShared) {
      // Get shared calendar IDs for the user
      const sharedCalendarIds = await this.db
        .select({ calendarId: calendarShares.calendarId })
        .from(calendarShares)
        .where(eq(calendarShares.sharedWithUserId, userId));

      const sharedIds = sharedCalendarIds.map((s) => s.calendarId);

      if (sharedIds.length > 0) {
        return this.db
          .select()
          .from(calendars)
          .where(
            and(
              eq(calendars.isActive, true),
              or(
                and(eq(calendars.teamId, teamId), eq(calendars.userId, userId)),
                inArray(calendars.id, sharedIds),
              ),
            ),
          )
          .orderBy(desc(calendars.isDefault), desc(calendars.createdAt));
      }
    }

    // Default: only user's calendars in the team
    return this.db
      .select()
      .from(calendars)
      .where(and(...conditions, eq(calendars.userId, userId)))
      .orderBy(desc(calendars.isDefault), desc(calendars.createdAt));
  }

  /**
   * Get a single calendar by ID
   */
  async findOne(calendarId: string): Promise<Calendar | null> {
    const [calendar] = await this.db
      .select()
      .from(calendars)
      .where(and(eq(calendars.id, calendarId), eq(calendars.isActive, true)));

    return calendar || null;
  }

  /**
   * Get calendar with access check
   */
  async findOneWithAccess(
    calendarId: string,
    userId: number,
  ): Promise<Calendar> {
    const calendar = await this.findOne(calendarId);

    if (!calendar) {
      throw new NotFoundException('Calendar not found');
    }

    // Check if user owns the calendar
    if (calendar.userId === userId) {
      return calendar;
    }

    // Check if calendar is shared with user
    const [share] = await this.db
      .select()
      .from(calendarShares)
      .where(
        and(
          eq(calendarShares.calendarId, calendarId),
          eq(calendarShares.sharedWithUserId, userId),
        ),
      );

    if (!share) {
      throw new ForbiddenException('You do not have access to this calendar');
    }

    return calendar;
  }

  /**
   * Update a calendar
   */
  async update(
    calendarId: string,
    userId: number,
    dto: UpdateCalendarDto,
  ): Promise<Calendar> {
    const calendar = await this.findOneWithAccess(calendarId, userId);

    // Only owner can update
    if (calendar.userId !== userId) {
      throw new ForbiddenException('Only the calendar owner can update it');
    }

    // If setting as default, unset other defaults
    if (dto.isDefault && calendar.teamId) {
      await this.db
        .update(calendars)
        .set({ isDefault: false })
        .where(
          and(
            eq(calendars.userId, userId),
            eq(calendars.teamId, calendar.teamId),
            eq(calendars.isDefault, true),
          ),
        );
    }

    const [updated] = await this.db
      .update(calendars)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(calendars.id, calendarId))
      .returning();

    return updated;
  }

  /**
   * Soft delete a calendar (set isActive to false)
   */
  async delete(calendarId: string, userId: number): Promise<void> {
    const calendar = await this.findOneWithAccess(calendarId, userId);

    // Only owner can delete
    if (calendar.userId !== userId) {
      throw new ForbiddenException('Only the calendar owner can delete it');
    }

    await this.db
      .update(calendars)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(calendars.id, calendarId));
  }

  /**
   * Get the default calendar for a user, create one if it doesn't exist
   */
  async getOrCreateDefaultCalendar(
    userId: number,
    teamId: number,
  ): Promise<Calendar> {
    const [existingDefault] = await this.db
      .select()
      .from(calendars)
      .where(
        and(
          eq(calendars.userId, userId),
          eq(calendars.teamId, teamId),
          eq(calendars.isDefault, true),
          eq(calendars.isActive, true),
        ),
      );

    if (existingDefault) {
      return existingDefault;
    }

    // Create default calendar
    return this.create(userId, teamId, {
      name: 'My Calendar',
      description: 'Default calendar',
      isDefault: true,
    });
  }
}
