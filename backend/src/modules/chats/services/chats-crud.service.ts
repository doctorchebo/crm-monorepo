import { db } from '@database/db.connection';
import { Chat, chats, contacts, senders, teamMembers } from '@database/schema';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { CreateChatDto } from '../dto/create-chat.dto';
import { UpdateChatDto } from '../dto/update-chat.dto';

import { ChatVisibilityService } from './chat-visibility.service';

/**
 * Chats CRUD Service
 * Handles basic CRUD operations for chats
 */
@Injectable()
export class ChatsCrudService {
  private readonly logger = new Logger(ChatsCrudService.name);

  constructor(private readonly chatVisibilityService: ChatVisibilityService) {}

  /**
   * Generate a unique chat ID from business phone and participant phone
   * Uses sorted order to ensure the same ID regardless of direction
   */
  generateChatId(businessPhone: string, participantPhone: string): string {
    const cleanBusinessPhone = businessPhone.replace(/\+/g, '');
    const cleanParticipantPhone = participantPhone.replace(/\+/g, '');
    const sorted = [cleanBusinessPhone, cleanParticipantPhone].sort();
    return `chat_${sorted.join('_')}`;
  }

  /**
   * Validate that sender belongs to authenticated user
   */
  async validateSenderBelongsToUser(
    userId: number,
    senderId: number,
  ): Promise<void> {
    const sender = await db.query.senders.findFirst({
      where: and(eq(senders.id, senderId), eq(senders.userId, userId)),
    });

    if (!sender) {
      throw new BadRequestException(
        'Sender not found or does not belong to this user',
      );
    }
  }

