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
  const { addNotification } = useNotification();

  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [senderToDelete, setSenderToDelete] = useState<Sender | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    data: senders = [],
    isLoading,
    mutate,
  } = useSWR("/senders", async (url) => {
    const response = await fetch(backendApi.baseUrl + url);
    if (!response.ok) throw new Error("Failed to fetch senders");
    return response.json();
  });

  const filteredSenders = useMemo(() => {
    return senders.filter(
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
      await fetch(`${backendApi.baseUrl}/senders/${senderToDelete.id}`, {
        method: "DELETE",
      });
      addNotification(
        `${
          senderToDelete.displayName || senderToDelete.phoneNumber
        } deleted successfully`,
        "success"
      );
      mutate();
      setDeleteDialogOpen(false);
      setSenderToDelete(null);
    } catch (err) {
      console.error("Failed to delete sender:", err);
      addNotification("Failed to delete sender", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sender Numbers</h1>
          <p className="text-muted-foreground mt-2">
            Manage your WhatsApp business phone numbers
          </p>
        </div>
        <Button
          onClick={() => router.push(`/${locale}/dashboard/senders/new`)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Sender
        </Button>
      </div>

      {/* Search Bar */}
      <Card className="p-4">
        <Input
          placeholder="Search by phone or name..."
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
            <p className="text-muted-foreground">No sender numbers yet</p>
            <Button
              variant="outline"
              onClick={() => router.push(`/${locale}/dashboard/senders/new`)}
              className="mt-4"
            >
              Add your first sender
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold">
                    Phone Number
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">
                    Display Name
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">
                    Contacts
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">Status</th>
                  <th className="px-6 py-3 text-left font-semibold">
                    Verified
                  </th>
                  <th className="px-6 py-3 text-right font-semibold">
                    Actions
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
                          Unnamed
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
                        {sender.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {sender.isVerified ? (
                        <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                          <Check className="h-4 w-4" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-yellow-600 dark:text-yellow-400">
                          <AlertCircle className="h-4 w-4" />
                          Pending
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
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(sender)}
                            className="text-red-600 dark:text-red-400"
                          >
                            Delete
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
        title="Delete Sender"
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
