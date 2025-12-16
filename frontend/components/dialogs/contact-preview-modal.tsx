/**
 * ContactPreviewModal
 * Shows selected contacts before sending with options to message each contact
 *
 * Features:
 * - Avatar and name on first line
 * - Phone number and message button on second line
 * - Send button in footer
 */

"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContactToSend } from "@/lib/types/contact-message.types";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";

interface ContactPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  onConfirmSend: () => void;
  contacts: ContactToSend[];
  onStartChat: (contact: ContactToSend) => void;
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

export function ContactPreviewModal({
  isOpen,
  onClose,
  onBack,
  onConfirmSend,
  contacts,
  onStartChat,
  isLoading = false,
}: ContactPreviewModalProps) {
  if (contacts.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] max-h-[80vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <DialogTitle className="flex-1">
            {contacts.length} contact{contacts.length > 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto min-h-[150px] max-h-[400px] space-y-3 py-2">
          {contacts.map((contact) => {
            const id = contact.contactId || contact.id || contact.phoneNumber;
            const displayName = getDisplayName(contact);
            const initials = getInitials(contact.firstName, contact.lastName);

            return (
              <div
                key={id}
                className="flex flex-col gap-1 p-3 rounded-lg bg-muted/50"
              >
                {/* First Line: Avatar and Name */}
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {contact.avatar && (
                      <AvatarImage src={contact.avatar} alt={displayName} />
                    )}
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <p className="font-medium text-sm flex-1 truncate">
                    {displayName}
                  </p>
                </div>

                {/* Second Line: Phone and Message Button */}
                <div className="flex items-center justify-between pl-[52px]">
                  <p className="text-sm text-muted-foreground">
                    {contact.phoneNumber}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-primary hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartChat(contact);
                    }}
                  >
                    <MessageCircle className="h-4 w-4 mr-1" />
                    Message
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer with Send Button */}
        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={onConfirmSend}
            disabled={isLoading}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {isLoading ? "Sending..." : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
