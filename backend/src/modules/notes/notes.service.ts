import { db } from '@database/db.connection';
import {
  chats,
  messages,
  NewNote,
  notes as notesTable,
  users,
} from '@database/schema';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gt, ilike, isNull, lt, SQL } from 'drizzle-orm';
import { ChatAccessService } from '../chats/services/chat-access.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { ChatNotesResponseDto, NoteResponseDto } from './dto/note-response.dto';
import { NotesGateway } from './notes.gateway';

/**
 * Pagination options for fetching notes
 */
export interface NotesPaginationOptions {
  limit: number;
  cursor?: number;
  direction: 'before' | 'after';
  aroundId?: number;
}

/**
 * Paginated notes response
 */
export interface PaginatedNotesResponse {
  chatId: string;
  notes: NoteResponseDto[];
  pagination: {
    hasMore: boolean;
    hasPrevious: boolean;
    oldestId: number | null;
    newestId: number | null;
    total?: number;
  };
}

/**
 * Search options for notes
 */
export interface NotesSearchOptions {
  limit: number;
}

/**
 * Search result with match context
 */
export interface NoteSearchResult extends NoteResponseDto {
  matchContext?: string;
}

/**
 * Search response
 */
export interface NotesSearchResponse {
  chatId: string;
  query: string;
  results: NoteSearchResult[];
  total: number;
}

/**
 * Notes Service
 * Manages notes attached to messages or chats
 * Supports real-time updates via WebSocket
 */
