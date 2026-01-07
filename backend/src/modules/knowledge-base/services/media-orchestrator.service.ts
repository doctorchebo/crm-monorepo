/**
 * Media Orchestrator Service
 *
 * Main entry point for AI media operations.
 * Coordinates all media services to provide a unified interface for:
 * - Media retrieval and selection for AI replies
 * - Guardrail enforcement
 * - Decision auditing
 *
 * This is the service that AI reply system should call.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GuardrailCheckResult,
  MediaCandidate,
  MediaDecisionAudit,
  MediaRetrievalResult,
} from '../types/media.types';
import { MediaDecisionAuditService } from './media-decision-audit.service';
import {
  MediaGuardrailContext,
  MediaGuardrailsService,
} from './media-guardrails.service';
import { MediaRetrievalService } from './media-retrieval.service';
import { MediaVectorizationService } from './media-vectorization.service';
import { KbMediaService } from './media.service';

export interface MediaSelectionRequest {
  /** User's message/query text */
  query: string;
  /** Chat ID */
  chatId: string;
  /** User ID (CRM user, not customer) */
  userId: number;
  /** Message ID for audit */
  messageId: string;
  /** Chat language code */
  chatLanguage?: string;
  /** Recent conversation context */
  conversationContext?: string;
  /** Is this the first AI message in conversation? */
  isFirstAiMessage?: boolean;
  /** Did the last AI message have media? */
  lastMessageHadMedia?: boolean;
  /** Total AI messages in this conversation */
  aiMessageCount?: number;
}

export interface MediaSelectionResult {
  /** Whether media should be sent */
  shouldSendMedia: boolean;
  /** Selected media if sending */
  selectedMedia: MediaRetrievalResult | null;
  /** Why this decision was made */
  reason: string;
  /** Audit ID for this decision */
  auditId: string;
  /** All guardrails that were checked */
  guardrailsChecked: string[];
  /** Any guardrails that failed */
  guardrailFailures: Array<{ rule: string; reason: string }>;
  /** Alternative suggestion if media blocked */
  suggestion?: 'text_only' | 'use_template' | 'wait';
  /** Retry after time if applicable */
  retryAfterMs?: number;
}

@Injectable()
export class MediaOrchestratorService {
  private readonly logger = new Logger(MediaOrchestratorService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly mediaService: KbMediaService,
    private readonly retrievalService: MediaRetrievalService,
    private readonly guardrailsService: MediaGuardrailsService,
    private readonly auditService: MediaDecisionAuditService,
    private readonly vectorizationService: MediaVectorizationService,
  ) {
    this.enabled = this.configService.get<boolean>('AI_MEDIA_ENABLED', true);

    this.logger.log(`MediaOrchestrator initialized, enabled: ${this.enabled}`);
  }

