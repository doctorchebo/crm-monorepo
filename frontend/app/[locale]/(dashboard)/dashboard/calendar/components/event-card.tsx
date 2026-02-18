"use client";

/**
 * Event Card Component
 * Displays event information in compact or detailed format
 */

import type { CalendarEvent } from "@/lib/api/calendar";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Clock, MapPin, Users, Video } from "lucide-react";

type EventCardVariant = "compact" | "detailed";

interface EventCardProps {
  event: CalendarEvent;
  variant?: EventCardVariant;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

// Event status colors
const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-500",
  tentative: "bg-amber-500",
  cancelled: "bg-gray-400",
};

export function EventCard({
  event,
  variant = "compact",
  onClick,
  className,
}: EventCardProps) {
  const startTime = parseISO(event.startTime);
  const endTime = parseISO(event.endTime);
  const statusColor = STATUS_COLORS[event.status] || "bg-primary";

  if (variant === "compact") {
    return (
      <button
        className={cn(
          "w-full text-left truncate text-xs px-1.5 py-0.5 rounded",
          "transition-colors hover:opacity-80",
          statusColor,
          "text-white",
          event.status === "cancelled" && "line-through opacity-60",
          className,
        )}
        onClick={onClick}
      >
        {!event.isAllDay && (
          <span className="font-medium mr-1">{format(startTime, "h:mm")}</span>
        )}
        {event.title}
      </button>
    );
  }

  // Detailed variant
  return (
    <div
      className={cn(
        "rounded-md border-l-4 px-2 py-1.5 cursor-pointer",
        "transition-colors hover:bg-muted/50",
        "bg-background shadow-sm",
        event.status === "cancelled" && "opacity-60",
        className,
      )}
      style={{
        borderLeftColor:
          event.status === "confirmed"
            ? "#3b82f6"
            : event.status === "tentative"
              ? "#f59e0b"
              : "#9ca3af",
      }}
      onClick={onClick}
    >
      {/* Title */}
      <h4
        className={cn(
          "font-medium text-sm truncate",
          event.status === "cancelled" && "line-through",
        )}
      >
        {event.title}
      </h4>

      {/* Time */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
        <Clock className="h-3 w-3" />
        {event.isAllDay ? (
          <span>All day</span>
        ) : (
          <span>
            {format(startTime, "h:mm a")} - {format(endTime, "h:mm a")}
          </span>
        )}
      </div>

      {/* Location (only if space permits) */}
      {event.location && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
          <MapPin className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{event.location}</span>
        </div>
      )}

      {/* Video conference indicator */}
      {event.videoConferenceUrl && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
          <Video className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">
            {event.videoConferenceProvider || "Video call"}
          </span>
        </div>
      )}

      {/* Attendees count */}
      {event.attendees && event.attendees.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
          <Users className="h-3 w-3 flex-shrink-0" />
          <span>
            {event.attendees.length} attendee
            {event.attendees.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
