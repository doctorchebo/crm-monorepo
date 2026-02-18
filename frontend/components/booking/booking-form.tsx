"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PublicBookingLink, TimeSlot } from "@/lib/api/public-booking";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface BookingFormProps {
  bookingLink: PublicBookingLink;
  selectedSlot: TimeSlot;
  onSubmit: (data: {
    guestName: string;
    guestEmail: string;
    guestPhone?: string;
    notes?: string;
    customAnswers?: Record<string, string>;
  }) => void;
  onBack: () => void;
  submitting: boolean;
}

export function BookingForm({
  bookingLink,
  selectedSlot,
  onSubmit,
  onBack,
  submitting,
}: BookingFormProps) {
  const t = useTranslations("booking");
  const [formData, setFormData] = useState({
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    notes: "",
    customAnswers: {} as Record<string, string>,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when field is edited
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleCustomAnswerChange = (questionId: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      customAnswers: { ...prev.customAnswers, [questionId]: value },
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.guestName.trim()) {
      newErrors.guestName = t("nameRequired");
    }

    if (!formData.guestEmail.trim()) {
      newErrors.guestEmail = t("emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.guestEmail)) {
      newErrors.guestEmail = t("emailInvalid");
    }

    if (bookingLink.collectPhone && !formData.guestPhone.trim()) {
      newErrors.guestPhone = t("phoneRequired");
    }

    // Validate custom questions
    if (bookingLink.customQuestions) {
      bookingLink.customQuestions.forEach((question) => {
        if (question.required && !formData.customAnswers[question.id]?.trim()) {
          newErrors[`custom_${question.id}`] = t("fieldRequired");
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    onSubmit({
      guestName: formData.guestName,
      guestEmail: formData.guestEmail,
      guestPhone: formData.guestPhone || undefined,
      notes: formData.notes || undefined,
      customAnswers:
        Object.keys(formData.customAnswers).length > 0
          ? formData.customAnswers
          : undefined,
    });
  };

  const formatSlotTime = () => {
    const start = new Date(selectedSlot.startTime);
    return start.toLocaleString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          disabled={submitting}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h3 className="text-lg font-medium">{t("enterDetails")}</h3>
          <p className="text-sm text-muted-foreground">{formatSlotTime()}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="guestName">
            {t("name")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="guestName"
            value={formData.guestName}
            onChange={(e) => handleChange("guestName", e.target.value)}
            placeholder={t("namePlaceholder")}
            disabled={submitting}
            className={errors.guestName ? "border-destructive" : ""}
          />
          {errors.guestName && (
            <p className="text-sm text-destructive">{errors.guestName}</p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="guestEmail">
            {t("email")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="guestEmail"
            type="email"
            value={formData.guestEmail}
            onChange={(e) => handleChange("guestEmail", e.target.value)}
            placeholder={t("emailPlaceholder")}
            disabled={submitting}
            className={errors.guestEmail ? "border-destructive" : ""}
          />
          {errors.guestEmail && (
            <p className="text-sm text-destructive">{errors.guestEmail}</p>
          )}
        </div>

        {/* Phone (optional or required based on bookingLink settings) */}
        {bookingLink.collectPhone !== false && (
          <div className="space-y-2">
            <Label htmlFor="guestPhone">
              {t("phone")}
              {bookingLink.collectPhone && (
                <span className="text-destructive"> *</span>
              )}
            </Label>
            <Input
              id="guestPhone"
              type="tel"
              value={formData.guestPhone}
              onChange={(e) => handleChange("guestPhone", e.target.value)}
              placeholder={t("phonePlaceholder")}
              disabled={submitting}
              className={errors.guestPhone ? "border-destructive" : ""}
            />
            {errors.guestPhone && (
              <p className="text-sm text-destructive">{errors.guestPhone}</p>
            )}
          </div>
        )}

        {/* Notes (optional based on bookingLink settings) */}
        {bookingLink.collectNotes !== false && (
          <div className="space-y-2">
            <Label htmlFor="notes">{t("additionalNotes")}</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder={t("notesPlaceholder")}
              rows={3}
              disabled={submitting}
            />
          </div>
        )}

        {/* Custom questions */}
        {bookingLink.customQuestions?.map((question) => (
          <div key={question.id} className="space-y-2">
            <Label htmlFor={`question_${question.id}`}>
              {question.label}
              {question.required && (
                <span className="text-destructive"> *</span>
              )}
            </Label>
            {question.type === "textarea" ? (
              <Textarea
                id={`question_${question.id}`}
                value={formData.customAnswers[question.id] || ""}
                onChange={(e) =>
                  handleCustomAnswerChange(question.id, e.target.value)
                }
                rows={3}
                disabled={submitting}
                className={
                  errors[`custom_${question.id}`] ? "border-destructive" : ""
                }
              />
            ) : question.type === "select" && question.options ? (
              <select
                id={`question_${question.id}`}
                value={formData.customAnswers[question.id] || ""}
                onChange={(e) =>
                  handleCustomAnswerChange(question.id, e.target.value)
                }
                disabled={submitting}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{t("selectOption")}</option>
                {question.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`question_${question.id}`}
                value={formData.customAnswers[question.id] || ""}
                onChange={(e) =>
                  handleCustomAnswerChange(question.id, e.target.value)
                }
                disabled={submitting}
                className={
                  errors[`custom_${question.id}`] ? "border-destructive" : ""
                }
              />
            )}
            {errors[`custom_${question.id}`] && (
              <p className="text-sm text-destructive">
                {errors[`custom_${question.id}`]}
              </p>
            )}
          </div>
        ))}

        {/* Submit button */}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("scheduling")}
            </>
          ) : (
            t("confirmBooking")
          )}
        </Button>

        {/* Confirmation notice */}
        {bookingLink.requiresConfirmation && (
          <p className="text-sm text-muted-foreground text-center">
            {t("requiresConfirmationNotice")}
          </p>
        )}
      </form>
    </div>
  );
}
