"use client";

/**
 * Availability Settings Page
 * Configure working hours and availability rules for bookings
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuthProtection } from "@/hooks/use-auth";
import { useAvailability } from "@/hooks/use-calendar";
import type { DayOfWeek } from "@/lib/api/calendar";
import { Clock, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

interface DaySchedule {
  isAvailable: boolean;
  startTime: string;
  endTime: string;
}

type WeekSchedule = Record<DayOfWeek, DaySchedule>;

const DEFAULT_SCHEDULE: WeekSchedule = {
  monday: { isAvailable: true, startTime: "09:00", endTime: "17:00" },
  tuesday: { isAvailable: true, startTime: "09:00", endTime: "17:00" },
  wednesday: { isAvailable: true, startTime: "09:00", endTime: "17:00" },
  thursday: { isAvailable: true, startTime: "09:00", endTime: "17:00" },
  friday: { isAvailable: true, startTime: "09:00", endTime: "17:00" },
  saturday: { isAvailable: false, startTime: "09:00", endTime: "17:00" },
  sunday: { isAvailable: false, startTime: "09:00", endTime: "17:00" },
};

export default function AvailabilityPage() {
  const t = useTranslations("calendar");
  useAuthProtection();

  const { rules, isLoading, setRules } = useAvailability();
  const [schedule, setSchedule] = useState<WeekSchedule>(DEFAULT_SCHEDULE);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize schedule from rules
  useEffect(() => {
    if (rules.length > 0) {
      const newSchedule = { ...DEFAULT_SCHEDULE };
      rules.forEach((rule) => {
        if (rule.dayOfWeek && newSchedule[rule.dayOfWeek]) {
          newSchedule[rule.dayOfWeek] = {
            isAvailable: rule.isAvailable,
            startTime: rule.startTime,
            endTime: rule.endTime,
          };
        }
      });
      setSchedule(newSchedule);
    }
  }, [rules]);

  const updateDay = useCallback(
    (day: DayOfWeek, updates: Partial<DaySchedule>) => {
      setSchedule((prev) => ({
        ...prev,
        [day]: { ...prev[day], ...updates },
      }));
      setHasChanges(true);
    },
    [],
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const rulesData = DAYS_OF_WEEK.map((day) => ({
        dayOfWeek: day.value,
        startTime: schedule[day.value].startTime,
        endTime: schedule[day.value].endTime,
        isAvailable: schedule[day.value].isAvailable,
      }));

      await setRules({ rules: rulesData });
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  const applyToAll = (template: DaySchedule) => {
    const newSchedule = { ...schedule };
    DAYS_OF_WEEK.forEach((day) => {
      if (day.value !== "saturday" && day.value !== "sunday") {
        newSchedule[day.value] = { ...template };
      }
    });
    setSchedule(newSchedule);
    setHasChanges(true);
  };

  return (
    <PageLayout
      title={t("availability")}
      description={t("availabilityDescription")}
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
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
              <CardDescription>
                Apply common schedules to all weekdays
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  applyToAll({
                    isAvailable: true,
                    startTime: "09:00",
                    endTime: "17:00",
                  })
                }
              >
                9 AM - 5 PM
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  applyToAll({
                    isAvailable: true,
                    startTime: "08:00",
                    endTime: "18:00",
                  })
                }
              >
                8 AM - 6 PM
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  applyToAll({
                    isAvailable: true,
                    startTime: "10:00",
                    endTime: "19:00",
                  })
                }
              >
                10 AM - 7 PM
              </Button>
            </CardContent>
          </Card>

          {/* Weekly Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Weekly Schedule
              </CardTitle>
              <CardDescription>
                Set your available hours for each day of the week
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {DAYS_OF_WEEK.map((day) => (
                <DayRow
                  key={day.value}
                  day={day}
                  schedule={schedule[day.value]}
                  onUpdate={(updates) => updateDay(day.value, updates)}
                />
              ))}
            </CardContent>
          </Card>

          {/* Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                • These availability rules apply to all your booking links by
                default
              </p>
              <p>
                • You can override availability for specific dates in the
                calendar view
              </p>
              <p>
                • Booking links can have their own custom availability rules
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}

interface DayRowProps {
  day: { value: DayOfWeek; label: string };
  schedule: DaySchedule;
  onUpdate: (updates: Partial<DaySchedule>) => void;
}

function DayRow({ day, schedule, onUpdate }: DayRowProps) {
  return (
    <div className="flex items-center gap-4 py-2 border-b last:border-0">
      <div className="w-28">
        <Label className="font-medium">{day.label}</Label>
      </div>

      <Switch
        checked={schedule.isAvailable}
        onCheckedChange={(checked) => onUpdate({ isAvailable: checked })}
      />

      {schedule.isAvailable ? (
        <div className="flex items-center gap-2 flex-1">
          <Input
            type="time"
            value={schedule.startTime}
            onChange={(e) => onUpdate({ startTime: e.target.value })}
            className="w-32"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="time"
            value={schedule.endTime}
            onChange={(e) => onUpdate({ endTime: e.target.value })}
            className="w-32"
          />
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">Unavailable</span>
      )}
    </div>
  );
}
