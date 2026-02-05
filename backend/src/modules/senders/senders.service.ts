import { db } from '@database/db.connection';
import { Sender, senders } from '@database/schema';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CreateSenderDto } from './dto/create-sender.dto';
import { UpdateSenderDto } from './dto/update-sender.dto';

/**
 * Meta phone number data from WABA sync
 */
interface WabaPhoneNumber {
  id: string;
  phoneNumber: string;
  verifiedName?: string;
  qualityRating?: string;
  codeVerificationStatus?: string;
  nameStatus?: string;
  isOfficialBusinessAccount: boolean;
  messagingLimitTier?: string;
}

/**
 * Result of sync operation
 */
export interface SyncResult {
  created: Sender[];
  updated: Sender[];
  total: number;
}

/**
 * Senders Service
 *
 * Manages WhatsApp business phone numbers (senders) for users.
 * Phone numbers are registered in the system's single WABA (configured via META_WABA_ID).
 *
 * Key features:
 * - Sync phone numbers from Meta WABA
 * - Manual phone number creation (for testing or unsynced numbers)
 * - Update sender metadata from Meta
 * - Link/unlink contacts to senders
 */
@Injectable()
export class SendersService {
  private readonly logger = new Logger(SendersService.name);

  constructor(private readonly whatsAppService: WhatsAppService) {}

  // ==================== SYNC OPERATIONS ====================

  /**
   * Sync all phone numbers from the WABA to the database
   *
   * This fetches all phone numbers registered in the system's WABA
   * and creates/updates sender records for the specified user.
   *
   * @param userId - User ID to assign synced phone numbers to
   * @returns Sync result with created and updated senders
   */
  async syncFromWaba(userId: number): Promise<SyncResult> {
    this.logger.log(`Starting WABA sync for user ${userId}`);

    // Fetch all phone numbers from Meta WABA
    const wabaPhones = await this.whatsAppService.getAllWabaPhoneNumbers();

    if (wabaPhones.length === 0) {
      this.logger.log('No phone numbers found in WABA');
      return { created: [], updated: [], total: 0 };
    }

    this.logger.log(`Found ${wabaPhones.length} phone numbers in WABA`);

    const created: Sender[] = [];
    const updated: Sender[] = [];

    for (const phone of wabaPhones) {
      const result = await this.upsertSenderFromWaba(userId, phone);
      if (result.isNew) {
        created.push(result.sender);
      } else {
        updated.push(result.sender);
      }
    }

    this.logger.log(
      `Sync complete: ${created.length} created, ${updated.length} updated`,
    );

    return {
      created,
      updated,
      total: wabaPhones.length,
    };
  }

  /**
   * Refresh a single sender's metadata from Meta
   *
   * @param userId - User ID for ownership verification
   * @param senderId - Sender ID to refresh
   * @returns Updated sender
   */
  async refreshFromMeta(userId: number, senderId: number): Promise<Sender> {
    const sender = await this.findOne(userId, senderId);

    let phoneNumberId = sender.phoneNumberId;

    // If no phoneNumberId, try to look it up from Meta
    if (!phoneNumberId) {
      this.logger.log(
        `Sender ${senderId} has no phoneNumberId, attempting to look up from Meta...`,
      );
      try {
        phoneNumberId = await this.whatsAppService.getPhoneNumberIdFromMeta(
          sender.phoneNumber,
        );
        this.logger.log(
          `Found phoneNumberId for ${sender.phoneNumber}: ${phoneNumberId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to get phoneNumberId from Meta: ${error.message}`,
        );
        throw new BadRequestException(
          `Phone number ${sender.phoneNumber} not found in Meta WABA. Make sure it's registered in your WhatsApp Business Account.`,
        );
      }
    }

    // Fetch latest details from Meta
    const details =
      await this.whatsAppService.getPhoneNumberDetails(phoneNumberId);

    // Update sender with latest data (including the phoneNumberId if we just looked it up)
    const [updated] = await db
      .update(senders)
      .set({
        phoneNumberId: phoneNumberId,
        verifiedName: details.verifiedName ?? sender.verifiedName,
        qualityRating: details.qualityRating ?? sender.qualityRating,
        codeVerificationStatus:
          details.codeVerificationStatus ?? sender.codeVerificationStatus,
        nameStatus: details.nameStatus ?? sender.nameStatus,
        isOfficialBusinessAccount:
          details.isOfficialBusinessAccount ?? sender.isOfficialBusinessAccount,
        messagingLimit: details.messagingLimitTier ?? sender.messagingLimit,
        status:
          details.codeVerificationStatus === 'VERIFIED'
            ? 'CONNECTED'
            : sender.status,
        updatedAt: new Date(),
      })
      .where(eq(senders.id, senderId))
      .returning();

    this.logger.log(`Refreshed sender ${senderId} from Meta`);
    return updated;
  }

