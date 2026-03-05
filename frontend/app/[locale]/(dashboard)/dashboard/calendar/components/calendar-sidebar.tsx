"use client";

/**
 * Calendar Sidebar Component
 * Mini calendar, calendar list with CRUD, and settings
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  Calendar,
  CreateCalendarDto,
  UpdateCalendarDto,
} from "@/lib/api/calendar";
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
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Star,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { CalendarFormDialog } from "./calendar-form-dialog";
import { CalendarSettingsDialog } from "./calendar-settings-dialog";

interface CalendarSidebarProps {
  calendars: Calendar[];
  selectedCalendarId?: string;
  onSelectCalendar: (calendarId: string) => void;
  currentDate: Date;
  onDateSelect: (date: Date) => void;
  onCreateCalendar: (data: CreateCalendarDto) => Promise<Calendar>;
  onUpdateCalendar: (
    calendarId: string,
    data: UpdateCalendarDto,
  ) => Promise<Calendar>;
  onDeleteCalendar: (calendarId: string) => Promise<void>;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function CalendarSidebar({
  calendars,
  selectedCalendarId,
  onSelectCalendar,
  currentDate,
  onDateSelect,
  onCreateCalendar,
  onUpdateCalendar,
  onDeleteCalendar,
}: CalendarSidebarProps) {
  const t = useTranslations("calendar");
  const [miniCalendarDate, setMiniCalendarDate] = useState(new Date());
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(
    new Set(calendars.map((c) => c.calendarId)),
  );

  // Dialog states
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const openCreateDialog = () => {
    setEditingCalendar(null);
    setFormDialogOpen(true);
  };

  const openEditDialog = (calendar: Calendar) => {
    setEditingCalendar(calendar);
    setFormDialogOpen(true);
  };

  const handleFormSave = async (
    data: CreateCalendarDto | UpdateCalendarDto,
  ) => {
    if (editingCalendar) {
      await onUpdateCalendar(
        editingCalendar.calendarId,
        data as UpdateCalendarDto,
      );
    } else {
      const created = await onCreateCalendar(data as CreateCalendarDto);
      setVisibleCalendars((prev) => new Set([...prev, created.calendarId]));
    }
  };

  const handleDeleteCalendar = async (calendarId: string) => {
    await onDeleteCalendar(calendarId);
    setVisibleCalendars((prev) => {
      const next = new Set(prev);
      next.delete(calendarId);
      return next;
    });
  };

  const handleSetDefault = async (calendar: Calendar) => {
    await onUpdateCalendar(calendar.calendarId, { isDefault: true });
  };

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
    <>
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
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={openCreateDialog}
              title="Create calendar"
            >
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
                  onEdit={() => openEditDialog(calendar)}
                  onDelete={() => handleDeleteCalendar(calendar.calendarId)}
                  onSetDefault={() => handleSetDefault(calendar)}
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
          <Button
            variant="ghost"
            className="w-full justify-start"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4 mr-2" />
            {t("calendarSettings")}
          </Button>
        </div>
      </div>

      {/* Create / Edit Calendar Dialog */}
      <CalendarFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        calendar={editingCalendar}
        onSave={handleFormSave}
        onDelete={
          editingCalendar
            ? () => handleDeleteCalendar(editingCalendar.calendarId)
            : undefined
        }
      />

      {/* Calendar Settings Dialog */}
      <CalendarSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </>
  );
}

interface CalendarListItemProps {
  calendar: Calendar;
  isSelected: boolean;
  isVisible: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}

function CalendarListItem({
  calendar,
  isSelected,
  isVisible,
  onSelect,
  onToggleVisibility,
  onEdit,
  onDelete,
  onSetDefault,
}: CalendarListItemProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer",
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

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
                "focus:opacity-100",
              )}
              onClick={(e) => e.stopPropagation()}
              title="Calendar options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Edit
            </DropdownMenuItem>
            {!calendar.isDefault && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onSetDefault();
                }}
              >
                <Star className="h-3.5 w-3.5 mr-2" />
                Set as default
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-500 dark:text-red-400 focus:text-red-600 dark:focus:text-red-300 focus:bg-red-50 dark:focus:bg-red-950/40"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{calendar.name}&quot; and all
              its events. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete calendar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
