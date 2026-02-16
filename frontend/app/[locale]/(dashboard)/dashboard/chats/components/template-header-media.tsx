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
import { memo, useCallback, useEffect, useMemo, useState } from "react";

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

/**
 * Convert lat/lng + zoom to OSM tile coordinates.
 * Returns the tile x/y *and* the pixel offset of the point within that tile.
 */
function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const xTile = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const yTile = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  // Pixel offset within the 256×256 tile
  const xPixel = Math.floor((((lng + 180) / 360) * n - xTile) * 256);
  const yPixel = Math.floor(
    (((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      n -
      yTile) *
      256,
  );
  return { xTile, yTile, xPixel, yPixel };
}

/**
 * Inline static map preview using raw OSM tile URLs.
 * Renders a 3×2 tile grid (768×512) centred on the coordinate, clipped to the
 * container size, with a CSS pin marker. No external static-map service needed.
 */
function StaticMapPreview({
  lat,
  lng,
  alt,
  className,
  onError,
}: {
  lat: number;
  lng: number;
  alt: string;
  className?: string;
  onError?: () => void;
}) {
  const zoom = 15;
  const tileSize = 256;
  const cols = 3; // tiles horizontally
  const rows = 2; // tiles vertically

  const { xTile, yTile, xPixel, yPixel } = useMemo(
    () => latLngToTile(lat, lng, zoom),
    [lat, lng],
  );

  // Offset so the target point is centred in the visible area.
  // The grid is cols*256 × rows*256.  We want (xPixel, yPixel) of the
  // centre tile (index 1,0 in a 3×2 grid) to land at container centre.
  // Container will be w-full × h-32 (128px). Grid = 768×512.
  const gridW = cols * tileSize;
  const gridH = rows * tileSize;
  // Centre tile is at col=1, row=0 ⇒ pixel origin (256, 0) within grid.
  const pointInGridX = tileSize + xPixel; // col-offset + intra-tile
  const pointInGridY = 0 + yPixel;

  // We want pointInGrid to sit at 50% of the container.
  // Use CSS translate to shift the grid so the point is centred.
  const translateX = -(pointInGridX - gridW / 2);
  const translateY = -(pointInGridY - gridH / 2);

  // Build tile URLs — 3 columns × 2 rows centred on the target tile
  const tiles: { x: number; y: number; url: string }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tx = xTile + col - 1; // col offset: -1, 0, +1
      const ty = yTile + row; // row offset: 0, +1
      tiles.push({
        x: col * tileSize,
        y: row * tileSize,
        url: `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`,
      });
    }
  }

  const [hasError, setHasError] = useState(false);
  const handleTileError = useCallback(() => {
    setHasError(true);
    onError?.();
  }, [onError]);

  if (hasError) return null; // let parent show fallback

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ minHeight: 128 }}
      role="img"
      aria-label={alt}
    >
      {/* Tile grid */}
      <div
        className="absolute"
        style={{
          width: gridW,
          height: gridH,
          left: "50%",
          top: "50%",
          transform: `translate(${translateX - gridW / 2}px, ${translateY - gridH / 2}px)`,
        }}
      >
        {tiles.map((t) => (
          <img
            key={`${t.x}-${t.y}`}
            src={t.url}
            alt=""
            draggable={false}
            loading="lazy"
            onError={handleTileError}
            style={{
              position: "absolute",
              left: t.x,
              top: t.y,
              width: tileSize,
              height: tileSize,
            }}
          />
        ))}
      </div>

      {/* Centre pin marker */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full z-10 pointer-events-none">
        <MapPin className="h-7 w-7 text-red-500 drop-shadow-md fill-red-500/30" />
      </div>
    </div>
  );
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
            <StaticMapPreview
              lat={lat!}
              lng={lng!}
              alt={locationName || "Location"}
              className="w-full h-32"
              onError={handleMapError}
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
