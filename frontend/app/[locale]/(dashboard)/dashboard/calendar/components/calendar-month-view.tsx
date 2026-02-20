"use client";

/**
 * Calendar Month View
 * Grid-based month view with events displayed on each day
 */

import type { CalendarEvent } from "@/lib/api/calendar";
import { cn } from "@/lib/utils";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useMemo } from "react";
import { EventCard } from "./event-card";

interface CalendarMonthViewProps {
  events: CalendarEvent[];
  currentDate: Date;
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
  getEventsForDate: (date: Date) => CalendarEvent[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_EVENTS_VISIBLE = 3;

export function CalendarMonthView({
  events,
  currentDate,
  onEventClick,
  onDateClick,
  getEventsForDate,
}: CalendarMonthViewProps) {
  // Generate calendar grid days
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  // Group days into weeks
  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  return (
    <div className="flex flex-col h-full">
      {/* Weekday Headers */}
      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-sm font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 flex flex-col">
        {weeks.map((week, weekIndex) => (
          <div
            key={weekIndex}
            className="flex-1 grid grid-cols-7 border-b last:border-b-0 min-h-0"
          >
            {week.map((day) => {
              const dayEvents = getEventsForDate(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isCurrentDay = isToday(day);
              const hasMoreEvents = dayEvents.length > MAX_EVENTS_VISIBLE;

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[100px] border-r last:border-r-0 p-1 cursor-pointer transition-colors hover:bg-muted/50",
                    !isCurrentMonth && "bg-muted/20",
                  )}
                  onClick={() => onDateClick(day)}
                >
                  {/* Day Number */}
                  <div className="flex items-center justify-center mb-1">
                    <span
                      className={cn(
                        "flex items-center justify-center w-7 h-7 text-sm rounded-full",
                        isCurrentDay &&
                          "bg-primary text-primary-foreground font-semibold",
                        !isCurrentMonth && "text-muted-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>

                  {/* Events */}
                  <div className="space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, MAX_EVENTS_VISIBLE).map((event) => (
                      <EventCard
                        key={event.eventId}
                        event={event}
                        variant="compact"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                      />
                    ))}

                    {hasMoreEvents && (
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground pl-1"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          onDateClick(day);
                        }}
                      >
                        +{dayEvents.length - MAX_EVENTS_VISIBLE} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
