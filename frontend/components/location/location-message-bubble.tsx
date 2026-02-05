"use client";

/**
 * Location Message Bubble Component
 * Displays location messages with an interactive map preview using Leaflet
 *
 * Features:
 * - Static map preview showing the location pin
 * - Location name and address display
 * - Click to open in external maps (Google Maps)
 * - Responsive design for chat bubbles
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExternalLink, MapPin, Navigation } from "lucide-react";
import dynamic from "next/dynamic";
import { memo, useCallback, useMemo } from "react";

// Define the props type for LocationMap
interface LocationMapProps {
  latitude: number;
  longitude: number;
  interactive?: boolean;
  zoom?: number;
  className?: string;
  onLocationSelect?: (lat: number, lng: number) => void;
  markerLabel?: string;
}

// Dynamically import the map component to avoid SSR issues with Leaflet
const LocationMap = dynamic<LocationMapProps>(
  () => import("@/components/location/location-map").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-32 bg-muted rounded-lg flex items-center justify-center">
        <MapPin className="h-6 w-6 text-muted-foreground animate-pulse" />
      </div>
    ),
  },
);

export interface LocationData {
  latitude: number;
  longitude: number;
  name?: string | null;
  address?: string | null;
  url?: string | null;
}

interface LocationMessageBubbleProps {
  latitude: number;
  longitude: number;
  name?: string | null;
  address?: string | null;
  url?: string | null;
  isOutbound: boolean;
  timestamp: string;
  messageId?: string;
  status?: string;
  deliveredAt?: string;
  readAt?: string;
  isHighlighted?: boolean;
  onReply?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
}

export const LocationMessageBubble = memo(function LocationMessageBubble({
  latitude,
  longitude,
  name,
  address,
  url,
  isOutbound,
  timestamp,
  messageId,
  status,
  deliveredAt,
  readAt,
  isHighlighted = false,
  onReply,
  onDelete,
}: LocationMessageBubbleProps) {
  // Build Google Maps URL for opening externally
  const googleMapsUrl = useMemo(() => {
    const query = name ? encodeURIComponent(name) : `${latitude},${longitude}`;
    return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${latitude},${longitude}`;
  }, [name, latitude, longitude]);

  // Formatted display text
  const displayName = name || "Shared Location";
  const displayAddress =
    address || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  const handleOpenInMaps = useCallback(() => {
    window.open(googleMapsUrl, "_blank", "noopener,noreferrer");
  }, [googleMapsUrl]);

  const handleGetDirections = useCallback(() => {
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    window.open(directionsUrl, "_blank", "noopener,noreferrer");
  }, [latitude, longitude]);

  return (
    <div
      className={cn(
        "flex flex-col gap-1 max-w-[320px] rounded-xl overflow-hidden shadow-sm",
        isOutbound
          ? "bg-primary text-primary-foreground ml-auto"
          : "bg-card text-card-foreground border",
        isHighlighted && "ring-2 ring-yellow-400",
      )}
    >
      {/* Map Preview */}
      <div className="w-full h-32 relative">
        <LocationMap
          latitude={latitude}
          longitude={longitude}
          interactive={false}
          className="w-full h-full"
        />
        {/* Overlay for click action */}
        <button
          onClick={handleOpenInMaps}
          className="absolute inset-0 bg-transparent hover:bg-black/10 transition-colors cursor-pointer"
          aria-label="Open in Google Maps"
        />
      </div>

      {/* Location Info */}
      <div className="px-3 py-2 space-y-1">
        <div className="flex items-start gap-2">
          <MapPin
            className={cn(
              "h-4 w-4 mt-0.5 flex-shrink-0",
              isOutbound ? "text-primary-foreground/80" : "text-primary",
            )}
          />
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-sm font-medium truncate",
                isOutbound ? "text-primary-foreground" : "text-foreground",
              )}
            >
              {displayName}
            </p>
            <p
              className={cn(
                "text-xs truncate",
                isOutbound
                  ? "text-primary-foreground/70"
                  : "text-muted-foreground",
              )}
            >
              {displayAddress}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          <Button
            variant={isOutbound ? "secondary" : "outline"}
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={handleOpenInMaps}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            View Map
          </Button>
          <Button
            variant={isOutbound ? "secondary" : "outline"}
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={handleGetDirections}
          >
            <Navigation className="h-3 w-3 mr-1" />
            Directions
          </Button>
        </div>

        {/* Timestamp */}
        <div
          className={cn(
            "text-[10px] text-right",
            isOutbound ? "text-primary-foreground/60" : "text-muted-foreground",
          )}
        >
          {timestamp}
        </div>
      </div>
    </div>
  );
});

LocationMessageBubble.displayName = "LocationMessageBubble";
