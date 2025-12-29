"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountryCodeSelect } from "@/components/ui/country-code-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotification } from "@/hooks/use-notification";
import { backendApi, CreateContactDto } from "@/lib/api/endpoints";
import { extractPhoneNumberParts } from "@/lib/utils/phone-number";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Contact {
  id: string;
  contactId: string;
  firstName: string;
  lastName: string | null;
  countryCode: string;
  phoneNumber: string;
  avatar: string | null;
  lastMessageTime: string | null;
  lastMessagePreview: string | null;
  lastMessageType: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ContactFormPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = params.locale as string;
  const contactId = searchParams.get("id");
  const isEdit = !!contactId;
  const t = useTranslations("contacts");
  const { addNotification } = useNotification();

  const [isLoading, setIsLoading] = useState(false);
  const [isContactLoading, setIsContactLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    countryCode: "",
    phoneNumber: "",
  });

  // Fetch contact data if editing
  useEffect(() => {
    if (!isEdit) {
      setIsContactLoading(false);
      return;
    }

    const fetchContact = async () => {
      try {
        setIsContactLoading(true);
        const data = (await backendApi.contacts.get(contactId)) as Contact;

        // Use shared utility to extract phone number parts
        // The utility handles cases where phone number includes country code
        const phoneParts = extractPhoneNumberParts(data.phoneNumber);

        // Prefer the stored countryCode if available, otherwise use extracted one
        const countryCode = data.countryCode || phoneParts.countryCode;
        const phoneNumberOnly = phoneParts.phoneNumber;

        setFormData({
          firstName: data.firstName,
          lastName: data.lastName || "",
          countryCode: countryCode,
          phoneNumber: phoneNumberOnly,
        });
      } catch {
        setError("Failed to load contact");
        addNotification("Failed to load contact", "error");
      } finally {
        setIsContactLoading(false);
      }
    };

    fetchContact();
  }, [contactId, isEdit, addNotification]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error when user starts typing
    if (error) setError(null);
  };

  const validateForm = (): boolean => {
    if (!formData.firstName.trim()) {
      setError("First name is required");
      return false;
    }
    if (!formData.countryCode.trim()) {
      setError("Country code is required");
      return false;
    }
    if (!/^\+\d{1,3}$/.test(formData.countryCode)) {
      setError("Invalid country code format (e.g., +1, +34)");
      return false;
    }
    if (!formData.phoneNumber.trim()) {
      setError("Phone number is required");
      return false;
    }
    if (!/^\d{6,15}$/.test(formData.phoneNumber)) {
      setError("Invalid phone number (6-15 digits)");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Combine country code and phone number into full E.164 format
      const fullPhoneNumber = `${formData.countryCode.trim()}${formData.phoneNumber.trim()}`;

      if (isEdit && contactId) {
        // Update contact
        const updatePayload = {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          countryCode: formData.countryCode.trim(),
          phoneNumber: fullPhoneNumber,
        };

        await backendApi.contacts.update(contactId, updatePayload);
        addNotification(`Contact updated successfully!`, "success");
      } else {
        // Create contact
        const createPayload: CreateContactDto = {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          countryCode: formData.countryCode.trim(),
          phoneNumber: fullPhoneNumber,
        };

        await backendApi.contacts.create(createPayload);
        addNotification(
          `Contact ${createPayload.firstName} created successfully!`,
          "success"
        );
      }

      router.push(`/${locale}/dashboard/contacts`);
    } catch (err: unknown) {
      const errorMessage =
        (err as Error)?.message ||
        `Failed to ${isEdit ? "update" : "create"} contact. Please try again.`;
      setError(errorMessage);
      addNotification(errorMessage, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    router.push(`/${locale}/dashboard/contacts`);
  };

  const pageTitle = isEdit ? t("edit") : t("newContact");
  const cardTitle = isEdit ? t("updateContact") : t("addContact");
  const submitButtonLabel = isEdit ? t("updateContact") : t("addContact");

  if (isContactLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8">
        <div className="space-y-2">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/${locale}/dashboard/contacts`)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-muted-foreground mt-2">{t("description")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{cardTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="firstName">{t("firstName")}</Label>
              <Input
                id="firstName"
                name="firstName"
                placeholder={t("enterFirstName")}
                value={formData.firstName}
                onChange={handleChange}
                disabled={isLoading}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="lastName">{t("lastName")}</Label>
              <Input
                id="lastName"
                name="lastName"
                placeholder={t("enterLastName")}
                value={formData.lastName}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label>
                {t("countryCode")} & {t("phoneNumber")}
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <CountryCodeSelect
                    value={formData.countryCode}
                    onChange={(code) => {
                      setFormData((prev) => ({
                        ...prev,
                        countryCode: code,
                      }));
                      if (error) setError(null);
                    }}
                    disabled={isLoading}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    id="phoneNumber"
                    name="phoneNumber"
                    placeholder={t("enterPhoneNumber")}
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                6-15 digits without country code
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isLoading}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? `${submitButtonLabel}...` : submitButtonLabel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
