import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CreatePinDto } from './dto/pin.dto';
import { PinsService } from './pins.service';

/**
 * Pins Controller
 * Handles HTTP endpoints for pinned messages
 */
@Controller('pins')
@UseGuards(JwtAuthGuard)
export class PinsController {
  constructor(private readonly pinsService: PinsService) {}

  /**
   * Get all pinned messages for a chat
   * GET /pins/:chatId
   */
  @Get(':chatId')
  async getPinnedMessages(@Param('chatId') chatId: string) {
    return this.pinsService.getPinnedMessages(chatId);
  }

  /**
   * Get pin count for a chat
   * GET /pins/:chatId/count
   */
  @Get(':chatId/count')
  async getPinCount(@Param('chatId') chatId: string) {
    return this.pinsService.getPinCount(chatId);
  }

  /**
   * Pin a message
   * POST /pins
   * Body: { messageId: string, chatId: string, duration: PinDuration }
   */
  @Post()
  async pinMessage(@Req() req: any, @Body() dto: CreatePinDto) {
    const userId = req.user.userId;
    return this.pinsService.pinMessage(userId, dto);
  }

  /**
   * Unpin a message
   * DELETE /pins/:chatId/:messageId
   */
  @Delete(':chatId/:messageId')
  async unpinMessage(
    @Req() req: any,
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
  ) {
    const userId = req.user.userId;
    await this.pinsService.unpinMessage(userId, { messageId, chatId });
    return { success: true };
  }

  /**
   * Check if a message is pinned
   * GET /pins/:chatId/check/:messageId
   */
  @Get(':chatId/check/:messageId')
  async isMessagePinned(
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
  ) {
    const isPinned = await this.pinsService.isMessagePinned(messageId, chatId);
    return { isPinned };
  }

  /**
   * Get pinned status for multiple messages (batch)
   * GET /pins/:chatId/batch?messageIds=id1,id2,id3
   */
  @Get(':chatId/batch')
  async getPinnedMessageIds(
    @Param('chatId') chatId: string,
    @Query('messageIds') messageIds: string,
  ) {
    const ids = messageIds.split(',').filter(Boolean);
    const pinnedIds = await this.pinsService.getPinnedMessageIds(chatId, ids);
    return { pinnedMessageIds: pinnedIds };
  }

  /**
   * Get message context for scrolling to a pinned message
   * GET /pins/:chatId/context/:messageId
   */
  @Get(':chatId/context/:messageId')
  async getMessageContext(
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
    @Query('windowSize') windowSize?: string,
  ) {
    return this.pinsService.getMessageContext(
      chatId,
      messageId,
      windowSize ? parseInt(windowSize, 10) : undefined,
    );
  }
}
