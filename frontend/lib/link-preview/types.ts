/**
 * Link Preview Types
 * Type definitions for link preview components
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
 * URL regex pattern for detecting links in text
 */
export const URL_REGEX =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

/**
 * Extract URLs from text
 */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Check if URL is a YouTube video
 */
export function isYouTubeUrl(url: string): boolean {
  return (
    url.includes("youtube.com") ||
    url.includes("youtu.be") ||
    url.includes("youtube.com/shorts")
  );
}

/**
 * Extract YouTube video ID from URL
 */
export function extractYouTubeVideoId(url: string): string | null {
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
 * Check if URL is for a video platform (playable in preview)
 */
export function isVideoUrl(url: string): boolean {
  return (
    isYouTubeUrl(url) ||
    url.includes("vimeo.com") ||
    url.includes("twitch.tv") ||
    url.includes("dailymotion.com")
  );
}
