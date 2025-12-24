/**
 * DTO for note response with user information
 */
export class NoteResponseDto {
  id: number;
  messageId?: string;
  chatId?: string;
  userId: number;
  note: string;
  createdAt: Date | null;
  user?: {
    id: number;
    name: string;
    email: string;
  };
}

/**
 * DTO for notes grouped by chat
 */
export class ChatNotesResponseDto {
  chatId: string;
  generalNotes: NoteResponseDto[];
  messageNotes: Record<string, NoteResponseDto[]>;
}
