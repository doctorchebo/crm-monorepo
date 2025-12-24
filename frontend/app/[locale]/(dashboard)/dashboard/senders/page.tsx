"use client";

import { DeleteConfirmationDialog } from "@/components/dialogs/delete-confirmation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNotification } from "@/hooks/use-notification";
import { backendApi, type Sender, type WabaInfo } from "@/lib/api/endpoints";
import {
  CheckCircle2,
  CloudDownload,
  Info,
  Loader2,
  MoreVertical,
  Phone,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";

export default function SendersPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations("senders");
  const tCommon = useTranslations("common");
  const { addNotification } = useNotification();

  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [senderToDelete, setSenderToDelete] = useState<Sender | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

  // Fetch senders
  const {
    data: senders = [],
    isLoading,
    mutate,
  } = useSWR<Sender[]>("/senders", async () => {
    const result = await backendApi.senders.list();
    return result as Sender[];
  });

  // Fetch WABA info
  const { data: wabaInfo, isLoading: isLoadingWaba } = useSWR<WabaInfo>(
    "/senders/waba-info",
    async () => {
      const result = await backendApi.senders.getWabaInfo();
      return result;
    }
  );

  const filteredSenders = useMemo(() => {
    return (senders as Sender[]).filter(
      (sender: Sender) =>
        sender.phoneNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sender.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sender.verifiedName?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [senders, searchQuery]);

  // Sync from WABA
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await backendApi.senders.sync();
      addNotification(
        t("syncSuccess", {
          created: result.created.length,
          updated: result.updated.length,
        }),
        "success"
      );
      mutate();
    } catch (err) {
      console.error("Failed to sync from WABA:", err);
      addNotification(t("syncFailed"), "error");
    } finally {
      setIsSyncing(false);
    }
  };

  // Refresh single sender from Meta
  const handleRefresh = async (senderId: number) => {
    setRefreshingId(senderId);
    try {
      await backendApi.senders.refresh(senderId);
      addNotification(t("refreshSuccess"), "success");
      mutate();
    } catch (err) {
      console.error("Failed to refresh sender:", err);
      addNotification(t("refreshFailed"), "error");
    } finally {
      setRefreshingId(null);
    }
  };

  // Verify sender
  const handleVerify = async (senderId: number) => {
    setVerifyingId(senderId);
    try {
      await backendApi.senders.verify(senderId);
      addNotification(t("verifySuccess"), "success");
      mutate();
    } catch (err) {
      console.error("Failed to verify sender:", err);
      addNotification(t("verifyFailed"), "error");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDeleteClick = (sender: Sender) => {
    setSenderToDelete(sender);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!senderToDelete) return;

    setIsDeleting(true);
    try {
      await backendApi.senders.delete(Number(senderToDelete.id));
      addNotification(
        `${senderToDelete.displayName || senderToDelete.phoneNumber} ${t(
          "deletedSuccessfully"
        )}`,
        "success"
      );
      mutate();
      setDeleteDialogOpen(false);
      setSenderToDelete(null);
    } catch (err) {
      console.error("Failed to delete sender:", err);
      addNotification(t("failedToDelete"), "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const getQualityBadge = (quality?: string | null) => {
    switch (quality) {
      case "GREEN":
        return (
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-green-500" />
            <span className="text-sm text-green-700 dark:text-green-400">
              {t("qualityHigh")}
            </span>
          </div>
        );
      case "YELLOW":
        return (
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-yellow-500" />
            <span className="text-sm text-yellow-700 dark:text-yellow-400">
              {t("qualityMedium")}
            </span>
          </div>
        );
      case "RED":
        return (
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <span className="text-sm text-red-700 dark:text-red-400">
              {t("qualityLow")}
            </span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
            <span className="text-sm text-muted-foreground">
              {t("qualityUnknown")}
            </span>
          </div>
        );
    }
  };

  const getStatusBadge = (status?: string | null) => {
    switch (status) {
      case "CONNECTED":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {t("statusConnected")}
          </Badge>
        );
      case "PENDING":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
            {t("statusPending")}
          </Badge>
        );
      case "FLAGGED":
        return <Badge variant="destructive">{t("statusFlagged")}</Badge>;
      default:
        return <Badge variant="outline">{status || t("statusUnknown")}</Badge>;
    }
  };

  const getVerificationBadge = (codeVerificationStatus?: string | null) => {
    switch (codeVerificationStatus) {
      case "VERIFIED":
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
              </TooltipTrigger>
              <TooltipContent>{t("verified")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case "NOT_VERIFIED":
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Shield className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </TooltipTrigger>
              <TooltipContent>{t("notVerified")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-2">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={isSyncing}
            className="gap-2"
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CloudDownload className="h-4 w-4" />
            )}
            {t("syncFromWaba")}
          </Button>
          <Button
            onClick={() => router.push(`/${locale}/dashboard/senders/new`)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            {t("addSender")}
          </Button>
        </div>
      </div>

      {/* WABA Info Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-4 w-4" />
            {t("wabaInfo")}
          </CardTitle>
          <CardDescription>{t("wabaInfoDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingWaba ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-24" />
            </div>
          ) : wabaInfo ? (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t("wabaId")}:</span>
                <code className="px-2 py-0.5 bg-muted rounded text-xs">
                  {wabaInfo.wabaId}
                </code>
              </div>
              <Badge
                variant={wabaInfo.isConfigured ? "default" : "destructive"}
                className="gap-1"
              >
                {wabaInfo.isConfigured ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    {t("wabaConnected")}
                  </>
                ) : (
                  t("wabaNotConfigured")
                )}
              </Badge>
              <span className="text-muted-foreground">
                {senders.length} {t("phoneNumbers")}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("wabaNotConfigured")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Search Bar */}
      <Card className="p-4">
        <Input
          placeholder={t("searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full"
        />
      </Card>

      {/* Senders Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filteredSenders.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Phone className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t("noSenders")}</h3>
            <p className="text-muted-foreground mb-4 max-w-md">
              {t("noSendersDescription")}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => router.push(`/${locale}/dashboard/senders/new`)}
              >
                {t("addFirst")}
              </Button>
              <Button onClick={handleSync} disabled={isSyncing}>
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CloudDownload className="h-4 w-4 mr-2" />
                )}
                {t("syncFirst")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold">
                    {t("phoneNumber")}
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">
                    {t("displayName")}
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">
                    {t("status")}
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">
                    {t("quality")}
                  </th>
                  <th className="px-6 py-3 text-right font-semibold">
                    {t("actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSenders.map((sender: Sender) => (
                  <tr
                    key={sender.id}
                    className="border-b hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                          <Phone className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">
                              {sender.phoneNumber}
                            </span>
                            {getVerificationBadge(
                              sender.codeVerificationStatus
                            )}
                            {sender.isOfficialBusinessAccount && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("officialBusiness")}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          {sender.phoneNumberId && (
                            <div className="text-xs text-muted-foreground">
                              ID: {sender.phoneNumberId}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {sender.verifiedName || sender.displayName ? (
                        <div>
                          <span>
                            {sender.verifiedName || sender.displayName}
                          </span>
                          {sender.verifiedName &&
                            sender.displayName &&
                            sender.verifiedName !== sender.displayName && (
                              <span className="block text-xs text-muted-foreground">
                                {sender.displayName}
                              </span>
                            )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">
                          {t("unnamed")}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {getStatusBadge(sender.status)}
                        {sender.messagingLimit && (
                          <span className="text-xs text-muted-foreground">
                            {t("limit")}: {sender.messagingLimit}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getQualityBadge(sender.qualityRating)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleRefresh(sender.id)}
                            disabled={refreshingId === sender.id}
                          >
                            {refreshingId === sender.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            {t("refreshFromMeta")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleVerify(sender.id)}
                            disabled={verifyingId === sender.id}
                          >
                            {verifyingId === sender.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-4 w-4 mr-2" />
                            )}
                            {t("verify")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(
                                `/${locale}/dashboard/senders/${sender.id}/edit`
                              )
                            }
                          >
                            {tCommon("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(sender)}
                            className="text-red-600 dark:text-red-400"
                          >
                            {tCommon("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        title={t("deleteTitle")}
        description={t("deleteDescription", {
          name:
            senderToDelete?.displayName || senderToDelete?.phoneNumber || "",
        })}
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setSenderToDelete(null);
        }}
      />
    </div>
  );
}
