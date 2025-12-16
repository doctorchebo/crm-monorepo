import { db } from '@database/db.connection';
import {
  chats,
  messages,
  NewNote,
  notes as notesTable,
  senders,
  users,
} from '@database/schema';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { CreateNoteDto } from './dto/create-note.dto';
import { ChatNotesResponseDto, NoteResponseDto } from './dto/note-response.dto';
import { NotesGateway } from './notes.gateway';

/**
 * Notes Service
 * Manages notes attached to messages or chats
 * Supports real-time updates via WebSocket
 */
@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(private readonly notesGateway: NotesGateway) {}

  /**
   * Validate that the sender belongs to the user
   * This ensures users can only create notes for chats they have access to
   */
  private async validateUserAccessToChat(
    userId: number,
    chatId: string,
  ): Promise<void> {
    // Get the chat
    const chat = await db.query.chats.findFirst({
      where: eq(chats.chatId, chatId),
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    // For now, we check if the user has any sender with this business phone
    // This is a simplified permission check
    // In the future, this will use team-based permissions
    const senderCount = await db
      .select()
      .from(senders)
      .where(
        and(
          eq(senders.userId, userId),
          eq(senders.phoneNumber, chat.businessPhone),
        ),
      );

    if (senderCount.length === 0) {
      throw new BadRequestException('User does not have access to this chat');
    }
  }

  /**
   * Add a note to a message or chat
   * @param createNoteDto - The note data
   * @returns The created note with user information
   */
  async createNote(createNoteDto: CreateNoteDto): Promise<NoteResponseDto> {
    try {
      // Validate that either messageId or chatId is provided, not both
      if (!createNoteDto.messageId && !createNoteDto.chatId) {
        throw new BadRequestException(
          'Either messageId or chatId must be provided',
        );
      }

      if (createNoteDto.messageId && createNoteDto.chatId) {
        throw new BadRequestException(
          'Cannot attach note to both message and chat',
        );
      }

      // If messageId is provided, validate it exists
      if (createNoteDto.messageId) {
        const message = await db.query.messages.findFirst({
          where: eq(messages.messageId, createNoteDto.messageId),
        });

        if (!message) {
          throw new NotFoundException(
            `Message ${createNoteDto.messageId} not found`,
          );
        }

        // Validate user access to this chat (through the message's chat)
        await this.validateUserAccessToChat(
          createNoteDto.userId,
          message.chatId,
        );
      }

      // If chatId is provided, validate user has access
      if (createNoteDto.chatId) {
        await this.validateUserAccessToChat(
          createNoteDto.userId,
          createNoteDto.chatId,
        );
      }

      // Create the note
      const newNote: NewNote = {
        messageId: createNoteDto.messageId || null,
        chatId: createNoteDto.chatId || null,
        userId: createNoteDto.userId,
        note: createNoteDto.note,
      };

      const result = await db.insert(notesTable).values(newNote).returning();

      const createdNote = result[0];

      // Fetch user information
      const user = await db.query.users.findFirst({
        where: eq(users.id, createdNote.userId),
      });

      this.logger.log(
        `Note created: ${createdNote.id} by user ${createdNote.userId}`,
      );

      const response: NoteResponseDto = {
        id: createdNote.id,
        messageId: createdNote.messageId || undefined,
        chatId: createdNote.chatId || undefined,
        userId: createdNote.userId,
        note: createdNote.note,
        createdAt: createdNote.createdAt,
        user: user
          ? {
              id: user.id,
              name: user.name,
              email: user.email,
            }
          : undefined,
      };

      // Emit WebSocket event for real-time updates
      const targetChatId = createdNote.chatId;
      if (targetChatId) {
        try {
          this.notesGateway.emitNoteCreated(targetChatId, response);
        } catch (wsError) {
          this.logger.warn(
            `Failed to emit WebSocket event: ${wsError.message}`,
          );
        }
      }

      return response;
    } catch (error) {
      this.logger.error(`Error creating note: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get all notes for a chat (both general and message-level)
   * @param chatId - The chat ID
   * @returns Notes grouped by type
   */
  async getChatNotes(chatId: string): Promise<ChatNotesResponseDto> {
    try {
      // Validate chat exists
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      if (!chat) {
        throw new NotFoundException(`Chat ${chatId} not found`);
      }

      // Get all general notes for this chat
      const generalNotes = await db.query.notes.findMany({
        where: and(eq(notesTable.chatId, chatId), isNull(notesTable.messageId)),
      });

      // Get all messages in this chat
      const chatMessages = await db.query.messages.findMany({
        where: eq(messages.chatId, chatId),
      });

      // Get message IDs
      const messageIds = chatMessages.map((m) => m.messageId);

      // Get all notes attached to messages in this chat
      const messageNotes =
        messageIds.length > 0
          ? await db.query.notes.findMany({
              where: (notesTable: any) =>
                messageIds.includes(notesTable.messageId),
            })
          : [];

      // Fetch all users for these notes
      const allNoteUserIds = [...generalNotes, ...messageNotes].map(
        (n) => n.userId,
      );
      const uniqueUserIds = Array.from(new Set(allNoteUserIds));

      const usersMap = new Map();
      for (const userId of uniqueUserIds) {
        const user = await db.query.users.findFirst({
          where: eq(users.id, userId),
        });
        if (user) {
          usersMap.set(userId, {
            id: user.id,
            name: user.name,
            email: user.email,
          });
        }
      }

      // Format general notes
      const formattedGeneralNotes: NoteResponseDto[] = generalNotes.map(
        (note) => ({
          id: note.id,
          messageId: note.messageId || undefined,
          chatId: note.chatId || undefined,
          userId: note.userId,
          note: note.note,
          createdAt: note.createdAt,
          user: usersMap.get(note.userId),
        }),
      );

      // Format message notes grouped by messageId
      const formattedMessageNotesMap = new Map<string, NoteResponseDto[]>();
      for (const note of messageNotes) {
        const formatted: NoteResponseDto = {
          id: note.id,
          messageId: note.messageId || undefined,
          chatId: note.chatId || undefined,
          userId: note.userId,
          note: note.note,
          createdAt: note.createdAt,
          user: usersMap.get(note.userId),
        };

        if (!formattedMessageNotesMap.has(note.messageId)) {
          formattedMessageNotesMap.set(note.messageId, []);
        }
        const notesList = formattedMessageNotesMap.get(note.messageId);
        if (notesList) {
          notesList.push(formatted);
        }
      }

      // Convert Map to plain object for JSON serialization
      const formattedMessageNotes: Record<string, NoteResponseDto[]> = {};
      for (const [messageId, notes] of formattedMessageNotesMap) {
        formattedMessageNotes[messageId] = notes;
      }

      this.logger.debug(
        `Retrieved notes for chat ${chatId}: ${formattedGeneralNotes.length} general, ${messageNotes.length} message notes`,
      );

      return {
        chatId,
        generalNotes: formattedGeneralNotes,
        messageNotes: formattedMessageNotes,
      };
    } catch (error) {
      this.logger.error(`Error retrieving chat notes: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get notes for a specific message
   * @param messageId - The message ID
   * @returns Array of notes
   */
  async getMessageNotes(messageId: string): Promise<NoteResponseDto[]> {
    try {
      // Validate message exists
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        throw new NotFoundException(`Message ${messageId} not found`);
      }

      const notesList = await db.query.notes.findMany({
        where: eq(notesTable.messageId, messageId),
      });

      // Fetch user info for each note
      const formattedNotes: NoteResponseDto[] = [];
      for (const note of notesList) {
        const user = await db.query.users.findFirst({
          where: eq(users.id, note.userId),
        });

        formattedNotes.push({
          id: note.id,
          messageId: note.messageId || undefined,
          chatId: note.chatId || undefined,
          userId: note.userId,
          note: note.note,
          createdAt: note.createdAt,
          user: user
            ? {
                id: user.id,
                name: user.name,
                email: user.email,
              }
            : undefined,
        });
      }

      return formattedNotes;
    } catch (error) {
      this.logger.error(
        `Error retrieving message notes: ${error.message}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Delete a note (with permission check)
   * @param noteId - The note ID
   * @param userId - The user requesting deletion
   */
  async deleteNote(noteId: number, userId: number): Promise<void> {
    try {
      const note = await db.query.notes.findFirst({
        where: eq(notesTable.id, noteId),
      });

      if (!note) {
        throw new NotFoundException(`Note ${noteId} not found`);
      }

      // Only the note creator can delete it
      if (note.userId !== userId) {
        throw new BadRequestException('You can only delete notes you created');
      }

      await db.delete(notesTable).where(eq(notesTable.id, noteId));

      this.logger.log(`Note ${noteId} deleted by user ${userId}`);

      // Emit WebSocket event for real-time updates
      if (note.chatId) {
        try {
          this.notesGateway.emitNoteDeleted(note.chatId, noteId);
        } catch (wsError) {
          this.logger.warn(
            `Failed to emit WebSocket event: ${wsError.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error deleting note: ${error.message}`, error);
      throw error;
    }
  }
}
