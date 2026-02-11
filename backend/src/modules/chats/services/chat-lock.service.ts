import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '../../../database/db.connection';
import { chatLocks, chats } from '../../../database/schema';
import { AuditWriteService } from '../../audit/audit-write.service';

/**
 * Lock types with their corresponding TTL in milliseconds
 * - human: 5 minutes - for human agents actively working
 * - ai: 30 seconds - short-lived for AI processing
 * - system: 1 minute - for system operations
 */
export const LOCK_TTL = {
  human: 5 * 60 * 1000, // 5 minutes
  ai: 30 * 1000, // 30 seconds
  system: 1 * 60 * 1000, // 1 minute
} as const;

export type LockType = keyof typeof LOCK_TTL;

export interface LockInfo {
  chatId: string;
  lockedBy: number;
  lockType: LockType;
  lockedAt: Date;
  expiresAt: Date;
  reason: string | null;
}

export interface AcquireLockResult {
  success: boolean;
  lock?: LockInfo;
  error?: string;
  currentHolder?: {
    lockedBy: number;
    lockType: LockType;
    expiresAt: Date;
  };
}

/**
 * ChatLockService - Ensures exclusive chat control
 *
 * CRITICAL AI SAFETY:
 * - Only ONE actor (human or AI) may control a chat at a time
 * - AI CANNOT override an active human lock
 * - Locks automatically expire based on their TTL
 * - All lock operations are logged to activity_logs
 */
@Injectable()
export class ChatLockService {
  private readonly logger = new Logger(ChatLockService.name);

  constructor(private readonly auditWriteService: AuditWriteService) {}

