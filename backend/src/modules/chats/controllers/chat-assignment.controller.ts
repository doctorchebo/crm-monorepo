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
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { ChatAssignmentService } from '../services/chat-assignment.service';
import { PermissionService } from '../../../shared/services/permission.service';

interface AuthenticatedRequest {
  user: { userId: number };
}

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
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
    @Body() dto: AssignChatDto,
  ) {
    // Get team ID for permission check
    const teamId = await this.permissionService.getTeamIdForChat(chatId);
    if (teamId) {
      await this.permissionService.enforcePermission(
        req.user.userId,
        teamId,
        'assign_chats',
        chatId,
      );
    }

    this.logger.log(
      `User ${req.user.userId} assigning chat ${chatId} to user ${dto.assigneeId}`,
    );

    return this.chatAssignmentService.assignChat(
      chatId,
      dto.assigneeId,
      req.user.userId,
    );
  }

  /**
   * Unassign a chat
   * DELETE /chats/:chatId/assign
   */
  @Delete(':chatId/assign')
  async unassignChat(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    // Get team ID for permission check
    const teamId = await this.permissionService.getTeamIdForChat(chatId);
    if (teamId) {
      await this.permissionService.enforcePermission(
        req.user.userId,
        teamId,
        'assign_chats',
        chatId,
      );
    }

    this.logger.log(`User ${req.user.userId} unassigning chat ${chatId}`);

    return this.chatAssignmentService.unassignChat(chatId, req.user.userId);
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
  async getMyAssignedChats(@Req() req: AuthenticatedRequest) {
    return this.chatAssignmentService.getAssignedChats(req.user.userId);
  }
}