  /**
   * Find contact by phone number and return their name if found
   */
  async getContactNameByPhone(
    participantPhone: string,
  ): Promise<string | null> {
    try {
      const normalizedPhone = participantPhone.replace(/^\+/, '');
      const phoneWithPlus = `+${normalizedPhone}`;

      const contact = await db.query.contacts.findFirst({
        where: and(
          or(
            eq(contacts.phoneNumber, participantPhone),
            eq(contacts.phoneNumber, normalizedPhone),
            eq(contacts.phoneNumber, phoneWithPlus),
          ),
          eq(contacts.isActive, true),
        ),
      });

      if (contact) {
        const name = contact.lastName
          ? `${contact.firstName} ${contact.lastName}`
          : contact.firstName;
        return name;
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Error looking up contact for phone ${participantPhone}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Create or get existing chat with a contact
   */
  async createOrGetChatWithContact(
    userId: number,
    businessPhone: string,
    participantPhone: string,
    participantName?: string,
    senderId?: number,
  ): Promise<Chat> {
    try {
      let finalSenderId = senderId;
      if (finalSenderId) {
        await this.validateSenderBelongsToUser(userId, finalSenderId);
      } else {
        const userSenders = await db.query.senders.findFirst({
          where: eq(senders.userId, userId),
        });

        if (!userSenders) {
          throw new Error('No senders configured for this user');
        }
        finalSenderId = userSenders.id;
        this.logger.log(
          `No senderId provided, using default sender: ${finalSenderId}`,
        );
      }

      if (!finalSenderId) {
        throw new Error('Unable to determine sender ID for chat');
      }

      const chatId = this.generateChatId(businessPhone, participantPhone);

      let chat = await db.query.chats.findFirst({
        where: and(eq(chats.chatId, chatId), eq(chats.senderId, finalSenderId)),
      });

      if (chat) {
        this.logger.log(
          `Chat already exists: ${chatId} for sender ${finalSenderId}`,
        );

        if (!chat.participantName && (participantName || !participantName)) {
          let nameToUpdate: string | null | undefined = participantName;
          if (!nameToUpdate) {
            nameToUpdate = await this.getContactNameByPhone(participantPhone);
          }

          if (nameToUpdate) {
            const [updatedChat] = await db
              .update(chats)
              .set({
                participantName: nameToUpdate,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(chats.chatId, chatId),
                  eq(chats.senderId, finalSenderId),
                ),
              )
              .returning();

            this.logger.log(
              `Chat updated with participantName: ${chatId} -> ${nameToUpdate}`,
            );
            return updatedChat;
          }
        }

        return chat;
      }

      let finalParticipantName: string | null | undefined = participantName;
      if (!finalParticipantName) {
        finalParticipantName =
          await this.getContactNameByPhone(participantPhone);
      }

      // Get teamId from user's active team membership (not just owner)
      const userTeamMembership = await db.query.teamMembers.findFirst({
        where: and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.isActive, true),
        ),
      });

      const [newChat] = await db
        .insert(chats)
        .values({
          chatId,
          userId,
          senderId: finalSenderId,
          businessPhone,
          participantPhone,
          participantName: finalParticipantName || null,
          isActive: true,
          teamId: userTeamMembership?.teamId,
        })
        .returning();

      this.logger.log(`Chat created: ${chatId} for sender ${finalSenderId}`);
      return newChat;
    } catch (error) {
      this.logger.error(
        `Error creating/getting chat with contact: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Create a new chat
   */
  async create(userId: number, teamId: string, createChatDto: CreateChatDto) {
    try {
      const chatId = this.generateChatId(
        createChatDto.businessPhone,
        createChatDto.participantPhone,
      );

      let finalSenderId = createChatDto.senderId;
      if (finalSenderId) {
        await this.validateSenderBelongsToUser(userId, finalSenderId);
      } else {
        const userSenders = await db.query.senders.findFirst({
          where: eq(senders.userId, userId),
        });

        if (!userSenders) {
          throw new Error('No senders configured for this user');
        }
        finalSenderId = userSenders.id;
      }

      if (!finalSenderId) {
        throw new Error('Unable to determine sender ID for chat');
      }

      const [chat] = await db
        .insert(chats)
        .values({
          chatId,
          userId,
          senderId: finalSenderId,
          businessPhone: createChatDto.businessPhone,
          participantPhone: createChatDto.participantPhone,
          participantName: createChatDto.participantName || null,

          isActive: true,
          teamId: parseInt(teamId),
        })
        .returning();

      this.logger.log(`Chat created: ${chatId} for sender ${finalSenderId}`);
      return chat;
    } catch (error) {
      this.logger.error(`Error creating chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a single chat
   */
  async findOne(chatId: string): Promise<Chat> {
    try {
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      if (!chat) {
        throw new NotFoundException(`Chat ${chatId} not found`);
      }

      return chat;
    } catch (error) {
      this.logger.error(`Error fetching chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all chats for a team (excludes archived chats)
   */
  async findByTeam(
    userId: number,
    teamId: string,
    skip: number = 0,
    take: number = 20,
  ) {
    try {
      // Lookup user's role in the team
      const membership = await db.query.teamMembers.findFirst({
        where: and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.teamId, parseInt(teamId)),
          eq(teamMembers.isActive, true),
        ),
      });

      const role = membership?.role?.toLowerCase();

      // Use centralized visibility service for ALL conditions (base + role-based)
      // This ensures consistency with Kanban page and other chat displays
      const whereConditions = [
        eq(chats.teamId, parseInt(teamId)),
        ...this.chatVisibilityService.getAllConditions(role || 'agent', userId),
      ];

      this.logger.log(
        `Fetching chats for user ${userId} (Role: ${role}) in team ${teamId}. Conditions: ${whereConditions.length}`,
      );

      const result = await db.query.chats.findMany({
        where: and(...whereConditions),
        with: {
          assignee: true, // Include assignee user data for display
        },
        orderBy: [
          desc(sql`${chats.lastMessageTime} IS NULL`),
          desc(chats.lastMessageTime),
        ],
        limit: take,
        offset: skip,
      });

      // Enrich with contact names and flatten assignee info
      const enrichedChats = await this.enrichChatsWithContactNames(result);

      // Add assigneeName field for frontend convenience
      return enrichedChats.map((chat) => ({
        ...chat,
        assigneeName:
          (chat as Chat & { assignee?: { name?: string } }).assignee?.name ||
          null,
        assigneeEmail:
          (chat as Chat & { assignee?: { email?: string } }).assignee?.email ||
          null,
      }));
    } catch (error) {
      this.logger.error(`Error fetching team chats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update a chat
   */
  async update(chatId: string, updateChatDto: UpdateChatDto) {
    try {
      await this.findOne(chatId);

      const updateData: Partial<Chat> & { updatedAt: Date } = {
        updatedAt: new Date(),
      };

      if (updateChatDto.participantName !== undefined) {
        updateData.participantName = updateChatDto.participantName;
      }
      if (updateChatDto.lastMessage !== undefined) {
        updateData.lastMessage = updateChatDto.lastMessage;
      }

      const [updated] = await db
        .update(chats)
        .set(updateData)
        .where(eq(chats.chatId, chatId))
        .returning();

      return updated;
    } catch (error) {
      this.logger.error(`Error updating chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Assign a chat to a user
   */
  async assignChat(
    chatId: string,
    assignerId: number,
    assigneeId: number | null,
  ) {
    // If assigneeId is null, we unassign.
    try {
      const [updated] = await db
        .update(chats)
        .set({
          assignedTo: assigneeId, // null or userId
          assignedBy: assigneeId ? assignerId : null,
          assignedAt: assigneeId ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(chats.chatId, chatId))
        .returning();

      if (!updated) {
        throw new NotFoundException(`Chat ${chatId} not found`);
      }
      return updated;
    } catch (error) {
      this.logger.error(`Error assigning chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Close a chat
   */
  async close(chatId: string) {
    try {
      await this.findOne(chatId);

      const [updated] = await db
        .update(chats)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(chats.chatId, chatId))
        .returning();

      return updated;
    } catch (error) {
      this.logger.error(`Error closing chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Helper method to enrich chats with contact names from the contacts table
   */
  async enrichChatsWithContactNames(chatList: Chat[]): Promise<Chat[]> {
    return Promise.all(
      chatList.map(async (chat) => {
        const needsNameLookup =
          !chat.participantName ||
          chat.participantName === chat.participantPhone ||
          chat.participantName === `+${chat.participantPhone}` ||
          `+${chat.participantName}` === chat.participantPhone;

        if (needsNameLookup) {
          const contactName = await this.getContactNameByPhone(
            chat.participantPhone,
          );
          if (contactName) {
            return {
              ...chat,
              participantName: contactName,
            };
          }
        }
        return chat;
      }),
    );
  }

  /**
   * Repair chats with NULL teamId
   * Assigns correct teamId based on sender's owner's team membership
   * This is used to fix historical data from before the teamId fix
   */
  async repairChatTeamIds(): Promise<{
    total: number;
    repaired: number;
    skipped: number;
    errors: string[];
  }> {
    this.logger.log('Starting chat teamId repair...');

    // Find all chats with NULL teamId
    const chatsToRepair = await db
      .select()
      .from(chats)
      .where(sql`${chats.teamId} IS NULL`);

    this.logger.log(`Found ${chatsToRepair.length} chats with NULL teamId`);

    const result = {
      total: chatsToRepair.length,
      repaired: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const chat of chatsToRepair) {
      try {
        let teamId: number | null = null;

        // First try to get teamId from sender's owner
        if (chat.senderId) {
          const sender = await db.query.senders.findFirst({
            where: eq(senders.id, chat.senderId),
          });

          if (sender?.userId) {
            const ownerMembership = await db.query.teamMembers.findFirst({
              where: and(
                eq(teamMembers.userId, sender.userId),
                eq(teamMembers.isActive, true),
              ),
            });

            if (ownerMembership) {
              teamId = ownerMembership.teamId;
            }
          }
        }

        // If still no teamId, try from chat's userId
        if (!teamId && chat.userId) {
          const userMembership = await db.query.teamMembers.findFirst({
            where: and(
              eq(teamMembers.userId, chat.userId),
              eq(teamMembers.isActive, true),
            ),
          });

          if (userMembership) {
            teamId = userMembership.teamId;
          }
        }

        if (teamId) {
          await db
            .update(chats)
            .set({ teamId, updatedAt: new Date() })
            .where(eq(chats.chatId, chat.chatId));
          result.repaired++;
          this.logger.log(`Repaired chat ${chat.chatId} with teamId ${teamId}`);
        } else {
          result.skipped++;
          this.logger.warn(
            `Could not determine teamId for chat ${chat.chatId}`,
          );
        }
      } catch (error) {
        result.errors.push(`${chat.chatId}: ${error.message}`);
        this.logger.error(
          `Error repairing chat ${chat.chatId}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Chat repair complete: ${result.repaired} repaired, ${result.skipped} skipped, ${result.errors.length} errors`,
    );

    return result;
  }
}
