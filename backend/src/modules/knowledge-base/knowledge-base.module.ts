/**
 * Knowledge Base Module
 *
 * Manages structured knowledge objects for AI retrieval.
 * Provides templates, object management, chunking, embedding, and semantic search.
 * Includes media management with AI eligibility, guardrails, and audit trail.
 */

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImageProcessingService } from '@shared/services/image-processing.service';
import { S3Service } from '@shared/services/s3.service';
import { AiMemoryModule } from '../ai-memory/ai-memory.module';
import { MediaCompressionModule } from '../media-compression/media-compression.module';
import { ThumbnailModule } from '../thumbnail/thumbnail.module';
import { VideoCompressionModule } from '../video-compression/video-compression.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { TeamModule } from '../team/team.module';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KbMediaController } from './media.controller';
import { KnowledgeBaseRepository } from './repositories/knowledge-base.repository';
import {
  IndexingService,
  // Media services
  KbMediaService,
  KbThumbnailService,
  KnowledgeBaseStorageService,
  MediaDecisionAuditService,
  MediaGuardrailsService,
  MediaOrchestratorService,
  MediaRetrievalService,
  MediaVectorizationService,
  ObjectService,
  RetrievalService,
  TemplateService,
} from './services';

@Module({
  imports: [
    ConfigModule,
    AiMemoryModule, // For EmbeddingService
    ThumbnailModule, // For Lambda thumbnail service (via MediaCompressionModule)
    VideoCompressionModule, // For video compression queue
    MediaCompressionModule, // For Lambda compression (primary)
    forwardRef(() => WhatsAppModule), // For ConversationWindowService
    TeamModule,
  ],
  controllers: [KnowledgeBaseController, KbMediaController],
  providers: [
    // Repository
    KnowledgeBaseRepository,
    // Shared Services
    S3Service,
    ImageProcessingService,
    // Core Services
    TemplateService,
    ObjectService,
    IndexingService,
    RetrievalService,
    KnowledgeBaseStorageService,
    // Media Services
    KbMediaService,
    KbThumbnailService,
    MediaRetrievalService,
    MediaGuardrailsService,
    MediaDecisionAuditService,
    MediaVectorizationService,
    MediaOrchestratorService,
  ],
  exports: [
    KnowledgeBaseRepository,
    TemplateService,
    ObjectService,
    IndexingService,
    RetrievalService,
    KnowledgeBaseStorageService,
    // Export media services for AI reply integration
    KbMediaService,
    KbThumbnailService,
    MediaRetrievalService,
    MediaGuardrailsService,
    MediaOrchestratorService,
  ],
})
export class KnowledgeBaseModule {}