  /**
   * Select media for an AI reply
   *
   * This is the main entry point called by the AI reply service.
   * It performs:
   * 1. Guardrail checks
   * 2. Media retrieval and ranking
   * 3. Intent-based media type preference
   * 4. Final selection
   * 5. Audit logging
   */
  async selectMediaForReply(
    request: MediaSelectionRequest,
  ): Promise<MediaSelectionResult> {
    const startTime = Date.now();

    // Check if media feature is enabled
    if (!this.enabled) {
      return this.createNoMediaResult(request, 'Media feature is disabled', []);
    }

    // Step 1: Check guardrails first
    const guardrailContext: MediaGuardrailContext = {
      chatId: request.chatId,
      userId: request.userId,
      userIntent: request.query,
      isFirstAiMessage: request.isFirstAiMessage,
      lastMessageHadMedia: request.lastMessageHadMedia,
      messageCountInConversation: request.aiMessageCount,
    };

    const guardrailResult =
      await this.guardrailsService.checkGuardrails(guardrailContext);

    // If guardrails fail, log and return early
    if (!guardrailResult.passed) {
      return this.handleGuardrailFailure(request, guardrailResult);
    }

    // Step 2: Retrieve relevant media
    const retrievalResponse = await this.retrievalService.retrieveMedia(
      request.userId,
      request.query,
      {
        chatId: request.chatId,
        chatLanguage: request.chatLanguage,
        aiEnabledOnly: true,
        conversationContext: request.conversationContext,
        topK: 10, // Get more candidates for intent-based filtering
      },
    );

    // Step 3: Check if we have any eligible media
    if (retrievalResponse.results.length === 0) {
      return this.createNoMediaResult(
        request,
        'No relevant media found for query',
        Object.keys(this.guardrailsService.getGuardrailConfig()),
      );
    }

    // Step 4: Classify user intent and apply media type preference
    const userIntent = this.classifyIntent(request.query);
    const preferredMimeTypes = this.getPreferredMimeTypes(userIntent);

    // Re-rank results based on user intent AND AI instructions
    const rankedResults = this.rankResultsByIntent(
      retrievalResponse.results,
      preferredMimeTypes,
      userIntent,
      request.query,
    );

    this.logger.debug(
      `[Media Selection] Intent: ${userIntent}, preferred types: ${preferredMimeTypes?.join(', ') || 'any'}, candidates: ${rankedResults.length}`,
    );

    // Step 5: Select the best media (now considering intent)
    const selectedMedia = rankedResults[0];

    // Step 6: Final eligibility check on selected media
    const eligibility = await this.mediaService.checkAiEligibility(
      selectedMedia.mediaId,
      request.chatId,
      request.chatLanguage,
    );

    if (!eligibility.isEligible) {
      // Try next candidate if available
      for (let i = 1; i < rankedResults.length && i < 5; i++) {
        const fallbackMedia = rankedResults[i];
        const fallbackEligibility = await this.mediaService.checkAiEligibility(
          fallbackMedia.mediaId,
          request.chatId,
          request.chatLanguage,
        );

        if (fallbackEligibility.isEligible) {
          return this.createSuccessResult(
            request,
            fallbackMedia,
            `Selected fallback media (intent: ${userIntent}): ${fallbackMedia.caption?.substring(0, 50)}`,
            rankedResults,
            guardrailResult,
          );
        }
      }

      return this.createNoMediaResult(
        request,
        `Best media not eligible: ${eligibility.explanation}`,
        Object.keys(this.guardrailsService.getGuardrailConfig()),
        rankedResults,
      );
    }

    // Step 7: Success - media will be sent
    return this.createSuccessResult(
      request,
      selectedMedia,
      `Selected media (intent: ${userIntent}): ${selectedMedia.caption?.substring(0, 50)}`,
      rankedResults,
      guardrailResult,
    );
  }

  /**
   * Get preferred MIME types based on user intent
   *
   * When user explicitly asks for videos or images, we should prioritize
   * those media types in selection.
   */
  private getPreferredMimeTypes(intent: string): string[] | null {
    switch (intent) {
      case 'video_request':
        // User explicitly asked for video
        return ['video/mp4', 'video/webm', 'video/quicktime', 'video/'];
      case 'visual_request':
        // User asked for images/visuals - include both images and videos
        return [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/',
          'video/mp4',
          'video/webm',
          'video/',
        ];
      case 'document_request':
        // User asked for documents/brochures
        return ['application/pdf', 'application/'];
      case 'floor_plan_request':
        // Floor plans are usually images or PDFs
        return ['image/jpeg', 'image/png', 'image/', 'application/pdf'];
      default:
        // No specific preference - use default ranking
        return null;
    }
  }

