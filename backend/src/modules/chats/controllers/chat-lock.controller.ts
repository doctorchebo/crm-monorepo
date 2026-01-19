import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  Req,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { ChatLockService } from '../services/chat-lock.service';
import { PermissionService } from '../../../shared/services/permission.service';

interface AuthenticatedRequest {
  user: { userId: number };
}

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
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
    @Body() dto: AcquireLockDto,
  ) {
    this.logger.log(
      `User ${req.user.userId} acquiring ${dto.lockType} lock on chat ${chatId}`,
    );

    const result = await this.chatLockService.acquireLock(
      chatId,
      req.user.userId,
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
  async releaseLock(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    this.logger.log(`User ${req.user.userId} releasing lock on chat ${chatId}`);

    const result = await this.chatLockService.releaseLock(
      chatId,
      req.user.userId,
    );

    return { success: result };
  }

  /**
   * Force unlock a chat (admin/owner only)
   * DELETE /chats/:chatId/lock/force
   */
  @Delete('force')
  async forceUnlock(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
    @Body() body: { reason?: string },
  ) {
    // Get team ID for permission check
    const teamId = await this.permissionService.getTeamIdForChat(chatId);
    if (teamId) {
      await this.permissionService.enforcePermission(
        req.user.userId,
        teamId,
        'force_unlock',
      );
    }

    this.logger.log(`User ${req.user.userId} force unlocking chat ${chatId}`);

    const result = await this.chatLockService.forceUnlock(
      chatId,
      req.user.userId,
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
  async refreshLock(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    this.logger.log(
      `User ${req.user.userId} refreshing lock on chat ${chatId}`,
    );

    const result = await this.chatLockService.refreshLock(
      chatId,
      req.user.userId,
    );

    return result;
  }

  /**
   * Request control of a locked chat (notifies holder)
   * POST /chats/:chatId/lock/request
   */
  @Post('request')
  async requestControl(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    this.logger.log(
      `User ${req.user.userId} requesting control of chat ${chatId}`,
    );

    await this.chatLockService.requestControl(chatId, req.user.userId);

    return { success: true };
  }
}
