import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtPayload } from '@shared/types';
import { PermissionService } from '../../../shared/services/permission.service';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { ChatLockService } from '../services/chat-lock.service';

interface AcquireLockDto {
  lockType: 'human' | 'ai' | 'system';
  reason?: string;
}

/**
 * ChatLockController - API endpoints for managing chat locks
 *
 * Provides endpoints for:
 * - Acquiring exclusive control of a chat
 * - Releasing locks
 * - Force unlocking (admin only)
 * - Checking lock status
 * - Requesting control from current holder
 */
@Controller('chats/:chatId/lock')
@UseGuards(JwtAuthGuard)
export class ChatLockController {
  private readonly logger = new Logger(ChatLockController.name);

  constructor(
    private readonly chatLockService: ChatLockService,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Acquire a lock on a chat
   * POST /chats/:chatId/lock
   */
  @Post()
  async acquireLock(
    @Req() req: any,
    @Param('chatId') chatId: string,
    @Body() dto: AcquireLockDto,
  ) {
    const user = req.user as JwtPayload;
    this.logger.log(
      `User ${user.userId} acquiring ${dto.lockType} lock on chat ${chatId}`,
    );

    const result = await this.chatLockService.acquireLock(
      chatId,
      user.userId,
      dto.lockType,
      dto.reason,
    );

    return result;
  }

  /**
   * Release a lock on a chat
   * DELETE /chats/:chatId/lock
   */
  @Delete()
  async releaseLock(@Req() req: any, @Param('chatId') chatId: string) {
    const user = req.user as JwtPayload;
    this.logger.log(`User ${user.userId} releasing lock on chat ${chatId}`);

    const result = await this.chatLockService.releaseLock(chatId, user.userId);

    return { success: result };
  }

  /**
   * Force unlock a chat (admin/owner only)
   * DELETE /chats/:chatId/lock/force
   */
  @Delete('force')
  async forceUnlock(
    @Req() req: any,
    @Param('chatId') chatId: string,
    @Body() body: { reason?: string },
  ) {
    const user = req.user as JwtPayload;
    // Get team ID for permission check
    const teamId = await this.permissionService.getTeamIdForChat(chatId);
    if (teamId) {
      await this.permissionService.enforcePermission(
        user.userId,
        teamId,
        'force_unlock',
      );
    }

    this.logger.log(`User ${user.userId} force unlocking chat ${chatId}`);

    const result = await this.chatLockService.forceUnlock(
      chatId,
      user.userId,
      body?.reason || 'Admin force unlock',
    );

    return { success: result };
  }

  /**
   * Get lock status for a chat
   * GET /chats/:chatId/lock
   */
  @Get()
  async getLockStatus(@Param('chatId') chatId: string) {
    const info = await this.chatLockService.getLockInfo(chatId);
    const isLocked = await this.chatLockService.isLocked(chatId);

    return {
      isLocked,
      lock: info,
    };
  }

  /**
   * Refresh an existing lock (extend TTL)
   * POST /chats/:chatId/lock/refresh
   */
  @Post('refresh')
  async refreshLock(@Req() req: any, @Param('chatId') chatId: string) {
    const user = req.user as JwtPayload;
    this.logger.log(`User ${user.userId} refreshing lock on chat ${chatId}`);

    const result = await this.chatLockService.refreshLock(chatId, user.userId);

    return result;
  }

  /**
   * Request control of a locked chat (notifies holder)
   * POST /chats/:chatId/lock/request
   */
  @Post('request')
  async requestControl(@Req() req: any, @Param('chatId') chatId: string) {
    const user = req.user as JwtPayload;
    this.logger.log(`User ${user.userId} requesting control of chat ${chatId}`);

    await this.chatLockService.requestControl(chatId, user.userId);

    return { success: true };
  }
}
