"use client";

/**
 * Calendar Agenda View
 * List-based view showing upcoming events
 */

import type { CalendarEvent } from "@/lib/api/calendar";
import { cn } from "@/lib/utils";
import {
  addDays,
  eachDayOfInterval,
  format,
  isSameDay,
  isToday,
  isTomorrow,
  parseISO,
} from "date-fns";
import { CalendarDays, Clock, MapPin, Video } from "lucide-react";
import { useMemo } from "react";

interface CalendarAgendaViewProps {
  events: CalendarEvent[];
  currentDate: Date;
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
  getEventsForDate: (date: Date) => CalendarEvent[];
}

export function CalendarAgendaView({
  events,
  currentDate,
  onEventClick,
  onDateClick,
  getEventsForDate,
}: CalendarAgendaViewProps) {
  // Generate list of days for the agenda period
  const agendaDays = useMemo(() => {
    const endDate = addDays(currentDate, 14);
    return eachDayOfInterval({ start: currentDate, end: endDate });
  }, [currentDate]);

  // Group events by day
  const eventsByDay = useMemo(() => {
    const grouped: { day: Date; events: CalendarEvent[] }[] = [];

    agendaDays.forEach((day) => {
      const dayEvents = events.filter((event) => {
        const eventStart = parseISO(event.startTime);
        return isSameDay(eventStart, day);
      });

      if (dayEvents.length > 0) {
        grouped.push({
          day,
          events: dayEvents.sort((a, b) => {
            if (a.isAllDay && !b.isAllDay) return -1;
            if (!a.isAllDay && b.isAllDay) return 1;
            return (
              new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
            );
          }),
        });
      }
    });

    return grouped;
  }, [agendaDays, events]);

  const getDayLabel = (day: Date) => {
    if (isToday(day)) return "Today";
    if (isTomorrow(day)) return "Tomorrow";
    return format(day, "EEEE");
  };

  if (eventsByDay.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-12">
        <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No upcoming events</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Your schedule is clear for the next two weeks
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {eventsByDay.map(({ day, events: dayEvents }) => (
        <div key={day.toISOString()}>
          {/* Day Header */}
          <button
            className="flex items-center gap-3 mb-3 hover:opacity-80 transition-opacity"
            onClick={() => onDateClick(day)}
          >
            <div
              className={cn(
                "flex flex-col items-center justify-center w-14 h-14 rounded-lg",
                isToday(day)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              <span className="text-xs font-medium uppercase">
                {format(day, "MMM")}
              </span>
              <span className="text-xl font-bold">{format(day, "d")}</span>
            </div>
            <div>
              <div
                className={cn("font-semibold", isToday(day) && "text-primary")}
              >
                {getDayLabel(day)}
              </div>
              <div className="text-sm text-muted-foreground">
                {format(day, "MMMM d, yyyy")}
              </div>
            </div>
          </button>

          {/* Day Events */}
          <div className="space-y-2 ml-[calc(3.5rem+0.75rem)]">
            {dayEvents.map((event) => (
              <AgendaEventItem
                key={event.eventId}
                event={event}
                onClick={() => onEventClick(event)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface AgendaEventItemProps {
  event: CalendarEvent;
  onClick: () => void;
}

function AgendaEventItem({ event, onClick }: AgendaEventItemProps) {
  const startTime = parseISO(event.startTime);
  const endTime = parseISO(event.endTime);

  return (
    <button
      className="w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Color indicator */}
        <div className="w-1 h-full min-h-[40px] rounded-full bg-primary flex-shrink-0" />

        <div className="flex-1 min-w-0">
          {/* Title */}
          <h4 className="font-medium truncate">{event.title}</h4>

          {/* Time */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
            <Clock className="h-3.5 w-3.5" />
            {event.isAllDay ? (
              <span>All day</span>
            ) : (
              <span>
                {format(startTime, "h:mm a")} - {format(endTime, "h:mm a")}
              </span>
            )}
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <MapPin className="h-3.5 w-3.5" />
              <span className="truncate">{event.location}</span>
            </div>
          )}

          {/* Video conference */}
          {event.videoConferenceUrl && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <Video className="h-3.5 w-3.5" />
              <span className="truncate">
                {event.videoConferenceProvider || "Video call"}
              </span>
            </div>
          )}

          {/* Description preview */}
          {event.description && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {event.description}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
