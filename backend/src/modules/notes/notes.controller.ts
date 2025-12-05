import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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
   * Get all notes for a chat (both general and message-level)
   * GET /notes/chat/:chatId
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
