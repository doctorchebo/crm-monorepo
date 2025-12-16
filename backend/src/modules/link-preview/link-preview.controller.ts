/**
 * Link Preview Controller
 * REST API endpoints for fetching link preview metadata
 */

import { JwtAuthGuard } from '@modules/auth/auth.guard';
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { LinkPreviewService } from './link-preview.service';
import { LinkPreviewData } from './link-preview.types';

@Controller('link-preview')
@UseGuards(JwtAuthGuard)
export class LinkPreviewController {
  constructor(private readonly linkPreviewService: LinkPreviewService) {}

  /**
   * GET /link-preview?url=xxx
   * Fetch link preview for a single URL
   */
  @Get()
  async getLinkPreview(@Query('url') url: string): Promise<LinkPreviewData> {
    if (!url) {
      return {
        url: '',
        domain: '',
        success: false,
        error: 'URL is required',
      };
    }

    return this.linkPreviewService.fetchLinkPreview(url);
  }

  /**
   * POST /link-preview/batch
   * Fetch link previews for multiple URLs
   */
  @Post('batch')
  async getBatchLinkPreviews(
    @Body() body: { urls: string[] },
  ): Promise<Record<string, LinkPreviewData>> {
    if (!body.urls || !Array.isArray(body.urls) || body.urls.length === 0) {
      return {};
    }

    // Limit to 10 URLs per request
    const urls = body.urls.slice(0, 10);
    const results =
      await this.linkPreviewService.fetchMultipleLinkPreviews(urls);

    // Convert Map to plain object for JSON response
    const response: Record<string, LinkPreviewData> = {};
    for (const [url, data] of results.entries()) {
      response[url] = data;
    }

    return response;
  }
}
