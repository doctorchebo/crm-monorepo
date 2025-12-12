"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface EditMessageModalProps {
  open: boolean;
  messageId: string;
  currentText: string;
  messageTimestamp: string;
  onClose: () => void;
  onSave: (messageId: string, newText: string) => Promise<void>;
}

export function EditMessageModal({
  open,
  messageId,
  currentText,
  messageTimestamp,
  onClose,
  onSave,
}: EditMessageModalProps) {
  const t = useTranslations("chats");
  const tc = useTranslations("common");
  const [text, setText] = useState(currentText);
  const [loading, setLoading] = useState(false);
  const [canEdit, setCanEdit] = useState(true);

  // Check if message is within 15-minute edit window
  useEffect(() => {
    const messageAge = Date.now() - new Date(messageTimestamp).getTime();
    const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    setCanEdit(messageAge < EDIT_WINDOW_MS);
  }, [messageTimestamp]);

  // Reset text when modal opens
  useEffect(() => {
    if (open) {
      setText(currentText);
      setLoading(false);
    }
  }, [open, currentText]);

  const handleSave = async () => {
    if (!text.trim()) return;

    setLoading(true);
    try {
      await onSave(messageId, text);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!canEdit) {
    return open ? (
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
            {t("editMessageTitle")}
          </h2>
          <div className="py-4">
            <p className="text-sm text-red-600 dark:text-red-400">
              {t("editWindowExpired")}
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={onClose} variant="outline">
              {tc("close")}
            </Button>
          </div>
        </div>
      </div>
    ) : null;
  }

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

        <h2 className="text-lg font-semibold mb-2">{t("editMessageTitle")}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t("editMessageDescription")}
        </p>

        <div className="space-y-4">
          <div>
            <Input
              value={text}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setText(e.target.value)
              }
              placeholder={t("typeMessage")}
              className="min-h-24"
              maxLength={4096}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {text.length} / 4096
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button onClick={onClose} variant="outline" disabled={loading}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || !text.trim() || text === currentText}
          >
            {loading ? (
              <>
                <Loader className="h-4 w-4 mr-2 animate-spin" />
                {t("editingMessage")}
              </>
            ) : (
              tc("save")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