  /**
   * Attempt to acquire a lock on a chat
   *
   * IMPORTANT: AI locks cannot override human locks.
   * If a human is actively working on a chat, AI must wait.
   */
  async acquireLock(
    chatId: string,
    userId: number,
    lockType: LockType,
    reason?: string,
  ): Promise<AcquireLockResult> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL[lockType]);

    try {
      // First, clean up any expired lock on this chat
      await db
        .delete(chatLocks)
        .where(and(eq(chatLocks.chatId, chatId), lt(chatLocks.expiresAt, now)));

      // Check if there's an existing active lock
      const existingLock = await db
        .select()
        .from(chatLocks)
        .where(eq(chatLocks.chatId, chatId))
        .limit(1);

      if (existingLock.length > 0) {
        const current = existingLock[0];

        // If the same user already has the lock, refresh it
        if (current.lockedBy === userId) {
          const [refreshedLock] = await db
            .update(chatLocks)
            .set({
              lockType,
              lockedAt: now,
              expiresAt,
              reason,
            })
            .where(eq(chatLocks.chatId, chatId))
            .returning();

          this.logger.debug(
            `Lock refreshed for chat ${chatId} by user ${userId}`,
          );

          return {
            success: true,
            lock: {
              chatId: refreshedLock.chatId,
              lockedBy: refreshedLock.lockedBy,
              lockType: refreshedLock.lockType as LockType,
              lockedAt: refreshedLock.lockedAt,
              expiresAt: refreshedLock.expiresAt,
              reason: refreshedLock.reason,
            },
          };
        }

        // CRITICAL: AI cannot override human locks
        if (lockType === 'ai' && current.lockType === 'human') {
          this.logger.warn(
            `AI lock denied for chat ${chatId}: human lock active by user ${current.lockedBy}`,
          );
          return {
            success: false,
            error: 'Cannot acquire AI lock: chat is locked by a human user',
            currentHolder: {
              lockedBy: current.lockedBy,
              lockType: current.lockType as LockType,
              expiresAt: current.expiresAt,
            },
          };
        }

        // Lock is held by another user
        return {
          success: false,
          error: `Chat is locked by user ${current.lockedBy}`,
          currentHolder: {
            lockedBy: current.lockedBy,
            lockType: current.lockType as LockType,
            expiresAt: current.expiresAt,
          },
        };
      }

      // No existing lock, create one
      const [newLock] = await db
        .insert(chatLocks)
        .values({
          chatId,
          lockedBy: userId,
          lockType,
          lockedAt: now,
          expiresAt,
          reason,
        })
        .returning();

      await this.logAction(userId, chatId, 'lock_acquired', {
        lockType,
        expiresAt,
      });

      this.logger.log(
        `Lock acquired for chat ${chatId} by user ${userId} (type: ${lockType})`,
      );

      return {
        success: true,
        lock: {
          chatId: newLock.chatId,
          lockedBy: newLock.lockedBy,
          lockType: newLock.lockType as LockType,
          lockedAt: newLock.lockedAt,
          expiresAt: newLock.expiresAt,
          reason: newLock.reason,
        },
      };
    } catch (err: unknown) {
      const error = err as Error & { code?: string };

      // Handle unique constraint violation (race condition)
      if (error.code === '23505') {
        this.logger.warn(`Lock race condition for chat ${chatId}`);
        return {
          success: false,
          error: 'Lock was acquired by another user',
        };
      }

      this.logger.error(`Error acquiring lock: ${error.message}`);
      throw error;
    }
  }

  /**
   * Release a lock on a chat
   */
  async releaseLock(chatId: string, userId: number): Promise<boolean> {
    const result = await db
      .delete(chatLocks)
      .where(and(eq(chatLocks.chatId, chatId), eq(chatLocks.lockedBy, userId)))
      .returning();

    if (result.length > 0) {
      await this.logAction(userId, chatId, 'lock_released', {});
      this.logger.log(`Lock released for chat ${chatId} by user ${userId}`);
      return true;
    }

    return false;
  }

  /**
   * Force unlock a chat (Admin/Owner only)
   */
  async forceUnlock(
    chatId: string,
    adminUserId: number,
    reason: string,
  ): Promise<boolean> {
    const existingLock = await this.getLockInfo(chatId);

    if (!existingLock) {
      return false;
    }

    await db.delete(chatLocks).where(eq(chatLocks.chatId, chatId));

    await this.logAction(adminUserId, chatId, 'lock_force_released', {
      previousHolder: existingLock.lockedBy,
      previousLockType: existingLock.lockType,
      reason,
    });

    this.logger.warn(
      `Lock force-released for chat ${chatId} by admin ${adminUserId}: ${reason}`,
    );

    return true;
  }

  /**
   * Check if a chat is currently locked
   */
  async isLocked(chatId: string): Promise<boolean> {
    const now = new Date();

    // Clean up expired locks first
    await db
      .delete(chatLocks)
      .where(and(eq(chatLocks.chatId, chatId), lt(chatLocks.expiresAt, now)));

    const [lock] = await db
      .select()
      .from(chatLocks)
      .where(eq(chatLocks.chatId, chatId))
      .limit(1);

    return !!lock;
  }

  /**
   * Get lock information for a chat
   */
  async getLockInfo(chatId: string): Promise<LockInfo | null> {
    const now = new Date();

    // Clean up expired locks first
    await db
      .delete(chatLocks)
      .where(and(eq(chatLocks.chatId, chatId), lt(chatLocks.expiresAt, now)));

    const [lock] = await db
      .select()
      .from(chatLocks)
      .where(eq(chatLocks.chatId, chatId))
      .limit(1);

    if (!lock) {
      return null;
    }

    return {
      chatId: lock.chatId,
      lockedBy: lock.lockedBy,
      lockType: lock.lockType as LockType,
      lockedAt: lock.lockedAt,
      expiresAt: lock.expiresAt,
      reason: lock.reason,
    };
  }

  /**
   * Refresh an existing lock (extend TTL)
   */
  async refreshLock(
    chatId: string,
    userId: number,
  ): Promise<AcquireLockResult> {
    const existingLock = await this.getLockInfo(chatId);

    if (!existingLock) {
      return {
        success: false,
        error: 'No lock to refresh',
      };
    }

    if (existingLock.lockedBy !== userId) {
      return {
        success: false,
        error: 'Cannot refresh lock: not the lock holder',
        currentHolder: {
          lockedBy: existingLock.lockedBy,
          lockType: existingLock.lockType,
          expiresAt: existingLock.expiresAt,
        },
      };
    }

    const now = new Date();
    const newExpiry = new Date(now.getTime() + LOCK_TTL[existingLock.lockType]);

    const [refreshedLock] = await db
      .update(chatLocks)
      .set({ expiresAt: newExpiry })
      .where(eq(chatLocks.chatId, chatId))
      .returning();

    return {
      success: true,
      lock: {
        chatId: refreshedLock.chatId,
        lockedBy: refreshedLock.lockedBy,
        lockType: refreshedLock.lockType as LockType,
        lockedAt: refreshedLock.lockedAt,
        expiresAt: refreshedLock.expiresAt,
        reason: refreshedLock.reason,
      },
    };
  }

  /**
   * Request control of a chat from the current lock holder
   */
  async requestControl(chatId: string, requesterId: number): Promise<void> {
    const lock = await this.getLockInfo(chatId);

    if (!lock) {
      throw new ConflictException('Chat is not locked');
    }

    if (lock.lockedBy === requesterId) {
      throw new ConflictException('You already hold the lock on this chat');
    }

    await this.logAction(requesterId, chatId, 'control_requested', {
      currentHolder: lock.lockedBy,
    });

    this.logger.log(
      `Control requested for chat ${chatId} by user ${requesterId}, current holder: ${lock.lockedBy}`,
    );
  }

  /**
   * Clean up all expired locks (scheduled task)
   */
  async cleanupExpiredLocks(): Promise<number> {
    const now = new Date();

    const deleted = await db
      .delete(chatLocks)
      .where(lt(chatLocks.expiresAt, now))
      .returning();

    if (deleted.length > 0) {
      this.logger.log(`Cleaned up ${deleted.length} expired locks`);
    }

    return deleted.length;
  }

  /**
   * Log a lock-related action to the audit trail
   */
  private async logAction(
    userId: number,
    chatId: string,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Get the team ID from the chat for proper audit logging
      const chat = await db
        .select({ teamId: chats.teamId })
        .from(chats)
        .where(eq(chats.chatId, chatId))
        .limit(1);

      const teamId = chat[0]?.teamId ?? undefined;

      await this.auditWriteService.log({
        userId,
        teamId,
        category: 'pipeline',
        entityType: 'chat_lock',
        entityId: chatId,
        action: action as any,
        chatId,
        metadata,
      });
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(
        `Failed to log lock action: ${error.message}`,
        error.stack,
      );
    }
  }
}
