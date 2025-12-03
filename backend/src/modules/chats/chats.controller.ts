import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
  async create(@Body() createChatDto: CreateChatDto) {
    // TODO: Get teamId from request context
    return this.chatsService.create('teamId', createChatDto);
  }

  @Get()
  async findByTeam(
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 20,
  ) {
    // TODO: Get teamId from request context
    return this.chatsService.findByTeam('teamId', skip, take);
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
