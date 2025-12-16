"use client";

/**
 * Link Preview Component
 * Displays Open Graph metadata for URLs with thumbnail, title, and description
 * Layout: Vertical card with image on top, content below (like WhatsApp)
 */

import { backendApi } from "@/lib/api/endpoints";
import {
  extractYouTubeVideoId,
  isYouTubeUrl,
  LinkPreviewData,
} from "@/lib/link-preview";
import { ExternalLink, Globe, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

interface LinkPreviewProps {
  url: string;
  isOutbound?: boolean;
  onVideoPlay?: (videoId: string, url: string) => void;
}

export function LinkPreview({
  url,
  isOutbound = false,
  onVideoPlay,
}: LinkPreviewProps) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        setLoading(true);
        const data = (await backendApi.linkPreview.get(url)) as LinkPreviewData;
        setPreview(data);
      } catch (error) {
        console.error("Failed to fetch link preview:", error);
        // Extract domain for fallback
        let domain = "";
        try {
          domain = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          domain = url;
        }
        setPreview({
          url,
          domain,
          success: false,
          error: "Failed to fetch",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [url]);

  const handleClick = (e: React.MouseEvent) => {
    // Don't open link if clicking play button
    if ((e.target as HTMLElement).closest(".play-button")) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const videoId = preview?.youtubeVideoId || extractYouTubeVideoId(url);
    if (videoId && onVideoPlay) {
      onVideoPlay(videoId, url);
    }
  };

  if (loading) {
    return (
      <div
        className={`mt-2 rounded-lg overflow-hidden border animate-pulse ${
          isOutbound
            ? "border-primary-foreground/20 bg-primary-foreground/10"
            : "border-border bg-muted/50"
        }`}
      >
        {/* Skeleton for image */}
        <div className="w-full h-32 bg-gray-300/30" />
        {/* Skeleton for content */}
        <div className="p-2.5 space-y-2">
          <div className="h-3 bg-gray-300/30 rounded w-3/4" />
          <div className="h-2 bg-gray-300/30 rounded w-full" />
          <div className="h-2 bg-gray-300/30 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!preview) return null;

  const isYouTube = isYouTubeUrl(url);
  const hasImage = preview.image && !imageError;
  const videoId = preview.youtubeVideoId || extractYouTubeVideoId(url);

  // Format the display URL (remove protocol and trailing slash)
  const displayUrl = url
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .split("/")[0]; // Just the domain

  return (
    <div
      onClick={handleClick}
      className={`mt-2 rounded-lg overflow-hidden border cursor-pointer transition-all hover:shadow-md max-w-[280px] ${
        isOutbound
          ? "border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/15"
          : "border-border bg-background hover:bg-muted/50"
      }`}
    >
      {/* Image/Thumbnail Section - Top of card */}
      {isYouTube && videoId ? (
        <div className="relative w-full aspect-video bg-black">
          <Image
            src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
            alt={preview.title || "YouTube video"}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
            unoptimized
          />
          {/* Play Button Overlay */}
          {onVideoPlay && (
            <button
              onClick={handlePlayClick}
              className="play-button absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors group"
            >
              <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <Play className="w-6 h-6 text-white fill-white ml-0.5" />
              </div>
            </button>
          )}
        </div>
      ) : hasImage ? (
        <div className="relative w-full h-36 bg-muted">
          <Image
            src={preview.image!}
            alt={preview.title || "Link preview"}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
            unoptimized
          />
        </div>
      ) : (
        // Fallback: Show favicon in a colored background
        <div
          className={`w-full h-20 flex items-center justify-center ${
            isOutbound ? "bg-primary-foreground/5" : "bg-muted/80"
          }`}
        >
          {preview.favicon ? (
            <Image
              src={preview.favicon}
              alt=""
              width={48}
              height={48}
              className="rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
              unoptimized
            />
          ) : (
            <Globe
              className={`w-10 h-10 ${
                isOutbound
                  ? "text-primary-foreground/30"
                  : "text-muted-foreground/50"
              }`}
            />
          )}
        </div>
      )}

      {/* Content Section - Bottom of card */}
      <div className="p-2.5">
        {/* Title */}
        {preview.title && (
          <p
            className={`text-xs font-medium line-clamp-2 leading-tight ${
              isOutbound ? "text-primary-foreground" : "text-foreground"
            }`}
          >
            {preview.title}
          </p>
        )}

        {/* Description - truncated */}
        {preview.description && (
          <p
            className={`text-[11px] line-clamp-2 mt-1 leading-tight ${
              isOutbound
                ? "text-primary-foreground/70"
                : "text-muted-foreground"
            }`}
          >
            {preview.description}
          </p>
        )}

        {/* Website domain and link */}
        <div className="mt-2 flex items-center gap-1.5">
          {/* Favicon */}
          {preview.favicon && hasImage && (
            <div className="w-3.5 h-3.5 flex-shrink-0">
              <Image
                src={preview.favicon}
                alt=""
                width={14}
                height={14}
                className="rounded-sm"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
                unoptimized
              />
            </div>
          )}

          {/* Domain */}
          <p
            className={`text-[10px] truncate flex-1 ${
              isOutbound
                ? "text-primary-foreground/50"
                : "text-muted-foreground/70"
            }`}
          >
            {displayUrl}
          </p>

          {/* External link icon */}
          <ExternalLink
            className={`w-3 h-3 flex-shrink-0 ${
              isOutbound
                ? "text-primary-foreground/40"
                : "text-muted-foreground/50"
            }`}
          />
        </div>
      </div>
    </div>
  );
}
