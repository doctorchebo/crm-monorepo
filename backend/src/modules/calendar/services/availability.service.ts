import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  availabilityOverrides,
  availabilityRules,
  bookingLinks,
  bookings,
  calendarEvents,
  type AvailabilityOverride,
  type AvailabilityRule,
  type NewAvailabilityOverride,
  type NewAvailabilityRule,
} from '../../../database/calendar.schema';
import * as schema from '../../../database/schema';
import {
  BulkAvailabilityDto,
  CreateAvailabilityOverrideDto,
  CreateAvailabilityRuleDto,
  UpdateAvailabilityOverrideDto,
  UpdateAvailabilityRuleDto,
} from '../dto';

export interface TimeSlot {
  start: Date;
  end: Date;
}

interface CustomWindow {
  startMinutes: number;
  endMinutes: number;
}

@Injectable()
export class AvailabilityService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Convert HH:MM time string to minutes from midnight
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Convert minutes from midnight to HH:MM string
   */
  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Create an availability rule
   */
  async createRule(
    userId: number,
    dto: CreateAvailabilityRuleDto,
  ): Promise<AvailabilityRule> {
    // Support both daysOfWeek array and single dayOfWeek
    const daysOfWeek =
      dto.daysOfWeek ?? (dto.dayOfWeek !== undefined ? [dto.dayOfWeek] : []);

    const ruleData: NewAvailabilityRule = {
      userId,
      bookingLinkId: dto.bookingLinkId,
      ruleType: dto.ruleType || 'available',
      daysOfWeek,
      startMinutes: this.timeToMinutes(dto.startTime),
      endMinutes: this.timeToMinutes(dto.endTime),
      timezone: dto.timezone || 'UTC',
      isActive: true,
    };

    const [created] = await this.db
      .insert(availabilityRules)
      .values(ruleData)
      .returning();

    return created;
  }

  /**
   * Update an availability rule
   */
  async updateRule(
    ruleId: string,
    userId: number,
    dto: UpdateAvailabilityRuleDto,
  ): Promise<AvailabilityRule> {
    const [existing] = await this.db
      .select()
      .from(availabilityRules)
      .where(
        and(
          eq(availabilityRules.id, ruleId),
          eq(availabilityRules.userId, userId),
        ),
      );

    if (!existing) {
      throw new NotFoundException('Availability rule not found');
    }

    const updateData: Partial<AvailabilityRule> = {
      updatedAt: new Date(),
    };

    if (dto.ruleType) updateData.ruleType = dto.ruleType;
    if (dto.daysOfWeek) updateData.daysOfWeek = dto.daysOfWeek;
    else if (dto.dayOfWeek !== undefined)
      updateData.daysOfWeek = [dto.dayOfWeek];
    if (dto.startTime)
      updateData.startMinutes = this.timeToMinutes(dto.startTime);
    if (dto.endTime) updateData.endMinutes = this.timeToMinutes(dto.endTime);
    if (dto.timezone) updateData.timezone = dto.timezone;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const [updated] = await this.db
      .update(availabilityRules)
      .set(updateData)
      .where(eq(availabilityRules.id, ruleId))
      .returning();

    return updated;
  }

  /**
   * Delete an availability rule
   */
  async deleteRule(ruleId: string, userId: number): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(availabilityRules)
      .where(
        and(
          eq(availabilityRules.id, ruleId),
          eq(availabilityRules.userId, userId),
        ),
      );

    if (!existing) {
      throw new NotFoundException('Availability rule not found');
    }

    await this.db
      .delete(availabilityRules)
      .where(eq(availabilityRules.id, ruleId));
  }

  /**
   * Get availability rules for a user
   */
  async getRules(
    userId: number,
    bookingLinkId?: string,
  ): Promise<AvailabilityRule[]> {
    const conditions = [
      eq(availabilityRules.userId, userId),
      eq(availabilityRules.isActive, true),
    ];

    if (bookingLinkId) {
      conditions.push(
        or(
          eq(availabilityRules.bookingLinkId, bookingLinkId),
          isNull(availabilityRules.bookingLinkId),
        ) as ReturnType<typeof eq>,
      );
    }

    return this.db
      .select()
      .from(availabilityRules)
      .where(and(...conditions))
      .orderBy(availabilityRules.startMinutes);
  }

  /**
   * Set bulk availability (weekly schedule)
   */
  async setBulkAvailability(
    userId: number,
    dto: BulkAvailabilityDto,
  ): Promise<AvailabilityRule[]> {
    // Remove existing rules
    const deleteConditions = [eq(availabilityRules.userId, userId)];
    if (dto.bookingLinkId) {
      deleteConditions.push(
        eq(availabilityRules.bookingLinkId, dto.bookingLinkId),
      );
    } else {
      deleteConditions.push(
        isNull(availabilityRules.bookingLinkId) as ReturnType<typeof eq>,
      );
    }

    await this.db.delete(availabilityRules).where(and(...deleteConditions));

    // Create new rules from weekly schedule
    const newRules: NewAvailabilityRule[] = [];
    for (const day of dto.weeklySchedule) {
      for (const slot of day.slots) {
        newRules.push({
          userId,
          bookingLinkId: dto.bookingLinkId,
          ruleType: 'available',
          daysOfWeek: [day.dayOfWeek], // Single day per rule
          startMinutes: this.timeToMinutes(slot.startTime),
          endMinutes: this.timeToMinutes(slot.endTime),
          timezone: dto.timezone || 'UTC',
          isActive: true,
        });
      }
    }

    if (newRules.length === 0) {
      return [];
    }

    return this.db.insert(availabilityRules).values(newRules).returning();
  }

  /**
   * Create an availability override
   */
  async createOverride(
    userId: number,
    dto: CreateAvailabilityOverrideDto,
  ): Promise<AvailabilityOverride> {
    const customWindows: CustomWindow[] = [];
    if (dto.overrideStartTime && dto.overrideEndTime) {
      customWindows.push({
        startMinutes: this.timeToMinutes(dto.overrideStartTime),
        endMinutes: this.timeToMinutes(dto.overrideEndTime),
      });
    }

    const overrideData: NewAvailabilityOverride = {
      userId,
      bookingLinkId: dto.bookingLinkId,
      date: new Date(dto.date),
      overrideType: dto.isUnavailable ? 'unavailable' : 'custom',
      customWindows: customWindows.length > 0 ? customWindows : null,
      reason: dto.reason,
    };

    const [created] = await this.db
      .insert(availabilityOverrides)
      .values(overrideData)
      .returning();

    return created;
  }

  /**
   * Update an availability override
   */
  async updateOverride(
    overrideId: string,
    userId: number,
    dto: UpdateAvailabilityOverrideDto,
  ): Promise<AvailabilityOverride> {
    const [existing] = await this.db
      .select()
      .from(availabilityOverrides)
      .where(
        and(
          eq(availabilityOverrides.id, overrideId),
          eq(availabilityOverrides.userId, userId),
        ),
      );

    if (!existing) {
      throw new NotFoundException('Availability override not found');
    }

    const updateData: Partial<AvailabilityOverride> = {};

    if (dto.date) updateData.date = new Date(dto.date);
    if (dto.reason !== undefined) updateData.reason = dto.reason;
    if (dto.isUnavailable !== undefined) {
      updateData.overrideType = dto.isUnavailable ? 'unavailable' : 'custom';
    }
    if (dto.overrideStartTime && dto.overrideEndTime) {
      updateData.customWindows = [
        {
          startMinutes: this.timeToMinutes(dto.overrideStartTime),
          endMinutes: this.timeToMinutes(dto.overrideEndTime),
        },
      ];
    }

    const [updated] = await this.db
      .update(availabilityOverrides)
      .set(updateData)
      .where(eq(availabilityOverrides.id, overrideId))
      .returning();

    return updated;
  }

  /**
   * Delete an availability override
   */
  async deleteOverride(overrideId: string, userId: number): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(availabilityOverrides)
      .where(
        and(
          eq(availabilityOverrides.id, overrideId),
          eq(availabilityOverrides.userId, userId),
        ),
      );

    if (!existing) {
      throw new NotFoundException('Availability override not found');
    }

    await this.db
      .delete(availabilityOverrides)
      .where(eq(availabilityOverrides.id, overrideId));
  }

  /**
   * Get availability overrides for a date range
   */
  async getOverrides(
    userId: number,
    startDate: Date,
    endDate: Date,
    bookingLinkId?: string,
  ): Promise<AvailabilityOverride[]> {
    const conditions = [
      eq(availabilityOverrides.userId, userId),
      gte(availabilityOverrides.date, startDate),
      lte(availabilityOverrides.date, endDate),
    ];

    if (bookingLinkId) {
      conditions.push(
        or(
          eq(availabilityOverrides.bookingLinkId, bookingLinkId),
          isNull(availabilityOverrides.bookingLinkId),
        ) as ReturnType<typeof eq>,
      );
    }

    return this.db
      .select()
      .from(availabilityOverrides)
      .where(and(...conditions))
      .orderBy(availabilityOverrides.date);
  }

  /**
   * Get available time slots for a booking link on a specific date
   */
  async getAvailableSlots(
    bookingLinkId: string,
    date: Date,
    durationMinutes: number,
  ): Promise<TimeSlot[]> {
    // Get the booking link to find associated user(s)
    const [bookingLink] = await this.db
      .select()
      .from(bookingLinks)
      .where(eq(bookingLinks.id, bookingLinkId));

    if (!bookingLink) {
      throw new NotFoundException('Booking link not found');
    }

    // Get assigned user IDs from the booking link
    const assignedUserIds = (bookingLink.assignedUserIds as number[]) || [];
    if (assignedUserIds.length === 0) {
      // Fallback to creator
      assignedUserIds.push(bookingLink.createdBy);
    }

    const dayOfWeek = date.getDay();
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);

    // Collect all available slots across users
    const allSlots: TimeSlot[] = [];

    for (const userId of assignedUserIds) {
      // Get availability rules for this day
      const rules = await this.db
        .select()
        .from(availabilityRules)
        .where(
          and(
            eq(availabilityRules.userId, userId),
            eq(availabilityRules.isActive, true),
            or(
              eq(availabilityRules.bookingLinkId, bookingLinkId),
              isNull(availabilityRules.bookingLinkId),
            ),
          ),
        );

      // Filter rules for the day of week
      const applicableRules = rules.filter((rule) => {
        const days = rule.daysOfWeek as number[];
        return days.includes(dayOfWeek);
      });

      // Check for date override
      const [override] = await this.db
        .select()
        .from(availabilityOverrides)
        .where(
          and(
            eq(availabilityOverrides.userId, userId),
            gte(availabilityOverrides.date, dateStart),
            lte(availabilityOverrides.date, dateEnd),
            or(
              eq(availabilityOverrides.bookingLinkId, bookingLinkId),
              isNull(availabilityOverrides.bookingLinkId),
            ),
          ),
        );

      // If unavailable override, skip this user for this date
      if (override && override.overrideType === 'unavailable') {
        continue;
      }

      // Build time windows
      let timeWindows: { startMinutes: number; endMinutes: number }[] = [];

      if (
        override &&
        override.overrideType === 'custom' &&
        override.customWindows
      ) {
        // Use custom windows from override
        timeWindows = override.customWindows as CustomWindow[];
      } else {
        // Use rules
        timeWindows = applicableRules.map((rule) => ({
          startMinutes: rule.startMinutes,
          endMinutes: rule.endMinutes,
        }));
      }

      // Get existing bookings for this user on this date
      const existingBookings = await this.db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.assignedUserId, userId),
            gte(bookings.scheduledStart, dateStart),
            lte(bookings.scheduledStart, dateEnd),
            // Only consider non-cancelled bookings
            or(
              eq(bookings.status, 'pending'),
              eq(bookings.status, 'confirmed'),
            ),
          ),
        );

      // Get calendar events for the user
      const existingEvents = await this.db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.createdBy, userId),
            gte(calendarEvents.startTime, dateStart),
            lte(calendarEvents.startTime, dateEnd),
            eq(calendarEvents.status, 'scheduled'),
          ),
        );

      // Calculate available slots
      for (const window of timeWindows) {
        const slots = this.calculateSlotsForWindow(
          date,
          window.startMinutes,
          window.endMinutes,
          durationMinutes,
          bookingLink.bufferBeforeMinutes || 0,
          bookingLink.bufferAfterMinutes || 0,
          existingBookings,
          existingEvents,
        );
        allSlots.push(...slots);
      }
    }

    // Remove duplicates and sort
    const uniqueSlots = this.deduplicateSlots(allSlots);
    return uniqueSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  /**
   * Calculate available slots within a time window
   */
  private calculateSlotsForWindow(
    date: Date,
    startMinutes: number,
    endMinutes: number,
    durationMinutes: number,
    bufferBefore: number,
    bufferAfter: number,
    existingBookings: Array<{ scheduledStart: Date; scheduledEnd: Date }>,
    existingEvents: Array<{ startTime: Date; endTime: Date }>,
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const slotInterval = 15; // 15-minute slots
    const totalDuration = durationMinutes + bufferBefore + bufferAfter;

    let currentMinutes = startMinutes;

    while (currentMinutes + totalDuration <= endMinutes) {
      const slotStart = new Date(date);
      slotStart.setHours(0, 0, 0, 0);
      slotStart.setMinutes(currentMinutes + bufferBefore);

      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotStart.getMinutes() + durationMinutes);

      // Check for conflicts with bookings
      const hasBookingConflict = existingBookings.some((booking) =>
        this.hasOverlap(
          slotStart,
          slotEnd,
          booking.scheduledStart,
          booking.scheduledEnd,
        ),
      );

      // Check for conflicts with events
      const hasEventConflict = existingEvents.some((event) =>
        this.hasOverlap(slotStart, slotEnd, event.startTime, event.endTime),
      );

      if (!hasBookingConflict && !hasEventConflict) {
        // Check if slot is in the future
        if (slotStart > new Date()) {
          slots.push({ start: slotStart, end: slotEnd });
        }
      }

      currentMinutes += slotInterval;
    }

    return slots;
  }

  /**
   * Check if two time ranges overlap
   */
  private hasOverlap(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date,
  ): boolean {
    return start1 < end2 && end1 > start2;
  }

  /**
   * Remove duplicate time slots
   */
  private deduplicateSlots(slots: TimeSlot[]): TimeSlot[] {
    const seen = new Set<string>();
    return slots.filter((slot) => {
      const key = `${slot.start.toISOString()}-${slot.end.toISOString()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Check if a specific time slot is available
   */
  async isSlotAvailable(
    bookingLinkId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<boolean> {
    const [bookingLink] = await this.db
      .select()
      .from(bookingLinks)
      .where(eq(bookingLinks.id, bookingLinkId));

    if (!bookingLink) {
      return false;
    }

    const durationMinutes = Math.round(
      (endTime.getTime() - startTime.getTime()) / (1000 * 60),
    );

    const slots = await this.getAvailableSlots(
      bookingLinkId,
      startTime,
      durationMinutes,
    );

    // Check if the requested slot matches any available slot
    return slots.some(
      (slot) =>
        slot.start.getTime() === startTime.getTime() &&
        slot.end.getTime() === endTime.getTime(),
    );
  }

  /**
   * Get dates with available slots for a given month
   */
  async getAvailableDatesInMonth(
    bookingLinkId: string,
    year: number,
    month: number,
    durationMinutes: number,
  ): Promise<string[]> {
    const availableDates: string[] = [];

    // Get first and last day of month
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    // Start from today if month is current month
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = firstDay < today ? today : firstDay;

    // Iterate through each day in the month
    for (
      let day = new Date(startDate);
      day <= lastDay;
      day.setDate(day.getDate() + 1)
    ) {
      try {
        const slots = await this.getAvailableSlots(
          bookingLinkId,
          new Date(day),
          durationMinutes,
        );

        if (slots.length > 0) {
          availableDates.push(day.toISOString().split('T')[0]);
        }
      } catch {
        // Skip days with errors
        continue;
      }
    }

    return availableDates;
  }
}
