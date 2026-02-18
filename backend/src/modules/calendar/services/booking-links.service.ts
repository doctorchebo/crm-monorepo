import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  bookingLinkMembers,
  bookingLinks,
  type BookingLink,
  type BookingLinkMember,
  type NewBookingLink,
  type NewBookingLinkMember,
} from '../../../database/calendar.schema';
import * as schema from '../../../database/schema';
import { CreateBookingLinkDto, UpdateBookingLinkDto } from '../dto';

@Injectable()
export class BookingLinksService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Create a new booking link
   */
  async create(
    teamId: number,
    createdBy: number,
    dto: CreateBookingLinkDto,
  ): Promise<BookingLink> {
    // Check slug uniqueness within team
    const [existing] = await this.db
      .select()
      .from(bookingLinks)
      .where(
        and(eq(bookingLinks.teamId, teamId), eq(bookingLinks.slug, dto.slug)),
      );

    if (existing) {
      throw new ConflictException(
        'A booking link with this slug already exists',
      );
    }

    const bookingLinkData: NewBookingLink = {
      teamId,
      createdBy,
      slug: dto.slug,
      name: dto.name,
      description: dto.description,
      eventType: dto.bookingType || 'meeting',
      duration: dto.durationMinutes || 30,
      locationType: dto.location ? 'in_person' : 'video',
      locationDetails: dto.location,
      videoProvider: dto.videoLink ? 'custom' : undefined,
      calendarId: dto.calendarId,
      minNoticeMinutes: dto.minNotice ?? 60,
      maxFutureDays: dto.maxAdvanceDays ?? 60,
      bufferBeforeMinutes: dto.bufferBefore ?? 0,
      bufferAfterMinutes: dto.bufferAfter ?? 0,
      maxBookingsPerDay: dto.maxBookingsPerDay,
      isRoundRobin: dto.bookingType === 'round_robin',
      roundRobinMode: dto.bookingType === 'round_robin' ? 'equal' : undefined,
      assignedUserIds: dto.members?.map((m) => Number(m.userId)) || [createdBy],
      confirmationMessage: dto.confirmationMessage,
      requiresApproval: dto.requiresConfirmation ?? false,
      color: '#3B82F6',
      customQuestions: [],
      status: 'active',
    };

    const [created] = await this.db
      .insert(bookingLinks)
      .values(bookingLinkData)
      .returning();

    // Create booking link members for assigned users
    const memberUserIds = dto.members?.map((m) => Number(m.userId)) || [];
    if (memberUserIds.length > 0) {
      await this.setMembers(created.id, memberUserIds);
    } else {
      // Add creator as default member
      await this.addMember(created.id, createdBy);
    }

    return created;
  }

  /**
   * Get all booking links for a team
   */
  async findAllForTeam(
    teamId: number,
    includeArchived = false,
  ): Promise<BookingLink[]> {
    const conditions = [eq(bookingLinks.teamId, teamId)];

    if (!includeArchived) {
      conditions.push(eq(bookingLinks.status, 'active'));
    }

    return this.db
      .select()
      .from(bookingLinks)
      .where(and(...conditions))
      .orderBy(desc(bookingLinks.createdAt));
  }

  /**
   * Get a booking link by ID
   */
  async findById(bookingLinkId: string): Promise<BookingLink | null> {
    const [bookingLink] = await this.db
      .select()
      .from(bookingLinks)
      .where(eq(bookingLinks.id, bookingLinkId));

    return bookingLink || null;
  }

  /**
   * Get a booking link by slug (for public booking page)
   */
  async findBySlug(teamId: number, slug: string): Promise<BookingLink | null> {
    const [bookingLink] = await this.db
      .select()
      .from(bookingLinks)
      .where(
        and(
          eq(bookingLinks.teamId, teamId),
          eq(bookingLinks.slug, slug),
          eq(bookingLinks.status, 'active'),
        ),
      );

    return bookingLink || null;
  }

  /**
   * Get a booking link with access check
   */
  async findByIdWithAccess(
    bookingLinkId: string,
    userId: number,
    teamId: number,
  ): Promise<BookingLink> {
    const bookingLink = await this.findById(bookingLinkId);

    if (!bookingLink) {
      throw new NotFoundException('Booking link not found');
    }

    // Check team access
    if (bookingLink.teamId !== teamId) {
      throw new ForbiddenException(
        'You do not have access to this booking link',
      );
    }

    // Check if user is creator or member
    if (bookingLink.createdBy !== userId) {
      const [member] = await this.db
        .select()
        .from(bookingLinkMembers)
        .where(
          and(
            eq(bookingLinkMembers.bookingLinkId, bookingLinkId),
            eq(bookingLinkMembers.userId, userId),
          ),
        );

      if (!member) {
        throw new ForbiddenException(
          'You do not have access to this booking link',
        );
      }
    }

    return bookingLink;
  }

  /**
   * Update a booking link
   */
  async update(
    bookingLinkId: string,
    userId: number,
    teamId: number,
    dto: UpdateBookingLinkDto,
  ): Promise<BookingLink> {
    const bookingLink = await this.findByIdWithAccess(
      bookingLinkId,
      userId,
      teamId,
    );

    // Only creator can update
    if (bookingLink.createdBy !== userId) {
      throw new ForbiddenException(
        'Only the creator can update this booking link',
      );
    }

    // Check slug uniqueness if changing
    if (dto.slug && dto.slug !== bookingLink.slug) {
      const [existing] = await this.db
        .select()
        .from(bookingLinks)
        .where(
          and(eq(bookingLinks.teamId, teamId), eq(bookingLinks.slug, dto.slug)),
        );

      if (existing) {
        throw new ConflictException(
          'A booking link with this slug already exists',
        );
      }
    }

    const updateData: Partial<BookingLink> = {
      updatedAt: new Date(),
    };

    // Map DTO fields to schema fields
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.durationMinutes !== undefined)
      updateData.duration = dto.durationMinutes;
    if (dto.bookingType !== undefined) updateData.eventType = dto.bookingType;
    if (dto.bufferBefore !== undefined)
      updateData.bufferBeforeMinutes = dto.bufferBefore;
    if (dto.bufferAfter !== undefined)
      updateData.bufferAfterMinutes = dto.bufferAfter;
    if (dto.minNotice !== undefined)
      updateData.minNoticeMinutes = dto.minNotice;
    if (dto.maxAdvanceDays !== undefined)
      updateData.maxFutureDays = dto.maxAdvanceDays;
    if (dto.maxBookingsPerDay !== undefined)
      updateData.maxBookingsPerDay = dto.maxBookingsPerDay;
    if (dto.requiresConfirmation !== undefined)
      updateData.requiresApproval = dto.requiresConfirmation;
    if (dto.location !== undefined) updateData.locationDetails = dto.location;
    if (dto.confirmationMessage !== undefined)
      updateData.confirmationMessage = dto.confirmationMessage;
    if (dto.isActive !== undefined)
      updateData.status = dto.isActive ? 'active' : 'paused';

    // Update members if provided
    if (dto.members && dto.members.length > 0) {
      const memberUserIds = dto.members.map((m) => Number(m.userId));
      await this.setMembers(bookingLinkId, memberUserIds);
      updateData.assignedUserIds = memberUserIds;
    }

    const [updated] = await this.db
      .update(bookingLinks)
      .set(updateData)
      .where(eq(bookingLinks.id, bookingLinkId))
      .returning();

    return updated;
  }

  /**
   * Archive a booking link (soft delete)
   */
  async archive(
    bookingLinkId: string,
    userId: number,
    teamId: number,
  ): Promise<BookingLink> {
    const bookingLink = await this.findByIdWithAccess(
      bookingLinkId,
      userId,
      teamId,
    );

    if (bookingLink.createdBy !== userId) {
      throw new ForbiddenException(
        'Only the creator can archive this booking link',
      );
    }

    const [updated] = await this.db
      .update(bookingLinks)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(bookingLinks.id, bookingLinkId))
      .returning();

    return updated;
  }

  /**
   * Pause/unpause a booking link
   */
  async toggleStatus(
    bookingLinkId: string,
    userId: number,
    teamId: number,
  ): Promise<BookingLink> {
    const bookingLink = await this.findByIdWithAccess(
      bookingLinkId,
      userId,
      teamId,
    );

    if (bookingLink.createdBy !== userId) {
      throw new ForbiddenException('Only the creator can change the status');
    }

    const newStatus = bookingLink.status === 'active' ? 'paused' : 'active';

    const [updated] = await this.db
      .update(bookingLinks)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(bookingLinks.id, bookingLinkId))
      .returning();

    return updated;
  }

  /**
   * Add a member to a booking link
   */
  async addMember(
    bookingLinkId: string,
    userId: number,
    priority = 0,
  ): Promise<BookingLinkMember> {
    const memberData: NewBookingLinkMember = {
      bookingLinkId,
      userId,
      priority,
      isActive: true,
    };

    const [member] = await this.db
      .insert(bookingLinkMembers)
      .values(memberData)
      .onConflictDoNothing()
      .returning();

    return member;
  }

  /**
   * Remove a member from a booking link
   */
  async removeMember(bookingLinkId: string, userId: number): Promise<void> {
    await this.db
      .delete(bookingLinkMembers)
      .where(
        and(
          eq(bookingLinkMembers.bookingLinkId, bookingLinkId),
          eq(bookingLinkMembers.userId, userId),
        ),
      );
  }

  /**
   * Set members for a booking link (replace all)
   */
  async setMembers(
    bookingLinkId: string,
    userIds: number[],
  ): Promise<BookingLinkMember[]> {
    // Remove existing members
    await this.db
      .delete(bookingLinkMembers)
      .where(eq(bookingLinkMembers.bookingLinkId, bookingLinkId));

    if (userIds.length === 0) {
      return [];
    }

    // Add new members
    const memberData: NewBookingLinkMember[] = userIds.map((userId, index) => ({
      bookingLinkId,
      userId,
      priority: index,
      isActive: true,
    }));

    return this.db.insert(bookingLinkMembers).values(memberData).returning();
  }

  /**
   * Get members of a booking link
   */
  async getMembers(bookingLinkId: string): Promise<BookingLinkMember[]> {
    return this.db
      .select()
      .from(bookingLinkMembers)
      .where(eq(bookingLinkMembers.bookingLinkId, bookingLinkId))
      .orderBy(bookingLinkMembers.priority);
  }

  /**
   * Get active members for round-robin assignment
   */
  async getActiveMembers(bookingLinkId: string): Promise<BookingLinkMember[]> {
    return this.db
      .select()
      .from(bookingLinkMembers)
      .where(
        and(
          eq(bookingLinkMembers.bookingLinkId, bookingLinkId),
          eq(bookingLinkMembers.isActive, true),
        ),
      )
      .orderBy(bookingLinkMembers.priority);
  }

  /**
   * Update member after assignment (for round-robin tracking)
   */
  async recordAssignment(memberId: string): Promise<void> {
    const [member] = await this.db
      .select()
      .from(bookingLinkMembers)
      .where(eq(bookingLinkMembers.id, memberId));

    if (member) {
      await this.db
        .update(bookingLinkMembers)
        .set({
          lastAssignedAt: new Date(),
          totalAssignments: (member.totalAssignments || 0) + 1,
        })
        .where(eq(bookingLinkMembers.id, memberId));
    }
  }

  /**
   * Increment total bookings counter
   */
  async incrementBookingsCount(bookingLinkId: string): Promise<void> {
    const [bookingLink] = await this.db
      .select()
      .from(bookingLinks)
      .where(eq(bookingLinks.id, bookingLinkId));

    if (bookingLink) {
      await this.db
        .update(bookingLinks)
        .set({
          totalBookings: (bookingLink.totalBookings || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(bookingLinks.id, bookingLinkId));
    }
  }
}
