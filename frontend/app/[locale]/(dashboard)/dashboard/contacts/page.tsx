"use client";

import { DeleteConfirmationDialog } from "@/components/dialogs/delete-confirmation-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { MoreVertical, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";

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

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "";

  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // If within 24 hours, show time
  if (diffDays <= 1) {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // If within week, show weekday
  if (diffDays <= 7) {
    return date.toLocaleString("en-US", { weekday: "short" });
  }

  // Otherwise show date
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getInitials(firstName: string, lastName: string | null): string {
  const first = firstName.charAt(0).toUpperCase();
  const last = lastName ? lastName.charAt(0).toUpperCase() : "";
  return (first + last).slice(0, 2);
}

export default function ContactsPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations("contacts");
  const tChats = useTranslations("chats");
  const { addNotification } = useNotification();

  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    data: contacts = [],
    isLoading,
    mutate,
  } = useSWR("contacts", async () => {
    return await backendApi.contacts.list();
  });

  const filteredAndSortedContacts = useMemo(() => {
    return (contacts as Contact[])
      .filter((contact: Contact) => {
        const searchLower = searchQuery.toLowerCase();
        return (
          contact.firstName.toLowerCase().includes(searchLower) ||
          contact.lastName?.toLowerCase().includes(searchLower) ||
          contact.phoneNumber.includes(searchQuery)
        );
      })
      .sort((a: Contact, b: Contact) => {
        // Sort by last message time (most recent first)
        if (!a.lastMessageTime && !b.lastMessageTime) return 0;
        if (!a.lastMessageTime) return 1;
        if (!b.lastMessageTime) return -1;

        return (
          new Date(b.lastMessageTime).getTime() -
          new Date(a.lastMessageTime).getTime()
        );
      });
  }, [contacts, searchQuery]);

  const handleEdit = (contactId: string) => {
    router.push(`/${locale}/dashboard/contacts/${contactId}/edit`);
  };

  const handleStartChat = async (contact: Contact) => {
    try {
      // Fetch available senders for the user
      const allSenders = (await backendApi.senders.list()) as any[];

      if (!allSenders || allSenders.length === 0) {
        addNotification(
          "No WhatsApp senders configured. Please set up a sender first.",
          "error"
        );
        return;
      }

      // TODO: In future, add logic to fetch senders linked to this specific contact
      // For now, use the first available sender as default
      // This should be replaced with: const contactSenders = await backendApi.contacts.getSenders(contact.contactId)

      const selectedSender = allSenders[0];
      const businessPhone = selectedSender.phoneNumber;
      const participantPhone = contact.phoneNumber;
      const senderId = selectedSender.id;

      const createdChat = await backendApi.chats.startWithContact({
        businessPhone,
        participantPhone,
        participantName: `${contact.firstName} ${
          contact.lastName || ""
        }`.trim(),
        senderId,
      });

      // Navigate to chats page with the created chat ID
      const chatId = (createdChat as any)?.chatId || "";
      router.push(`/${locale}/dashboard/chats?selectedChatId=${chatId}`);
    } catch (err) {
      console.error("Failed to start chat:", err);
      addNotification("Failed to start chat", "error");
      // Fallback: just go to chats page
      router.push(`/${locale}/dashboard/chats`);
    }
  };

  const handleDeleteClick = (contact: Contact) => {
    setContactToDelete(contact);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!contactToDelete) return;

    setIsDeleting(true);
    try {
      await backendApi.contacts.delete(contactToDelete.contactId);
      addNotification(
        `${contactToDelete.firstName} ${
          contactToDelete.lastName || ""
        } deleted successfully`,
        "success"
      );
      mutate();
      setDeleteDialogOpen(false);
      setContactToDelete(null);
    } catch (err) {
      console.error("Failed to delete contact:", err);
      addNotification("Failed to delete contact", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-2">{t("description")}</p>
        </div>
        <Button
          onClick={() => router.push(`/${locale}/dashboard/contacts/form`)}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("newContact")}
        </Button>
      </div>

      <Card className="p-4">
        <Input
          placeholder={t("searchContacts")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mb-4"
        />

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            ))}
          </div>
        ) : filteredAndSortedContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-5xl mb-4">👥</div>
            <h3 className="text-lg font-semibold">{t("noContacts")}</h3>
            <p className="text-muted-foreground mt-2 mb-4">
              {searchQuery
                ? "Try adjusting your search"
                : "Create your first contact to get started"}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => router.push(`/${locale}/dashboard/contacts/new`)}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("addContact")}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAndSortedContacts.map((contact: Contact) => (
              <div
                key={contact.contactId}
                className="group flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 dark:hover:bg-accent/20 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="h-12 w-12 shrink-0">
                    {contact.avatar && <AvatarImage src={contact.avatar} />}
                    <AvatarFallback>
                      {getInitials(contact.firstName, contact.lastName)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="font-medium truncate">
                        {contact.firstName} {contact.lastName}
                      </p>
                      {contact.lastMessageTime && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDateTime(contact.lastMessageTime)}
                        </span>
                      )}
                    </div>
                    {contact.lastMessagePreview && (
                      <div className="flex items-center gap-1 mt-1">
                        <p className="text-sm text-muted-foreground truncate">
                          {contact.lastMessagePreview}
                        </p>
                        {contact.lastMessageType && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            • {contact.lastMessageType}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleEdit(contact.contactId)}
                    >
                      {t("edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleStartChat(contact)}>
                      {t("startChat")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDeleteClick(contact)}
                      className="text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20"
                    >
                      {t("delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </Card>

      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        title={t("deleteContact")}
        description={t("deleteConfirmationDesc")}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setContactToDelete(null);
        }}
        isLoading={isDeleting}
      />
    </div>
  );
}
