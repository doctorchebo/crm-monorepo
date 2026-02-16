"use client";

/**
 * Template Header Media
 *
 * Shared component for rendering template header media in both:
 * - The send modal preview (when composing)
 * - The message bubble (after sending)
 *
 * Supports all Meta-supported header formats:
 * - TEXT: Bold header text
 * - IMAGE: Thumbnail preview via <img>
 * - VIDEO: Embedded <video> player
 * - DOCUMENT: Filename with document icon
 * - LOCATION: Static map tile (OpenStreetMap) with name/address overlay
 *
 * @see https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components
 */

import { cn } from "@/lib/utils";
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  MapPin,
  Video,
} from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────

export interface TemplateHeaderMediaProps {
  /** Header format: TEXT, IMAGE, VIDEO, DOCUMENT, LOCATION */
  format: string;
  /** For TEXT headers: the text content (already resolved) */
  text?: string | null;
  /** For IMAGE headers: image URL */
  imageUrl?: string | null;
  /** For VIDEO headers: video URL */
  videoUrl?: string | null;
  /** For VIDEO headers: thumbnail/poster image URL */
  thumbnailUrl?: string | null;
  /** For DOCUMENT headers: document URL */
  documentUrl?: string | null;
  /** For DOCUMENT headers: filename */
  documentFilename?: string | null;
  /** For LOCATION headers: latitude (string or number) */
  latitude?: string | number | null;
  /** For LOCATION headers: longitude (string or number) */
  longitude?: string | number | null;
  /** For LOCATION headers: location name (e.g. "Philz Coffee") */
  locationName?: string | null;
  /** For LOCATION headers: address (e.g. "101 Forest Ave, Palo Alto, CA") */
  locationAddress?: string | null;
  /** Visual variant: "bubble" for chat, "preview" for send modal */
  variant?: "bubble" | "preview";
  /** Whether the bubble is outbound (affects text colors) */
  isOutbound?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Build an OpenStreetMap static tile URL for a map preview */
function buildStaticMapUrl(
  lat: number,
  lng: number,
  width = 400,
  height = 200,
  zoom = 15,
): string {
  // Use OpenStreetMap's tile layer via a static image proxy.
  // This is the most reliable free option that doesn't require API keys.
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&markers=${lat},${lng},red-pushpin`;
}

/** Validate that a URL looks usable for an <img>/<video> src */
function isValidMediaUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:")
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

/** Fallback placeholder when no media URL is available */
function MediaPlaceholder({
  icon: Icon,
  label,
  className,
}: {
  icon: React.ElementType;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md bg-muted/70 border border-dashed border-border",
        "flex items-center justify-center gap-2 text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-xs">{label}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────

export const TemplateHeaderMedia = memo(function TemplateHeaderMedia({
  format,
  text,
  imageUrl,
  videoUrl,
  thumbnailUrl,
  documentUrl,
  documentFilename,
  latitude,
  longitude,
  locationName,
  locationAddress,
  variant = "preview",
  isOutbound = false,
}: TemplateHeaderMediaProps) {
  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoThumbnailError, setVideoThumbnailError] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Reset error states when URLs change (e.g. when freshMediaUrl resolves
  // asynchronously, replacing a stale URL that previously failed).
  useEffect(() => setImageError(false), [imageUrl]);
  useEffect(() => setVideoError(false), [videoUrl]);
  useEffect(() => setVideoThumbnailError(false), [thumbnailUrl]);

  const handleImageError = useCallback(() => setImageError(true), []);
  const handleVideoError = useCallback(() => setVideoError(true), []);
  const handleVideoThumbnailError = useCallback(
    () => setVideoThumbnailError(true),
    [],
  );
  const handleMapError = useCallback(() => setMapError(true), []);

  const upperFormat = format?.toUpperCase();
  const isBubble = variant === "bubble";

  // ── TEXT ──
  if (!upperFormat || upperFormat === "TEXT") {
    if (!text) return null;
    return (
      <div
        className={cn(
          "font-semibold text-sm mb-1",
          isBubble
            ? isOutbound
              ? "text-primary-foreground"
              : "text-foreground"
            : "font-semibold",
        )}
      >
        {text}
      </div>
    );
  }

  // ── IMAGE ──
  if (upperFormat === "IMAGE") {
    if (isValidMediaUrl(imageUrl) && !imageError) {
      return (
        <div
          className={cn(
            "rounded-md overflow-hidden",
            isBubble ? "mb-2" : "mb-0",
          )}
        >
          <img
            src={imageUrl}
            alt="Template header"
            className="w-full h-auto max-h-48 object-cover rounded-md"
            onError={handleImageError}
            loading="lazy"
          />
        </div>
      );
    }
    return (
      <MediaPlaceholder
        icon={ImageIcon}
        label="Image header"
        className={cn("h-32", isBubble ? "mb-2" : "")}
      />
    );
  }

  // ── VIDEO ──
  if (upperFormat === "VIDEO") {
    // Primary: try the <video> player
    if (isValidMediaUrl(videoUrl) && !videoError) {
      return (
        <div
          className={cn(
            "rounded-md overflow-hidden",
            isBubble ? "mb-2" : "mb-0",
          )}
        >
          <video
            src={videoUrl}
            controls
            preload="none"
            poster={isValidMediaUrl(thumbnailUrl) ? thumbnailUrl! : undefined}
            className="w-full max-h-48 rounded-md bg-black"
            onError={handleVideoError}
          />
        </div>
      );
    }
    // Fallback: show thumbnail as a still image when video URL fails
    if (isValidMediaUrl(thumbnailUrl) && !videoThumbnailError) {
      return (
        <div
          className={cn(
            "rounded-md overflow-hidden relative",
            isBubble ? "mb-2" : "mb-0",
          )}
        >
          <img
            src={thumbnailUrl}
            alt="Video thumbnail"
            className="w-full h-auto max-h-48 object-cover rounded-md"
            onError={handleVideoThumbnailError}
            loading="lazy"
          />
          {/* Play icon overlay to indicate this is a video */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="rounded-full bg-black/50 p-2">
              <Video className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
      );
    }
    return (
      <MediaPlaceholder
        icon={Video}
        label="Video header"
        className={cn("h-32", isBubble ? "mb-2" : "")}
      />
    );
  }

  // ── DOCUMENT ──
  if (upperFormat === "DOCUMENT") {
    const filename = documentFilename || "Document";
    const hasUrl = isValidMediaUrl(documentUrl);

    return (
      <div
        className={cn(
          "rounded-md flex items-center gap-2 p-3",
          isBubble
            ? isOutbound
              ? "bg-primary-foreground/10 mb-2"
              : "bg-muted-foreground/10 mb-2"
            : "bg-muted/70 border border-dashed border-border",
        )}
      >
        <FileText className="h-5 w-5 flex-shrink-0 opacity-60" />
        <span className="text-xs flex-1 truncate">{filename}</span>
        {hasUrl && (
          <a
            href={documentUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    );
  }

  // ── LOCATION ──
  // Per Meta docs: "Location headers appear as generic maps at the top of the
  // template and are useful for order tracking, delivery updates, etc."
  // We render a static map tile when lat/lng is available.
  if (upperFormat === "LOCATION") {
    const lat = latitude != null ? Number(latitude) : null;
    const lng = longitude != null ? Number(longitude) : null;
    const hasCoords =
      lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng);

    return (
      <div
        className={cn("rounded-md overflow-hidden", isBubble ? "mb-2" : "mb-0")}
      >
        {/* Map tile */}
        {hasCoords && !mapError ? (
          <a
            href={`https://www.google.com/maps?q=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block relative group cursor-pointer"
          >
            <img
              src={buildStaticMapUrl(lat!, lng!)}
              alt={locationName || "Location"}
              className="w-full h-32 object-cover"
              onError={handleMapError}
              loading="lazy"
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <ExternalLink className="h-5 w-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg" />
            </div>
          </a>
        ) : (
          <div
            className={cn(
              "h-32 flex flex-col items-center justify-center gap-1",
              "bg-muted/70 border border-dashed border-border rounded-md",
            )}
          >
            <MapPin className="h-6 w-6 text-muted-foreground" />
            {variant === "preview" && (
              <span className="text-[11px] text-muted-foreground">
                Enter coordinates below
              </span>
            )}
          </div>
        )}

        {/* Name and address bar (matches WhatsApp's native rendering) */}
        {(locationName || locationAddress) && (
          <div
            className={cn(
              "px-3 py-2 text-xs",
              isBubble
                ? isOutbound
                  ? "bg-primary-foreground/5"
                  : "bg-muted-foreground/5"
                : "bg-muted/40",
            )}
          >
            {locationName && (
              <div className="font-medium truncate">{locationName}</div>
            )}
            {locationAddress && (
              <div className="text-muted-foreground truncate mt-0.5">
                {locationAddress}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Unknown format — fallback
  return null;
});

TemplateHeaderMedia.displayName = "TemplateHeaderMedia";
