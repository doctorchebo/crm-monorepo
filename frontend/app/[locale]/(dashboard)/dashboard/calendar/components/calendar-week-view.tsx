"use client";

/**
 * Calendar Week View
 * Time-grid based week view showing events by hour
 */

import type { CalendarEvent } from "@/lib/api/calendar";
import { cn } from "@/lib/utils";
import {
  eachDayOfInterval,
  eachHourOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  parseISO,
  setHours,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { useMemo, useRef } from "react";
import { EventCard } from "./event-card";

interface CalendarWeekViewProps {
  events: CalendarEvent[];
  currentDate: Date;
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
  getEventsForDate: (date: Date) => CalendarEvent[];
}

const HOUR_HEIGHT = 60; // pixels per hour
const START_HOUR = 0;
const END_HOUR = 24;

export function CalendarWeekView({
  events,
  currentDate,
  onEventClick,
  onDateClick,
  getEventsForDate,
}: CalendarWeekViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate week days
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate]);

  // Generate hours for the time grid
  const hours = useMemo(() => {
    const dayStart = setHours(startOfDay(new Date()), START_HOUR);
    const dayEnd = setHours(startOfDay(new Date()), END_HOUR - 1);
    return eachHourOfInterval({ start: dayStart, end: dayEnd });
  }, []);

  // Get event position and height
  const getEventStyle = (event: CalendarEvent) => {
    const start = parseISO(event.startTime);
    const end = parseISO(event.endTime);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    const duration = Math.max(endMinutes - startMinutes, 30); // Minimum 30 min

    const top = (startMinutes / 60) * HOUR_HEIGHT;
    const height = (duration / 60) * HOUR_HEIGHT;

    return {
      top: `${top}px`,
      height: `${Math.max(height, 24)}px`,
    };
  };

  // Get events for a specific day (non all-day events)
  const getDayEvents = (day: Date) => {
    return events.filter((event) => {
      if (event.isAllDay) return false;
      const eventStart = parseISO(event.startTime);
      return isSameDay(eventStart, day);
    });
  };

  // Get all-day events for the week
  const allDayEvents = useMemo(() => {
    return events.filter((event) => event.isAllDay);
  }, [events]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with day names */}
      <div className="flex border-b">
        {/* Time column spacer */}
        <div className="w-16 flex-shrink-0" />

        {/* Day headers */}
        <div className="flex-1 grid grid-cols-7">
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "py-2 px-1 text-center border-l",
                isToday(day) && "bg-primary/5",
              )}
            >
              <div className="text-sm text-muted-foreground">
                {format(day, "EEE")}
              </div>
              <div
                className={cn(
                  "text-lg font-semibold",
                  isToday(day) && "text-primary",
                )}
              >
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* All-day events row */}
      {allDayEvents.length > 0 && (
        <div className="flex border-b bg-muted/20">
          <div className="w-16 flex-shrink-0 px-2 py-1 text-xs text-muted-foreground">
            All day
          </div>
          <div className="flex-1 grid grid-cols-7 gap-0.5 p-1">
            {weekDays.map((day) => {
              const dayAllDayEvents = allDayEvents.filter((event) => {
                const eventStart = parseISO(event.startTime);
                return isSameDay(eventStart, day);
              });

              return (
                <div key={day.toISOString()} className="min-h-[24px]">
                  {dayAllDayEvents.map((event) => (
                    <EventCard
                      key={event.eventId}
                      event={event}
                      variant="compact"
                      onClick={() => onEventClick(event)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Time grid */}
      <div className="flex-1 overflow-auto" ref={containerRef}>
        <div className="flex min-h-full">
          {/* Time labels */}
          <div className="w-16 flex-shrink-0">
            {hours.map((hour) => (
              <div
                key={hour.toISOString()}
                className="relative"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="absolute -top-2.5 right-2 text-xs text-muted-foreground">
                  {format(hour, "ha")}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex-1 grid grid-cols-7">
            {weekDays.map((day) => {
              const dayEvents = getDayEvents(day);

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "relative border-l",
                    isToday(day) && "bg-primary/5",
                  )}
                  onClick={() => onDateClick(day)}
                >
                  {/* Hour grid lines */}
                  {hours.map((hour) => (
                    <div
                      key={hour.toISOString()}
                      className="border-b border-dashed"
                      style={{ height: HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Events */}
                  {dayEvents.map((event) => (
                    <div
                      key={event.eventId}
                      className="absolute left-0.5 right-0.5 z-10"
                      style={getEventStyle(event)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                    >
                      <EventCard event={event} variant="detailed" />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
