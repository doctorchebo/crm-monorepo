"use client";

import { DeleteConfirmationDialog } from "@/components/dialogs/delete-confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotification } from "@/hooks/use-notification";
import { backendApi } from "@/lib/api/endpoints";
import { AlertCircle, Check, MoreVertical, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";

interface Sender {
  id: number;
  userId: number;
  phoneNumber: string;
  displayName?: string;
  isActive: boolean;
  isVerified: boolean;
  contactCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

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

  const {
    data: senders = [],
    isLoading,
    mutate,
  } = useSWR<Sender[]>("/senders", async () => {
    const result = await backendApi.senders.list();
    return result as Sender[];
  });

  const filteredSenders = useMemo(() => {
    return (senders as Sender[]).filter(
      (sender: Sender) =>
        sender.phoneNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sender.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [senders, searchQuery]);

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

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-2">{t("subtitle")}</p>
        </div>
        <Button
          onClick={() => router.push(`/${locale}/dashboard/senders/new`)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {t("addSender")}
        </Button>
      </div>

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
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">{t("noSenders")}</p>
            <Button
              variant="outline"
              onClick={() => router.push(`/${locale}/dashboard/senders/new`)}
              className="mt-4"
            >
              {t("addFirst")}
            </Button>
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
                    {t("contacts")}
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">
                    {t("status")}
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">
                    {t("verified")}
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
                    <td className="px-6 py-4 font-mono text-sm">
                      {sender.phoneNumber}
                    </td>
                    <td className="px-6 py-4">
                      {sender.displayName ? (
                        <span>{sender.displayName}</span>
                      ) : (
                        <span className="text-muted-foreground italic">
                          {t("unnamed")}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                        {sender.contactCount} contacts
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 text-sm ${
                          sender.isActive
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            sender.isActive ? "bg-green-600" : "bg-red-600"
                          }`}
                        />
                        {sender.isActive ? t("active") : t("inactive")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {sender.isVerified ? (
                        <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                          <Check className="h-4 w-4" />
                          {t("verified")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-yellow-600 dark:text-yellow-400">
                          <AlertCircle className="h-4 w-4" />
                          {t("pending")}
                        </span>
                      )}
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
        description={`Are you sure you want to delete ${
          senderToDelete?.displayName || senderToDelete?.phoneNumber
        }? Associated contacts will remain but lose this sender association.`}
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
