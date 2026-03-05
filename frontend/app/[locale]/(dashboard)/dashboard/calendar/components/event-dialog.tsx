"use client";

/**
 * Event Dialog Component
 * Modal for creating and editing calendar events
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
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAvailability } from "@/hooks/use-calendar";
import type {
  CalendarEvent,
  CalendarEventStatus,
  CreateEventDto,
  ReminderType,
} from "@/lib/api/calendar";
import { cn } from "@/lib/utils";
import {
  addHours,
  format,
  isAfter,
  parseISO,
  setHours,
  setMinutes,
} from "date-fns";
import {
  Bell,
  CalendarIcon,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CalendarEvent | null;
  initialDate: Date | null;
  calendarId?: string;
  onSave: (data: CreateEventDto) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const REMINDER_OPTIONS = [
  { value: 0, label: "At time of event" },
  { value: 5, label: "5 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
];

export function EventDialog({
  open,
  onOpenChange,
  event,
  initialDate,
  calendarId,
  onSave,
  onDelete,
}: EventDialogProps) {
  const t = useTranslations("calendar");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);

  // Fetch user's availability rules
  const { rules: availabilityRules, isLoading: availabilityLoading } =
    useAvailability();

  // Calendar popover states
  const [startDatePickerOpen, setStartDatePickerOpen] = useState(false);
  const [endDatePickerOpen, setEndDatePickerOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [status, setStatus] = useState<CalendarEventStatus>("confirmed");
  const [videoConferenceUrl, setVideoConferenceUrl] = useState("");
  const [videoConferenceProvider, setVideoConferenceProvider] = useState("");
  const [attendees, setAttendees] = useState<
    Array<{ email: string; name: string }>
  >([]);
  const [newAttendeeEmail, setNewAttendeeEmail] = useState("");
  const [reminders, setReminders] = useState<
    Array<{ type: ReminderType; minutesBefore: number }>
  >([{ type: "push", minutesBefore: 15 }]);

  // Helper function to convert JS day number to DayOfWeek string
  const getDayOfWeekString = (date: Date): string => {
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    return days[date.getDay()];
  };

  // Helper function to parse date string as local date (not UTC)
  const parseLocalDate = (dateStr: string): Date => {
    // Append time to force local time parsing instead of UTC
    return new Date(dateStr + "T00:00:00");
  };

  // Helper function to check if a date is available
  const isDateAvailable = (date: Date): boolean => {
    if (availabilityLoading || !availabilityRules.length) return true;

    const dayOfWeek = getDayOfWeekString(date);

    // Check if this day of week has any available time slots
    const dayRules = availabilityRules.filter(
      (rule) => rule.dayOfWeek === dayOfWeek,
    );

    // If no rules for this day, it's unavailable
    if (dayRules.length === 0) return false;

    // If any rule for this day is marked as available, the day is available
    return dayRules.some((rule) => rule.isAvailable);
  };

  // Helper function to get available time ranges for a specific date
  const getAvailableTimeRanges = (
    dateStr: string,
  ): Array<{ start: string; end: string }> => {
    if (availabilityLoading || !availabilityRules.length || !dateStr) return [];

    const date = parseLocalDate(dateStr);
    const dayOfWeek = getDayOfWeekString(date);

    return availabilityRules
      .filter((rule) => rule.dayOfWeek === dayOfWeek && rule.isAvailable)
      .map((rule) => ({
        start: rule.startTime,
        end: rule.endTime,
      }));
  };

  // Helper function to check if a time is within available ranges
  const isTimeAvailable = (dateStr: string, timeStr: string): boolean => {
    if (!dateStr || !timeStr) return true;

    const ranges = getAvailableTimeRanges(dateStr);
    if (ranges.length === 0) return false;

    // Time strings in HH:mm format can be compared directly
    return ranges.some((range) => {
      return timeStr >= range.start && timeStr < range.end;
    });
  };
  // Initialize form when dialog opens
  useEffect(() => {
    if (open) {
      if (event) {
        // Edit mode
        const start = parseISO(event.startTime);
        const end = parseISO(event.endTime);

        setTitle(event.title);
        setDescription(event.description || "");
        setLocation(event.location || "");
        setStartDate(format(start, "yyyy-MM-dd"));
        setStartTime(format(start, "HH:mm"));
        setEndDate(format(end, "yyyy-MM-dd"));
        setEndTime(format(end, "HH:mm"));
        setIsAllDay(event.isAllDay);
        setStatus(event.status);
        setVideoConferenceUrl(event.videoConferenceUrl || "");
        setVideoConferenceProvider(event.videoConferenceProvider || "");
        setAttendees(
          event.attendees?.map((a) => ({
            email: a.email,
            name: a.name || "",
          })) || [],
        );
        setReminders(
          event.reminders?.map((r) => ({
            type: r.reminderType,
            minutesBefore: r.minutesBefore,
          })) || [{ type: "push", minutesBefore: 15 }],
        );
      } else {
        // Create mode
        const startDateTime = initialDate || new Date();
        const endDateTime = addHours(startDateTime, 1);

        setTitle("");
        setDescription("");
        setLocation("");
        setStartDate(format(startDateTime, "yyyy-MM-dd"));
        setStartTime(
          format(setMinutes(setHours(startDateTime, 9), 0), "HH:mm"),
        );
        setEndDate(format(endDateTime, "yyyy-MM-dd"));
        setEndTime(format(setMinutes(setHours(endDateTime, 10), 0), "HH:mm"));
        setIsAllDay(false);
        setStatus("confirmed");
        setVideoConferenceUrl("");
        setVideoConferenceProvider("");
        setAttendees([]);
        setReminders([{ type: "push", minutesBefore: 15 }]);
      }
      setTitleTouched(false);
    }
  }, [open, event, initialDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setTitleTouched(true);
    if (!title.trim()) return;
    if (dateTimeError) return;

    setIsSaving(true);
    try {
      const startDateTime = isAllDay
        ? `${startDate}T00:00:00`
        : `${startDate}T${startTime}:00`;
      const endDateTime = isAllDay
        ? `${endDate}T23:59:59`
        : `${endDate}T${endTime}:00`;

      await onSave({
        calendarId,
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        startTime: startDateTime,
        endTime: endDateTime,
        isAllDay,
        status,
        videoConferenceUrl: videoConferenceUrl.trim() || undefined,
        videoConferenceProvider: videoConferenceProvider.trim() || undefined,
        attendeeEmails:
          attendees.length > 0 ? attendees.map((a) => a.email) : undefined,
        reminders: reminders.length > 0 ? reminders : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  const handleDeleteClick = () => {
    setConfirmDeleteOpen(true);
  };

  // Derived validation
  const titleError = titleTouched && !title.trim() ? "Title is required" : null;

  const dateTimeError = (() => {
    if (!startDate || !endDate) return null;
    const startISO = isAllDay
      ? `${startDate}T00:00:00`
      : `${startDate}T${startTime || "00:00"}:00`;
    const endISO = isAllDay
      ? `${endDate}T23:59:59`
      : `${endDate}T${endTime || "00:00"}:00`;
    const start = new Date(startISO);
    const end = new Date(endISO);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    if (!isAfter(end, start)) return "End time must be after start time";

    // Check availability for start date/time
    if (
      !isAllDay &&
      startDate &&
      startTime &&
      !isTimeAvailable(startDate, startTime)
    ) {
      const ranges = getAvailableTimeRanges(startDate);
      if (ranges.length === 0) {
        return "This day is marked as unavailable in your schedule";
      }
      return `Start time is outside available hours. Available: ${ranges.map((r) => `${r.start}-${r.end}`).join(", ")}`;
    }

    // Check availability for end date/time
    if (!isAllDay && endDate && endTime && !isTimeAvailable(endDate, endTime)) {
      const ranges = getAvailableTimeRanges(endDate);
      if (ranges.length === 0) {
        return "End date is marked as unavailable in your schedule";
      }
      return `End time is outside available hours. Available: ${ranges.map((r) => `${r.start}-${r.end}`).join(", ")}`;
    }

    return null;
  })();

  const addAttendee = () => {
    if (newAttendeeEmail && newAttendeeEmail.includes("@")) {
      setAttendees([...attendees, { email: newAttendeeEmail, name: "" }]);
      setNewAttendeeEmail("");
    }
  };

  const removeAttendee = (index: number) => {
    setAttendees(attendees.filter((_, i) => i !== index));
  };

  const addReminder = () => {
    setReminders([...reminders, { type: "push", minutesBefore: 15 }]);
  };

  const removeReminder = (index: number) => {
    setReminders(reminders.filter((_, i) => i !== index));
  };

  const updateReminder = (
    index: number,
    field: "type" | "minutesBefore",
    value: string | number,
  ) => {
    setReminders(
      reminders.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    );
  };

  const isEditing = !!event;

  return (
    <>
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{event?.title}&rdquo;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {isEditing ? t("editEvent") : t("newEvent")}
              </DialogTitle>
              <DialogDescription>
                {isEditing
                  ? t("editEventDescription")
                  : t("newEventDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">{t("eventTitle")}</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setTitleTouched(true)}
                  placeholder={t("eventTitlePlaceholder")}
                  className={titleError ? "border-destructive" : ""}
                  required
                />
                {titleError && (
                  <p className="text-xs text-destructive">{titleError}</p>
                )}
              </div>

              {/* All Day Toggle */}
              <div className="flex items-center justify-between">
                <Label htmlFor="all-day">{t("allDay")}</Label>
                <Switch
                  id="all-day"
                  checked={isAllDay}
                  onCheckedChange={setIsAllDay}
                />
              </div>

              {/* Date/Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("start")}</Label>
                  <div className="flex flex-col gap-2">
                    <Popover
                      open={startDatePickerOpen}
                      onOpenChange={setStartDatePickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !startDate && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? (
                            format(parseLocalDate(startDate), "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            startDate ? parseLocalDate(startDate) : undefined
                          }
                          onSelect={(date) => {
                            if (date) {
                              setStartDate(format(date, "yyyy-MM-dd"));
                              setStartDatePickerOpen(false);
                              // If end date is not set or is before start date, update it
                              if (
                                !endDate ||
                                endDate < format(date, "yyyy-MM-dd")
                              ) {
                                setEndDate(format(date, "yyyy-MM-dd"));
                              }
                            }
                          }}
                          disabled={(date) => !isDateAvailable(date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {!isAllDay && (
                      <>
                        <Input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className={cn(
                            "w-full dark:[color-scheme:dark]",
                            startDate &&
                              startTime &&
                              !isTimeAvailable(startDate, startTime) &&
                              "border-destructive",
                          )}
                          required
                        />
                        {startDate &&
                          startTime &&
                          !isTimeAvailable(startDate, startTime) && (
                            <p className="text-xs text-destructive">
                              Time outside available hours
                            </p>
                          )}
                      </>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("end")}</Label>
                  <div className="flex flex-col gap-2">
                    <Popover
                      open={endDatePickerOpen}
                      onOpenChange={setEndDatePickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !endDate && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? (
                            format(parseLocalDate(endDate), "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            endDate ? parseLocalDate(endDate) : undefined
                          }
                          onSelect={(date) => {
                            if (date) {
                              setEndDate(format(date, "yyyy-MM-dd"));
                              setEndDatePickerOpen(false);
                            }
                          }}
                          disabled={(date) => !isDateAvailable(date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {!isAllDay && (
                      <>
                        <Input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className={cn(
                            "w-full dark:[color-scheme:dark]",
                            endDate &&
                              endTime &&
                              !isTimeAvailable(endDate, endTime) &&
                              "border-destructive",
                          )}
                          required
                        />
                        {endDate &&
                          endTime &&
                          !isTimeAvailable(endDate, endTime) && (
                            <p className="text-xs text-destructive">
                              Time outside available hours
                            </p>
                          )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {!availabilityLoading && availabilityRules.length > 0 && (
                <p className="text-xs text-muted-foreground -mt-2">
                  Dates are restricted based on your availability settings.
                  {startDate && !isAllDay && (
                    <>
                      {" "}
                      Available times for{" "}
                      {format(parseLocalDate(startDate), "EEEE")}:{" "}
                      {getAvailableTimeRanges(startDate).length > 0
                        ? getAvailableTimeRanges(startDate)
                            .map((r) => `${r.start}-${r.end}`)
                            .join(", ")
                        : "None"}
                    </>
                  )}
                </p>
              )}

              {dateTimeError && (
                <p className="text-xs text-destructive -mt-2">
                  {dateTimeError}
                </p>
              )}

              <Separator />

              {/* Location */}
              <div className="space-y-2">
                <Label htmlFor="location" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {t("location")}
                </Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t("locationPlaceholder")}
                />
              </div>

              {/* Video Conference */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  {t("videoConference")}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={videoConferenceProvider}
                    onValueChange={setVideoConferenceProvider}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("selectProvider")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zoom">Zoom</SelectItem>
                      <SelectItem value="google_meet">Google Meet</SelectItem>
                      <SelectItem value="teams">Microsoft Teams</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={videoConferenceUrl}
                    onChange={(e) => setVideoConferenceUrl(e.target.value)}
                    placeholder={t("meetingLink")}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">{t("description")}</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("descriptionPlaceholder")}
                  rows={3}
                />
              </div>

              <Separator />

              {/* Attendees */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {t("attendees")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={newAttendeeEmail}
                    onChange={(e) => setNewAttendeeEmail(e.target.value)}
                    placeholder={t("attendeeEmailPlaceholder")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addAttendee();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addAttendee}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {attendees.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {attendees.map((attendee, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between px-2 py-1 bg-muted rounded"
                      >
                        <span className="text-sm">{attendee.email}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeAttendee(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reminders */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    {t("reminders")}
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addReminder}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {t("addReminder")}
                  </Button>
                </div>
                {reminders.length > 0 && (
                  <div className="space-y-2">
                    {reminders.map((reminder, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Select
                          value={String(reminder.minutesBefore)}
                          onValueChange={(v) =>
                            updateReminder(index, "minutesBefore", parseInt(v))
                          }
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {REMINDER_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={String(option.value)}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={reminder.type}
                          onValueChange={(v) =>
                            updateReminder(index, "type", v as ReminderType)
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="push">Push</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="sms">SMS</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeReminder(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status (edit mode only) */}
              {isEditing && (
                <div className="space-y-2">
                  <Label>{t("status")}</Label>
                  <Select
                    value={status}
                    onValueChange={(v) => setStatus(v as CalendarEventStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirmed">
                        {t("statusConfirmed")}
                      </SelectItem>
                      <SelectItem value="tentative">
                        {t("statusTentative")}
                      </SelectItem>
                      <SelectItem value="cancelled">
                        {t("statusCancelled")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              {isEditing && onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteClick}
                  disabled={isDeleting || isSaving}
                  className="mr-auto"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  {t("delete")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving || isDeleting}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  isSaving || isDeleting || !title.trim() || !!dateTimeError
                }
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {isEditing ? t("save") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
