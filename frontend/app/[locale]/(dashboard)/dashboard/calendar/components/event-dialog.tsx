"use client";

/**
 * Event Dialog Component
 * Modal for creating and editing calendar events
 */

import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  CalendarEvent,
  CalendarEventStatus,
  CreateEventDto,
  ReminderType,
} from "@/lib/api/calendar";
import { addHours, format, parseISO, setHours, setMinutes } from "date-fns";
import {
  Bell,
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
    }
  }, [open, event, initialDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return;

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
        attendees: attendees.length > 0 ? attendees : undefined,
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
    }
  };

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? t("editEvent") : t("newEvent")}
            </DialogTitle>
            <DialogDescription>
              {isEditing ? t("editEventDescription") : t("newEventDescription")}
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
                placeholder={t("eventTitlePlaceholder")}
                required
              />
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
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                  {!isAllDay && (
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                    />
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("end")}</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                  {!isAllDay && (
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                    />
                  )}
                </div>
              </div>
            </div>

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
                onClick={handleDelete}
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
              disabled={isSaving || isDeleting || !title.trim()}
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isEditing ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
