"use client";

/**
 * Calendar Sidebar Component
 * Mini calendar and calendar list for navigation
 */

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Calendar } from "@/lib/api/calendar";
import { cn } from "@/lib/utils";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

interface CalendarSidebarProps {
  calendars: Calendar[];
  selectedCalendarId?: string;
  onSelectCalendar: (calendarId: string) => void;
  currentDate: Date;
  onDateSelect: (date: Date) => void;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function CalendarSidebar({
  calendars,
  selectedCalendarId,
  onSelectCalendar,
  currentDate,
  onDateSelect,
}: CalendarSidebarProps) {
  const t = useTranslations("calendar");
  const [miniCalendarDate, setMiniCalendarDate] = useState(new Date());
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(
    new Set(calendars.map((c) => c.calendarId)),
  );

  // Generate mini calendar days
  const miniCalendarDays = useMemo(() => {
    const monthStart = startOfMonth(miniCalendarDate);
    const monthEnd = endOfMonth(miniCalendarDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [miniCalendarDate]);

  // Group mini calendar days into weeks
  const miniCalendarWeeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < miniCalendarDays.length; i += 7) {
      result.push(miniCalendarDays.slice(i, i + 7));
    }
    return result;
  }, [miniCalendarDays]);

  const toggleCalendarVisibility = (calendarId: string) => {
    setVisibleCalendars((prev) => {
      const next = new Set(prev);
      if (next.has(calendarId)) {
        next.delete(calendarId);
      } else {
        next.add(calendarId);
      }
      return next;
    });
  };

  return (
    <div className="w-64 border-r flex flex-col bg-muted/10">
      {/* Mini Calendar */}
      <div className="p-4 border-b">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setMiniCalendarDate((d) => subMonths(d, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {format(miniCalendarDate, "MMMM yyyy")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setMiniCalendarDate((d) => addMonths(d, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((day, i) => (
            <div
              key={i}
              className="h-7 flex items-center justify-center text-xs text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="space-y-0.5">
          {miniCalendarWeeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7">
              {week.map((day) => {
                const isCurrentMonth = isSameMonth(day, miniCalendarDate);
                const isSelected = isSameDay(day, currentDate);
                const isTodayDate = isToday(day);

                return (
                  <button
                    key={day.toISOString()}
                    className={cn(
                      "h-7 w-7 flex items-center justify-center text-xs rounded-full",
                      "transition-colors hover:bg-muted",
                      !isCurrentMonth && "text-muted-foreground/50",
                      isSelected &&
                        "bg-primary text-primary-foreground hover:bg-primary",
                      isTodayDate &&
                        !isSelected &&
                        "border border-primary text-primary",
                    )}
                    onClick={() => onDateSelect(day)}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Calendar List */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold">{t("myCalendars")}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1 px-2 pb-4">
            {calendars.map((calendar) => (
              <CalendarListItem
                key={calendar.calendarId}
                calendar={calendar}
                isSelected={calendar.calendarId === selectedCalendarId}
                isVisible={visibleCalendars.has(calendar.calendarId)}
                onSelect={() => onSelectCalendar(calendar.calendarId)}
                onToggleVisibility={() =>
                  toggleCalendarVisibility(calendar.calendarId)
                }
              />
            ))}

            {calendars.length === 0 && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                {t("noCalendars")}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Settings */}
      <div className="border-t p-2">
        <Button variant="ghost" className="w-full justify-start" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          {t("calendarSettings")}
        </Button>
      </div>
    </div>
  );
}

interface CalendarListItemProps {
  calendar: Calendar;
  isSelected: boolean;
  isVisible: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
}

function CalendarListItem({
  calendar,
  isSelected,
  isVisible,
  onSelect,
  onToggleVisibility,
}: CalendarListItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer",
        "transition-colors hover:bg-muted",
        isSelected && "bg-muted",
      )}
      onClick={onSelect}
    >
      <Checkbox
        checked={isVisible}
        onCheckedChange={(e) => {
          e; // Prevent event bubbling
          onToggleVisibility();
        }}
        onClick={(e) => e.stopPropagation()}
        className="data-[state=checked]:bg-current data-[state=checked]:border-current"
        style={
          {
            "--tw-text-opacity": 1,
            color: calendar.color || "#3b82f6",
          } as React.CSSProperties
        }
      />
      <span className="text-sm flex-1 truncate">{calendar.name}</span>
      {calendar.isDefault && (
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          Default
        </span>
      )}
    </div>
  );
}
