"use client";

import {
  SettingsCategory,
  SettingsPage,
  SwitchSetting,
} from "@/components/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotification } from "@/hooks/use-notification";
import {
  backendApi,
  type CommerceSettings,
  type Sender,
} from "@/lib/api/endpoints";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, Package, Phone, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/**
 * Senders Commerce Settings Page
 *
 * Allows users to configure catalog visibility and shopping cart
 * settings for each WhatsApp phone number (sender).
 *
 * Commerce settings are managed per phone number via Meta's
 * WhatsApp Commerce Settings API.
 */
export default function SendersSettingsPage() {
  const t = useTranslations("settingsSenders");
  const { addNotification } = useNotification();

  // State
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<number | null>(null);
  const [commerceSettings, setCommerceSettings] =
    useState<CommerceSettings | null>(null);
  const [isLoadingSenders, setIsLoadingSenders] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Get selected sender
  const selectedSender = senders.find((s) => s.id === selectedSenderId);

  // Load senders on mount
  useEffect(() => {
    async function loadSenders() {
      try {
        setIsLoadingSenders(true);
        const data = await backendApi.senders.listActive();
        setSenders(data);

        // Auto-select first sender if available
        if (data.length > 0 && !selectedSenderId) {
          setSelectedSenderId(data[0].id);
        }
      } catch (error) {
        console.error("Failed to load senders:", error);
      } finally {
        setIsLoadingSenders(false);
      }
    }
    loadSenders();
  }, []);

  // Load commerce settings when sender changes
  useEffect(() => {
    if (!selectedSenderId) {
      setCommerceSettings(null);
      return;
    }

    async function loadCommerceSettings() {
      try {
        setIsLoadingSettings(true);
        const settings = await backendApi.senders.getCommerceSettings(
          selectedSenderId!,
        );
        setCommerceSettings(settings);
      } catch (error) {
        console.error("Failed to load commerce settings:", error);
        setCommerceSettings(null);
      } finally {
        setIsLoadingSettings(false);
      }
    }
    loadCommerceSettings();
  }, [selectedSenderId]);

  // Sync commerce settings from Meta
  const handleSync = useCallback(async () => {
    if (!selectedSenderId) return;

    try {
      setIsSyncing(true);
      const settings =
        await backendApi.senders.syncCommerceSettings(selectedSenderId);
      setCommerceSettings(settings);
      addNotification(t("syncSuccess"), "success");
    } catch (error) {
      console.error("Failed to sync commerce settings:", error);
      addNotification(t("syncError"), "error");
    } finally {
      setIsSyncing(false);
    }
  }, [selectedSenderId, addNotification, t]);

  // Update catalog visibility
  const handleCatalogVisibilityChange = useCallback(
    async (enabled: boolean) => {
      if (!selectedSenderId || !commerceSettings) return;

      try {
        setIsUpdating(true);
        const settings = await backendApi.senders.updateCommerceSettings(
          selectedSenderId,
          { isCatalogVisible: enabled },
        );
        setCommerceSettings(settings);
        addNotification(t("updateSuccess"), "success");
      } catch (error) {
        console.error("Failed to update catalog visibility:", error);
        addNotification(t("updateError"), "error");
      } finally {
        setIsUpdating(false);
      }
    },
    [selectedSenderId, commerceSettings, addNotification, t],
  );

  // Update cart enabled
  const handleCartEnabledChange = useCallback(
    async (enabled: boolean) => {
      if (!selectedSenderId || !commerceSettings) return;

      try {
        setIsUpdating(true);
        const settings = await backendApi.senders.updateCommerceSettings(
          selectedSenderId,
          { isCartEnabled: enabled },
        );
        setCommerceSettings(settings);
        addNotification(t("updateSuccess"), "success");
      } catch (error) {
        console.error("Failed to update cart enabled:", error);
        addNotification(t("updateError"), "error");
      } finally {
        setIsUpdating(false);
      }
    },
    [selectedSenderId, commerceSettings, addNotification, t],
  );

  // Format last synced time
  const formattedLastSynced = commerceSettings?.commerceSettingsSyncedAt
    ? formatDistanceToNow(new Date(commerceSettings.commerceSettingsSyncedAt), {
        addSuffix: true,
      })
    : t("neverSynced");

  // Check if sender is verified (has phoneNumberId)
  const isSenderVerified = selectedSender?.phoneNumberId != null;

  return (
    <SettingsPage title={t("title")} description={t("description")}>
      {/* Sender Selection */}
      <SettingsCategory
        title={t("selectSender")}
        description={t("selectSenderDescription")}
      >
        {isLoadingSenders ? (
          <div className="py-4">
            <Skeleton className="h-10 w-full" />
          </div>
        ) : senders.length === 0 ? (
          <div className="py-6 text-center">
            <Phone className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-medium">{t("noSenders")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("noSendersDescription")}
            </p>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/dashboard/senders">{t("goToSenders")}</Link>
            </Button>
          </div>
        ) : (
          <div className="py-4">
            <Select
              value={selectedSenderId?.toString() ?? ""}
              onValueChange={(value) => setSelectedSenderId(parseInt(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("selectSender")} />
              </SelectTrigger>
              <SelectContent>
                {senders.map((sender) => (
                  <SelectItem key={sender.id} value={sender.id.toString()}>
                    <div className="flex items-center gap-2">
                      <span>{sender.displayName || sender.phoneNumber}</span>
                      {sender.verifiedName && (
                        <Badge variant="secondary" className="text-xs">
                          {sender.verifiedName}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Selected sender details */}
            {selectedSender && (
              <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Phone className="h-4 w-4" />
                  <span>{t("phoneNumber")}:</span>
                  <span className="font-medium text-foreground">
                    {selectedSender.phoneNumber}
                  </span>
                </div>
                {selectedSender.verifiedName && (
                  <div className="flex items-center gap-1.5">
                    <span>{t("verifiedName")}:</span>
                    <span className="font-medium text-foreground">
                      {selectedSender.verifiedName}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </SettingsCategory>

      {/* Commerce Settings */}
      {selectedSenderId && (
        <SettingsCategory
          title={t("commerceSettings")}
          description={t("commerceSettingsDescription")}
        >
          {!isSenderVerified ? (
            // Sender not verified
            <div className="py-6">
              <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
                <AlertCircle className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-500" />
                <div>
                  <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
                    {t("requiresVerification")}
                  </h4>
                  <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                    {t("requiresVerificationDescription")}
                  </p>
                </div>
              </div>
            </div>
          ) : isLoadingSettings ? (
            // Loading state
            <div className="space-y-4 py-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !commerceSettings?.isCommerceAvailable ? (
            // Commerce not available (no linked catalog)
            <div className="py-6">
              <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-900 dark:bg-orange-950">
                <Package className="h-5 w-5 shrink-0 text-orange-600 dark:text-orange-500" />
                <div className="flex-1">
                  <h4 className="font-medium text-orange-800 dark:text-orange-200">
                    {t("commerceNotAvailable")}
                  </h4>
                  <p className="mt-1 text-sm text-orange-700 dark:text-orange-300">
                    {t("commerceNotAvailableDescription")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={handleSync}
                    disabled={isSyncing}
                  >
                    <RefreshCw
                      className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
                    />
                    {isSyncing ? t("syncing") : t("syncSettings")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            // Commerce settings available
            <div className="divide-y">
              {/* Linked Catalog Info */}
              <div className="flex items-center justify-between gap-4 py-4">
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {t("linkedCatalog")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("linkedCatalogDescription")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {commerceSettings.linkedCatalogId ? (
                    <Badge variant="outline" className="font-mono">
                      {commerceSettings.linkedCatalogId}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {t("noCatalogLinked")}
                    </span>
                  )}
                </div>
              </div>

              {/* Catalog Visibility Toggle */}
              <SwitchSetting
                id="catalog-visibility"
                title={t("catalogVisibility")}
                description={t("catalogVisibilityDescription")}
                checked={commerceSettings.isCatalogEnabled}
                onCheckedChange={handleCatalogVisibilityChange}
                disabled={isUpdating || !commerceSettings.linkedCatalogId}
              />

              {/* Cart Enabled Toggle */}
              <SwitchSetting
                id="cart-enabled"
                title={t("cartEnabled")}
                description={t("cartEnabledDescription")}
                checked={commerceSettings.isCartEnabled}
                onCheckedChange={handleCartEnabledChange}
                disabled={
                  isUpdating ||
                  !commerceSettings.linkedCatalogId ||
                  !commerceSettings.isCatalogEnabled
                }
              />

              {/* Sync Actions */}
              <div className="flex items-center justify-between gap-4 py-4">
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {t("lastSynced")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formattedLastSynced}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={isSyncing}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
                  />
                  {isSyncing ? t("syncing") : t("syncSettings")}
                </Button>
              </div>
            </div>
          )}
        </SettingsCategory>
      )}
    </SettingsPage>
  );
}
