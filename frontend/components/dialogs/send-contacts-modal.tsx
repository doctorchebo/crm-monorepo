/**
 * SendContactsModal
 * Modal for searching and selecting contacts to send via WhatsApp
 *
 * Features:
 * - Search bar to filter contacts
 * - Checkbox selection for each contact
 * - Avatar, name (or phone if no name), WhatsApp status
 * - Send button shows selected contact names with ellipsis
 */

"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactToSend } from "@/lib/types/contact-message.types";
import { Search, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface SendContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (contacts: ContactToSend[]) => void;
  contacts: ContactToSend[];
  initialSelectedContacts?: ContactToSend[];
  isLoading?: boolean;
}

function getInitials(firstName: string, lastName?: string): string {
  const first = firstName?.charAt(0)?.toUpperCase() || "";
  const last = lastName?.charAt(0)?.toUpperCase() || "";
  return (first + last).slice(0, 2) || "?";
}

function getDisplayName(contact: ContactToSend): string {
  if (contact.firstName) {
    return contact.lastName
      ? `${contact.firstName} ${contact.lastName}`
      : contact.firstName;
  }
  return contact.phoneNumber;
}

export function SendContactsModal({
  isOpen,
  onClose,
  onSend,
  contacts,
  initialSelectedContacts = [],
  isLoading = false,
}: SendContactsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const namesContainerRef = useRef<HTMLDivElement>(null);
  const [visibleNames, setVisibleNames] = useState<string[]>([]);
  const [hasOverflow, setHasOverflow] = useState(false);

  // Initialize selection when modal opens with initial contacts or reset when closing
  useEffect(() => {
    if (isOpen) {
      // If we have initial selected contacts (coming back from preview), restore them
      if (initialSelectedContacts.length > 0) {
        const ids = new Set(
          initialSelectedContacts.map(
            (c) => c.contactId || c.id || c.phoneNumber
          )
        );
        setSelectedIds(ids);
      }
    } else {
      setSearchQuery("");
      setSelectedIds(new Set());
    }
  }, [isOpen, initialSelectedContacts]);

  // Filter contacts based on search
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;

    const query = searchQuery.toLowerCase();
    return contacts.filter((contact) => {
      const name = getDisplayName(contact).toLowerCase();
      const phone = contact.phoneNumber.toLowerCase();
      return name.includes(query) || phone.includes(query);
    });
  }, [contacts, searchQuery]);

  // Get selected contacts
  const selectedContacts = useMemo(() => {
    return contacts.filter((c) =>
      selectedIds.has(c.contactId || c.id || c.phoneNumber)
    );
  }, [contacts, selectedIds]);

  // Calculate visible names for the send button area
  useEffect(() => {
    if (selectedContacts.length === 0) {
      setVisibleNames([]);
      setHasOverflow(false);
      return;
    }

    const names = selectedContacts.map((c) => c.firstName || c.phoneNumber);

    // Simple approach: show up to 3 names, then add "..."
    if (names.length <= 3) {
      setVisibleNames(names);
      setHasOverflow(false);
    } else {
      setVisibleNames(names.slice(0, 3));
      setHasOverflow(true);
    }
  }, [selectedContacts]);

  const toggleContact = (contact: ContactToSend) => {
    const id = contact.contactId || contact.id || contact.phoneNumber;
    const newSelected = new Set(selectedIds);

    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }

    setSelectedIds(newSelected);
  };

  const handleSend = () => {
    if (selectedContacts.length > 0) {
      onSend(selectedContacts);
    }
  };

  const formatNamesDisplay = (): string => {
    if (visibleNames.length === 0) return "";

    const namesText = visibleNames.join(", ");
    return hasOverflow ? `${namesText}...` : namesText;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Send Contacts</DialogTitle>
        </DialogHeader>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[400px] space-y-1 py-2">
          {isLoading ? (
            // Loading skeleton
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))
          ) : filteredContacts.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {searchQuery ? "No contacts found" : "No contacts available"}
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const id = contact.contactId || contact.id || contact.phoneNumber;
              const isSelected = selectedIds.has(id);
              const displayName = getDisplayName(contact);
              const initials = getInitials(contact.firstName, contact.lastName);

              return (
                <div
                  key={id}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                  onClick={() => toggleContact(contact)}
                >
                  {/* Checkbox */}
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleContact(contact)}
                    className="rounded-full"
                  />

                  {/* Avatar */}
                  <Avatar className="h-10 w-10">
                    {contact.avatar && (
                      <AvatarImage src={contact.avatar} alt={displayName} />
                    )}
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name and Phone */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {displayName}
                    </p>
                    {contact.firstName && (
                      <p className="text-xs text-muted-foreground truncate">
                        {contact.phoneNumber}
                      </p>
                    )}
                    {/* WhatsApp Status - show if contact is active */}
                    {contact.isActive !== undefined && (
                      <p
                        className={`text-xs ${
                          contact.isActive
                            ? "text-green-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        {contact.isActive ? "On WhatsApp" : "Not on WhatsApp"}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with selected names and send button */}
        {selectedContacts.length > 0 && (
          <div className="border-t pt-4 flex items-center justify-between gap-4">
            {/* Selected Names */}
            <div
              ref={namesContainerRef}
              className="flex-1 text-sm text-muted-foreground truncate"
            >
              {formatNamesDisplay()}
            </div>

            {/* Send Button */}
            <Button
              onClick={handleSend}
              disabled={isLoading}
              className="shrink-0 gap-2"
            >
              <Send className="h-4 w-4" />
              Send ({selectedContacts.length})
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
