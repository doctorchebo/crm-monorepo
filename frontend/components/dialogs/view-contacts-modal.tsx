/**
 * ViewContactsModal
 * Modal to view all contacts from a received contact message
 *
 * For each contact:
 * - Avatar and name on first line with Save button
 * - Phone number and Message button on second line
 */

"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReceivedContact } from "@/lib/types/contact-message.types";
import { MessageCircle, UserPlus } from "lucide-react";

interface ViewContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: ReceivedContact[];
  onStartChat: (contact: ReceivedContact) => void;
  onSaveContact: (contact: ReceivedContact) => void;
}

function getInitials(contact: ReceivedContact): string {
  const firstName = contact.name.first_name || "";
  const lastName = contact.name.last_name || "";
  const first = firstName.charAt(0).toUpperCase();
  const last = lastName.charAt(0).toUpperCase();
  return (
    (first + last).slice(0, 2) ||
    contact.name.formatted_name?.charAt(0)?.toUpperCase() ||
    "?"
  );
}

function getDisplayName(contact: ReceivedContact): string {
  if (contact.name.first_name) {
    return contact.name.last_name
      ? `${contact.name.first_name} ${contact.name.last_name}`
      : contact.name.first_name;
  }
  return contact.name.formatted_name || contact.phones?.[0]?.phone || "Unknown";
}

function getPhoneNumber(contact: ReceivedContact): string {
  return contact.phones?.[0]?.phone || contact.phones?.[0]?.wa_id || "";
}

export function ViewContactsModal({
  isOpen,
  onClose,
  contacts,
  onStartChat,
  onSaveContact,
}: ViewContactsModalProps) {
  if (contacts.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {contacts.length} Contact{contacts.length > 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto min-h-[150px] max-h-[400px] space-y-3 py-2">
          {contacts.map((contact, index) => {
            const displayName = getDisplayName(contact);
            const initials = getInitials(contact);
            const phoneNumber = getPhoneNumber(contact);

            return (
              <div
                key={`${phoneNumber}-${index}`}
                className="flex flex-col gap-2 p-3 rounded-lg bg-muted/50"
              >
                {/* First Line: Avatar, Name, Save Button */}
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <p className="font-medium text-sm flex-1 truncate">
                    {displayName}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 gap-1"
                    onClick={() => onSaveContact(contact)}
                  >
                    <UserPlus className="h-4 w-4" />
                    Save
                  </Button>
                </div>

                {/* Second Line: Phone and Message Button */}
                <div className="flex items-center justify-between pl-[52px]">
                  <p className="text-sm text-muted-foreground">
                    {phoneNumber || "No phone number"}
                  </p>
                  {phoneNumber && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-primary hover:text-primary"
                      onClick={() => onStartChat(contact)}
                    >
                      <MessageCircle className="h-4 w-4 mr-1" />
                      Message
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t pt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