  /**
   * Re-rank results based on user intent and preferred media types
   *
   * This ensures that when a user explicitly asks for a video, we
   * prioritize video results even if an image has slightly higher similarity.
   *
   * ALSO INCORPORATES:
   * - AI instructions eligibility filtering
   * - Studio/leaseback content prioritization based on user request
   */
  private rankResultsByIntent(
    results: MediaRetrievalResult[],
    preferredMimeTypes: string[] | null,
    intent: string,
    userQuery?: string,
  ): MediaRetrievalResult[] {
    // Log entry point for debugging
    this.logger.log(
      `[Instruction Filter] Starting filter with ${results.length} candidates`,
    );
    this.logger.log(
      `[Instruction Filter] Full query: "${userQuery || 'NO QUERY'}"`,
    );

    // Step 1: Filter and score based on AI instructions and user query
    const scoredResults = results.map((result) => {
      const instructionMatch = userQuery
        ? this.parseAiInstructionsEligibility(result.aiInstructions, userQuery)
        : { isEligible: true, matchScore: 50, reason: 'No query provided' };

      // Log instruction matching for transparency
      if (!instructionMatch.isEligible && result.aiInstructions) {
        this.logger.log(
          `[Instruction Filter] INELIGIBLE: ${result.objectName}/${result.fileName} - ${instructionMatch.reason}`,
        );
      } else if (instructionMatch.matchScore > 50 && result.aiInstructions) {
        this.logger.log(
          `[Instruction Filter] STRONG MATCH: ${result.objectName}/${result.fileName} (score: ${instructionMatch.matchScore}) - ${instructionMatch.reason}`,
        );
      }

      return {
        result,
        instructionScore: instructionMatch.matchScore,
        isInstructionEligible: instructionMatch.isEligible,
      };
    });

    // Remove ineligible results based on instructions
    const eligibleResults = scoredResults
      .filter((s) => s.isInstructionEligible)
      .sort((a, b) => b.instructionScore - a.instructionScore);

    const baseResults = eligibleResults.map((s) => s.result);

    this.logger.log(
      `[Instruction Filter] After filtering: ${baseResults.length}/${results.length} media items remain eligible`,
    );

    // Step 2: Apply MIME type preference (intent-based)
    if (!preferredMimeTypes || preferredMimeTypes.length === 0) {
      return baseResults; // No preference - return instruction-filtered order
    }

    // Separate results into preferred and non-preferred
    const preferred: MediaRetrievalResult[] = [];
    const nonPreferred: MediaRetrievalResult[] = [];

    for (const result of baseResults) {
      const isPreferred = preferredMimeTypes.some((type) =>
        type.endsWith('/')
          ? result.mimeType.startsWith(type)
          : result.mimeType === type,
      );

      if (isPreferred) {
        preferred.push(result);
      } else {
        nonPreferred.push(result);
      }
    }

    this.logger.debug(
      `[Media Selection] Intent "${intent}": ${preferred.length} preferred (instruction-filtered), ${nonPreferred.length} non-preferred`,
    );

    // Return preferred first (maintaining their relative ranking), then non-preferred
    return [...preferred, ...nonPreferred];
  }

  /**
   * Handle guardrail failure
   */
  private async handleGuardrailFailure(
    request: MediaSelectionRequest,
    guardrailResult: GuardrailCheckResult,
  ): Promise<MediaSelectionResult> {
    const auditId = await this.auditService.logDecision({
      messageId: request.messageId,
      chatId: request.chatId,
      userId: request.userId,
      mediaSent: false,
      userIntent: this.classifyIntent(request.query),
      queryText: request.query,
      selectionReason: guardrailResult.explanation,
      guardrailsApplied: Object.keys(
        this.guardrailsService.getGuardrailConfig(),
      ),
      guardrailFailures: guardrailResult.failures,
    });

    // Determine suggestion based on failure type
    let suggestion: 'text_only' | 'use_template' | 'wait' | undefined;
    let retryAfterMs: number | undefined;

    if (guardrailResult.recommendation === 'use_template') {
      suggestion = 'use_template';
    } else if (guardrailResult.failures.some((f) => f.retryAfterMs)) {
      suggestion = 'wait';
      retryAfterMs = Math.max(
        ...guardrailResult.failures
          .filter((f) => f.retryAfterMs)
          .map((f) => f.retryAfterMs!),
      );
    } else {
      suggestion = 'text_only';
    }

    return {
      shouldSendMedia: false,
      selectedMedia: null,
      reason: guardrailResult.explanation,
      auditId,
      guardrailsChecked: Object.keys(
        this.guardrailsService.getGuardrailConfig(),
      ),
      guardrailFailures: guardrailResult.failures.map((f) => ({
        rule: f.rule,
        reason: f.reason,
      })),
      suggestion,
      retryAfterMs,
    };
  }

