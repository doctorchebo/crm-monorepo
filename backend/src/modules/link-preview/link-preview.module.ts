/**
 * Link Preview Module
 * Module for fetching and caching link preview metadata (Open Graph)
 */

import { Module } from '@nestjs/common';
import { LinkPreviewController } from './link-preview.controller';
import { LinkPreviewService } from './link-preview.service';

@Module({
  controllers: [LinkPreviewController],
  providers: [LinkPreviewService],
  exports: [LinkPreviewService],
})
export class LinkPreviewModule {}