@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    private readonly notesGateway: NotesGateway,
    private readonly chatAccessService: ChatAccessService,
  ) {}

  /**
   * Validate that the user has access to the chat
   *
   * Access rules (via ChatAccessService):
   * - Team Owner/Admin: Can access all chats in their team
   * - Team Agent: Can only access chats assigned to them
   * - Non-members: No access
   */
  private async validateUserAccessToChat(
    userId: number,
    chatId: string,
  ): Promise<void> {
    const accessResult = await this.chatAccessService.checkChatAccess(
      userId,
      chatId,
    );

    if (!accessResult.hasAccess) {
      this.logger.debug(
        `Access denied for user ${userId} to chat ${chatId}: ${accessResult.reason}`,
      );
      throw new BadRequestException(
        accessResult.reason || 'User does not have access to this chat',
      );
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
              where: (notesTable, { inArray }) =>
                inArray(notesTable.messageId, messageIds),
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

        if (note.messageId) {
          if (!formattedMessageNotesMap.has(note.messageId)) {
            formattedMessageNotesMap.set(note.messageId, []);
          }
          const notesList = formattedMessageNotesMap.get(note.messageId);
          if (notesList) {
            notesList.push(formatted);
          }
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

  /**
   * Get paginated notes for a chat (general notes only)
   * Supports cursor-based pagination in both directions
   * @param chatId - The chat ID
   * @param options - Pagination options
   * @returns Paginated notes with metadata
   */
  async getChatNotesPaginated(
    chatId: string,
    options: NotesPaginationOptions,
  ): Promise<PaginatedNotesResponse> {
    try {
      // Validate chat exists
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      if (!chat) {
        throw new NotFoundException(`Chat ${chatId} not found`);
      }

      const { limit, cursor, direction, aroundId } = options;

      // Build base conditions: general notes for this chat (chatId set, messageId null)
      const baseConditions: SQL[] = [
        eq(notesTable.chatId, chatId),
        isNull(notesTable.messageId),
      ];

      let notes: (typeof notesTable.$inferSelect)[] = [];
      let hasMore = false;
      let hasPrevious = false;

      if (aroundId !== undefined) {
        // Fetch notes around a specific note ID (for search result navigation)
        // Get half of the limit before and half after the target note
        const halfLimit = Math.floor(limit / 2);

        // Get notes before (older than) the target, ordered newest first
        const notesBefore = await db.query.notes.findMany({
          where: and(...baseConditions, lt(notesTable.id, aroundId)),
          orderBy: desc(notesTable.id),
          limit: halfLimit,
        });

        // Get the target note itself
        const targetNote = await db.query.notes.findFirst({
          where: and(...baseConditions, eq(notesTable.id, aroundId)),
        });

        // Get notes after (newer than) the target, ordered oldest first
        const notesAfter = await db.query.notes.findMany({
          where: and(...baseConditions, gt(notesTable.id, aroundId)),
          orderBy: asc(notesTable.id),
          limit: halfLimit,
        });

        // Combine: older notes (reversed to chronological) + target + newer notes
        notes = [
          ...notesBefore.reverse(),
          ...(targetNote ? [targetNote] : []),
          ...notesAfter,
        ];

        // Check if there are more notes in either direction
        const [olderCount] = await db
          .select({ count: notesTable.id })
          .from(notesTable)
          .where(
            and(
              ...baseConditions,
              lt(notesTable.id, notes.length > 0 ? notes[0].id : aroundId),
            ),
          )
          .limit(1);

        const [newerCount] = await db
          .select({ count: notesTable.id })
          .from(notesTable)
          .where(
            and(
              ...baseConditions,
              gt(
                notesTable.id,
                notes.length > 0 ? notes[notes.length - 1].id : aroundId,
              ),
            ),
          )
          .limit(1);

        hasPrevious = !!olderCount?.count;
        hasMore = !!newerCount?.count;
      } else if (cursor !== undefined) {
        // Cursor-based pagination
        if (direction === 'before') {
          // Fetch older notes (smaller IDs)
          notes = await db.query.notes.findMany({
            where: and(...baseConditions, lt(notesTable.id, cursor)),
            orderBy: desc(notesTable.id),
            limit: limit + 1, // Fetch one extra to check if there are more
          });

          hasMore = notes.length > limit;
          if (hasMore) {
            notes = notes.slice(0, limit);
          }

          // Check if there are newer notes
          const [newerCheck] = await db
            .select({ count: notesTable.id })
            .from(notesTable)
            .where(and(...baseConditions, gt(notesTable.id, cursor)))
            .limit(1);
          hasPrevious = false; // In this context, 'previous' means older, which is what we're fetching
          hasMore = notes.length > limit;

          // Reverse to get chronological order (oldest first)
          notes = notes.reverse();

          // Actually, hasPrevious should indicate if there are even older notes
          // and hasMore should indicate if there are newer notes
          // Let me fix the logic:
          hasPrevious = hasMore; // There are older notes
          hasMore = !!newerCheck?.count; // There are newer notes (not really useful here)

          // Wait, let me reconsider. For "load more" scrolling up:
          // - hasMore: are there MORE older notes to load? (scroll up to see more)
          // - hasPrevious: are there newer notes we've already loaded? (scroll down)

          // Actually, for simplicity let's define:
          // - hasMore = there are older notes (smaller IDs) beyond what we returned
          // - hasPrevious = there are newer notes (larger IDs) beyond what we returned
          const hasOlderNotes = notes.length >= limit;
          const hasNewerNotes = !!newerCheck?.count;
          hasMore = hasOlderNotes;
          hasPrevious = hasNewerNotes;

          // Keep chronological order (oldest to newest)
          // notes is already reversed above
        } else {
          // Fetch newer notes (larger IDs)
          notes = await db.query.notes.findMany({
            where: and(...baseConditions, gt(notesTable.id, cursor)),
            orderBy: asc(notesTable.id),
            limit: limit + 1,
          });

          hasMore = notes.length > limit;
          if (hasMore) {
            notes = notes.slice(0, limit);
          }

          // Check if there are older notes
          const [olderCheck] = await db
            .select({ count: notesTable.id })
            .from(notesTable)
            .where(and(...baseConditions, lt(notesTable.id, cursor)))
            .limit(1);

          // hasMore = there are newer notes beyond what we returned
          // hasPrevious = there are older notes beyond what we returned
          hasPrevious = !!olderCheck?.count;
          // hasMore is already set correctly
        }
      } else {
        // No cursor - fetch the most recent notes
        notes = await db.query.notes.findMany({
          where: and(...baseConditions),
          orderBy: desc(notesTable.id),
          limit: limit + 1,
        });

        hasMore = notes.length > limit;
        if (hasMore) {
          notes = notes.slice(0, limit);
        }

        // Reverse to get chronological order
        notes = notes.reverse();

        // No newer notes (we fetched the latest), but there might be older ones
        hasPrevious = hasMore; // hasMore here means there are older notes
        hasMore = false; // No newer notes since we fetched the latest
      }

      // Fetch user information for all notes
      const userIds = [...new Set(notes.map((n) => n.userId))];
      const usersMap = new Map<
        number,
        { id: number; name: string; email: string }
      >();

      for (const userId of userIds) {
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

      // Format the response
      const formattedNotes: NoteResponseDto[] = notes.map((note) => ({
        id: note.id,
        messageId: note.messageId || undefined,
        chatId: note.chatId || undefined,
        userId: note.userId,
        note: note.note,
        createdAt: note.createdAt,
        user: usersMap.get(note.userId),
      }));

      this.logger.debug(
        `Retrieved ${formattedNotes.length} paginated notes for chat ${chatId}`,
      );

      return {
        chatId,
        notes: formattedNotes,
        pagination: {
          hasMore,
          hasPrevious,
          oldestId: formattedNotes.length > 0 ? formattedNotes[0].id : null,
          newestId:
            formattedNotes.length > 0
              ? formattedNotes[formattedNotes.length - 1].id
              : null,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error retrieving paginated notes: ${error.message}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Search notes in a chat
   * Searches note content and user names
   * @param chatId - The chat ID
   * @param query - Search query
   * @param options - Search options
   * @returns Search results with match context
   */
  async searchChatNotes(
    chatId: string,
    query: string,
    options: NotesSearchOptions,
  ): Promise<NotesSearchResponse> {
    try {
      // Validate chat exists
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      if (!chat) {
        throw new NotFoundException(`Chat ${chatId} not found`);
      }

      if (!query || query.trim().length === 0) {
        return {
          chatId,
          query: '',
          results: [],
          total: 0,
        };
      }

      const searchTerm = `%${query.trim()}%`;

      // Base conditions: general notes for this chat
      const baseConditions: SQL[] = [
        eq(notesTable.chatId, chatId),
        isNull(notesTable.messageId),
      ];

      // First, search notes by content
      const notesByContent = await db.query.notes.findMany({
        where: and(...baseConditions, ilike(notesTable.note, searchTerm)),
        orderBy: desc(notesTable.id),
        limit: options.limit,
      });

      // Get all unique user IDs from the chat's notes for name search
      const allChatNotes = await db.query.notes.findMany({
        where: and(...baseConditions),
        columns: { id: true, userId: true },
      });

      const allUserIds = [...new Set(allChatNotes.map((n) => n.userId))];

      // Find users whose names match the query
      const matchingUsers: number[] = [];
      for (const userId of allUserIds) {
        const user = await db.query.users.findFirst({
          where: and(eq(users.id, userId), ilike(users.name, searchTerm)),
        });
        if (user) {
          matchingUsers.push(user.id);
        }
      }

      // Get notes by matching user names (if not already found by content)
      const noteIdsByContent = new Set(notesByContent.map((n) => n.id));
      let notesByUserName: (typeof notesTable.$inferSelect)[] = [];

      if (matchingUsers.length > 0) {
        notesByUserName = await db.query.notes.findMany({
          where: (table, { and, inArray }) =>
            and(...baseConditions, inArray(table.userId, matchingUsers)),
          orderBy: desc(notesTable.id),
          limit: options.limit,
        });
        // Filter out duplicates
        notesByUserName = notesByUserName.filter(
          (n) => !noteIdsByContent.has(n.id),
        );
      }

      // Combine results, prioritizing content matches
      const combinedNotes = [...notesByContent, ...notesByUserName].slice(
        0,
        options.limit,
      );

      // Fetch user information
      const userIds = [...new Set(combinedNotes.map((n) => n.userId))];
      const usersMap = new Map<
        number,
        { id: number; name: string; email: string }
      >();

      for (const userId of userIds) {
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

      // Format results with match context
      const results: NoteSearchResult[] = combinedNotes.map((note) => {
        // Create a snippet of the note content around the match
        const lowerNote = note.note.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const matchIndex = lowerNote.indexOf(lowerQuery);

        let matchContext: string | undefined;
        if (matchIndex !== -1) {
          const start = Math.max(0, matchIndex - 30);
          const end = Math.min(
            note.note.length,
            matchIndex + query.length + 30,
          );
          matchContext =
            (start > 0 ? '...' : '') +
            note.note.slice(start, end) +
            (end < note.note.length ? '...' : '');
        }

        return {
          id: note.id,
          messageId: note.messageId || undefined,
          chatId: note.chatId || undefined,
          userId: note.userId,
          note: note.note,
          createdAt: note.createdAt,
          user: usersMap.get(note.userId),
          matchContext,
        };
      });

      this.logger.debug(
        `Search for "${query}" in chat ${chatId} returned ${results.length} results`,
      );

      return {
        chatId,
        query,
        results,
        total: results.length,
      };
    } catch (error) {
      this.logger.error(`Error searching notes: ${error.message}`, error);
      throw error;
    }
  }
}
