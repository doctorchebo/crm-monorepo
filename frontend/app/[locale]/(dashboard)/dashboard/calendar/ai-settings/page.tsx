"use client";

/**
 * Calendar AI Settings Page
 * Configure AI permissions and preferences for calendar management
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLayout } from "@/components/ui/page-layout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuthProtection } from "@/hooks/use-auth";
import { useCalendarAiSettings } from "@/hooks/use-calendar";
import type { AiCalendarPermission, DayOfWeek } from "@/lib/api/calendar";
import {
  Bot,
  Calendar,
  Clock,
  Loader2,
  Save,
  Shield,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

const DAYS_OF_WEEK: { value: DayOfWeek; label: string; short: string }[] = [
  { value: "monday", label: "Monday", short: "Mon" },
  { value: "tuesday", label: "Tuesday", short: "Tue" },
  { value: "wednesday", label: "Wednesday", short: "Wed" },
  { value: "thursday", label: "Thursday", short: "Thu" },
  { value: "friday", label: "Friday", short: "Fri" },
  { value: "saturday", label: "Saturday", short: "Sat" },
  { value: "sunday", label: "Sunday", short: "Sun" },
];

const PERMISSION_LEVELS: {
  value: AiCalendarPermission;
  label: string;
  description: string;
}[] = [
  {
    value: "suggest_only",
    label: "Suggest Only",
    description: "AI can suggest events but cannot create or modify them",
  },
  {
    value: "create_with_approval",
    label: "Create with Approval",
    description: "AI can create events but requires your approval first",
  },
  {
    value: "full_autonomy",
    label: "Full Autonomy",
    description: "AI can create, modify, and manage events independently",
  },
];

export default function AiSettingsPage() {
  const t = useTranslations("calendar");
  useAuthProtection();

  const { settings, isLoading, updateSettings } = useCalendarAiSettings();
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [isEnabled, setIsEnabled] = useState(false);
  const [permissionLevel, setPermissionLevel] =
    useState<AiCalendarPermission>("suggest_only");
  const [canCreateEvents, setCanCreateEvents] = useState(true);
  const [canModifyEvents, setCanModifyEvents] = useState(true);
  const [canDeleteEvents, setCanDeleteEvents] = useState(false);
  const [canManageBookings, setCanManageBookings] = useState(true);
  const [autoScheduleEnabled, setAutoScheduleEnabled] = useState(false);
  const [preferredMeetingDuration, setPreferredMeetingDuration] = useState(30);
  const [workingHoursStart, setWorkingHoursStart] = useState("09:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("17:00");
  const [workingDays, setWorkingDays] = useState<DayOfWeek[]>([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
  ]);

  // Initialize form from settings
  useEffect(() => {
    if (settings) {
      setIsEnabled(settings.isEnabled);
      setPermissionLevel(settings.permissionLevel);
      setCanCreateEvents(settings.canCreateEvents);
      setCanModifyEvents(settings.canModifyEvents);
      setCanDeleteEvents(settings.canDeleteEvents);
      setCanManageBookings(settings.canManageBookings);
      setAutoScheduleEnabled(settings.autoScheduleEnabled);
      setPreferredMeetingDuration(settings.preferredMeetingDuration);
      setWorkingHoursStart(settings.workingHoursStart || "09:00");
      setWorkingHoursEnd(settings.workingHoursEnd || "17:00");
      setWorkingDays(settings.workingDays || []);
    }
  }, [settings]);

  const markChanged = useCallback(() => {
    setHasChanges(true);
  }, []);

  const toggleWorkingDay = (day: DayOfWeek) => {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
    markChanged();
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        isEnabled,
        permissionLevel,
        canCreateEvents,
        canModifyEvents,
        canDeleteEvents,
        canManageBookings,
        autoScheduleEnabled,
        preferredMeetingDuration,
        workingHoursStart,
        workingHoursEnd,
        workingDays,
      });
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageLayout
      title={t("aiSettings")}
      description={t("aiSettingsDescription")}
      headerActions={
        <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Enable AI */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      AI Calendar Assistant
                    </CardTitle>
                    <CardDescription>
                      Let AI help manage your calendar and schedule
                    </CardDescription>
                  </div>
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(v) => {
                    setIsEnabled(v);
                    markChanged();
                  }}
                />
              </div>
            </CardHeader>
          </Card>

          {isEnabled && (
            <>
              {/* Permission Level */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Permission Level
                  </CardTitle>
                  <CardDescription>
                    Control how much autonomy the AI has over your calendar
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {PERMISSION_LEVELS.map((level) => (
                    <div
                      key={level.value}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        permissionLevel === level.value
                          ? "border-primary bg-primary/5"
                          : "hover:border-muted-foreground/50"
                      }`}
                      onClick={() => {
                        setPermissionLevel(level.value);
                        markChanged();
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded-full border-2 ${
                            permissionLevel === level.value
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/50"
                          }`}
                        >
                          {permissionLevel === level.value && (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="w-1.5 h-1.5 bg-white rounded-full" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{level.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {level.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Fine-grained Permissions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Capabilities
                  </CardTitle>
                  <CardDescription>
                    Fine-tune what actions the AI can perform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Create events</Label>
                      <p className="text-xs text-muted-foreground">
                        Allow AI to create new calendar events
                      </p>
                    </div>
                    <Switch
                      checked={canCreateEvents}
                      onCheckedChange={(v) => {
                        setCanCreateEvents(v);
                        markChanged();
                      }}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Modify events</Label>
                      <p className="text-xs text-muted-foreground">
                        Allow AI to update event details
                      </p>
                    </div>
                    <Switch
                      checked={canModifyEvents}
                      onCheckedChange={(v) => {
                        setCanModifyEvents(v);
                        markChanged();
                      }}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Delete events</Label>
                      <p className="text-xs text-muted-foreground">
                        Allow AI to remove events from calendar
                      </p>
                    </div>
                    <Switch
                      checked={canDeleteEvents}
                      onCheckedChange={(v) => {
                        setCanDeleteEvents(v);
                        markChanged();
                      }}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Manage bookings</Label>
                      <p className="text-xs text-muted-foreground">
                        Allow AI to confirm/cancel booking requests
                      </p>
                    </div>
                    <Switch
                      checked={canManageBookings}
                      onCheckedChange={(v) => {
                        setCanManageBookings(v);
                        markChanged();
                      }}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Auto-schedule</Label>
                      <p className="text-xs text-muted-foreground">
                        Let AI find optimal times for meetings
                      </p>
                    </div>
                    <Switch
                      checked={autoScheduleEnabled}
                      onCheckedChange={(v) => {
                        setAutoScheduleEnabled(v);
                        markChanged();
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Scheduling Preferences */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Scheduling Preferences
                  </CardTitle>
                  <CardDescription>
                    Help AI understand your scheduling preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Preferred Duration */}
                  <div className="space-y-2">
                    <Label>Default meeting duration</Label>
                    <Select
                      value={String(preferredMeetingDuration)}
                      onValueChange={(v) => {
                        setPreferredMeetingDuration(parseInt(v));
                        markChanged();
                      }}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">60 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Working Hours */}
                  <div className="space-y-2">
                    <Label>Working hours</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={workingHoursStart}
                        onChange={(e) => {
                          setWorkingHoursStart(e.target.value);
                          markChanged();
                        }}
                        className="w-32"
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={workingHoursEnd}
                        onChange={(e) => {
                          setWorkingHoursEnd(e.target.value);
                          markChanged();
                        }}
                        className="w-32"
                      />
                    </div>
                  </div>

                  {/* Working Days */}
                  <div className="space-y-2">
                    <Label>Working days</Label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <Button
                          key={day.value}
                          variant={
                            workingDays.includes(day.value)
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() => toggleWorkingDay(day.value)}
                        >
                          {day.short}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    How AI Calendar Works
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>
                    • AI can understand natural language requests like "Schedule
                    a meeting with John next Tuesday"
                  </p>
                  <p>
                    • It respects your availability and working hours when
                    suggesting times
                  </p>
                  <p>
                    • External calendar blocks are considered to avoid conflicts
                  </p>
                  <p>• All AI actions are logged in the activity history</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </PageLayout>
  );
}
