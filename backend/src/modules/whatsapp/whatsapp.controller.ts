import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { SaveNoteDto } from './dto/notes.dto';
import { OutboundMessageDto } from './dto/outbound-message.dto';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private whatsAppService: WhatsAppService) {}

  /**
   * Send a WhatsApp message
   * POST /whatsapp/send
   */
  @Post('send')
  @UseGuards(JwtAuthGuard)
  async sendMessage(@Body() messageDto: OutboundMessageDto, @Req() req: any) {
    this.logger.log(
      `Send message request from user ${req.user?.id}: To ${messageDto.to}`,
    );
    return this.whatsAppService.sendMessage(messageDto);
  }

  /**
   * Get message status
   * GET /whatsapp/status/:messageSid
   */
  @Get('status/:messageSid')
  @UseGuards(JwtAuthGuard)
  async getMessageStatus(@Param('messageSid') messageSid: string) {
    this.logger.log(`Get message status: ${messageSid}`);
    return this.whatsAppService.getMessageStatus(messageSid);
  }

  /**
   * Get all messages (with optional filters)
   * GET /whatsapp/messages
   */
  @Get('messages')
  @UseGuards(JwtAuthGuard)
  async getMessages(@Req() req: any) {
    this.logger.log(`Get messages request from user ${req.user?.id}`);
    return this.whatsAppService.getMessages();
  }

  /**
   * Save a note to a message
   * POST /whatsapp/notes
   */
  @Post('notes')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async getMessageNotes(@Param('messageId') messageId: string) {
    this.logger.log(`Get notes for message ${messageId}`);
    return this.whatsAppService.getMessageNotes(messageId);
  }
}