  /**
   * Create a "no media" result
   */
  private async createNoMediaResult(
    request: MediaSelectionRequest,
    reason: string,
    guardrailsChecked: string[],
    candidates?: MediaRetrievalResult[],
  ): Promise<MediaSelectionResult> {
    const auditId = await this.auditService.logDecision({
      messageId: request.messageId,
      chatId: request.chatId,
      userId: request.userId,
      mediaSent: false,
      userIntent: this.classifyIntent(request.query),
      queryText: request.query,
      selectionReason: reason,
      guardrailsApplied: guardrailsChecked,
      candidatesConsidered: candidates?.map((c) => ({
        mediaId: c.mediaId,
        objectId: c.objectId,
        objectName: c.objectName,
        mediaRole: c.mediaRole,
        caption: c.caption,
        similarity: c.similarity,
        eligibility: c.eligibility,
        selected: false,
        rejectionReason: reason,
      })),
    });

    return {
      shouldSendMedia: false,
      selectedMedia: null,
      reason,
      auditId,
      guardrailsChecked,
      guardrailFailures: [],
      suggestion: 'text_only',
    };
  }

  /**
   * Create a success result with selected media
   */
  private async createSuccessResult(
    request: MediaSelectionRequest,
    selectedMedia: MediaRetrievalResult,
    reason: string,
    allCandidates: MediaRetrievalResult[],
    guardrailResult: GuardrailCheckResult,
  ): Promise<MediaSelectionResult> {
    const candidatesConsidered: MediaCandidate[] = allCandidates.map((c) => ({
      mediaId: c.mediaId,
      objectId: c.objectId,
      objectName: c.objectName,
      mediaRole: c.mediaRole,
      caption: c.caption,
      similarity: c.similarity,
      eligibility: c.eligibility,
      selected: c.mediaId === selectedMedia.mediaId,
      rejectionReason:
        c.mediaId !== selectedMedia.mediaId
          ? 'Lower ranking than selected'
          : undefined,
    }));

    const auditId = await this.auditService.logDecision({
      messageId: request.messageId,
      chatId: request.chatId,
      userId: request.userId,
      mediaSent: true,
      selectedMediaId: selectedMedia.mediaId,
      objectId: selectedMedia.objectId,
      userIntent: this.classifyIntent(request.query),
      queryText: request.query,
      selectionReason: reason,
      guardrailsApplied: Object.keys(
        this.guardrailsService.getGuardrailConfig(),
      ),
      candidatesConsidered,
      similarityScore: selectedMedia.similarity,
      rankingScore: selectedMedia.rankingScore,
    });

    return {
      shouldSendMedia: true,
      selectedMedia,
      reason,
      auditId,
      guardrailsChecked: Object.keys(
        this.guardrailsService.getGuardrailConfig(),
      ),
      guardrailFailures: [],
    };
  }

  /**
   * Classify user intent from query
   * Note: Order matters! More specific intents should be checked first.
   */
  private classifyIntent(query: string): string {
    const lowercaseQuery = query.toLowerCase();

    // Check for explicit video requests FIRST (more specific than visual)
    // This handles cases like "do you have videos?" or "show me a video"
    if (/video|tour|walkthrough|clip|recording/.test(lowercaseQuery)) {
      return 'video_request';
    }

    // Check for document requests (PDFs, brochures)
    if (/brochure|catalog|document|pdf|file/.test(lowercaseQuery)) {
      return 'document_request';
    }

    // Check for visual requests (images, photos)
    if (/show|see|picture|photo|image|visual|look/.test(lowercaseQuery)) {
      return 'visual_request';
    }

    // Check for common intent patterns
    if (/price|cost|how much|pricing/.test(lowercaseQuery)) {
      return 'pricing_inquiry';
    }
    if (/floor plan|layout|blueprint/.test(lowercaseQuery)) {
      return 'floor_plan_request';
    }
    if (/location|address|map|where/.test(lowercaseQuery)) {
      return 'location_inquiry';
    }
    if (/specs|specification|features|details/.test(lowercaseQuery)) {
      return 'specification_inquiry';
    }

    return 'general_inquiry';
  }

