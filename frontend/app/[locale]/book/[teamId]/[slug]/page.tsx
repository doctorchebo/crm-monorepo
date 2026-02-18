"use client";

import { BookingCalendar } from "@/components/booking/booking-calendar";
import { BookingConfirmation } from "@/components/booking/booking-confirmation";
import { BookingForm } from "@/components/booking/booking-form";
import { BookingSlots } from "@/components/booking/booking-slots";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createPublicBooking,
  getAvailableDates,
  getAvailableSlots,
  getPublicBookingLink,
  isError,
  type PublicBookingLink,
  type TimeSlot,
} from "@/lib/api/public-booking";
import { AlertCircle, Calendar, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type BookingStep = "date" | "time" | "form" | "confirmation";

interface BookingData {
  selectedDate: Date | null;
  selectedSlot: TimeSlot | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  notes: string;
  customAnswers: Record<string, string>;
}

export default function PublicBookingPage() {
  const params = useParams();
  const t = useTranslations("booking");
  const teamId = params.teamId as string;
  const slug = params.slug as string;

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingLink, setBookingLink] = useState<PublicBookingLink | null>(
    null,
  );
  const [step, setStep] = useState<BookingStep>("date");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [bookingData, setBookingData] = useState<BookingData>({
    selectedDate: null,
    selectedSlot: null,
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    notes: "",
    customAnswers: {},
  });

  // Fetch booking link details
  useEffect(() => {
    async function fetchBookingLink() {
      setLoading(true);
      const response = await getPublicBookingLink(teamId, slug);

      if (isError(response)) {
        setError(response.message);
        setLoading(false);
        return;
      }

      setBookingLink(response);
      setLoading(false);

      // Fetch available dates for current month
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const datesResponse = await getAvailableDates(teamId, slug, month);

      if (!isError(datesResponse)) {
        setAvailableDates(datesResponse.availableDates);
      }
    }

    fetchBookingLink();
  }, [teamId, slug]);

  // Fetch slots when date is selected
  const handleDateSelect = async (date: Date) => {
    setBookingData((prev) => ({
      ...prev,
      selectedDate: date,
      selectedSlot: null,
    }));
    setSlotsLoading(true);

    const dateStr = date.toISOString().split("T")[0];
    const response = await getAvailableSlots(teamId, slug, dateStr);

    if (isError(response)) {
      setSlots([]);
    } else {
      setSlots(response.slots);
    }

    setSlotsLoading(false);
    setStep("time");
  };

  // Handle slot selection
  const handleSlotSelect = (slot: TimeSlot) => {
    setBookingData((prev) => ({ ...prev, selectedSlot: slot }));
    setStep("form");
  };

  // Handle form submission
  const handleFormSubmit = async (formData: {
    guestName: string;
    guestEmail: string;
    guestPhone?: string;
    notes?: string;
    customAnswers?: Record<string, string>;
  }) => {
    if (!bookingData.selectedSlot) return;

    setSubmitting(true);

    const response = await createPublicBooking(teamId, slug, {
      startTime: bookingData.selectedSlot.startTime,
      guestName: formData.guestName,
      guestEmail: formData.guestEmail,
      guestPhone: formData.guestPhone,
      notes: formData.notes,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      customAnswers: formData.customAnswers,
    });

    setSubmitting(false);

    if (isError(response)) {
      setError(response.message);
      return;
    }

    setConfirmationCode(response.bookingId);
    setStep("confirmation");
  };

  // Handle month change for calendar
  const handleMonthChange = async (month: Date) => {
    const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    const datesResponse = await getAvailableDates(teamId, slug, monthStr);

    if (!isError(datesResponse)) {
      setAvailableDates(datesResponse.availableDates);
    }
  };

  // Go back to previous step
  const handleBack = () => {
    if (step === "time") setStep("date");
    else if (step === "form") setStep("time");
  };

  // Loading state
  if (loading) {
    return (
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[400px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error || !bookingLink) {
    return (
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("errorTitle")}</AlertTitle>
          <AlertDescription>
            {error || t("bookingLinkNotFound")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Confirmation step
  if (step === "confirmation" && confirmationCode) {
    return (
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <BookingConfirmation
          bookingLink={bookingLink}
          confirmationCode={confirmationCode}
          selectedSlot={bookingData.selectedSlot!}
          guestName={bookingData.guestName || ""}
          guestEmail={bookingData.guestEmail || ""}
        />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto py-12 px-4">
      <div className="grid gap-8 md:grid-cols-[2fr,1fr]">
        {/* Main booking area */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{bookingLink.name}</CardTitle>
            {bookingLink.description && (
              <p className="text-muted-foreground mt-2">
                {bookingLink.description}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {/* Date selection */}
            {step === "date" && (
              <BookingCalendar
                availableDates={availableDates}
                onDateSelect={handleDateSelect}
                onMonthChange={handleMonthChange}
                maxAdvanceDays={bookingLink.maxAdvanceDays || 60}
              />
            )}

            {/* Time slot selection */}
            {step === "time" && (
              <BookingSlots
                slots={slots}
                loading={slotsLoading}
                selectedDate={bookingData.selectedDate!}
                onSlotSelect={handleSlotSelect}
                onBack={handleBack}
              />
            )}

            {/* Booking form */}
            {step === "form" && (
              <BookingForm
                bookingLink={bookingLink}
                selectedSlot={bookingData.selectedSlot!}
                onSubmit={handleFormSubmit}
                onBack={handleBack}
                submitting={submitting}
              />
            )}
          </CardContent>
        </Card>

        {/* Sidebar with booking info */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {/* Duration */}
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{t("duration")}</p>
                    <p className="text-sm text-muted-foreground">
                      {bookingLink.duration} {t("minutes")}
                    </p>
                  </div>
                </div>

                {/* Host */}
                {bookingLink.hostName && (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary font-medium">
                        {bookingLink.hostName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{bookingLink.hostName}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("host")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Selected date/time */}
                {bookingData.selectedDate && (
                  <div className="flex items-center gap-3 pt-4 border-t">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {bookingData.selectedDate.toLocaleDateString(
                          undefined,
                          {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          },
                        )}
                      </p>
                      {bookingData.selectedSlot && (
                        <p className="text-sm text-muted-foreground">
                          {new Date(
                            bookingData.selectedSlot.startTime,
                          ).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
