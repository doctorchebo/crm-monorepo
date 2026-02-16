import {
  BadRequestException,
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
import { ProfilePictureUrlService } from '@shared/services/profile-picture-url.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { ChatsService } from '../chats/chats.service';
import { TeamService } from '../team/team.service';
import {
  DeleteMessageDto,
  EditMessageDto,
} from './dto/message-edit-delete.dto';
import { SaveNoteDto } from './dto/notes.dto';
import { OutboundMessageDto } from './dto/outbound-message.dto';
import { SendLocationDto } from './dto/send-location.dto';
import { SendTemplateDto } from './dto/send-template.dto';
import { ConversationWindowService } from './services/conversation-window.service';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private whatsAppService: WhatsAppService,
    private chatsService: ChatsService,
    private conversationWindowService: ConversationWindowService,
    private teamService: TeamService,
    private profilePictureUrlService: ProfilePictureUrlService,
  ) {}

  // ... (previous methods omitted)

  /**
   * Get all chats (conversations)
   * GET /whatsapp/chats
   */
  @Get('chats')
  async getChats(
    @Req() req: any,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 20,
    @Query('teamId') teamId?: number,
  ) {
    const userId = req.user?.userId;

    // Resolve team ID if not provided
    let resolvedTeamId = teamId;
    if (!resolvedTeamId) {
      const teams = await this.teamService.getUserTeams(userId);
      if (teams.length > 0) {
        resolvedTeamId = teams[0].id;
      }
    }

    this.logger.log(
      `Get chats request from user ${userId} for team ${resolvedTeamId || 'none'}`,
    );

    if (!resolvedTeamId) {
      return [];
    }

    // Use unified ChatsService logic which includes robust visibility checks
    const chats = await this.chatsService.findByTeam(
      userId,
      resolvedTeamId.toString(),
      skip,
      take,
    );

    // Generate presigned URLs for assignee profile pictures
    return this.profilePictureUrlService.transformArrayWithUrls(
      chats,
      'assigneeProfilePictureKey',
      'assigneeProfilePictureUrl',
    );
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

  /**
   * Send a text/media message
   * POST /whatsapp/send
   *
   * Sends a free-form message (text, media, or attachments) via the Meta
   * Cloud API.  Subject to the 24-hour conversation window — if the window
   * is closed, use send-template instead.
   */
  @Post('send')
  async sendMessage(@Body() dto: OutboundMessageDto, @Req() req: any) {
    const userId = req.user?.userId;
    this.logger.log(
      `Send message to ${dto.to} from sender ${dto.senderId || 'default'}, user ${userId}`,
    );
    return this.whatsAppService.sendMessage(dto, userId);
  }

  /**
   * Send a location message
   * POST /whatsapp/send-location
   *
   * Sends a location message with coordinates and optional name/address.
   * Subject to 24-hour conversation window rules.
   *
   * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/location-messages
   */
  @Post('send-location')
  async sendLocation(@Body() dto: SendLocationDto, @Req() req: any) {
    const userId = req.user?.userId;
    this.logger.log(
      `Send location to ${dto.to} from sender ${dto.senderId}, user ${userId}`,
    );

    // Require senderId - no default fallback for location messages
    if (!dto.senderId) {
      throw new BadRequestException(
        'senderId is required for location messages',
      );
    }

    return this.whatsAppService.sendLocation(
      dto.senderId,
      dto.to,
      dto.latitude,
      dto.longitude,
      dto.name,
      dto.address,
      dto.replyToMessageId,
      userId,
    );
  }

  /**
   * Send a template message
   * POST /whatsapp/send-template
   *
   * Sends a proper WhatsApp template message (`type: 'template'`) via the
   * Meta Cloud API. Unlike free-form text messages, approved template messages
   * can bypass the 24-hour conversation window.
   *
   * This endpoint is used by the chat page when a user selects a template,
   * fills in variable values via the variable mapping modal, and clicks send.
   *
   * Required fields: to, senderId, templateId, locale, variables
   */
  @Post('send-template')
  async sendTemplate(@Body() dto: SendTemplateDto, @Req() req: any) {
    const userId = req.user?.userId;
    this.logger.log(
      `Send template "${dto.templateId}" (locale: ${dto.locale}) to ${dto.to} from sender ${dto.senderId}, user ${userId}`,
    );

    return this.whatsAppService.sendTemplateMessage(dto, userId);
  }
}
