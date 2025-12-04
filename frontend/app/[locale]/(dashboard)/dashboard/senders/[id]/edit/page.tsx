"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotification } from "@/hooks/use-notification";
import { backendApi } from "@/lib/api/endpoints";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Sender {
  id: number;
  phoneNumber: string;
  displayName?: string;
  twilioPhoneNumberSid?: string;
  twilioMessagingServiceSid?: string;
  twilioAccountSid?: string;
}

export default function SenderFormPage({
  params,
}: {
  params: { locale: string; id?: string };
}) {
  const router = useRouter();
  const locale = params.locale;
  const senderId = params.id;
  const isEdit = !!senderId;

  const { addNotification } = useNotification();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<Partial<Sender>>({
    phoneNumber: "",
    displayName: "",
    twilioPhoneNumberSid: "",
    twilioMessagingServiceSid: "",
    twilioAccountSid: "",
  });

  // Fetch sender data if editing
  useEffect(() => {
    if (isEdit) {
      const fetchSender = async () => {
        try {
          const response = await fetch(
            `${backendApi.baseUrl}/senders/${senderId}`
          );
          if (!response.ok) throw new Error("Failed to fetch sender");
          const sender = await response.json();
          setFormData(sender);
        } catch (err) {
          console.error("Failed to fetch sender:", err);
          addNotification("Failed to load sender details", "error");
          router.push(`/${locale}/dashboard/senders`);
        } finally {
          setIsFetching(false);
        }
      };

      fetchSender();
    }
  }, [isEdit, senderId, locale, router, addNotification]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.phoneNumber?.trim()) {
      newErrors.phoneNumber = "Phone number is required";
    } else if (!/^\+\d{1,3}\d{1,14}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber =
        "Phone must be in E.164 format (e.g., +14155552671)";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      addNotification("Please fix the errors below", "error");
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        phoneNumber: formData.phoneNumber,
        displayName: formData.displayName || null,
        twilioPhoneNumberSid: formData.twilioPhoneNumberSid || null,
        twilioMessagingServiceSid: formData.twilioMessagingServiceSid || null,
        twilioAccountSid: formData.twilioAccountSid || null,
      };

      const method = isEdit ? "PATCH" : "POST";
      const url = isEdit
        ? `${backendApi.baseUrl}/senders/${senderId}`
        : `${backendApi.baseUrl}/senders`;

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.message || `Failed to ${isEdit ? "update" : "create"} sender`
        );
      }

      const result = await response.json();

      addNotification(
        `Sender ${isEdit ? "updated" : "created"} successfully`,
        "success"
      );

      router.push(`/${locale}/dashboard/senders`);
    } catch (err: any) {
      console.error("Error:", err);
      addNotification(err.message || "An error occurred", "error");
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8">
        <div className="h-8 bg-muted animate-pulse rounded" />
        <Card className="h-96 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/${locale}/dashboard/senders`)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEdit ? "Edit Sender" : "Add New Sender"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEdit
              ? "Update sender details"
              : "Add a new WhatsApp business number"}
          </p>
        </div>
      </div>

      {/* Form */}
      <Card className="p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Phone Number Field */}
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone Number *</Label>
            <Input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              placeholder="+14155552671"
              value={formData.phoneNumber || ""}
              onChange={handleChange}
              disabled={isLoading}
              className={errors.phoneNumber ? "border-red-500" : ""}
            />
            {errors.phoneNumber && (
              <p className="text-sm text-red-500">{errors.phoneNumber}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Must be in E.164 format (country code + phone number)
            </p>
          </div>

          {/* Display Name Field */}
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name (Optional)</Label>
            <Input
              id="displayName"
              name="displayName"
              placeholder="e.g., Main Office, Sales Team"
              value={formData.displayName || ""}
              onChange={handleChange}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              A friendly name to help you identify this number
            </p>
          </div>

          {/* Twilio Fields (Optional) */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold">Twilio Details (Optional)</h3>

            <div className="space-y-2">
              <Label htmlFor="twilioPhoneNumberSid">Phone Number SID</Label>
              <Input
                id="twilioPhoneNumberSid"
                name="twilioPhoneNumberSid"
                placeholder="PNXXXXXXXXXXXXXXXX"
                value={formData.twilioPhoneNumberSid || ""}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="twilioMessagingServiceSid">
                Messaging Service SID
              </Label>
              <Input
                id="twilioMessagingServiceSid"
                name="twilioMessagingServiceSid"
                placeholder="MGXXXXXXXXXXXXXXXX"
                value={formData.twilioMessagingServiceSid || ""}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="twilioAccountSid">Account SID</Label>
              <Input
                id="twilioAccountSid"
                name="twilioAccountSid"
                placeholder="ACXXXXXXXXXXXXXXXX"
                value={formData.twilioAccountSid || ""}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/${locale}/dashboard/senders`)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? "Saving..."
                : isEdit
                ? "Update Sender"
                : "Add Sender"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
