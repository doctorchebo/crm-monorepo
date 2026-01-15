"use client";

import { Button } from "@/components/ui/button";
import { Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";

interface SelectionBannerProps {
    selectedCount: number;
    onCancel: () => void;
    onDelete: () => void;
}

export function SelectionBanner({
    selectedCount,
    onCancel,
    onDelete,
}: SelectionBannerProps) {
    const t = useTranslations("chats");

    return (
        <div className="flex items-center justify-between p-4 bg-muted/50 border-t h-[60px]">
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onDelete}
                    className="text-red-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20"
                    title={t("deleteMessage")}
                >
                    <Trash2 className="h-5 w-5" />
                </Button>
                <span className="font-medium text-sm">
                    {selectedCount}{" "}
                    {selectedCount === 1 ? t("messageSelected") : t("messagesSelected")}
                </span>
            </div>
            <Button variant="ghost" size="icon" onClick={onCancel}>
                <X className="h-5 w-5" />
            </Button>
        </div>
    );
}