  /**
   * Get audit information for a message
   *
   * Used to display "AI sent this media because..." tooltip
   */
  async getMediaDecisionForMessage(
    messageId: string,
  ): Promise<MediaDecisionAudit | null> {
    return this.auditService.getAuditLogForMessage(messageId);
  }

  /**
   * Mark a media decision as incorrect (human feedback)
   */
  async markMediaDecisionIncorrect(
    auditId: string,
    reason: string,
    correctMediaId?: string,
  ): Promise<void> {
    await this.auditService.recordFeedback(
      auditId,
      'incorrect',
      reason,
      correctMediaId,
    );

    this.logger.log(`Media decision ${auditId} marked as incorrect: ${reason}`);
  }

  /**
   * Disable media from AI usage after incorrect send
   */
  async disableMediaForAi(
    userId: number,
    mediaId: string,
    reason: string,
  ): Promise<void> {
    await this.mediaService.updateAiPermission(userId, mediaId, {
      aiEnabled: false,
    });

    this.logger.log(`Media ${mediaId} disabled for AI: ${reason}`);
  }

  // ============================================================================
  // PRE-CHECK FOR AI RESPONSE GENERATION
  // ============================================================================

  /**
   * Pre-check if media will be available for a query BEFORE generating AI response.
   *
   * This allows the AI to know it will have media to send, preventing contradictory
   * responses like "I can't send images" when an image will actually be attached.
   *
   * Call this BEFORE generating AI text to get media context for the prompt.
   *
   * @returns Information about available media for inclusion in AI prompt
   */
  async preCheckMediaAvailability(request: {
    query: string;
    chatId: string;
    userId: number;
    isFirstAiMessage?: boolean;
    lastMessageHadMedia?: boolean;
    aiMessageCount?: number;
    chatLanguage?: string;
    conversationContext?: string;
  }): Promise<{
    willHaveMedia: boolean;
    mediaDescription: string | null;
    mediaType: 'image' | 'video' | 'document' | 'audio' | null;
    mediaFileName: string | null;
    aiInstructions: string | null;
    blockedReason: string | null;
    suggestion: 'include_media_context' | 'text_only' | 'mention_later';
  }> {
    // Check if media feature is enabled
    if (!this.enabled) {
      return {
        willHaveMedia: false,
        mediaDescription: null,
        mediaType: null,
        mediaFileName: null,
        aiInstructions: null,
        blockedReason: 'Media feature is disabled',
        suggestion: 'text_only',
      };
    }

    // Step 1: Check guardrails first (without creating audit)
    const guardrailContext: MediaGuardrailContext = {
      chatId: request.chatId,
      userId: request.userId,
      userIntent: request.query,
      isFirstAiMessage: request.isFirstAiMessage,
      lastMessageHadMedia: request.lastMessageHadMedia,
      messageCountInConversation: request.aiMessageCount,
    };

    const guardrailResult =
      await this.guardrailsService.checkGuardrails(guardrailContext);

    if (!guardrailResult.passed) {
      // Check if it's a timing issue (can send later) vs permanent block
      const isTimingIssue = guardrailResult.failures.some(
        (f) =>
          f.rule === 'noMediaInFirstMessage' ||
          f.rule === 'mediaCooldownMs' ||
          f.rule === 'minMessagesBeforeMedia',
      );

      return {
        willHaveMedia: false,
        mediaDescription: null,
        mediaType: null,
        mediaFileName: null,
        aiInstructions: null,
        blockedReason: guardrailResult.explanation,
        suggestion: isTimingIssue ? 'mention_later' : 'text_only',
      };
    }

    // Step 2: Try to retrieve relevant media
    try {
      const retrievalResponse = await this.retrievalService.retrieveMedia(
        request.userId,
        request.query,
        {
          chatId: request.chatId,
          chatLanguage: request.chatLanguage,
          aiEnabledOnly: true,
          conversationContext: request.conversationContext,
          topK: 10, // Get more candidates for intent-based filtering (matching selectMediaForReply)
        },
      );

      if (retrievalResponse.results.length === 0) {
        return {
          willHaveMedia: false,
          mediaDescription: null,
          mediaType: null,
          mediaFileName: null,
          aiInstructions: null,
          blockedReason: 'No relevant media found',
          suggestion: 'text_only',
        };
      }

      // IMPORTANT: Use the same intent-based ranking as selectMediaForReply
      // This ensures pre-check and actual selection return the same media
      const userIntent = this.classifyIntent(request.query);
      const preferredMimeTypes = this.getPreferredMimeTypes(userIntent);
      const rankedResults = this.rankResultsByIntent(
        retrievalResponse.results,
        preferredMimeTypes,
        userIntent,
        request.query,
      );

      // Check eligibility of best candidate (after intent ranking)
      const bestMedia = rankedResults[0];
      const eligibility = await this.mediaService.checkAiEligibility(
        bestMedia.mediaId,
        request.chatId,
        request.chatLanguage,
      );

      if (!eligibility.isEligible && rankedResults.length > 1) {
        // Try fallback candidates
        for (let i = 1; i < rankedResults.length && i < 5; i++) {
          const fallbackMedia = rankedResults[i];
          const fallbackEligibility =
            await this.mediaService.checkAiEligibility(
              fallbackMedia.mediaId,
              request.chatId,
              request.chatLanguage,
            );

          if (fallbackEligibility.isEligible) {
            const mediaType = this.getMediaTypeFromMime(fallbackMedia.mimeType);
            return {
              willHaveMedia: true,
              mediaDescription:
                fallbackMedia.caption || fallbackMedia.objectName,
              mediaType,
              mediaFileName: fallbackMedia.fileName,
              aiInstructions: fallbackMedia.aiInstructions,
              blockedReason: null,
              suggestion: 'include_media_context',
            };
          }
        }
      }

      if (!eligibility.isEligible) {
        return {
          willHaveMedia: false,
          mediaDescription: null,
          mediaType: null,
          mediaFileName: null,
          aiInstructions: null,
          blockedReason: eligibility.explanation || 'Media not eligible',
          suggestion: 'text_only',
        };
      }

      // We have eligible media!
      const mediaType = this.getMediaTypeFromMime(bestMedia.mimeType);
      return {
        willHaveMedia: true,
        mediaDescription: bestMedia.caption || bestMedia.objectName,
        mediaType,
        mediaFileName: bestMedia.fileName,
        aiInstructions: bestMedia.aiInstructions,
        blockedReason: null,
        suggestion: 'include_media_context',
      };
    } catch (error) {
      this.logger.warn(
        `[Media Pre-check] Error checking media availability: ${error.message}`,
      );
      return {
        willHaveMedia: false,
        mediaDescription: null,
        mediaType: null,
        mediaFileName: null,
        aiInstructions: null,
        blockedReason: 'Error checking media',
        suggestion: 'text_only',
      };
    }
  }

