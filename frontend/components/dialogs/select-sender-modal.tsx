/**
 * SelectSenderModal
 * Modal dialog for selecting which sender number to initiate a chat with
 * Shows available sender numbers and lets user choose before starting conversation
 * Features search functionality for filtering senders by name or number
 */

"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

interface Sender {
  id: number;
  phoneNumber: string;
  displayName?: string | null;
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
  const t = useTranslations("contacts.selectSender");
  const [selectedSenderId, setSelectedSenderId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Reset search when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSelectedSenderId("");
    }
  }, [isOpen]);

  // Set initial selection when senders load
  useEffect(() => {
    if (isOpen && senders.length > 0 && !selectedSenderId) {
      setSelectedSenderId(senders[0].id.toString());
    }
  }, [isOpen, senders, selectedSenderId]);

  // Performant filtering using useMemo - only recalculates when dependencies change
  const filteredSenders = useMemo(() => {
    if (!searchQuery.trim()) {
      return senders;
    }
    const query = searchQuery.toLowerCase().trim();
    return senders.filter((sender) => {
      const phoneMatch = sender.phoneNumber.toLowerCase().includes(query);
      const nameMatch = sender.displayName?.toLowerCase().includes(query);
      return phoneMatch || nameMatch;
    });
  }, [senders, searchQuery]);

  // Update selection if current selection is filtered out
  useEffect(() => {
    if (
      filteredSenders.length > 0 &&
      !filteredSenders.find((s) => s.id.toString() === selectedSenderId)
    ) {
      setSelectedSenderId(filteredSenders[0].id.toString());
    }
  }, [filteredSenders, selectedSenderId]);

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
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { name: displayName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Contact Info */}
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">{displayName}</p>
            <p className="text-muted-foreground">{displayPhone}</p>
          </div>

          {/* Sender Selection */}
          {senders.length === 0 ? (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/50 p-3 text-sm text-amber-700 dark:text-amber-400">
              {t("noSenders")}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={t("searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Scrollable sender list */}
              <div className="max-h-[240px] overflow-y-auto">
                <RadioGroup
                  value={selectedSenderId}
                  onValueChange={setSelectedSenderId}
                  className="space-y-2"
                >
                  {filteredSenders.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {t("noResults")}
                    </p>
                  ) : (
                    filteredSenders.map((sender) => (
                      <div
                        key={sender.id}
                        className="flex items-center space-x-2 rounded-lg border p-3 hover:bg-muted transition-colors"
                      >
                        <RadioGroupItem
                          value={sender.id.toString()}
                          id={`sender-${sender.id}`}
                        />
                        <Label
                          htmlFor={`sender-${sender.id}`}
                          className="flex flex-1 cursor-pointer flex-col"
                        >
                          <span className="font-medium">
                            {sender.phoneNumber}
                          </span>
                          {sender.displayName && (
                            <span className="text-xs text-muted-foreground">
                              {sender.displayName}
                            </span>
                          )}
                        </Label>
                      </div>
                    ))
                  )}
                </RadioGroup>
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        <DialogFooter>
          <Button
            onClick={handleSelect}
            disabled={
              !selectedSenderId ||
              isLoading ||
              senders.length === 0 ||
              filteredSenders.length === 0
            }
          >
            {isLoading ? t("startingChat") : t("select")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
