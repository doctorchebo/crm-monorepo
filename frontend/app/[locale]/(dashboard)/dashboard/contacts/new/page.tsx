"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { backendApi, CreateContactDto } from "@/lib/api/endpoints";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function NewContactPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations("contacts");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    countryCode: "",
    phoneNumber: "",
  });

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
      const payload: CreateContactDto = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        countryCode: formData.countryCode.trim(),
        phoneNumber: formData.phoneNumber.trim(),
      };

      await backendApi.contacts.create(payload);
      router.push(`/${locale}/dashboard/contacts`);
    } catch (err: any) {
      setError(err?.message || "Failed to create contact. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    router.push(`/${locale}/dashboard/contacts`);
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("newContact")}</h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("addContact")}</CardTitle>
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
              <Label htmlFor="countryCode">{t("countryCode")}</Label>
              <Input
                id="countryCode"
                name="countryCode"
                placeholder={t("enterCountryCode")}
                value={formData.countryCode}
                onChange={handleChange}
                disabled={isLoading}
                required
              />
              <p className="text-xs text-muted-foreground">
                Format: +1, +34, +591, etc.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phoneNumber">{t("phoneNumber")}</Label>
              <Input
                id="phoneNumber"
                name="phoneNumber"
                placeholder={t("enterPhoneNumber")}
                value={formData.phoneNumber}
                onChange={handleChange}
                disabled={isLoading}
                required
              />
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
                {isLoading ? `${t("addContact")}...` : t("addContact")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
