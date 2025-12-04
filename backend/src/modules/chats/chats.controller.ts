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

  @Get(':id/messages')
  async getMessages(
    @Param('id') id: string,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 50,
  ) {
    return this.chatsService.getMessages(id, skip, take);
  }
}
