/**
 * DeleteChatDialog
 * Confirmation dialog for permanently deleting a chat
 * Warns user that all messages and media will be permanently deleted
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
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface DeleteChatDialogProps {
  isOpen: boolean;
  chatId: string;
  participantName?: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function DeleteChatDialog({
  isOpen,
  chatId,
  participantName,
  onConfirm,
  onCancel,
}: DeleteChatDialogProps) {
  const t = useTranslations("chats.chatList");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            {t("deleteConfirmDescription", {
              name: participantName || chatId,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-600 dark:text-red-400">
          <p className="font-medium">{t("deleteWarning")}</p>
          <ul className="mt-2 list-disc list-inside space-y-1 text-red-600/80 dark:text-red-400/90">
            <li>{t("deleteWarningMessages")}</li>
            <li>{t("deleteWarningMedia")}</li>
            <li>{t("deleteWarningIrreversible")}</li>
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={isDeleting}>
            {t("deleteCancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("deleting")}
              </>
            ) : (
              t("deleteConfirmButton")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
