"use client";

import { Button } from "@/components/ui/button";
import { Loader, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface DeleteMessageDialogProps {
  open: boolean;
  messageId: string;
  onClose: () => void;
  onConfirm: (messageId: string) => Promise<void>;
}

export function DeleteMessageDialog({
  open,
  messageId,
  onClose,
  onConfirm,
}: DeleteMessageDialogProps) {
  const t = useTranslations("chats");
  const [loading, setLoading] = useState(false);

  // Reset loading state when modal closes
  useEffect(() => {
    if (!open) {
      setLoading(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(messageId);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-background border rounded-lg shadow-lg p-6 max-w-lg w-full mx-4">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 hover:bg-accent rounded"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-semibold mb-2">
          {t("deleteConfirmTitle")}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t("deleteConfirmDescription")}
        </p>

        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="outline" disabled={loading}>
            {t("deleteCancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            variant="destructive"
          >
            {loading ? (
              <>
                <Loader className="h-4 w-4 mr-2 animate-spin" />
                {t("deletingMessage")}
              </>
            ) : (
              t("deleteConfirmButton")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
