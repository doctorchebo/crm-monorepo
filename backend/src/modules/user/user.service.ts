import { db } from '@database/db.connection';
import { users } from '@database/schema';
import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

@Injectable()
export class UserService {
  async findOne(id: string) {
    const userId = parseInt(id, 10);
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

  async update(id: string, updateUserDto: any) {
    const userId = parseInt(id, 10);
    const updated = await db
      .update(users)
      .set(updateUserDto)
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
}
