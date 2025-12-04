"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CountryCodeSelect } from "@/components/ui/country-code-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotification } from "@/hooks/use-notification";
import { backendApi, CreateContactDto } from "@/lib/api/endpoints";
import { useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Sender {
  id: number;
  phoneNumber: string;
  displayName: string | null;
  isActive: boolean;
}

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
  senders?: Array<{
    id: number;
    phoneNumber: string;
    displayName: string | null;
  }>;
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
  const [isSendersLoading, setIsSendersLoading] = useState(true);
  const [isContactLoading, setIsContactLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    countryCode: "",
    phoneNumber: "",
    senderIds: [] as number[],
  });

  // Fetch senders on mount
  useEffect(() => {
    const fetchSenders = async () => {
      try {
        const result = (await backendApi.senders.list()) as Sender[];
        setSenders(result.filter((s: Sender) => s.isActive));
        setIsSendersLoading(false);
      } catch (err) {
        console.error("Failed to fetch senders:", err);
        setIsSendersLoading(false);
        addNotification("Failed to load senders", "error");
      }
    };

    fetchSenders();
  }, [addNotification]);

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
        setContact(data);
        const linkedSenderIds = data.senders?.map((s) => s.id) || [];
        setFormData({
          firstName: data.firstName,
          lastName: data.lastName || "",
          countryCode: data.countryCode,
          phoneNumber: data.phoneNumber,
          senderIds: linkedSenderIds,
        });
      } catch (err: any) {
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

  const handleSenderToggle = (senderId: number) => {
    setFormData((prev) => ({
      ...prev,
      senderIds: prev.senderIds.includes(senderId)
        ? prev.senderIds.filter((id) => id !== senderId)
        : [...prev.senderIds, senderId],
    }));
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
    if (formData.senderIds.length === 0) {
      setError("Please select at least one sender");
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
      if (isEdit && contactId) {
        // Update contact
        const updatePayload: any = {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          countryCode: formData.countryCode.trim(),
          phoneNumber: formData.phoneNumber.trim(),
          senderIds: formData.senderIds,
        };

        await backendApi.contacts.update(contactId, updatePayload);
        addNotification(`Contact updated successfully!`, "success");
      } else {
        // Create contact
        const createPayload: CreateContactDto = {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          countryCode: formData.countryCode.trim(),
          phoneNumber: formData.phoneNumber.trim(),
          senderIds: formData.senderIds,
        };

        await backendApi.contacts.create(createPayload);
        addNotification(
          `Contact ${createPayload.firstName} created successfully!`,
          "success"
        );
      }

      router.push(`/${locale}/dashboard/contacts`);
    } catch (err: any) {
      const errorMessage =
        err?.message ||
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{pageTitle}</h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
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

            <div className="grid gap-4">
              <Label>
                Link to Senders <span className="text-red-500">*</span>
              </Label>
              {isSendersLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : senders.length === 0 ? (
                <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  No senders available. Please create a sender first.
                </div>
              ) : (
                <div className="space-y-3 border rounded-lg p-4">
                  {senders.map((sender) => (
                    <div key={sender.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`sender-${sender.id}`}
                        checked={formData.senderIds.includes(sender.id)}
                        onCheckedChange={() => handleSenderToggle(sender.id)}
                        disabled={isLoading}
                      />
                      <label
                        htmlFor={`sender-${sender.id}`}
                        className="flex-1 cursor-pointer text-sm"
                      >
                        {sender.displayName || sender.phoneNumber}
                        <span className="text-muted-foreground ml-1">
                          ({sender.phoneNumber})
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Select one or more senders to link this contact with. The first
                selected sender will be the primary sender.
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
              <Button type="submit" disabled={isLoading || isSendersLoading}>
                {isLoading ? `${submitButtonLabel}...` : submitButtonLabel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
