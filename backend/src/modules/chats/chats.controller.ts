import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RequirePermission } from '../auth/guards/permissions.guard';
import { ChatsService } from './chats.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { SearchChatsDto } from './dto/search-chats.dto';
import { SearchMessagesDto } from './dto/search-messages.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { TeamService } from '../team/team.service';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(
    private chatsService: ChatsService,
    private teamService: TeamService,
  ) {}

  async create(@Req() req: any, @Body() createChatDto: CreateChatDto) {
    const userId = req.user.userId;
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id.toString();

    if (!teamId) {
      throw new Error('User does not belong to any team');
    }

    return this.chatsService.create(userId, teamId, createChatDto);
  }

  /**
   * Start a new chat or get existing chat with a contact
   * POST /chats/contact/start
   * Requires: businessPhone, participantPhone, participantName (optional)
   */
  @Post('contact/start')
  async startChatWithContact(
    @Req() req: any,
    @Body()
    body: {
      businessPhone: string;
      participantPhone: string;
      participantName?: string;
      senderId?: number;
    },
  ) {
    const userId = req.user.userId;
    return this.chatsService.createOrGetChatWithContact(
      userId,
      body.businessPhone,
      body.participantPhone,
      body.participantName,
      body.senderId,
    );
  }

  @Get()
  async findByTeam(
    @Req() req: any,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 20,
    @Query('teamId') teamIdParam?: string,
  ) {
    const userId = req.user.userId;

    console.log(
      `[ChatsController] findByTeam called. User: ${userId}, TeamIdParam: ${teamIdParam}`,
    );

    let teamId = teamIdParam;
    if (!teamId) {
      const teams = await this.teamService.getUserTeams(userId);
      console.log(
        `[ChatsController] User teams found: ${teams.length}. First: ${teams[0]?.id}`,
      );
      teamId = teams[0]?.id.toString();
    }

    if (!teamId) {
      console.warn(
        `[ChatsController] No team ID found for user ${userId}. Returning empty list.`,
      );
      return []; // Return empty if no team
    }

    return this.chatsService.findByTeam(userId, teamId, skip, take);
  }

  /**
   * Get all archived chats for the current user
   * GET /chats/archived?skip=0&take=20
   */
  @Get('archived')
  async getArchivedChats(
    @Req() req: any,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 20,
  ) {
    const userId = req.user.userId;
    return this.chatsService.getArchivedChats(userId, skip, take);
  }

  /**
   * Search chats by participant name or phone number
   * GET /chats/search?query=text&skip=0&take=50
   *
   * Supports:
   * - Case-insensitive partial matching on name and phone
   * - Relevance-based ordering (exact matches first)
   * - Pagination
   */
  @Get('search')
  async searchChats(@Req() req: any, @Query() searchDto: SearchChatsDto) {
    const userId = req.user.userId;
    return this.chatsService.searchChats(userId, searchDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.chatsService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateChatDto: UpdateChatDto) {
    return this.chatsService.update(id, updateChatDto);
  }

  @Post(':id/close')
  async close(@Param('id') id: string) {
    return this.chatsService.close(id);
  }

  /**
   * Archive a chat
   * POST /chats/:id/archive
   */
  @Post(':id/archive')
  async archiveChat(@Param('id') id: string) {
    return this.chatsService.archiveChat(id);
  }

  /**
   * Unarchive a chat
   * POST /chats/:id/unarchive
   */
  @Post(':id/unarchive')
  async unarchiveChat(@Param('id') id: string) {
    return this.chatsService.unarchiveChat(id);
  }

  /**
   * Delete a chat and all associated data
   * DELETE /chats/:id
   * WARNING: This permanently deletes the chat, all messages, and media files
   */
  @Delete(':id')
  async deleteChat(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.chatsService.deleteChat(id, userId);
    return { success: true, message: 'Chat deleted successfully' };
  }

  /**
   * Assign a chat to a user
   * PATCH /chats/:id/assign
   * Body: { userId: number | null }
   */
  @Patch(':id/assign')
  @RequirePermission('chat.assign')
  async assignChat(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { userId: number | null },
  ) {
    const assignerId = req.user.userId;
    return this.chatsService.assignChat(id, assignerId, body.userId);
  }

  /**
   * Mark chat as read - resets unread count to zero
   * POST /chats/:id/mark-read
   */
  @Post(':id/mark-read')
  async markAsRead(@Param('id') id: string) {
    return this.chatsService.resetUnreadCount(id);
  }

  @Get(':id/messages')
  async getMessages(
    @Param('id') id: string,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 50,
  ) {
    return this.chatsService.getMessages(id, skip, take);
  }

  /**
   * Search messages within a chat
   * GET /chats/:id/messages/search?query=text&startDate=2024-01-01&endDate=2024-12-31&skip=0&take=20
   *
   * Supports:
   * - Text search (case-insensitive, partial match)
   * - Date range filtering
   * - Pagination
   */
  @Get(':id/messages/search')
  async searchMessages(
    @Param('id') id: string,
    @Query() searchDto: SearchMessagesDto,
  ) {
    return this.chatsService.searchMessages(id, searchDto);
  }

  /**
   * Find the first message on or after a specific date
   * Used for "jump to date" functionality in message search
   * GET /chats/:id/messages/by-date?date=2024-01-15
   */
  @Get(':id/messages/by-date')
  async findMessageByDate(
    @Param('id') chatId: string,
    @Query('date') dateString: string,
  ) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format. Use ISO format (e.g., 2024-01-15)');
    }
    return this.chatsService.findMessageByDate(chatId, date);
  }

  /**
   * Get message position within a chat
   * Used for scroll-to-message functionality
   * GET /chats/:id/messages/:messageId/position
   */
  @Get(':id/messages/:messageId/position')
  async getMessagePosition(
    @Param('id') chatId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.chatsService.getMessagePosition(chatId, messageId);
  }

  /**
   * Repair chats with NULL teamId (admin operation)
   * POST /chats/repair-team-ids
   * This is a one-time fix for historical data from before the teamId fix
   */
  @Post('repair-team-ids')
  async repairChatTeamIds() {
    return this.chatsService.repairChatTeamIds();
  }
}
