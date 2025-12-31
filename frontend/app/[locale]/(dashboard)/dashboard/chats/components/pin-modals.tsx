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
import { Clock, Pin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PinDuration } from "../types";

interface PinDurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (duration: PinDuration) => void;
  isLoading?: boolean;
}

const DURATION_OPTIONS = [
  { value: PinDuration.HOURS_24, labelKey: "pin24Hours", description: "24h" },
  { value: PinDuration.DAYS_7, labelKey: "pin7Days", description: "7d" },
  { value: PinDuration.DAYS_30, labelKey: "pin30Days", description: "30d" },
] as const;

export function PinDurationModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: PinDurationModalProps) {
  const t = useTranslations("chats");
  const [selectedDuration, setSelectedDuration] = useState<PinDuration>(
    PinDuration.DAYS_7
  );

  const handleConfirm = () => {
    onConfirm(selectedDuration);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pin className="h-5 w-5" />
            {t("pinMessageTitle")}
          </DialogTitle>
          <DialogDescription className="pt-2">
            {t("pinMessageDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-2">
          {DURATION_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedDuration(option.value)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                selectedDuration === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{t(option.labelKey)}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {option.description}
              </span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {t("cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? t("pinning") : t("pinMessage")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PinReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  oldestPinMessage?: string | null;
  isLoading?: boolean;
}

export function PinReplaceModal({
  isOpen,
  onClose,
  onConfirm,
  oldestPinMessage,
  isLoading = false,
}: PinReplaceModalProps) {
  const t = useTranslations("chats");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pin className="h-5 w-5 text-amber-500" />
            {t("pinLimitReachedTitle")}
          </DialogTitle>
          <DialogDescription className="pt-2">
            {t("pinLimitReachedDescription")}
          </DialogDescription>
        </DialogHeader>

        {oldestPinMessage && (
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-1">
              {t("willReplacePin")}:
            </p>
            <div className="px-3 py-2 bg-muted rounded-md text-sm truncate">
              {oldestPinMessage}
            </div>
          </div>
        )}

        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {t("cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading ? t("replacing") : t("replaceAndPin")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
