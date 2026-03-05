"use client";

/**
 * Calendar Page
 * Main calendar view with month/week/day views, event management, and booking links
 */

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageLayout } from "@/components/ui/page-layout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthProtection } from "@/hooks/use-auth";
import {
  useCalendarEvents,
  useCalendars,
  useCalendarView,
  type CalendarView,
} from "@/hooks/use-calendar";
import type { CalendarEvent, CreateEventDto } from "@/lib/api/calendar";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Plus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { CalendarAgendaView } from "./components/calendar-agenda-view";
import { CalendarDayView } from "./components/calendar-day-view";
import { CalendarMonthView } from "./components/calendar-month-view";
import { CalendarSidebar } from "./components/calendar-sidebar";
import { CalendarWeekView } from "./components/calendar-week-view";
import { EventDialog } from "./components/event-dialog";

export default function CalendarPage() {
  const t = useTranslations("calendar");
  useAuthProtection();

  // Calendar view state
  const {
    view,
    setView,
    currentDate,
    setCurrentDate,
    dateRange,
    goToNext,
    goToPrevious,
    goToToday,
    title,
  } = useCalendarView({ initialView: "month" });

  // Data hooks
  const {
    calendars,
    defaultCalendar,
    isLoading: calendarsLoading,
    createCalendar,
    updateCalendar,
    deleteCalendar,
  } = useCalendars();
  const [selectedCalendarId, setSelectedCalendarId] = useState<
    string | undefined
  >();

  const activeCalendarId = selectedCalendarId || defaultCalendar?.calendarId;

  const {
    events,
    isLoading: eventsLoading,
    createEvent,
    updateEvent,
    deleteEvent,
    getEventsForDate,
  } = useCalendarEvents({
    calendarId: activeCalendarId,
    startDate: dateRange.start,
    endDate: dateRange.end,
    includeAttendees: true,
  });

  // Dialog state
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Handlers
  const handleCreateEvent = () => {
    setSelectedEvent(null);
    setSelectedDate(new Date());
    setEventDialogOpen(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEventDialogOpen(true);
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setSelectedEvent(null);
    setEventDialogOpen(true);
  };

  const handleEventSave = async (data: CreateEventDto) => {
    if (selectedEvent) {
      await updateEvent(selectedEvent.eventId, data);
    } else {
      await createEvent({
        ...data,
        calendarId: activeCalendarId,
      });
    }
    setEventDialogOpen(false);
    setSelectedEvent(null);
  };

  const handleEventDelete = async () => {
    if (selectedEvent) {
      await deleteEvent(selectedEvent.eventId);
      setEventDialogOpen(false);
      setSelectedEvent(null);
    }
  };

  // View options
  const viewOptions: {
    value: CalendarView;
    label: string;
    icon: React.ReactNode;
  }[] = useMemo(
    () => [
      {
        value: "month",
        label: t("views.month"),
        icon: <LayoutGrid className="h-4 w-4" />,
      },
      {
        value: "week",
        label: t("views.week"),
        icon: <CalendarDays className="h-4 w-4" />,
      },
      {
        value: "day",
        label: t("views.day"),
        icon: <CalendarDays className="h-4 w-4" />,
      },
      {
        value: "agenda",
        label: t("views.agenda"),
        icon: <List className="h-4 w-4" />,
      },
    ],
    [t],
  );

  const renderCalendarView = () => {
    const viewProps = {
      events,
      currentDate,
      onEventClick: handleEventClick,
      onDateClick: handleDateClick,
      getEventsForDate,
    };

    switch (view) {
      case "month":
        return <CalendarMonthView {...viewProps} />;
      case "week":
        return <CalendarWeekView {...viewProps} />;
      case "day":
        return <CalendarDayView {...viewProps} />;
      case "agenda":
        return <CalendarAgendaView {...viewProps} />;
      default:
        return <CalendarMonthView {...viewProps} />;
    }
  };

  return (
    <PageLayout title={t("title")} className="h-full flex flex-col p-0">
      <div className="flex h-full">
        {/* Sidebar */}
        {sidebarOpen && (
          <CalendarSidebar
            calendars={calendars}
            selectedCalendarId={activeCalendarId}
            onSelectCalendar={setSelectedCalendarId}
            currentDate={currentDate}
            onDateSelect={setCurrentDate}
            onCreateCalendar={createCalendar}
            onUpdateCalendar={updateCalendar}
            onDeleteCalendar={deleteCalendar}
          />
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>
                {t("today")}
              </Button>

              <div className="flex items-center">
                <Button variant="ghost" size="icon" onClick={goToPrevious}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={goToNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <h2 className="text-lg font-semibold ml-2">{title}</h2>
            </div>

            <div className="flex items-center gap-2">
              {/* Calendar Selector */}
              {calendars.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      {calendars.find((c) => c.calendarId === activeCalendarId)
                        ?.name || t("selectCalendar")}
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {calendars.map((calendar) => (
                      <DropdownMenuItem
                        key={calendar.calendarId}
                        onClick={() =>
                          setSelectedCalendarId(calendar.calendarId)
                        }
                      >
                        <div
                          className="w-3 h-3 rounded-full mr-2"
                          style={{
                            backgroundColor: calendar.color || "#3b82f6",
                          }}
                        />
                        {calendar.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* View Tabs */}
              <Tabs
                value={view}
                onValueChange={(v) => setView(v as CalendarView)}
              >
                <TabsList>
                  {viewOptions.map((option) => (
                    <TabsTrigger
                      key={option.value}
                      value={option.value}
                      className="gap-1"
                    >
                      {option.icon}
                      <span className="hidden sm:inline">{option.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {/* Create Event */}
              <Button onClick={handleCreateEvent}>
                <Plus className="h-4 w-4 mr-2" />
                {t("newEvent")}
              </Button>
            </div>
          </div>

          {/* Calendar View */}
          <div className="flex-1 overflow-auto p-4">{renderCalendarView()}</div>
        </div>
      </div>

      {/* Event Dialog */}
      <EventDialog
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        event={selectedEvent}
        initialDate={selectedDate}
        calendarId={activeCalendarId}
        onSave={handleEventSave}
        onDelete={handleEventDelete}
      />
    </PageLayout>
  );
}
