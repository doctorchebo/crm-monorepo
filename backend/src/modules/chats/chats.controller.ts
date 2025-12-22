import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { ChatsService } from './chats.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { SearchChatsDto } from './dto/search-chats.dto';
import { SearchMessagesDto } from './dto/search-messages.dto';
import { UpdateChatDto } from './dto/update-chat.dto';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private chatsService: ChatsService) {}

  @Post()
  async create(@Req() req: any, @Body() createChatDto: CreateChatDto) {
    const userId = req.user.userId;
    // TODO: Get teamId from request context
    return this.chatsService.create(userId, 'teamId', createChatDto);
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
  ) {
    const userId = req.user.userId;
    // TODO: Get teamId from request context
    return this.chatsService.findByTeam(userId, 'teamId', skip, take);
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
}
