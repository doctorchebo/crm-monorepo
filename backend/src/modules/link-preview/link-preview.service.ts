/**
 * Link Preview Service
 * Fetches Open Graph metadata for URLs to generate link previews
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  CachedLinkPreview,
  KNOWN_DOMAIN_ICONS,
  LinkPreviewData,
} from './link-preview.types';

@Injectable()
export class LinkPreviewService {
  private readonly logger = new Logger(LinkPreviewService.name);
  private readonly cache = new Map<string, CachedLinkPreview>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  /**
   * Extract YouTube video ID from various YouTube URL formats
   */
  private extractYouTubeVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\s?]+)/,
      /youtube\.com\/shorts\/([^&\s?]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Check if URL is from Facebook/Instagram
   */
  private isFacebookOrInstagram(url: string): boolean {
    const domain = this.extractDomain(url);
    return (
      domain.includes('facebook.com') ||
      domain.includes('fb.watch') ||
      domain.includes('instagram.com')
    );
  }

  /**
   * Extract Instagram post/reel ID
   */
  private extractInstagramId(url: string): string | null {
    const patterns = [
      /instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/,
      /instagram\.com\/stories\/[^/]+\/([0-9]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Extract Facebook post/video ID
   */
  private extractFacebookId(url: string): {
    type: string;
    id: string;
  } | null {
    // Facebook video patterns
    const videoPatterns = [
      /facebook\.com\/(?:watch\/?\?v=|videos\/|reel\/)(\d+)/,
      /fb\.watch\/([A-Za-z0-9_-]+)/,
      /facebook\.com\/[^/]+\/videos\/(\d+)/,
    ];

    for (const pattern of videoPatterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return { type: 'video', id: match[1] };
      }
    }

    // Facebook post patterns
    const postPatterns = [
      /facebook\.com\/[^/]+\/posts\/([A-Za-z0-9_-]+)/,
      /facebook\.com\/permalink\.php\?.*story_fbid=(\d+)/,
    ];

    for (const pattern of postPatterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return { type: 'post', id: match[1] };
      }
    }

    return null;
  }

  /**
   * Get favicon URL for a domain
   */
  private getFaviconUrl(domain: string, baseUrl: string): string {
    // Check known domains first
    for (const [knownDomain, iconUrl] of Object.entries(KNOWN_DOMAIN_ICONS)) {
      if (domain.includes(knownDomain)) {
        return iconUrl;
      }
    }

    // Use Google's favicon service as fallback
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  }

  /**
   * Parse HTML and extract Open Graph metadata
   */
  private parseOpenGraphMetadata(
    html: string,
    url: string,
  ): Partial<LinkPreviewData> {
    const result: Partial<LinkPreviewData> = {};

    // Helper to extract meta content - improved regex to handle more formats
    const getMetaContent = (
      property: string,
      nameAttr = 'property',
    ): string | undefined => {
      // Try multiple regex patterns for different HTML formats
      const patterns = [
        // Standard format: property="og:xxx" content="value"
        new RegExp(
          `<meta[^>]*${nameAttr}=["']${property}["'][^>]*content=["']([^"']*)["']`,
          'i',
        ),
        // Reversed format: content="value" property="og:xxx"
        new RegExp(
          `<meta[^>]*content=["']([^"']*)["'][^>]*${nameAttr}=["']${property}["']`,
          'i',
        ),
        // With spaces and other attributes
        new RegExp(
          `<meta[^>]+${nameAttr}\\s*=\\s*["']${property}["'][^>]+content\\s*=\\s*["']([^"']*)["']`,
          'i',
        ),
      ];

      for (const regex of patterns) {
        const match = html.match(regex);
        if (match && match[1]) {
          return this.decodeHtmlEntities(match[1]);
        }
      }
      return undefined;
    };

    // Extract Open Graph tags
    result.title =
      getMetaContent('og:title') ||
      getMetaContent('twitter:title', 'name') ||
      this.extractTitleTag(html);
    result.description =
      getMetaContent('og:description') ||
      getMetaContent('twitter:description', 'name') ||
      getMetaContent('description', 'name');
    result.image =
      getMetaContent('og:image') ||
      getMetaContent('og:image:url') ||
      getMetaContent('og:image:secure_url') ||
      getMetaContent('twitter:image', 'name') ||
      getMetaContent('twitter:image:src', 'name');
    result.siteName = getMetaContent('og:site_name');
    result.type = getMetaContent('og:type');

    // Video metadata
    result.videoUrl =
      getMetaContent('og:video') ||
      getMetaContent('og:video:url') ||
      getMetaContent('og:video:secure_url');
    result.videoType = getMetaContent('og:video:type');
    const videoWidth = getMetaContent('og:video:width');
    const videoHeight = getMetaContent('og:video:height');
    if (videoWidth) result.videoWidth = parseInt(videoWidth, 10);
    if (videoHeight) result.videoHeight = parseInt(videoHeight, 10);

    // Convert relative image URLs to absolute
    if (result.image && !result.image.startsWith('http')) {
      try {
        const urlObj = new URL(url);
        result.image = new URL(result.image, urlObj.origin).href;
      } catch {
        // Keep the relative URL if parsing fails
      }
    }

    return result;
  }

  /**
   * Decode HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
  }

  /**
   * Extract title from <title> tag
   */
  private extractTitleTag(html: string): string | undefined {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? this.decodeHtmlEntities(match[1].trim()) : undefined;
  }

  /**
   * Fetch link preview data for a URL
   */
  async fetchLinkPreview(url: string): Promise<LinkPreviewData> {
    const domain = this.extractDomain(url);

    // Check cache first
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`Cache hit for ${url}`);
      return cached.data;
    }

    try {
      // Normalize the URL
      let normalizedUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        normalizedUrl = `https://${url}`;
      }

      // Check for YouTube and handle specially
      const youtubeVideoId = this.extractYouTubeVideoId(normalizedUrl);
      if (youtubeVideoId) {
        return this.fetchYouTubePreview(normalizedUrl, youtubeVideoId, domain);
      }

      // Check for Instagram and handle specially
      if (domain.includes('instagram.com')) {
        return this.fetchInstagramPreview(normalizedUrl, domain);
      }

      // Check for Facebook and handle specially
      if (
        domain.includes('facebook.com') ||
        domain.includes('fb.watch') ||
        domain.includes('fb.com')
      ) {
        return this.fetchFacebookPreview(normalizedUrl, domain);
      }

      // Fetch the page with appropriate headers
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(normalizedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Only read first 100KB to avoid large responses
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      let html = '';
      const decoder = new TextDecoder();
      const maxBytes = 100 * 1024;
      let bytesRead = 0;

      while (bytesRead < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;

        html += decoder.decode(value, { stream: true });
        bytesRead += value.length;

        // Stop early if we've found all the meta tags we need
        if (html.includes('</head>')) break;
      }

      reader.cancel();

      // Parse Open Graph metadata
      const metadata = this.parseOpenGraphMetadata(html, normalizedUrl);

      const result: LinkPreviewData = {
        url: normalizedUrl,
        domain,
        title: metadata.title,
        description: metadata.description,
        image: metadata.image,
        siteName: metadata.siteName,
        favicon: this.getFaviconUrl(domain, normalizedUrl),
        type: metadata.type,
        videoUrl: metadata.videoUrl,
        videoType: metadata.videoType,
        videoWidth: metadata.videoWidth,
        videoHeight: metadata.videoHeight,
        success: true,
      };

      // Cache the result
      this.cacheResult(url, result);

      return result;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch link preview for ${url}: ${error.message}`,
      );

      // Return basic info even on failure
      const result: LinkPreviewData = {
        url,
        domain,
        favicon: this.getFaviconUrl(domain, url),
        success: false,
        error: error.message,
      };

      // Cache failed results for shorter time (1 hour)
      this.cache.set(url, {
        data: result,
        cachedAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000,
      });

      return result;
    }
  }

  /**
   * Fetch Instagram preview
   * Instagram blocks most scraping, so we use their OEmbed API when possible
   */
  private async fetchInstagramPreview(
    url: string,
    domain: string,
  ): Promise<LinkPreviewData> {
    try {
      // Try to fetch with the Facebook bot user agent (often works better)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      let html = '';
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        const maxBytes = 150 * 1024;
        let bytesRead = 0;

        while (bytesRead < maxBytes) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
          bytesRead += value.length;
          if (html.includes('</head>')) break;
        }
        reader.cancel();
      }

      const metadata = this.parseOpenGraphMetadata(html, url);

      // Determine content type from URL
      let contentType = 'Post';
      if (url.includes('/reel/') || url.includes('/reels/')) {
        contentType = 'Reel';
      } else if (url.includes('/stories/')) {
        contentType = 'Story';
      } else if (url.includes('/p/')) {
        contentType = 'Post';
      }

      // Extract username from title if present
      let title = metadata.title;
      if (
        !title ||
        title === 'Instagram' ||
        title.includes('Login') ||
        title.length < 3
      ) {
        // Try to extract from URL
        const usernameMatch = url.match(
          /instagram\.com\/([^/?]+)(?:\/(?:p|reel|reels|stories))?/,
        );
        if (usernameMatch && usernameMatch[1]) {
          title = `${contentType} by @${usernameMatch[1]}`;
        } else {
          title = `Instagram ${contentType}`;
        }
      }

      const result: LinkPreviewData = {
        url,
        domain,
        title,
        description: metadata.description,
        image: metadata.image,
        siteName: 'Instagram',
        favicon: KNOWN_DOMAIN_ICONS['instagram.com'],
        type: contentType.toLowerCase(),
        videoUrl: metadata.videoUrl,
        success: true,
      };

      this.cacheResult(url, result);
      return result;
    } catch (error) {
      this.logger.warn(`Instagram preview failed for ${url}: ${error.message}`);

      // Return basic Instagram info
      let contentType = 'Post';
      if (url.includes('/reel/') || url.includes('/reels/')) {
        contentType = 'Reel';
      } else if (url.includes('/stories/')) {
        contentType = 'Story';
      }

      const result: LinkPreviewData = {
        url,
        domain,
        title: `Instagram ${contentType}`,
        siteName: 'Instagram',
        favicon: KNOWN_DOMAIN_ICONS['instagram.com'],
        type: contentType.toLowerCase(),
        success: true, // Mark as success with basic info
      };

      this.cacheResult(url, result);
      return result;
    }
  }

  /**
   * Fetch Facebook preview
   */
  private async fetchFacebookPreview(
    url: string,
    domain: string,
  ): Promise<LinkPreviewData> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Use Facebook's bot user agent for better results
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      let html = '';
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        const maxBytes = 150 * 1024;
        let bytesRead = 0;

        while (bytesRead < maxBytes) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
          bytesRead += value.length;
          if (html.includes('</head>')) break;
        }
        reader.cancel();
      }

      const metadata = this.parseOpenGraphMetadata(html, url);

      // Determine content type
      let contentType = 'Post';
      if (
        url.includes('/videos/') ||
        url.includes('/watch') ||
        url.includes('/reel/') ||
        url.includes('fb.watch')
      ) {
        contentType = 'Video';
      } else if (url.includes('/photos/')) {
        contentType = 'Photo';
      }

      // Clean up title if it's generic
      let title = metadata.title;
      if (
        !title ||
        title === 'Facebook' ||
        title.includes('Log in') ||
        title.length < 3
      ) {
        title = `Facebook ${contentType}`;
      }

      const result: LinkPreviewData = {
        url,
        domain: 'facebook.com',
        title,
        description: metadata.description,
        image: metadata.image,
        siteName: metadata.siteName || 'Facebook',
        favicon: KNOWN_DOMAIN_ICONS['facebook.com'],
        type: contentType.toLowerCase(),
        videoUrl: metadata.videoUrl,
        success: true,
      };

      this.cacheResult(url, result);
      return result;
    } catch (error) {
      this.logger.warn(`Facebook preview failed for ${url}: ${error.message}`);

      // Determine content type from URL
      let contentType = 'Post';
      if (
        url.includes('/videos/') ||
        url.includes('/watch') ||
        url.includes('/reel/') ||
        url.includes('fb.watch')
      ) {
        contentType = 'Video';
      }

      const result: LinkPreviewData = {
        url,
        domain: 'facebook.com',
        title: `Facebook ${contentType}`,
        siteName: 'Facebook',
        favicon: KNOWN_DOMAIN_ICONS['facebook.com'],
        type: contentType.toLowerCase(),
        success: true, // Mark as success with basic info
      };

      this.cacheResult(url, result);
      return result;
    }
  }

  /**
   * Fetch YouTube preview using oEmbed API
   */
  private async fetchYouTubePreview(
    url: string,
    videoId: string,
    domain: string,
  ): Promise<LinkPreviewData> {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

      const response = await fetch(oembedUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`YouTube oEmbed failed: ${response.status}`);
      }

      const data = await response.json();

      const result: LinkPreviewData = {
        url,
        domain,
        title: data.title,
        siteName: data.provider_name || 'YouTube',
        image: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        favicon: KNOWN_DOMAIN_ICONS['youtube.com'],
        type: 'video',
        youtubeVideoId: videoId,
        videoWidth: data.width,
        videoHeight: data.height,
        success: true,
      };

      this.cacheResult(url, result);
      return result;
    } catch (error) {
      this.logger.warn(`YouTube oEmbed failed for ${url}: ${error.message}`);

      // Return basic YouTube info
      const result: LinkPreviewData = {
        url,
        domain,
        title: 'YouTube Video',
        siteName: 'YouTube',
        image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        favicon: KNOWN_DOMAIN_ICONS['youtube.com'],
        type: 'video',
        youtubeVideoId: videoId,
        success: true,
      };

      this.cacheResult(url, result);
      return result;
    }
  }

  /**
   * Cache a link preview result
   */
  private cacheResult(url: string, data: LinkPreviewData): void {
    this.cache.set(url, {
      data,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.CACHE_TTL,
    });

    // Clean up old cache entries periodically
    if (this.cache.size > 1000) {
      this.cleanupCache();
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Batch fetch link previews for multiple URLs
   */
  async fetchMultipleLinkPreviews(
    urls: string[],
  ): Promise<Map<string, LinkPreviewData>> {
    const results = new Map<string, LinkPreviewData>();

    // Process in parallel with limited concurrency
    const batchSize = 5;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((url) => this.fetchLinkPreview(url)),
      );

      batch.forEach((url, index) => {
        results.set(url, batchResults[index]);
      });
    }

    return results;
  }
}
