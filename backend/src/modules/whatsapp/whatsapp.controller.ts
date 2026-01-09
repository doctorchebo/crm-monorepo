import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import {
  DeleteMessageDto,
  EditMessageDto,
} from './dto/message-edit-delete.dto';
import { SaveNoteDto } from './dto/notes.dto';
import { OutboundMessageDto } from './dto/outbound-message.dto';
import { SendContactsDto } from './dto/send-contacts.dto';
import { ConversationWindowService } from './services/conversation-window.service';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private whatsAppService: WhatsAppService,
    private conversationWindowService: ConversationWindowService,
  ) {}

  /**
   * Send a WhatsApp message
   * POST /whatsapp/send
   */
  @Post('send')
  async sendMessage(@Body() messageDto: OutboundMessageDto, @Req() req: any) {
    const userId = req.user?.userId;
    this.logger.log(
      `Send message request from user ${userId}: To ${messageDto.to}`,
    );
    return this.whatsAppService.sendMessage(messageDto, userId);
  }

  /**
   * Send a WhatsApp media message (image, video, audio, document)
   * POST /whatsapp/send-media
   */
  @Post('send-media')
  async sendMedia(@Body() mediaDto: any, @Req() req: any) {
    const userId = req.user?.userId;
    this.logger.log(
      `Send media request from user ${userId}: To ${mediaDto.to}, Type: ${mediaDto.mediaType}, originalMessageId: ${mediaDto.originalMessageId}, attachmentId: ${mediaDto.attachmentId}`,
    );
    return this.whatsAppService.sendMedia(
      mediaDto.to,
      mediaDto.mediaType,
      mediaDto.mediaUrl,
      mediaDto.caption,
      mediaDto.senderId,
      mediaDto.fileName,
      mediaDto.originalMessageId,
      mediaDto.attachmentId,
    );
  }

  /**
   * Send contacts via WhatsApp
   * POST /whatsapp/send-contacts
   */
  @Post('send-contacts')
  async sendContacts(@Body() dto: SendContactsDto, @Req() req: any) {
    const userId = req.user?.userId;
    this.logger.log(
      `Send contacts request from user ${userId}: To ${dto.to}, Count: ${dto.contacts.length}`,
    );
    return this.whatsAppService.sendContacts(
      dto.to,
      dto.contacts,
      dto.senderId,
    );
  }

  /**
   * Get message status
   * GET /whatsapp/status/:messageSid
   */
  @Get('status/:messageSid')
  async getMessageStatus(@Param('messageSid') messageSid: string) {
    //this.logger.log(`Get message status: ${messageSid}`);
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
    @Req() req: any,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 20,
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
    @Query('skip') skip: string = '0',
    @Query('take') take: string = '50',
  ) {
    this.logger.log(`Get messages for chat: ${chatId}`);
    // Parse query params as integers (they come as strings from URL)
    const skipNum = parseInt(skip, 10) || 0;
    const takeNum = parseInt(take, 10) || 50;
    return this.whatsAppService.getChatMessages(chatId, skipNum, takeNum);
  }

  /**
   * Get newer messages for a specific chat (messages after a given timestamp)
   * Used for bidirectional infinite scroll when viewing pinned message context
   * GET /whatsapp/chats/:chatId/messages/newer
   */
  @Get('chats/:chatId/messages/newer')
  async getNewerMessages(
    @Param('chatId') chatId: string,
    @Query('afterTimestamp') afterTimestamp: string,
    @Query('take') take: string = '50',
  ) {
    this.logger.log(
      `Get newer messages for chat: ${chatId}, after: ${afterTimestamp}`,
    );
    const takeNum = parseInt(take, 10) || 50;
    return this.whatsAppService.getNewerMessages(
      chatId,
      afterTimestamp,
      takeNum,
    );
  }

  /**
   * Save a note to a message
   * POST /whatsapp/notes
   */
  @Post('notes')
  async saveNote(@Body() noteDto: SaveNoteDto, @Req() req: any) {
    const userId = req.user?.userId;
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

  /**
   * Edit a message (within 15 minutes of sending)
   * PUT /whatsapp/messages/:messageId/edit
   */
  @Put('messages/:messageId/edit')
  async editMessage(
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
    @Req() req: any,
  ) {
    const userId = req.user?.userId;
    this.logger.log(`Edit message ${messageId} request from user ${userId}`);
    // Phone number ID will be determined from the message's sender in the service
    return this.whatsAppService.editMessage(messageId, dto.text, '');
  }

  /**
   * Delete a message (soft delete with placeholder)
   * DELETE /whatsapp/messages/:messageId
   */
  @Delete('messages/:messageId')
  async deleteMessage(
    @Param('messageId') messageId: string,
    @Body() dto: DeleteMessageDto,
    @Req() req: any,
  ) {
    const userId = req.user?.userId;
    this.logger.log(`Delete message ${messageId} request from user ${userId}`);
    // Phone number ID will be determined from the message's sender in the service
    return this.whatsAppService.deleteMessage(messageId, '');
  }

  /**
   * Get conversation window status for a chat
   * GET /whatsapp/chats/:chatId/window-status
   *
   * Returns the 24-hour conversation window status to determine
   * what types of messages can be sent to this chat.
   */
  @Get('chats/:chatId/window-status')
  async getConversationWindowStatus(@Param('chatId') chatId: string) {
    this.logger.log(`Get conversation window status for chat ${chatId}`);
    return this.conversationWindowService.getWindowStatus(chatId);
  }

  /**
   * Validate if a message can be sent to a chat
   * POST /whatsapp/chats/:chatId/validate-send
   *
   * Validates whether a free-form message or template can be sent
   * based on the 24-hour conversation window rules.
   */
  @Post('chats/:chatId/validate-send')
  async validateSend(
    @Param('chatId') chatId: string,
    @Body()
    body: {
      messageType: 'free-form' | 'template';
      isTemplateApproved?: boolean;
    },
  ) {
    this.logger.log(
      `Validate send for chat ${chatId}, type: ${body.messageType}`,
    );

    if (body.messageType === 'template') {
      return this.conversationWindowService.validateTemplateMessage(
        chatId,
        body.isTemplateApproved ?? false,
      );
    }

    return this.conversationWindowService.validateFreeFormMessage(chatId);
  }
}
