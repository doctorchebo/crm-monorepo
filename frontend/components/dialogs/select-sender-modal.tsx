/**
 * SelectSenderModal
 * Modal dialog for selecting which sender number to initiate a chat with
 * Shows available sender numbers and lets user choose before starting conversation
 */

"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useEffect, useState } from "react";

interface Sender {
  id: number;
  phoneNumber: string;
  displayName?: string;
}

interface Contact {
  firstName: string;
  lastName?: string;
  phoneNumber: string;
}

interface SelectSenderModalProps {
  isOpen: boolean;
  contact?: Contact;
  onSelect: (senderId: number, senderPhoneNumber: string) => void;
  onClose: () => void;
  senders: Sender[];
  isLoading?: boolean;
}

export function SelectSenderModal({
  isOpen,
  contact,
  onSelect,
  onClose,
  senders = [],
  isLoading = false,
}: SelectSenderModalProps) {
  const [selectedSenderId, setSelectedSenderId] = useState<string>("");

  // Set initial selection when senders load
  useEffect(() => {
    if (isOpen && senders.length > 0 && !selectedSenderId) {
      setSelectedSenderId(senders[0].id.toString());
    }
  }, [isOpen, senders, selectedSenderId]);

  const handleSelect = () => {
    if (!selectedSenderId) return;

    const selectedSender = senders.find(
      (s) => s.id.toString() === selectedSenderId
    );
    if (selectedSender) {
      onSelect(selectedSender.id, selectedSender.phoneNumber);
    }
  };

  const displayName = contact
    ? `${contact.firstName} ${contact.lastName || ""}`.trim()
    : "Unknown";
  const displayPhone = contact?.phoneNumber || "Unknown";

  return (
    <Sheet open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <SheetContent side="bottom" className="sm:max-w-[425px]">
        <SheetHeader>
          <SheetTitle>Select Sender Number</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Contact Info */}
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">{displayName}</p>
            <p className="text-muted-foreground">{displayPhone}</p>
          </div>

          {/* Sender Selection */}
          {senders.length === 0 ? (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
              No sender numbers available. Please add a sender number first.
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                Choose a sender number to initiate this conversation:
              </p>
              <RadioGroup
                value={selectedSenderId}
                onValueChange={setSelectedSenderId}
              >
                {senders.map((sender) => (
                  <div
                    key={sender.id}
                    className="flex items-center space-x-2 rounded-lg border p-3 hover:bg-muted"
                  >
                    <RadioGroupItem
                      value={sender.id.toString()}
                      id={`sender-${sender.id}`}
                    />
                    <Label
                      htmlFor={`sender-${sender.id}`}
                      className="flex flex-1 cursor-pointer flex-col"
                    >
                      <span className="font-medium">{sender.phoneNumber}</span>
                      {sender.displayName && (
                        <span className="text-xs text-muted-foreground">
                          {sender.displayName}
                        </span>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSelect}
            disabled={!selectedSenderId || isLoading || senders.length === 0}
          >
            {isLoading ? "Starting chat..." : "Select"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
