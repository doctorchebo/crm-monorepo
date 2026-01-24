import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtPayload } from '@shared/types';
import { PermissionService } from '../../../shared/services/permission.service';
import { JwtAuthGuard } from '../../auth/auth.guard';
import {
  PermissionsGuard,
  RequirePermission,
} from '../../auth/guards/permissions.guard';
import { ChatAssignmentService } from '../services/chat-assignment.service';

interface AssignChatDto {
  assigneeId: number;
}

/**
 * ChatAssignmentController - API endpoints for chat assignment
 *
 * Provides endpoints for:
 * - Assigning chats to team members
 * - Reassigning chats
 * - Unassigning chats
 * - Getting assignment info
 */
@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatAssignmentController {
  private readonly logger = new Logger(ChatAssignmentController.name);

  constructor(
    private readonly chatAssignmentService: ChatAssignmentService,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Assign a chat to a user
   * POST /chats/:chatId/assign
   */
  @Post(':chatId/assign')
  async assignChat(
    @Req() req: any,
    @Param('chatId') chatId: string,
    @Body() dto: AssignChatDto,
  ) {
    const user = req.user as JwtPayload;
    // Get team ID for permission check
    const teamId = await this.permissionService.getTeamIdForChat(chatId);
    if (teamId) {
      await this.permissionService.enforcePermission(
        user.userId,
        teamId,
        'assign_chats',
        chatId,
      );
    }

    this.logger.log(
      `User ${user.userId} assigning chat ${chatId} to user ${dto.assigneeId}`,
    );

    return this.chatAssignmentService.assignChat(
      chatId,
      dto.assigneeId,
      user.userId,
    );
  }

  /**
   * Unassign a chat
   * DELETE /chats/:chatId/assign
   */
  @Delete(':chatId/assign')
  async unassignChat(@Req() req: any, @Param('chatId') chatId: string) {
    const user = req.user as JwtPayload;
    // Get team ID for permission check
    const teamId = await this.permissionService.getTeamIdForChat(chatId);
    if (teamId) {
      await this.permissionService.enforcePermission(
        user.userId,
        teamId,
        'assign_chats',
        chatId,
      );
    }

    this.logger.log(`User ${user.userId} unassigning chat ${chatId}`);

    return this.chatAssignmentService.unassignChat(chatId, user.userId);
  }

  /**
   * Get assignment info for a chat
   * GET /chats/:chatId/assignment
   */
  @Get(':chatId/assignment')
  async getChatAssignment(@Param('chatId') chatId: string) {
    return this.chatAssignmentService.getChatAssignment(chatId);
  }

  /**
   * Get all chats assigned to a specific user
   * GET /users/:userId/assigned-chats
   */
  @Get('/users/:userId/assigned-chats')
  async getAssignedChats(@Param('userId', ParseIntPipe) userId: number) {
    return this.chatAssignmentService.getAssignedChats(userId);
  }

  /**
   * Get my assigned chats
   * GET /chats/assigned
   */
  @Get('assigned')
  async getMyAssignedChats(@Req() req: any) {
    const user = req.user as JwtPayload;
    return this.chatAssignmentService.getAssignedChats(user.userId);
  }

  /**
   * Get unassigned chats for a team
   * GET /chats/team/:teamId/unassigned
   */
  @Get('team/:teamId/unassigned')
  @UseGuards(PermissionsGuard)
  @RequirePermission('view_chats')
  async getUnassignedChats(
    @Req() req: any,
    @Param('teamId', ParseIntPipe) teamId: number,
  ) {
    return this.chatAssignmentService.getUnassignedChats(teamId);
  }

  /**
   * Get all chats for a team (assigned and unassigned)
   * GET /chats/team/:teamId/all
   */
  @Get('team/:teamId/all')
  @UseGuards(PermissionsGuard)
  @RequirePermission('view_chats')
  async getAllTeamChats(
    @Req() req: any,
    @Param('teamId', ParseIntPipe) teamId: number,
  ) {
    return this.chatAssignmentService.getAllTeamChats(teamId);
  }
}