  /**
   * Upsert a sender from WABA phone data
   * Creates if phone number doesn't exist, updates if it does
   */
  private async upsertSenderFromWaba(
    userId: number,
    phone: WabaPhoneNumber,
  ): Promise<{ sender: Sender; isNew: boolean }> {
    // Check if sender already exists by phoneNumberId or phoneNumber
    const existing = await db.query.senders.findFirst({
      where: eq(senders.phoneNumber, phone.phoneNumber),
    });

    if (existing) {
      // Update existing sender
      const [updated] = await db
        .update(senders)
        .set({
          phoneNumberId: phone.id,
          verifiedName: phone.verifiedName ?? existing.verifiedName,
          qualityRating: phone.qualityRating ?? existing.qualityRating,
          codeVerificationStatus:
            phone.codeVerificationStatus ?? existing.codeVerificationStatus,
          nameStatus: phone.nameStatus ?? existing.nameStatus,
          isOfficialBusinessAccount: phone.isOfficialBusinessAccount,
          messagingLimit: phone.messagingLimitTier ?? existing.messagingLimit,
          status:
            phone.codeVerificationStatus === 'VERIFIED'
              ? 'CONNECTED'
              : existing.status,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(senders.id, existing.id))
        .returning();

      return { sender: updated, isNew: false };
    }

    // Create new sender
    const [created] = await db
      .insert(senders)
      .values({
        userId,
        phoneNumber: phone.phoneNumber,
        phoneNumberId: phone.id,
        displayName: phone.verifiedName || null,
        verifiedName: phone.verifiedName || null,
        qualityRating: phone.qualityRating || null,
        codeVerificationStatus: phone.codeVerificationStatus || null,
        nameStatus: phone.nameStatus || null,
        isOfficialBusinessAccount: phone.isOfficialBusinessAccount,
        messagingLimit: phone.messagingLimitTier || null,
        status:
          phone.codeVerificationStatus === 'VERIFIED' ? 'CONNECTED' : 'PENDING',
        isActive: true,
        registeredAt: new Date(),
      })
      .returning();

    return { sender: created, isNew: true };
  }

  // ==================== CRUD OPERATIONS ====================

  /**
   * Create a new sender (manual phone number entry)
   *
   * Use this for adding phone numbers that are not yet in the WABA,
   * or for testing purposes. In production, prefer syncFromWaba().
   */
  async create(
    userId: number,
    createSenderDto: CreateSenderDto,
  ): Promise<Sender> {
    // Check if phone number already exists
    const existingSender = await db.query.senders.findFirst({
      where: eq(senders.phoneNumber, createSenderDto.phoneNumber),
    });

    if (existingSender) {
      throw new ConflictException(
        'A sender with this phone number already exists',
      );
    }

    // Try to get phoneNumberId from Meta (may fail if number not in WABA)
    let phoneNumberId: string | null = null;
    let metaDetails: Awaited<
      ReturnType<WhatsAppService['getPhoneNumberDetails']>
    > | null = null;

    try {
      phoneNumberId = await this.whatsAppService.getPhoneNumberIdFromMeta(
        createSenderDto.phoneNumber,
      );
      if (phoneNumberId) {
        metaDetails =
          await this.whatsAppService.getPhoneNumberDetails(phoneNumberId);
      }
      this.logger.log(
        `Found phoneNumberId for ${createSenderDto.phoneNumber}: ${phoneNumberId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Phone number not found in WABA: ${error.message}. Creating as PENDING.`,
      );
    }

    const [sender] = await db
      .insert(senders)
      .values({
        userId,
        phoneNumber: createSenderDto.phoneNumber,
        phoneNumberId: createSenderDto.phoneNumberId || phoneNumberId || null,
        displayName:
          createSenderDto.displayName || metaDetails?.verifiedName || null,
        verifiedName: metaDetails?.verifiedName || null,
        qualityRating: metaDetails?.qualityRating || null,
        codeVerificationStatus: metaDetails?.codeVerificationStatus || null,
        nameStatus: metaDetails?.nameStatus || null,
        isOfficialBusinessAccount:
          metaDetails?.isOfficialBusinessAccount || false,
        messagingLimit: metaDetails?.messagingLimitTier || null,
        status: phoneNumberId ? 'CONNECTED' : 'PENDING',
        isActive: true,
      })
      .returning();

    this.logger.log(
      `Created sender: ${createSenderDto.phoneNumber} (status: ${sender.status})`,
    );
    return sender;
  }

  /**
   * Get all active senders for a user (excludes soft-deleted)
   */
  async findAll(userId: number): Promise<Sender[]> {
    return db.query.senders.findMany({
      where: and(eq(senders.userId, userId), eq(senders.isActive, true)),
      orderBy: (senders, { desc }) => desc(senders.createdAt),
    });
  }

  /**
   * Get all active senders for a user (alias for findAll)
   */
  async findAllActive(userId: number): Promise<Sender[]> {
    return this.findAll(userId);
  }

  /**
   * Get a specific sender by ID
   */
  async findOne(userId: number, senderId: number): Promise<Sender> {
    const sender = await db.query.senders.findFirst({
      where: and(eq(senders.userId, userId), eq(senders.id, senderId)),
    });

    if (!sender) {
      throw new NotFoundException('Sender not found');
    }

    return sender;
  }

  /**
   * Update a sender
   */
  async update(
    userId: number,
    senderId: number,
    updateSenderDto: UpdateSenderDto,
  ): Promise<Sender> {
    const sender = await this.findOne(userId, senderId);

    // Check for phone number conflicts if changing phone number
    if (
      updateSenderDto.phoneNumber &&
      updateSenderDto.phoneNumber !== sender.phoneNumber
    ) {
      const existingSender = await db.query.senders.findFirst({
        where: eq(senders.phoneNumber, updateSenderDto.phoneNumber),
      });

      if (existingSender) {
        throw new ConflictException(
          'A sender with this phone number already exists',
        );
      }
    }

    const [updated] = await db
      .update(senders)
      .set({
        phoneNumber: updateSenderDto.phoneNumber ?? sender.phoneNumber,
        displayName: updateSenderDto.displayName ?? sender.displayName,
        phoneNumberId: updateSenderDto.phoneNumberId ?? sender.phoneNumberId,
        updatedAt: new Date(),
      })
      .where(eq(senders.id, senderId))
      .returning();

    this.logger.log(`Updated sender ${senderId}`);
    return updated;
  }

  /**
   * Soft delete a sender (mark as inactive)
   */
  async remove(userId: number, senderId: number): Promise<Sender> {
    await this.findOne(userId, senderId);

    const [deleted] = await db
      .update(senders)
      .set({
        isActive: false,
        status: 'DISCONNECTED',
        updatedAt: new Date(),
      })
      .where(eq(senders.id, senderId))
      .returning();

    this.logger.log(`Soft deleted sender ${senderId}`);
    return deleted;
  }

  /**
   * Permanently delete a sender
   * Use with caution - this removes all history
   */
  async hardDelete(userId: number, senderId: number): Promise<void> {
    await this.findOne(userId, senderId);

    // Delete the sender
    await db.delete(senders).where(eq(senders.id, senderId));

    this.logger.log(`Hard deleted sender ${senderId}`);
  }

  // ==================== VERIFICATION ====================

  /**
   * Verify a sender phone number and update with Meta data
   * Call this after manually adding a phone number to retrieve its metadata
   */
  async verifySender(userId: number, senderId: number): Promise<Sender> {
    const sender = await this.findOne(userId, senderId);

    // Get phoneNumberId from Meta if not set
    let phoneNumberId = sender.phoneNumberId;
    if (!phoneNumberId) {
      try {
        phoneNumberId = await this.whatsAppService.getPhoneNumberIdFromMeta(
          sender.phoneNumber,
        );
      } catch (error) {
        throw new BadRequestException(
          `Phone number not found in WABA: ${error.message}`,
        );
      }
    }

    // Get full details
    const details =
      await this.whatsAppService.getPhoneNumberDetails(phoneNumberId);

    // Update sender with all metadata
    const [updated] = await db
      .update(senders)
      .set({
        phoneNumberId,
        verifiedName: details.verifiedName,
        qualityRating: details.qualityRating,
        codeVerificationStatus: details.codeVerificationStatus,
        nameStatus: details.nameStatus,
        isOfficialBusinessAccount: details.isOfficialBusinessAccount,
        messagingLimit: details.messagingLimitTier,
        status:
          details.codeVerificationStatus === 'VERIFIED'
            ? 'CONNECTED'
            : 'PENDING',
        updatedAt: new Date(),
      })
      .where(eq(senders.id, senderId))
      .returning();

    this.logger.log(
      `Verified sender ${senderId}: phoneNumberId=${phoneNumberId}, status=${updated.status}`,
    );
    return updated;
  }

  // ==================== COMMERCE SETTINGS ====================

  /**
   * Get commerce settings for a sender
   * First tries local database, then syncs from Meta if needed
   */
  async getCommerceSettings(
    userId: number,
    senderId: number,
  ): Promise<{
    isCatalogEnabled: boolean;
    isCartEnabled: boolean;
    linkedCatalogId: string | null;
    commerceSettingsSyncedAt: Date | null;
    isCommerceAvailable: boolean;
  }> {
    const sender = await this.findOne(userId, senderId);

    return {
      isCatalogEnabled: sender.isCatalogEnabled || false,
      isCartEnabled: sender.isCartEnabled || false,
      linkedCatalogId: sender.linkedCatalogId || null,
      commerceSettingsSyncedAt: sender.commerceSettingsSyncedAt || null,
      isCommerceAvailable: !!sender.linkedCatalogId,
    };
  }

  /**
   * Sync commerce settings from Meta for a sender
   * Requires phoneNumberId to be set
   */
  async syncCommerceSettings(
    userId: number,
    senderId: number,
  ): Promise<{
    isCatalogEnabled: boolean;
    isCartEnabled: boolean;
    linkedCatalogId: string | null;
    commerceSettingsSyncedAt: Date;
    isCommerceAvailable: boolean;
  }> {
    const sender = await this.findOne(userId, senderId);

    if (!sender.phoneNumberId) {
      throw new BadRequestException(
        'Sender must be verified with Meta before syncing commerce settings. ' +
          'Please verify the sender first.',
      );
    }

    this.logger.log(`Syncing commerce settings for sender ${senderId}`);

    // Fetch from Meta
    const metaSettings = await this.whatsAppService.getCommerceSettings(
      sender.phoneNumberId,
    );

    const now = new Date();

    // Update local database
    const [updated] = await db
      .update(senders)
      .set({
        linkedCatalogId: metaSettings.catalogId,
        isCartEnabled: metaSettings.isCartEnabled,
        isCatalogEnabled: metaSettings.isCatalogVisible,
        commerceSettingsSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(senders.id, senderId))
      .returning();

    this.logger.log(
      `Synced commerce settings for sender ${senderId}: ` +
        `catalog=${metaSettings.catalogId}, cart=${metaSettings.isCartEnabled}, visible=${metaSettings.isCatalogVisible}`,
    );

    return {
      isCatalogEnabled: updated.isCatalogEnabled || false,
      isCartEnabled: updated.isCartEnabled || false,
      linkedCatalogId: updated.linkedCatalogId || null,
      commerceSettingsSyncedAt: now,
      isCommerceAvailable: !!updated.linkedCatalogId,
    };
  }

  /**
   * Update commerce settings for a sender
   * Updates both Meta API and local database
   */
  async updateCommerceSettings(
    userId: number,
    senderId: number,
    settings: {
      isCartEnabled?: boolean;
      isCatalogVisible?: boolean;
    },
  ): Promise<{
    isCatalogEnabled: boolean;
    isCartEnabled: boolean;
    linkedCatalogId: string | null;
    commerceSettingsSyncedAt: Date;
    isCommerceAvailable: boolean;
  }> {
    const sender = await this.findOne(userId, senderId);

    if (!sender.phoneNumberId) {
      throw new BadRequestException(
        'Sender must be verified with Meta before updating commerce settings. ' +
          'Please verify the sender first.',
      );
    }

    this.logger.log(
      `Updating commerce settings for sender ${senderId}: cart=${settings.isCartEnabled}, catalogVisible=${settings.isCatalogVisible}`,
    );

    // Update Meta API
    const success = await this.whatsAppService.updateCommerceSettings(
      sender.phoneNumberId,
      {
        isCartEnabled: settings.isCartEnabled,
        isCatalogVisible: settings.isCatalogVisible,
      },
    );

    if (!success) {
      throw new BadRequestException(
        'Failed to update commerce settings with Meta. Please try again.',
      );
    }

    const now = new Date();

    // Update local database
    const updateData: Partial<typeof senders.$inferInsert> = {
      commerceSettingsSyncedAt: now,
      updatedAt: now,
    };

    if (settings.isCartEnabled !== undefined) {
      updateData.isCartEnabled = settings.isCartEnabled;
    }
    if (settings.isCatalogVisible !== undefined) {
      updateData.isCatalogEnabled = settings.isCatalogVisible;
    }

    const [updated] = await db
      .update(senders)
      .set(updateData)
      .where(eq(senders.id, senderId))
      .returning();

    this.logger.log(
      `Updated commerce settings for sender ${senderId}: ` +
        `cart=${updated.isCartEnabled}, catalog=${updated.isCatalogEnabled}`,
    );

    return {
      isCatalogEnabled: updated.isCatalogEnabled || false,
      isCartEnabled: updated.isCartEnabled || false,
      linkedCatalogId: updated.linkedCatalogId || null,
      commerceSettingsSyncedAt: now,
      isCommerceAvailable: !!updated.linkedCatalogId,
    };
  }

  /**
   * Link a Meta catalog to a sender's WhatsApp commerce settings
   *
   * This connects a Meta product catalog to the sender's phone number,
   * enabling product messages and catalog features for that number.
   *
   * @param userId - User ID for authorization
   * @param senderId - Sender ID
   * @param catalogId - Meta catalog ID to link
   * @returns Updated commerce settings
   */
  async linkCatalogToSender(
    userId: number,
    senderId: number,
    catalogId: string,
  ): Promise<{
    isCatalogEnabled: boolean;
    isCartEnabled: boolean;
    linkedCatalogId: string | null;
    commerceSettingsSyncedAt: Date;
    isCommerceAvailable: boolean;
  }> {
    const sender = await this.findOne(userId, senderId);

    if (!sender.phoneNumberId) {
      throw new BadRequestException(
        'Sender must be verified with Meta before linking a catalog. ' +
          'Please verify the sender first.',
      );
    }

    this.logger.log(
      `Linking catalog ${catalogId} to sender ${senderId} (phone: ${sender.phoneNumberId})`,
    );

    // Link catalog via Meta API
    const success = await this.whatsAppService.linkCatalogToPhoneNumber(
      sender.phoneNumberId,
      catalogId,
    );

    if (!success) {
      throw new BadRequestException(
        'Failed to link catalog with Meta. Please try again.',
      );
    }

    const now = new Date();

    // Update local database
    const [updated] = await db
      .update(senders)
      .set({
        linkedCatalogId: catalogId,
        isCatalogEnabled: true, // Auto-enable catalog visibility when linking
        commerceSettingsSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(senders.id, senderId))
      .returning();

    this.logger.log(
      `Successfully linked catalog ${catalogId} to sender ${senderId}`,
    );

    return {
      isCatalogEnabled: updated.isCatalogEnabled || false,
      isCartEnabled: updated.isCartEnabled || false,
      linkedCatalogId: updated.linkedCatalogId || null,
      commerceSettingsSyncedAt: now,
      isCommerceAvailable: true,
    };
  }

  /**
   * Unlink catalog from a sender's WhatsApp commerce settings
   *
   * @param userId - User ID for authorization
   * @param senderId - Sender ID
   * @returns Updated commerce settings
   */
  async unlinkCatalogFromSender(
    userId: number,
    senderId: number,
  ): Promise<{
    isCatalogEnabled: boolean;
    isCartEnabled: boolean;
    linkedCatalogId: string | null;
    commerceSettingsSyncedAt: Date;
    isCommerceAvailable: boolean;
  }> {
    const sender = await this.findOne(userId, senderId);

    if (!sender.phoneNumberId) {
      throw new BadRequestException(
        'Sender must be verified with Meta before unlinking a catalog.',
      );
    }

    if (!sender.linkedCatalogId) {
      throw new BadRequestException(
        'No catalog is currently linked to this sender.',
      );
    }

    this.logger.log(
      `Unlinking catalog from sender ${senderId} (phone: ${sender.phoneNumberId})`,
    );

    // Unlink catalog via Meta API
    const success = await this.whatsAppService.unlinkCatalogFromPhoneNumber(
      sender.phoneNumberId,
    );

    if (!success) {
      throw new BadRequestException(
        'Failed to unlink catalog from Meta. Please try again.',
      );
    }

    const now = new Date();

    // Update local database
    const [updated] = await db
      .update(senders)
      .set({
        linkedCatalogId: null,
        isCatalogEnabled: false,
        isCartEnabled: false,
        commerceSettingsSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(senders.id, senderId))
      .returning();

    this.logger.log(`Successfully unlinked catalog from sender ${senderId}`);

    return {
      isCatalogEnabled: false,
      isCartEnabled: false,
      linkedCatalogId: null,
      commerceSettingsSyncedAt: now,
      isCommerceAvailable: false,
    };
  }

  // ==================== HELPERS ====================

  /**
   * Get WABA info for display purposes
   */
  getWabaId(): string | undefined {
    return this.whatsAppService.getWabaId();
  }
}
