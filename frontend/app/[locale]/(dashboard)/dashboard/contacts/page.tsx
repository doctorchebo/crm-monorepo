"use client";

import { DeleteConfirmationDialog } from "@/components/dialogs/delete-confirmation-dialog";
import { SelectSenderModal } from "@/components/dialogs/select-sender-modal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthProtection } from "@/hooks/use-auth";
import { useNotification } from "@/hooks/use-notification";
import { backendApi, Contact } from "@/lib/api/endpoints";
import { MoreVertical, Phone, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

interface Sender {
  id: number;
  phoneNumber: string;
  displayName?: string;
}

/** Debounce hook for search */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
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

function getInitials(
  firstName: string,
  lastName: string | undefined | null
): string {
  const first = firstName.charAt(0).toUpperCase();
  const last = lastName ? lastName.charAt(0).toUpperCase() : "";
  return (first + last).slice(0, 2);
}



export default function ContactsPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations("contacts");
  const tCommon = useTranslations("common");

  const { addNotification } = useNotification();

  // Protect this route - redirect to login if token is missing or expired
  useAuthProtection();

  // Pagination and search state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal and dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [senderModalOpen, setSenderModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [availableSenders, setAvailableSenders] = useState<Sender[]>([]);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset page when search or page size changes
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [debouncedSearch, pageSize]);

  // Fetch contacts with pagination and search
  const {
    data,
    isLoading,
    mutate,
  } = useSWR(
    ["contacts", page, pageSize, debouncedSearch],
    async () => {
      return await backendApi.contacts.list({
        page,
        limit: pageSize,
        search: debouncedSearch || undefined,
      });
    }
  );

  const contacts = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, totalItems: 0, limit: pageSize };

  // Sort contacts by last message time (client-side for display)
  const sortedContacts = useMemo(() => {
    return [...contacts].sort((a, b) => {
      if (!a.lastMessageTime && !b.lastMessageTime) return 0;
      if (!a.lastMessageTime) return 1;
      if (!b.lastMessageTime) return -1;

      return (
        new Date(b.lastMessageTime).getTime() -
        new Date(a.lastMessageTime).getTime()
      );
    });
  }, [contacts]);

  // Selection handlers
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === contacts.length && contacts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.contactId)));
    }
  }, [contacts, selectedIds.size]);

  const toggleSelect = useCallback((contactId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Navigation handlers
  const handleContactClick = (contactId: string) => {
    router.push(`/${locale}/dashboard/contacts/form?id=${contactId}`);
  };

  const handleEdit = (contactId: string) => {
    router.push(`/${locale}/dashboard/contacts/form?id=${contactId}`);
  };

  const handleStartChat = async (contact: Contact) => {
    try {
      // Fetch available senders for the user
      const senders = (await backendApi.senders.list()) as Sender[];

      if (!senders || senders.length === 0) {
        addNotification(
          "No WhatsApp senders configured. Please add a sender first.",
          "error"
        );
        return;
      }

      // Store contact and senders in state, then show modal
      setSelectedContact(contact);
      setAvailableSenders(senders);
      setSenderModalOpen(true);
    } catch (err) {
      console.error("Failed to fetch senders:", err);
      addNotification("Failed to start chat", "error");
    }
  };

  const handleSenderSelected = async (
    senderId: number,
    senderPhoneNumber: string
  ) => {
    if (!selectedContact) return;

    try {
      const participantPhone = selectedContact.phoneNumber;
      const participantName = `${selectedContact.firstName} ${selectedContact.lastName || ""
        }`.trim();

      const createdChat = await backendApi.chats.startWithContact({
        businessPhone: senderPhoneNumber,
        participantPhone,
        participantName,
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
    } finally {
      setSenderModalOpen(false);
      setSelectedContact(null);
      setAvailableSenders([]);
    }
  };

  // Delete handlers
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
        `${contactToDelete.firstName} ${contactToDelete.lastName || ""
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

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    setIsDeleting(true);
    try {
      const result = await backendApi.contacts.bulkDelete(Array.from(selectedIds));
      addNotification(
        t("bulkDeleteSuccess", { count: result.deletedCount }),
        "success"
      );
      setSelectedIds(new Set());
      setBulkDeleteDialogOpen(false);
      mutate();
    } catch (err) {
      console.error("Failed to bulk delete contacts:", err);
      addNotification("Failed to delete contacts", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background gap-4 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground mt-2">
              {t("totalContacts", { count: pagination.totalItems })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/${locale}/dashboard/contacts/import`)}
            >
              <Upload className="mr-2 h-4 w-4" />
              {t("importText")}
            </Button>
            <Button
              onClick={() => router.push(`/${locale}/dashboard/contacts/form`)}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("newContact")}
            </Button>
          </div>
        </div>

        {/* Search and Pagination Controls */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-end sm:items-center">
          <div className="relative w-full sm:w-auto sm:min-w-[300px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchContactsPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            translations={{
              page: t("pagination.page", { current: pagination.page, total: pagination.totalPages }),
              previous: t("pagination.previous"),
              next: t("pagination.next"),
              first: t("pagination.first"),
              last: t("pagination.last"),
              rowsPerPage: t("pagination.rowsPerPage")
            }}
            compact
          />
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg border animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-4 px-2">
              <span className="text-sm font-medium">
                {t("selectedCount", { count: selectedIds.size })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="h-8 text-muted-foreground hover:text-foreground"
              >
                {t("clearSelection")}
              </Button>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteDialogOpen(true)}
              className="h-8"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("deleteSelected")}
            </Button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-4 overflow-hidden flex flex-col">

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            ))}
          </div>
        ) : sortedContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-5xl mb-4">👥</div>
            <h3 className="text-lg font-semibold">{t("noContacts")}</h3>
            <p className="text-muted-foreground mt-2 mb-4">
              {searchQuery
                ? t("noSearchResults")
                : t("createFirstContact")}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => router.push(`/${locale}/dashboard/contacts/form`)}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("addContact")}
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Select All Header */}
            <div className="flex items-center gap-3 px-3 py-2 border-b mb-2">
              <Checkbox
                checked={selectedIds.size === contacts.length && contacts.length > 0}
                onCheckedChange={toggleSelectAll}
                aria-label="Select all contacts"
              />
              <span className="text-sm text-muted-foreground">
                {t("selectAll")}
              </span>
            </div>

            {/* Contact List */}
            <div className="space-y-1">
              {sortedContacts.map((contact: Contact) => (
                <div
                  key={contact.contactId}
                  className="group flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 dark:hover:bg-accent/20 transition-colors cursor-pointer"
                  onClick={() => handleContactClick(contact.contactId)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Checkbox */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(contact.contactId)}
                        onCheckedChange={() => toggleSelect(contact.contactId)}
                        aria-label={`Select ${contact.firstName}`}
                      />
                    </div>

                    {/* Avatar */}
                    <Avatar className="h-12 w-12 shrink-0">
                      {contact.avatar && <AvatarImage src={contact.avatar} />}
                      <AvatarFallback>
                        {getInitials(contact.firstName, contact.lastName)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Contact Info */}
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
                      {/* Phone Number */}
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <span>{contact.phoneNumber}</span>
                      </div>
                      {contact.lastMessagePreview && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">
                          {contact.lastMessagePreview}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions Dropdown */}
                  <div onClick={(e) => e.stopPropagation()}>
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
                          {tCommon("edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStartChat(contact)}>
                          {t("startChat")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(contact)}
                          className="text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20"
                        >
                          {tCommon("delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>


          </>
        )}
      </div>

      {/* Single Delete Confirmation Dialog */}
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

      {/* Bulk Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={bulkDeleteDialogOpen}
        title={t("bulkDeleteTitle")}
        description={t("bulkDeleteDescription", { count: selectedIds.size })}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteDialogOpen(false)}
        isLoading={isDeleting}
      />

      {/* Sender Selection Modal */}
      {selectedContact && (
        <SelectSenderModal
          isOpen={senderModalOpen}
          onClose={() => {
            setSenderModalOpen(false);
            setSelectedContact(null);
            setAvailableSenders([]);
          }}
          onSelect={handleSenderSelected}
          senders={availableSenders}
          contact={selectedContact}
        />
      )}
    </div>
  );
}
