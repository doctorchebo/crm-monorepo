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
import { CreateReactionDto } from './dto/reaction.dto';
import { ReactionsService } from './reactions.service';

/**
 * Reactions Controller
 * Handles HTTP endpoints for message reactions
 */
@Controller('reactions')
@UseGuards(JwtAuthGuard)
export class ReactionsController {
  constructor(private readonly reactionsService: ReactionsService) {}

  /**
   * Add or update a reaction to a message
   * POST /reactions
   * Body: { messageId: string, emoji: string }
   */
  @Post()
  async addReaction(@Req() req: any, @Body() dto: CreateReactionDto) {
    const userId = req.user.userId;
    return this.reactionsService.addReaction(userId, dto);
  }

  /**
   * Remove a reaction from a message
   * DELETE /reactions/:messageId
   */
  @Delete(':messageId')
  async removeReaction(@Req() req: any, @Param('messageId') messageId: string) {
    const userId = req.user.userId;
    await this.reactionsService.removeReaction(userId, messageId);
    return { success: true };
  }

  /**
   * Get all reactions for a single message
   * GET /reactions/:messageId
   */
  @Get(':messageId')
  async getReactionsForMessage(@Param('messageId') messageId: string) {
    return this.reactionsService.getReactionsForMessage(messageId);
  }

  /**
   * Get reactions for multiple messages (batch)
   * GET /reactions/batch?messageIds=id1,id2,id3
   */
  @Get('batch/messages')
  async getReactionsForMessages(@Query('messageIds') messageIds: string) {
    const ids = messageIds.split(',').filter(Boolean);
    return this.reactionsService.getReactionsForMessages(ids);
  }

  /**
   * Get current user's reaction on a message
   * GET /reactions/:messageId/mine
   */
  @Get(':messageId/mine')
  async getUserReaction(
    @Req() req: any,
    @Param('messageId') messageId: string,
  ) {
    const userId = req.user.userId;
    return this.reactionsService.getUserReaction(userId, messageId);
  }

  /**
   * Get customer reactions for a chat
   * GET /reactions/customer/:chatId
   */
  @Get('customer/:chatId')
  async getCustomerReactionsForChat(@Param('chatId') chatId: string) {
    return this.reactionsService.getCustomerReactionsForChat(chatId);
  }

  /**
   * Get customer reactions for multiple messages (batch)
   * GET /reactions/customer/batch?messageIds=id1,id2,id3
   */
  @Get('customer/batch/messages')
  async getCustomerReactionsForMessages(
    @Query('messageIds') messageIds: string,
  ) {
    const ids = messageIds.split(',').filter(Boolean);
    return this.reactionsService.getCustomerReactionsForMessages(ids);
  }
}
