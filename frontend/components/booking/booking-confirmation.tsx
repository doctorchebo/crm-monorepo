"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PublicBookingLink, TimeSlot } from "@/lib/api/public-booking";
import { Calendar, CheckCircle2, Clock, Mail, User } from "lucide-react";
import { useTranslations } from "next-intl";

interface BookingConfirmationProps {
  bookingLink: PublicBookingLink;
  confirmationCode: string;
  selectedSlot: TimeSlot;
  guestName: string;
  guestEmail: string;
}

export function BookingConfirmation({
  bookingLink,
  confirmationCode,
  selectedSlot,
  guestName,
  guestEmail,
}: BookingConfirmationProps) {
  const t = useTranslations("booking");

  const startTime = new Date(selectedSlot.startTime);
  const endTime = new Date(selectedSlot.endTime);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleAddToCalendar = () => {
    // Generate ICS file for calendar download
    const icsContent = generateICS({
      title: bookingLink.name,
      description: bookingLink.description || "",
      startTime,
      endTime,
      hostName: bookingLink.hostName || "",
    });

    const blob = new Blob([icsContent], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `booking-${confirmationCode}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <CardTitle className="text-2xl">
          {bookingLink.requiresConfirmation
            ? t("bookingRequested")
            : t("bookingConfirmed")}
        </CardTitle>
        <CardDescription>
          {bookingLink.requiresConfirmation
            ? t("bookingRequestedDescription")
            : t("bookingConfirmedDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Confirmation code */}
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground mb-1">
            {t("confirmationCode")}
          </p>
          <p className="text-2xl font-mono font-bold tracking-wider">
            {confirmationCode}
          </p>
        </div>

        {/* Booking details */}
        <div className="space-y-4">
          <h3 className="font-semibold">{t("bookingDetails")}</h3>

          <div className="space-y-3">
            {/* Event name */}
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{bookingLink.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(startTime)}
                </p>
              </div>
            </div>

            {/* Time */}
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">
                  {formatTime(startTime)} - {formatTime(endTime)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {bookingLink.duration} {t("minutes")}
                </p>
              </div>
            </div>

            {/* Guest name */}
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{guestName}</p>
                <p className="text-sm text-muted-foreground">{t("guest")}</p>
              </div>
            </div>

            {/* Email */}
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{guestEmail}</p>
                <p className="text-sm text-muted-foreground">
                  {t("confirmationSentTo")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-4">
          <Button onClick={handleAddToCalendar} className="w-full">
            <Calendar className="mr-2 h-4 w-4" />
            {t("addToCalendar")}
          </Button>

          <Button
            variant="outline"
            onClick={() => window.print()}
            className="w-full"
          >
            {t("printConfirmation")}
          </Button>
        </div>

        {/* Host info */}
        {bookingLink.hostName && (
          <div className="border-t pt-4 mt-6">
            <p className="text-sm text-muted-foreground text-center">
              {t("hostInfo", { name: bookingLink.hostName })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function generateICS({
  title,
  description,
  startTime,
  endTime,
  hostName,
}: {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  hostName: string;
}): string {
  const formatICSDate = (date: Date) => {
    return date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  };

  const uid = `${Date.now()}-${Math.random().toString(36).substring(2)}@booking`;

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CRM Calendar//Booking//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${uid}
DTSTART:${formatICSDate(startTime)}
DTEND:${formatICSDate(endTime)}
SUMMARY:${title}
DESCRIPTION:${description}${hostName ? `\\nHost: ${hostName}` : ""}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;
}
