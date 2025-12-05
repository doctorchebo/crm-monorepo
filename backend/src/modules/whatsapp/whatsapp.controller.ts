import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { SaveNoteDto } from './dto/notes.dto';
import { OutboundMessageDto } from './dto/outbound-message.dto';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private whatsAppService: WhatsAppService) {}

  /**
   * Send a WhatsApp message
   * POST /whatsapp/send
   */
  @Post('send')
  async sendMessage(@Body() messageDto: OutboundMessageDto, @Req() req: any) {
    this.logger.log(
      `Send message request from user ${req.user?.userId}: To ${messageDto.to}`,
    );
    return this.whatsAppService.sendMessage(messageDto);
  }

  /**
   * Get message status
   * GET /whatsapp/status/:messageSid
   */
  @Get('status/:messageSid')
  async getMessageStatus(@Param('messageSid') messageSid: string) {
    this.logger.log(`Get message status: ${messageSid}`);
    return this.whatsAppService.getMessageStatus(messageSid);
  }

  /**
   * Get all messages (with optional filters)
   * GET /whatsapp/messages
   */
  @Get('messages')
  async getMessages(@Req() req: any) {
    this.logger.log(`Get messages request from user ${req.user?.userId}`);
    return this.whatsAppService.getMessages();
  }

  /**
   * Get all chats (conversations)
   * GET /whatsapp/chats
   */
  @Get('chats')
  async getChats(
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 20,
    @Req() req: any,
  ) {
    const userId = req.user?.userId;
    this.logger.log(`Get chats request from user ${userId}`);
    return this.whatsAppService.getChats(skip, take, userId);
  }

  /**
   * Get messages for a specific chat
   * GET /whatsapp/chats/:chatId/messages
   */
  @Get('chats/:chatId/messages')
  async getChatMessages(
    @Param('chatId') chatId: string,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 50,
  ) {
    this.logger.log(`Get messages for chat: ${chatId}`);
    return this.whatsAppService.getChatMessages(chatId, skip, take);
  }

  /**
   * Save a note to a message
   * POST /whatsapp/notes
   */
  @Post('notes')
  async saveNote(@Body() noteDto: SaveNoteDto, @Req() req: any) {
    const userId = req.user?.id;
    this.logger.log(
      `Save note for message ${noteDto.messageId} from user ${userId}`,
    );
    return this.whatsAppService.saveNote(
      noteDto.messageId,
      userId,
      noteDto.note,
    );
  }

  /**
   * Get all notes for a message
   * GET /whatsapp/notes/:messageId
   */
  @Get('notes/:messageId')
  async getMessageNotes(@Param('messageId') messageId: string) {
    this.logger.log(`Get notes for message ${messageId}`);
    return this.whatsAppService.getMessageNotes(messageId);
  }
}
