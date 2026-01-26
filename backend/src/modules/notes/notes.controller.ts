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
import { CreateNoteDto } from './dto/create-note.dto';
import { NotesService } from './notes.service';

@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  /**
   * Create a new note
   * POST /notes
   * Body: { messageId?: string, chatId?: string, note: string, userId: number }
   */
  @Post()
  async createNote(@Req() req: any, @Body() createNoteDto: CreateNoteDto) {
    // Ensure userId comes from authenticated user
    createNoteDto.userId = req.user.userId;
    return this.notesService.createNote(createNoteDto);
  }

  /**
   * Get paginated notes for a chat (general notes only, message notes are separate)
   * GET /notes/chat/:chatId/paginated
   * Query params:
   *   - limit: number of notes to fetch (default 20)
   *   - cursor: note ID to fetch before (for older notes) or after (for newer notes)
   *   - direction: 'before' (older) or 'after' (newer), default 'before'
   *   - aroundId: fetch notes around a specific note ID (for search result navigation)
   */
  @Get('chat/:chatId/paginated')
  async getChatNotesPaginated(
    @Param('chatId') chatId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('direction') direction?: 'before' | 'after',
    @Query('aroundId') aroundId?: string,
  ) {
    return this.notesService.getChatNotesPaginated(chatId, {
      limit: limit ? parseInt(limit) : 20,
      cursor: cursor ? parseInt(cursor) : undefined,
      direction: direction || 'before',
      aroundId: aroundId ? parseInt(aroundId) : undefined,
    });
  }

  /**
   * Search notes in a chat
   * GET /notes/chat/:chatId/search
   * Query params:
   *   - q: search query (searches note content and user name)
   *   - limit: max results (default 50)
   */
  @Get('chat/:chatId/search')
  async searchChatNotes(
    @Param('chatId') chatId: string,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    return this.notesService.searchChatNotes(chatId, query, {
      limit: limit ? parseInt(limit) : 50,
    });
  }

  /**
   * Get all notes for a chat (both general and message-level)
   * GET /notes/chat/:chatId
   * @deprecated Use /notes/chat/:chatId/paginated for better performance
   */
  @Get('chat/:chatId')
  async getChatNotes(@Param('chatId') chatId: string) {
    return this.notesService.getChatNotes(chatId);
  }

  /**
   * Get notes for a specific message
   * GET /notes/message/:messageId
   */
  @Get('message/:messageId')
  async getMessageNotes(@Param('messageId') messageId: string) {
    return this.notesService.getMessageNotes(messageId);
  }

  /**
   * Delete a note
   * DELETE /notes/:id
   */
  @Delete(':id')
  async deleteNote(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.userId;
    return this.notesService.deleteNote(parseInt(id), userId);
  }
}
