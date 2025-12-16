/**
 * Link Preview Types
 * Type definitions for link preview/Open Graph metadata system
 */

/**
 * Open Graph metadata for a URL
 */
export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
  type?: string;
  // Video-specific fields
  videoUrl?: string;
  videoType?: string;
  videoWidth?: number;
  videoHeight?: number;
  // Domain info
  domain: string;
  // YouTube specific
  youtubeVideoId?: string;
  // Metadata fetch status
  success: boolean;
  error?: string;
}

/**
 * Request DTO for link preview
 */
export interface LinkPreviewRequest {
  url: string;
}

/**
 * Cached link preview entry
 */
export interface CachedLinkPreview {
  data: LinkPreviewData;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Known domains with fallback icons
 */
export const KNOWN_DOMAIN_ICONS: Record<string, string> = {
  'youtube.com': 'https://www.youtube.com/s/desktop/favicon.ico',
  'youtu.be': 'https://www.youtube.com/s/desktop/favicon.ico',
  'facebook.com': 'https://www.facebook.com/favicon.ico',
  'instagram.com': 'https://www.instagram.com/favicon.ico',
  'twitter.com': 'https://twitter.com/favicon.ico',
  'x.com': 'https://x.com/favicon.ico',
  'linkedin.com': 'https://www.linkedin.com/favicon.ico',
  'tiktok.com': 'https://www.tiktok.com/favicon.ico',
  'canva.com': 'https://www.canva.com/favicon.ico',
  'github.com': 'https://github.com/favicon.ico',
  'reddit.com': 'https://www.reddit.com/favicon.ico',
  'pinterest.com': 'https://www.pinterest.com/favicon.ico',
  'spotify.com': 'https://www.spotify.com/favicon.ico',
  'vimeo.com': 'https://vimeo.com/favicon.ico',
  'twitch.tv': 'https://www.twitch.tv/favicon.ico',
  'whatsapp.com': 'https://web.whatsapp.com/favicon.ico',
  'telegram.org': 'https://telegram.org/favicon.ico',
  'discord.com': 'https://discord.com/favicon.ico',
  'slack.com': 'https://slack.com/favicon.ico',
  'notion.so': 'https://www.notion.so/favicon.ico',
  'figma.com': 'https://www.figma.com/favicon.ico',
  'dribbble.com': 'https://dribbble.com/favicon.ico',
  'medium.com': 'https://medium.com/favicon.ico',
  'stackoverflow.com': 'https://stackoverflow.com/favicon.ico',
  'amazon.com': 'https://www.amazon.com/favicon.ico',
  'netflix.com': 'https://www.netflix.com/favicon.ico',
  'google.com': 'https://www.google.com/favicon.ico',
  'docs.google.com':
    'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico',
  'drive.google.com':
    'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png',
  'meet.google.com':
    'https://fonts.gstatic.com/s/i/productlogos/meet_2020q4/v1/web-48dp/logo_meet_2020q4_color_1x_web_48dp.png',
};
