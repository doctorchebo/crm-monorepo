"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TimeSlot } from "@/lib/api/public-booking";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

interface BookingSlotsProps {
  slots: TimeSlot[];
  loading: boolean;
  selectedDate: Date;
  onSlotSelect: (slot: TimeSlot) => void;
  onBack: () => void;
}

export function BookingSlots({
  slots,
  loading,
  selectedDate,
  onSlotSelect,
  onBack,
}: BookingSlotsProps) {
  const t = useTranslations("booking");

  // Group slots by period (morning, afternoon, evening)
  const groupedSlots = groupSlotsByPeriod(slots.filter((s) => s.available));

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-medium">
            {selectedDate.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
    );
  }

  const availableSlots = slots.filter((s) => s.available);

  if (availableSlots.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-medium">
            {selectedDate.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h3>
        </div>
        <div className="text-center py-12 text-muted-foreground">
          <p>{t("noSlotsAvailable")}</p>
          <Button variant="link" onClick={onBack} className="mt-2">
            {t("selectAnotherDate")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-medium">
          {selectedDate.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </h3>
      </div>

      {/* Morning slots */}
      {groupedSlots.morning.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">
            {t("morning")}
          </h4>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {groupedSlots.morning.map((slot) => (
              <SlotButton
                key={slot.startTime}
                slot={slot}
                formatTime={formatTime}
                onClick={() => onSlotSelect(slot)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Afternoon slots */}
      {groupedSlots.afternoon.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">
            {t("afternoon")}
          </h4>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {groupedSlots.afternoon.map((slot) => (
              <SlotButton
                key={slot.startTime}
                slot={slot}
                formatTime={formatTime}
                onClick={() => onSlotSelect(slot)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Evening slots */}
      {groupedSlots.evening.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">
            {t("evening")}
          </h4>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {groupedSlots.evening.map((slot) => (
              <SlotButton
                key={slot.startTime}
                slot={slot}
                formatTime={formatTime}
                onClick={() => onSlotSelect(slot)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SlotButton({
  slot,
  formatTime,
  onClick,
}: {
  slot: TimeSlot;
  formatTime: (time: string) => string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      className={cn(
        "w-full justify-center",
        "hover:bg-primary hover:text-primary-foreground",
        "transition-colors",
      )}
      onClick={onClick}
    >
      {formatTime(slot.startTime)}
    </Button>
  );
}

function groupSlotsByPeriod(slots: TimeSlot[]) {
  const morning: TimeSlot[] = [];
  const afternoon: TimeSlot[] = [];
  const evening: TimeSlot[] = [];

  slots.forEach((slot) => {
    const hour = new Date(slot.startTime).getHours();

    if (hour < 12) {
      morning.push(slot);
    } else if (hour < 17) {
      afternoon.push(slot);
    } else {
      evening.push(slot);
    }
  });

  return { morning, afternoon, evening };
}