  /**
   * Helper to convert MIME type to WhatsApp media type
   */
  private getMediaTypeFromMime(
    mimeType: string,
  ): 'image' | 'video' | 'document' | 'audio' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  }

  /**
   * Trigger vectorization for a media item (called after upload)
   */
  async vectorizeMedia(mediaId: string): Promise<void> {
    await this.vectorizationService.vectorizeMedia(mediaId);
  }

  /**
   * Get media selection statistics
   */
  async getMediaStats(
    userId: number,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalDecisions: number;
    mediasSent: number;
    mediasBlocked: number;
    topBlockReasons: Array<{ reason: string; count: number }>;
  }> {
    return this.auditService.getDecisionStats(userId, startDate, endDate);
  }

  /**
   * Parse AI instructions to extract eligibility conditions
   * Examples:
   * - "Send this video when the user asks about the studio apartment"
   * - "Send this when the conversation is about financial conditions and when conversation is in spanish"
   * - "Use only for apartment inquiries"
   *
   * Returns score 0-100 for how well this media matches the current context
   */
  /**
   * Parse AI instructions and determine if media is eligible for this user query.
   *
   * CRITICAL LOGIC:
   * - If media has SPECIFIC conditional instructions ("Send when X", "Use for Y"),
   *   and the user request DOES NOT match those conditions, media is INELIGIBLE
   * - If media has NO instructions, it's universally eligible (generic media)
   * - If media has instructions that DO match, it gets a HIGHER score
   *
   * This prevents sending leaseback video when user asks for studio apartment,
   * or Spanish-only video when conversation is in English.
   */
  private parseAiInstructionsEligibility(
    aiInstructions: string | null,
    userQuery: string,
  ): { isEligible: boolean; matchScore: number; reason: string } {
    if (!aiInstructions || aiInstructions.trim().length === 0) {
      // No instructions = generic media, send in any context
      return {
        isEligible: true,
        matchScore: 50,
        reason: 'No eligibility constraints (universal media)',
      };
    }

    const instructions = aiInstructions.toLowerCase();
    const query = userQuery.toLowerCase();

    this.logger.debug(
      `[Instruction Filter] Instructions: "${instructions.substring(0, 80)}..."`,
    );
    this.logger.debug(`[Instruction Filter] Query: "${query}"`);

    // Extract all conditional triggers from instructions
    // Pattern: "Send (this|when) <condition>" or "<MEDIA> for <purpose>"
    const triggers = this.extractInstructionTriggers(instructions, query);

    // CRITICAL: If media has explicit triggers but NONE match, it's INELIGIBLE
    if (triggers.hasExplicitTriggers && !triggers.anyTriggerMatches) {
      return {
        isEligible: false,
        matchScore: 0,
        reason: `Media has specific purpose constraints that don't match: ${triggers.unmatchedTriggers.join(', ')}`,
      };
    }

    // If media has triggers and some DO match, boost the score
    if (triggers.hasExplicitTriggers && triggers.anyTriggerMatches) {
      const matchCount = triggers.matchedTriggers.length;
      const score = 70 + matchCount * 15; // 70-100 based on how many triggers matched

      return {
        isEligible: true,
        matchScore: Math.min(100, score),
        reason: `Strong match: ${triggers.matchedTriggers.join(', ')}`,
      };
    }

    // Check for exclusive constraints ("Spanish-only", "For English conversations")
    const exclusiveConstraint = this.checkExclusiveConstraints(
      instructions,
      query,
    );
    if (exclusiveConstraint.isViolated) {
      return {
        isEligible: false,
        matchScore: 0,
        reason: exclusiveConstraint.reason,
      };
    }

    // No explicit triggers and no violations = generic media with moderate score
    return {
      isEligible: true,
      matchScore: 45,
      reason: 'No specific constraints match, but no violations either',
    };
  }

  /**
   * Extract explicit instruction triggers from aiInstructions.
   *
   * Looks for patterns like:
   * - "Send this when user asks about studio apartment"
   * - "Use for leaseback inquiries"
   * - "For properties in Argentina"
   */
  private extractInstructionTriggers(
    instructions: string,
    userQuery: string,
  ): {
    hasExplicitTriggers: boolean;
    anyTriggerMatches: boolean;
    matchedTriggers: string[];
    unmatchedTriggers: string[];
  } {
    const triggers: string[] = [];
    let hasExplicitTriggers = false;

    // Pattern 1: Look for "about X" - this captures the actual subject
    // Examples: "when user asks about studio apartment" -> "studio apartment"
    //           "inquiries about two bedroom" -> "two bedroom"
    const aboutPatterns = instructions.match(/\babout\s+(?:the\s+)?([^,.]+)/gi);
    if (aboutPatterns) {
      hasExplicitTriggers = true;
      for (const pattern of aboutPatterns) {
        // Extract what comes after "about" (and optional "the")
        const topic = pattern.replace(/^about\s+(?:the\s+)?/i, '').trim();
        if (topic.length > 0) {
          triggers.push(topic);
        }
      }
    }

    // Pattern 2: "for X" where X is specific (leaseback, investment, inquiries, etc)
    const forPatterns = instructions.match(/\bfor\s+([^,.]+)(?=[,.]\s|$)/gi);
    if (forPatterns) {
      for (const pattern of forPatterns) {
        const topic = pattern.replace(/^for\s+/i, '').trim();
        // Only consider "for X" as explicit if X is substantial (not generic "for users")
        if (
          topic.length > 3 &&
          !['users', 'properties', 'people'].includes(topic)
        ) {
          hasExplicitTriggers = true;
          triggers.push(topic);
        }
      }
    }

    // Pattern 3: "when X" - as fallback if no "about" found
    // Only use this if we haven't found triggers yet
    if (!hasExplicitTriggers) {
      const whenPatterns = instructions.match(/\bwhen\s+([^,.]+)/gi);
      if (whenPatterns) {
        for (const pattern of whenPatterns) {
          const topic = pattern.replace(/^when\s+/i, '').trim();
          // Filter out common non-specific phrases like "the user asks" or "customer wants"
          const isGeneric =
            /^(the\s+)?(user|customer|client|they|someone|people)\s+(asks?|wants?|needs?|is|are)/i.test(
              topic,
            );
          if (!isGeneric && topic.length > 5) {
            hasExplicitTriggers = true;
            triggers.push(topic);
          }
        }
      }
    }

    if (!hasExplicitTriggers) {
      return {
        hasExplicitTriggers: false,
        anyTriggerMatches: false,
        matchedTriggers: [],
        unmatchedTriggers: [],
      };
    }

    // Now check which triggers match the user query
    const matchedTriggers: string[] = [];
    const unmatchedTriggers: string[] = [];

    // Common stop words and action verbs to exclude from keyword matching
    const stopWords = new Set([
      'the',
      'for',
      'and',
      'this',
      'that',
      'with',
      'from',
      'about',
      'when',
      'user',
      'customer',
      'client',
      'asks',
      'asks',
      'asking',
      'wants',
      'needs',
      'looking',
      'inquires',
      'inquiring',
      'requests',
    ]);

    for (const trigger of triggers) {
      // Normalize trigger for matching - extract only meaningful nouns/adjectives
      const triggerKeywords = trigger
        .split(/\s+/)
        .filter(
          (word) => word.length > 2 && !stopWords.has(word.toLowerCase()),
        );

      // Debug logging for keyword extraction
      this.logger.debug(
        `[Instruction Filter] Trigger: "${trigger}" → keywords: [${triggerKeywords.join(', ')}]`,
      );

      // Check if query contains ALL significant keywords from the trigger
      const keywordMatches = triggerKeywords.map((keyword) => ({
        keyword,
        found: userQuery.includes(keyword.toLowerCase()),
      }));

      const allKeywordsMatch = keywordMatches.every((m) => m.found);

      this.logger.debug(
        `[Instruction Filter] Keyword matching: ${keywordMatches.map((m) => `${m.keyword}=${m.found ? '✓' : '✗'}`).join(', ')} → ${allKeywordsMatch ? 'MATCH' : 'NO MATCH'}`,
      );

      if (allKeywordsMatch) {
        matchedTriggers.push(trigger);
      } else {
        unmatchedTriggers.push(trigger);
      }
    }

    return {
      hasExplicitTriggers: true,
      anyTriggerMatches: matchedTriggers.length > 0,
      matchedTriggers,
      unmatchedTriggers,
    };
  }

  /**
   * Check for exclusive constraints like "Spanish-only" or "For English conversations".
   *
   * These are HARD blocks - if violated, media is completely ineligible.
   */
  private checkExclusiveConstraints(
    instructions: string,
    userQuery: string,
  ): { isViolated: boolean; reason: string } {
    // Check for language-exclusive constraints
    if (instructions.includes('spanish') && instructions.includes('only')) {
      // This video is Spanish-only, but user is likely not in Spanish
      // We would need conversation language from context, for now check query language hints
      if (!userQuery.includes('español') && !userQuery.includes('spanish')) {
        return {
          isViolated: true,
          reason:
            'Media is Spanish-only but conversation appears to be in different language',
        };
      }
    }

    if (instructions.includes('english') && instructions.includes('only')) {
      if (userQuery.includes('español') || userQuery.includes('portugués')) {
        return {
          isViolated: true,
          reason:
            'Media is English-only but conversation is in different language',
        };
      }
    }

    return { isViolated: false, reason: '' };
  }
}
