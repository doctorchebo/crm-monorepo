import { db } from '../../database/db.connection';
import { users, activityLogs } from '../../database/schema';
import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  async findOne(id: string) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new NotFoundException(`Invalid User ID ${id}`);
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Don't return password hash
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async findByEmail(email: string) {
    return db.query.users.findFirst({
      where: eq(users.email, email),
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new NotFoundException(`Invalid User ID ${id}`);
    }

    // Filter DTO to only include fields that exist in the database schema
    // The users table currently only supports name and email
    const updateData: Partial<typeof users.$inferInsert> = {};
    if (updateUserDto.name) updateData.name = updateUserDto.name;
    if (updateUserDto.email) updateData.email = updateUserDto.email;

    // Always update timestamp
    updateData.updatedAt = new Date();

    const updated = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    if (updated.length === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const { passwordHash, ...userWithoutPassword } = updated[0];
    return userWithoutPassword;
  }

  async remove(id: string) {
    const userId = parseInt(id, 10);
    const deleted = await db
      .delete(users)
      .where(eq(users.id, userId))
      .returning();

    if (deleted.length === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return { success: true };
  }

  async getActivityLogs(userId: number) {
    const results = await db
      .select()
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(20);

    return results.map((row) => ({
      id: row.activity_logs.id,
      action: row.activity_logs.action,
      timestamp: row.activity_logs.createdAt,
      ipAddress: row.activity_logs.ipAddress,
      userName: row.users?.name,
    }));
  }
}
