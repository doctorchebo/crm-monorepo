"use client";

import { EntityAuditHistoryPanel } from "@/components/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotification } from "@/hooks/use-notification";
import { backendApi, type Sender } from "@/lib/api/endpoints";
import {
  ArrowLeft,
  CheckCircle2,
  History,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

export default function SenderFormPage({
  params,
}: {
  params: Promise<{ locale: string; id?: string }>;
}) {
  const { locale, id: senderId } = use(params);
  const router = useRouter();
  const isEdit = !!senderId;
  const t = useTranslations("senders");
  const tCommon = useTranslations("common");

  const { addNotification } = useNotification();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEdit);
  const [showHistory, setShowHistory] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<Partial<Sender>>({
    phoneNumber: "",
    displayName: "",
  });

  // Fetch sender data if editing
  useEffect(() => {
    if (isEdit) {
      const fetchSender = async () => {
        try {
          const sender = await backendApi.senders.get(parseInt(senderId, 10));
          setFormData(sender as Partial<Sender>);
        } catch (err) {
          console.error("Failed to fetch sender:", err);
          addNotification(t("failedToLoad"), "error");
          router.push(`/${locale}/dashboard/senders`);
        } finally {
          setIsFetching(false);
        }
      };

      fetchSender();
    }
  }, [isEdit, senderId, locale, router, addNotification, t]);

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
      newErrors.phoneNumber = t("phoneNumberRequired");
    } else if (!/^\+\d{1,3}\d{1,14}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = t("phoneNumberInvalid");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      addNotification(t("fixErrors"), "error");
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        phoneNumber: formData.phoneNumber!,
        displayName: formData.displayName ?? undefined,
      };

      if (isEdit) {
        await backendApi.senders.update(parseInt(senderId, 10), payload);
      } else {
        await backendApi.senders.create(payload);
      }

      addNotification(
        isEdit ? t("updateSuccess") : t("createSuccess"),
        "success",
      );

      router.push(`/${locale}/dashboard/senders`);
    } catch (err: any) {
      console.error("Error:", err);
      addNotification(err.message || t("saveError"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  const getQualityBadge = (quality?: string | null) => {
    switch (quality) {
      case "GREEN":
        return (
          <Badge className="bg-green-100 text-green-800">
            {t("qualityHigh")}
          </Badge>
        );
      case "YELLOW":
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            {t("qualityMedium")}
          </Badge>
        );
      case "RED":
        return <Badge variant="destructive">{t("qualityLow")}</Badge>;
      default:
        return null;
    }
  };

  const getStatusBadge = (status?: string | null) => {
    switch (status) {
      case "CONNECTED":
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {t("statusConnected")}
          </Badge>
        );
      case "PENDING":
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            {t("statusPending")}
          </Badge>
        );
      case "FLAGGED":
        return <Badge variant="destructive">{t("statusFlagged")}</Badge>;
      default:
        return <Badge variant="outline">{status || t("statusUnknown")}</Badge>;
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
          {tCommon("back")}
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEdit ? t("editSender") : t("addSender")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEdit ? t("editSenderSubtitle") : t("addSenderSubtitle")}
          </p>
        </div>
        {isEdit && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-2"
            onClick={() => setShowHistory(true)}
          >
            <History className="h-4 w-4" />
            {t("history")}
          </Button>
        )}
      </div>

      {/* Form */}
      <Card className="p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Phone Number Field */}
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">{t("phoneNumber")} *</Label>
            <Input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              placeholder="+14155552671"
              value={formData.phoneNumber || ""}
              onChange={handleChange}
              disabled={isLoading || (isEdit && !!formData.phoneNumberId)}
              className={errors.phoneNumber ? "border-red-500" : ""}
            />
            {errors.phoneNumber && (
              <p className="text-sm text-red-500">{errors.phoneNumber}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("phoneNumberHelp")}
            </p>
            {isEdit && formData.phoneNumberId && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t("phoneNumberLocked")}
              </p>
            )}
          </div>

          {/* Display Name Field */}
          <div className="space-y-2">
            <Label htmlFor="displayName">{t("displayNameLabel")}</Label>
            <Input
              id="displayName"
              name="displayName"
              placeholder={t("displayNamePlaceholder")}
              value={formData.displayName || ""}
              onChange={handleChange}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              {t("displayNameHelp")}
            </p>
          </div>

          {/* Meta Cloud API Status */}
          {isEdit && (
            <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">
                    {t("metaStatus")}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(formData.status)}
                  {getQualityBadge(formData.qualityRating)}
                </div>
              </div>

              {formData.phoneNumberId && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">{t("phoneNumberId")}:</span>{" "}
                  {formData.phoneNumberId}
                </div>
              )}

              {formData.verifiedName && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">{t("verifiedName")}:</span>{" "}
                  {formData.verifiedName}
                </div>
              )}

              {formData.codeVerificationStatus && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {formData.codeVerificationStatus === "VERIFIED" ? (
                    <ShieldCheck className="h-3 w-3 text-green-600" />
                  ) : (
                    <Shield className="h-3 w-3 text-yellow-600" />
                  )}
                  <span>
                    {formData.codeVerificationStatus === "VERIFIED"
                      ? t("verified")
                      : t("notVerified")}
                  </span>
                </div>
              )}

              {formData.messagingLimit && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">{t("limit")}:</span>{" "}
                  {formData.messagingLimit}
                </div>
              )}

              {!formData.phoneNumberId && (
                <p className="text-xs text-amber-700 dark:text-amber-200">
                  ⚠️ {t("phoneNumberIdNotSet")}
                </p>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/${locale}/dashboard/senders`)}
              disabled={isLoading}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? tCommon("loading")
                : isEdit
                  ? tCommon("update")
                  : tCommon("create")}
            </Button>
          </div>
        </form>
      </Card>

      {isEdit && senderId && (
        <EntityAuditHistoryPanel
          open={showHistory}
          onOpenChange={setShowHistory}
          entityType="sender"
          entityId={senderId}
          entityName={formData.displayName || formData.phoneNumber || undefined}
        />
      )}
    </div>
  );
}
