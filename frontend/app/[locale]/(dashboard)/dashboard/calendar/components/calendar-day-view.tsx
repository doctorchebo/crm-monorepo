"use client";

/**
 * Calendar Day View
 * Time-grid based single day view with detailed event display
 */

import type { CalendarEvent } from "@/lib/api/calendar";
import { cn } from "@/lib/utils";
import {
  eachHourOfInterval,
  format,
  isToday,
  parseISO,
  setHours,
  startOfDay,
} from "date-fns";
import { useEffect, useMemo, useRef } from "react";
import { EventCard } from "./event-card";

interface CalendarDayViewProps {
  events: CalendarEvent[];
  currentDate: Date;
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
  getEventsForDate: (date: Date) => CalendarEvent[];
}

const HOUR_HEIGHT = 80; // pixels per hour (larger for day view)
const START_HOUR = 0;
const END_HOUR = 24;

export function CalendarDayView({
  events,
  currentDate,
  onEventClick,
  onDateClick,
  getEventsForDate,
}: CalendarDayViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dayEvents = useMemo(
    () => getEventsForDate(currentDate),
    [getEventsForDate, currentDate],
  );

  // Generate hours for the time grid
  const hours = useMemo(() => {
    const dayStart = setHours(startOfDay(new Date()), START_HOUR);
    const dayEnd = setHours(startOfDay(new Date()), END_HOUR - 1);
    return eachHourOfInterval({ start: dayStart, end: dayEnd });
  }, []);

  // Scroll to current hour on mount
  useEffect(() => {
    if (containerRef.current && isToday(currentDate)) {
      const currentHour = new Date().getHours();
      const scrollPosition = currentHour * HOUR_HEIGHT - 100;
      containerRef.current.scrollTop = Math.max(0, scrollPosition);
    }
  }, [currentDate]);

  // Get event position and height
  const getEventStyle = (event: CalendarEvent) => {
    const start = parseISO(event.startTime);
    const end = parseISO(event.endTime);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    const duration = Math.max(endMinutes - startMinutes, 30);

    const top = (startMinutes / 60) * HOUR_HEIGHT;
    const height = (duration / 60) * HOUR_HEIGHT;

    return {
      top: `${top}px`,
      height: `${Math.max(height, 32)}px`,
    };
  };

  // Separate all-day and timed events
  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: CalendarEvent[] = [];
    const timed: CalendarEvent[] = [];

    dayEvents.forEach((event) => {
      if (event.isAllDay) {
        allDay.push(event);
      } else {
        timed.push(event);
      }
    });

    return { allDayEvents: allDay, timedEvents: timed };
  }, [dayEvents]);

  // Current time indicator
  const currentTimePosition = useMemo(() => {
    if (!isToday(currentDate)) return null;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    return (minutes / 60) * HOUR_HEIGHT;
  }, [currentDate]);

  return (
    <div className="flex flex-col h-full">
      {/* Day Header */}
      <div className="flex items-center justify-center py-4 border-b bg-muted/20">
        <div className="text-center">
          <div className="text-sm text-muted-foreground">
            {format(currentDate, "EEEE")}
          </div>
          <div
            className={cn(
              "text-3xl font-bold",
              isToday(currentDate) && "text-primary",
            )}
          >
            {format(currentDate, "d")}
          </div>
          <div className="text-sm text-muted-foreground">
            {format(currentDate, "MMMM yyyy")}
          </div>
        </div>
      </div>

      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="border-b p-2 bg-muted/10">
          <div className="text-xs text-muted-foreground mb-1">All day</div>
          <div className="space-y-1">
            {allDayEvents.map((event) => (
              <EventCard
                key={event.eventId}
                event={event}
                variant="detailed"
                onClick={() => onEventClick(event)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Time grid */}
      <div className="flex-1 overflow-auto" ref={containerRef}>
        <div className="flex min-h-full">
          {/* Time labels */}
          <div className="w-20 flex-shrink-0">
            {hours.map((hour) => (
              <div
                key={hour.toISOString()}
                className="relative"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="absolute -top-2.5 right-3 text-xs text-muted-foreground">
                  {format(hour, "h:mm a")}
                </span>
              </div>
            ))}
          </div>

          {/* Day column */}
          <div
            className="flex-1 relative border-l"
            onClick={() => onDateClick(currentDate)}
          >
            {/* Hour grid lines */}
            {hours.map((hour) => (
              <div
                key={hour.toISOString()}
                className="border-b border-dashed hover:bg-muted/50 transition-colors"
                style={{ height: HOUR_HEIGHT }}
              />
            ))}

            {/* Current time indicator */}
            {currentTimePosition !== null && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none"
                style={{ top: currentTimePosition }}
              >
                <div className="relative">
                  <div className="absolute -left-2 w-3 h-3 rounded-full bg-red-500" />
                  <div className="h-0.5 bg-red-500" />
                </div>
              </div>
            )}

            {/* Events */}
            <div className="absolute inset-0 px-2 pt-0">
              {timedEvents.map((event) => (
                <div
                  key={event.eventId}
                  className="absolute left-2 right-2 z-10"
                  style={getEventStyle(event)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(event);
                  }}
                >
                  <EventCard
                    event={event}
                    variant="detailed"
                    className="h-full"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
