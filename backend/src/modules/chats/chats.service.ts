import { Chat } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { CreateChatDto } from './dto/create-chat.dto';
import { SearchChatsDto, SearchChatsResponse } from './dto/search-chats.dto';
import {
  SearchMessagesDto,
  SearchMessagesResponse,
} from './dto/search-messages.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import {
  ChatsArchiveService,
  ChatsCleanupService,
  ChatsCrudService,
  ChatsMessagesService,
} from './services';

// Re-export for backward compatibility
export { CHAT_UPDATE_GATEWAY } from './services';

/**
 * Chats Service (Facade)
 * Provides a unified API by delegating to specialized sub-services
 */
@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  constructor(
    private readonly crudService: ChatsCrudService,
    private readonly archiveService: ChatsArchiveService,
    private readonly messagesService: ChatsMessagesService,
    private readonly cleanupService: ChatsCleanupService,
  ) {}

  // ========== CRUD Operations ==========

  generateChatId(businessPhone: string, participantPhone: string): string {
    return this.crudService.generateChatId(businessPhone, participantPhone);
  }

  async createOrGetChatWithContact(
    userId: number,
    businessPhone: string,
    participantPhone: string,
    participantName?: string,
    senderId?: number,
  ): Promise<Chat> {
    return this.crudService.createOrGetChatWithContact(
      userId,
      businessPhone,
      participantPhone,
      participantName,
      senderId,
    );
  }

  async create(userId: number, teamId: string, createChatDto: CreateChatDto) {
    return this.crudService.create(userId, teamId, createChatDto);
  }

  async findOne(chatId: string): Promise<Chat> {
    return this.crudService.findOne(chatId);
  }

  async findByTeam(
    userId: number,
    teamId: string,
    skip: number = 0,
    take: number = 20,
  ) {
    return this.crudService.findByTeam(userId, teamId, skip, take);
  }

  async update(chatId: string, updateChatDto: UpdateChatDto) {
    return this.crudService.update(chatId, updateChatDto);
  }

  async close(chatId: string) {
    return this.crudService.close(chatId);
  }

  async assignChat(
    chatId: string,
    assignerId: number,
    assigneeId: number | null,
  ) {
    return this.crudService.assignChat(chatId, assignerId, assigneeId);
  }

  // ========== Archive Operations ==========

  async archiveChat(chatId: string): Promise<Chat> {
    return this.archiveService.archiveChat(chatId);
  }

  async unarchiveChat(chatId: string): Promise<Chat> {
    return this.archiveService.unarchiveChat(chatId);
  }

  async getArchivedChats(
    userId: number,
    skip: number = 0,
    take: number = 20,
  ): Promise<{ chats: Chat[]; total: number }> {
    return this.archiveService.getArchivedChats(userId, skip, take);
  }

  async autoUnarchiveOnMessage(chatId: string): Promise<void> {
    return this.archiveService.autoUnarchiveOnMessage(chatId);
  }

  // ========== Message Operations ==========

  async addMessage(chatId: string, message: any) {
    return this.messagesService.addMessage(chatId, message);
  }

  async getMessages(chatId: string, skip: number = 0, take: number = 50) {
    return this.messagesService.getMessages(chatId, skip, take);
  }

  async searchMessages(
    chatId: string,
    searchDto: SearchMessagesDto,
  ): Promise<SearchMessagesResponse> {
    return this.messagesService.searchMessages(chatId, searchDto);
  }

  async getMessagePosition(
    chatId: string,
    messageId: string,
  ): Promise<{
    found: boolean;
    position: number;
    message: any;
    surroundingMessages: any[];
    totalCount: number;
  }> {
    return this.messagesService.getMessagePosition(chatId, messageId);
  }

  async findMessageByDate(
    chatId: string,
    targetDate: Date,
  ): Promise<{
    found: boolean;
    messageId: string | null;
    message: any | null;
    position: number;
    totalCount: number;
  }> {
    return this.messagesService.findMessageByDate(chatId, targetDate);
  }

  // ========== Cleanup & Unread Operations ==========

  async deleteChat(chatId: string, userId: number): Promise<void> {
    return this.cleanupService.deleteChat(chatId, userId);
  }

  async incrementUnreadCount(chatId: string): Promise<Chat> {
    return this.cleanupService.incrementUnreadCount(chatId);
  }

  async resetUnreadCount(chatId: string): Promise<Chat> {
    return this.cleanupService.resetUnreadCount(chatId);
  }

  async getTotalUnreadCount(userId: number): Promise<number> {
    return this.cleanupService.getTotalUnreadCount(userId);
  }

  async searchChats(
    userId: number,
    searchDto: SearchChatsDto,
  ): Promise<SearchChatsResponse> {
    return this.cleanupService.searchChats(userId, searchDto);
  }
}
