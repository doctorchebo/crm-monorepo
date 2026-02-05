"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { backendApi, MetaCatalog } from "@/lib/api/endpoints";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

interface DeleteCatalogDialogProps {
  /** The catalog to delete, or null if the dialog should be closed */
  catalog: MetaCatalog | null;
  /** Callback when the dialog should be closed */
  onClose: () => void;
  /** Callback when a catalog is successfully deleted */
  onDeleted: (catalogId: string) => void;
  /** Callback for showing notifications */
  onNotification: (message: string, type: "success" | "error") => void;
}

/**
 * Reusable Dialog for confirming and executing Meta catalog deletion.
 *
 * Features:
 * - Shows detailed warnings about the deletion impact
 * - Handles the delete API call
 * - Shows loading state during deletion
 * - Notifies parent on success/failure
 */
export function DeleteCatalogDialog({
  catalog,
  onClose,
  onDeleted,
  onNotification,
}: DeleteCatalogDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!catalog) return;

    setIsDeleting(true);
    try {
      const result = await backendApi.catalog.deleteMetaCatalog(catalog.id);

      onNotification(
        result.message || `Catalog "${catalog.name}" deleted`,
        "success",
      );

      onDeleted(catalog.id);
      onClose();
    } catch (error) {
      console.error("Failed to delete catalog:", error);
      onNotification(
        error instanceof Error ? error.message : "Failed to delete catalog",
        "error",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={!!catalog} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Catalog</DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete the catalog &ldquo;
            {catalog?.name}&rdquo;? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>All products in this catalog will be deleted from Meta</li>
                <li>
                  The catalog will be disconnected from your WhatsApp Business
                  Account
                </li>
                <li>
                  Any phone numbers linked to this catalog will be unlinked
                </li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Delete Catalog
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
