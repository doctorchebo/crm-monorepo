"use client";

/**
 * Calendar Settings Dialog
 * General display preferences for the calendar view
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
import { useEffect, useMemo, useState } from "react";
import { buildTimezoneOptions, getBrowserTimezone } from "./timezone-utils";

export interface CalendarPreferences {
  defaultView: "month" | "week" | "day" | "agenda";
  weekStartsOn: "sunday" | "monday";
  showWeekends: boolean;
  timeFormat: "12h" | "24h";
  defaultTimezone: string;
}

const STORAGE_KEY = "calendar-preferences";

export const DEFAULT_PREFERENCES: CalendarPreferences = {
  defaultView: "month",
  weekStartsOn: "sunday",
  showWeekends: true,
  timeFormat: "12h",
  defaultTimezone: "UTC",
};

export function loadCalendarPreferences(): CalendarPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return {
    ...DEFAULT_PREFERENCES,
    defaultTimezone: getBrowserTimezone(),
  };
}

export function saveCalendarPreferences(prefs: CalendarPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

interface CalendarSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPreferencesChange?: (prefs: CalendarPreferences) => void;
}

export function CalendarSettingsDialog({
  open,
  onOpenChange,
  onPreferencesChange,
}: CalendarSettingsDialogProps) {
  const [prefs, setPrefs] = useState<CalendarPreferences>(DEFAULT_PREFERENCES);
  const timezoneOptions = useMemo(() => buildTimezoneOptions(), []);

  useEffect(() => {
    if (open) {
      setPrefs(loadCalendarPreferences());
    }
  }, [open]);

  const update = (partial: Partial<CalendarPreferences>) => {
    setPrefs((prev) => ({ ...prev, ...partial }));
  };

  const handleSave = () => {
    saveCalendarPreferences(prefs);
    onPreferencesChange?.(prefs);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Calendar Settings</DialogTitle>
          <DialogDescription>
            Customize how the calendar looks and behaves for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Default View */}
          <div className="space-y-1.5">
            <Label htmlFor="cs-default-view">Default view</Label>
            <Select
              value={prefs.defaultView}
              onValueChange={(v) =>
                update({ defaultView: v as CalendarPreferences["defaultView"] })
              }
            >
              <SelectTrigger id="cs-default-view">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="agenda">Agenda</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Week starts on */}
          <div className="space-y-1.5">
            <Label htmlFor="cs-week-start">Week starts on</Label>
            <Select
              value={prefs.weekStartsOn}
              onValueChange={(v) =>
                update({
                  weekStartsOn: v as CalendarPreferences["weekStartsOn"],
                })
              }
            >
              <SelectTrigger id="cs-week-start">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sunday">Sunday</SelectItem>
                <SelectItem value="monday">Monday</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Show weekends */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="cs-weekends" className="cursor-pointer">
                Show weekends
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Display Saturday and Sunday in the calendar
              </p>
            </div>
            <Switch
              id="cs-weekends"
              checked={prefs.showWeekends}
              onCheckedChange={(v) => update({ showWeekends: v })}
            />
          </div>

          <Separator />

          {/* Time format */}
          <div className="space-y-1.5">
            <Label htmlFor="cs-time-format">Time format</Label>
            <Select
              value={prefs.timeFormat}
              onValueChange={(v) =>
                update({ timeFormat: v as CalendarPreferences["timeFormat"] })
              }
            >
              <SelectTrigger id="cs-time-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12h">12-hour (1:00 PM)</SelectItem>
                <SelectItem value="24h">24-hour (13:00)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Default timezone */}
          <div className="space-y-1.5">
            <Label htmlFor="cs-timezone">Display timezone</Label>
            <Select
              value={prefs.defaultTimezone}
              onValueChange={(v) => update({ defaultTimezone: v })}
            >
              <SelectTrigger id="cs-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {timezoneOptions.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
