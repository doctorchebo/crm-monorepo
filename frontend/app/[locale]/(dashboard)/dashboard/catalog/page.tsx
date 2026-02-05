"use client";

import { CatalogBulkImportModal } from "@/components/catalog/catalog-bulk-import-modal";
import { CatalogItemCard } from "@/components/catalog/catalog-item-card";
import { CatalogItemDetailDrawer } from "@/components/catalog/catalog-item-detail-drawer";
import { CatalogItemFormModal } from "@/components/catalog/catalog-item-form-modal";
import { CatalogSendToContactsModal } from "@/components/catalog/catalog-send-to-contacts-modal";
import { SenderCatalogManager } from "@/components/catalog/sender-catalog-manager";
import { DeleteConfirmationDialog } from "@/components/dialogs/delete-confirmation-dialog";
import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/ui/page-layout";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthProtection } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useNotification } from "@/hooks/use-notification";
import { backendApi } from "@/lib/api/endpoints";
import {
  CheckSquare,
  FileCheck,
  Package,
  Plus,
  Send,
  Upload,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

/**
 * Catalog item status enum matching backend
 */
type CatalogItemStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_UPDATE"
  | "ARCHIVED";

/**
 * Catalog item image
 */
interface CatalogItemImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  isMain: boolean;
  sortOrder: number;
}

/**
 * Catalog item type
 */
interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  salePrice: number | null;
  currency: string;
  link: string | null;
  retailerId: string | null;
  availability: string;
  condition: string;
  brand: string | null;
  status: CatalogItemStatus;
  statusMessage: string | null;
  images: CatalogItemImage[];
  mainImageUrl: string | null;
  mainThumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Paginated response
 */
interface PaginatedCatalogItems {
  items: CatalogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Filter tabs for catalog items
 */
type FilterTab = "all" | "pending";

/**
 * Catalog Page
 *
 * Main page for managing product catalog:
 * - List catalog items with grid view
 * - Search and filter functionality
 * - Create, edit, delete items
 * - Toggle visibility
 * - View item details
 */
export default function CatalogPage() {
  const t = useTranslations("catalog");
  const { isLoading: authLoading } = useAuthProtection();
  const { addNotification } = useNotification();

  // Catalog link state - tracks which catalog is linked to the selected sender
  const [linkedCatalogId, setLinkedCatalogId] = useState<string | null>(null);
  const [selectedSenderId, setSelectedSenderId] = useState<number | null>(null);

  // Items state
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const {
    value: searchQuery,
    debouncedValue: debouncedSearch,
    setValue: setSearchQuery,
  } = useDebouncedValue("", { delay: 300 });
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [detailItem, setDetailItem] = useState<CatalogItem | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<CatalogItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk selection mode
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set(),
  );
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);

  // Bulk import modal
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);

  // Build query params based on filters
  const getQueryParams = useCallback(() => {
    const params: Record<string, string> = {
      page: page.toString(),
      limit: "20",
    };

    if (debouncedSearch) {
      params.search = debouncedSearch;
    }

    switch (activeTab) {
      case "pending":
        params.status = "PENDING_APPROVAL";
        break;
    }

    return params;
  }, [page, debouncedSearch, activeTab]);

  // Fetch catalog items
  const fetchItems = useCallback(async () => {
    // Only fetch items if a catalog is linked
    if (!linkedCatalogId) {
      setItems([]);
      setTotalItems(0);
      setTotalPages(1);
      return;
    }

    setIsLoading(true);
    try {
      const params = getQueryParams();
      const data = await backendApi.catalog.listItems({
        page: parseInt(params.page) || 1,
        limit: parseInt(params.limit) || 20,
        search: params.search,
        status: params.status,
      });
      setItems(data.items as CatalogItem[]);
      setTotalPages(data.totalPages);
      setTotalItems(data.total);
    } catch (error) {
      console.error("Error fetching catalog items:", error);
      addNotification("Failed to load catalog items", "error");
    } finally {
      setIsLoading(false);
    }
  }, [getQueryParams, addNotification, linkedCatalogId]);

  // Fetch on mount and when params change
  useEffect(() => {
    if (!authLoading && linkedCatalogId) {
      fetchItems();
    }
  }, [authLoading, fetchItems, linkedCatalogId]);

  // Reset page when search or filter changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeTab]);

  // Handle create new item
  const handleCreateItem = () => {
    setEditingItem(null);
    setIsFormModalOpen(true);
  };

  // Handle edit item
  const handleEditItem = (item: CatalogItem) => {
    setEditingItem(item);
    setIsFormModalOpen(true);
  };

  // Handle view item details
  const handleViewItem = (item: CatalogItem) => {
    setDetailItem(item);
    setIsDetailDrawerOpen(true);
  };

  // Handle status change from drawer (after sync with Meta)
  const handleItemStatusChange = useCallback(
    (itemId: string, newStatus: CatalogItemStatus) => {
      // Update the item in the local list
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, status: newStatus } : item,
        ),
      );

      // Update the detail item if it's the same
      setDetailItem((prev) =>
        prev?.id === itemId ? { ...prev, status: newStatus } : prev,
      );

      // Refetch to ensure we have latest data
      fetchItems();
    },
    [fetchItems],
  );

  // Handle delete item
  const handleDeleteItem = async () => {
    if (!deleteItem) return;

    setIsDeleting(true);
    try {
      await backendApi.catalog.deleteItem(deleteItem.id);
      addNotification(t("itemDeleted"), "success");
      fetchItems();
    } catch (error) {
      console.error("Error deleting item:", error);
      addNotification("Failed to delete item", "error");
    } finally {
      setIsDeleting(false);
      setDeleteItem(null);
    }
  };

  // Handle submit items for Meta review
  const handleSubmitForReview = async () => {
    if (selectedItemIds.size === 0) return;

    try {
      const result = await backendApi.catalog.submitForReview(
        Array.from(selectedItemIds),
      );

      if (result.submittedCount > 0) {
        addNotification(result.message, "success");
        fetchItems();
        setIsSelectionMode(false);
        setSelectedItemIds(new Set());
      }

      // Show failures if any
      if (result.failures.length > 0) {
        const failureMessage = result.failures
          .slice(0, 3)
          .map((f) => `${f.itemName}: ${f.reason}`)
          .join("\n");
        addNotification(
          `${result.failedCount} item(s) could not be submitted:\n${failureMessage}`,
          "error",
        );
      }
    } catch (error) {
      console.error("Error submitting for review:", error);
      addNotification("Failed to submit items for review", "error");
    }
  };

  // Handle form save
  const handleFormSave = () => {
    setIsFormModalOpen(false);
    setEditingItem(null);
    fetchItems();
  };

  // Selection mode handlers
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      setSelectedItemIds(new Set());
    }
  };

  const handleItemSelect = (itemId: string, selected: boolean) => {
    const newSelected = new Set(selectedItemIds);
    if (selected) {
      if (newSelected.size < 30) {
        // Max 30 items
        newSelected.add(itemId);
      }
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItemIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItemIds.size === items.length) {
      setSelectedItemIds(new Set());
    } else {
      const allIds = items.slice(0, 30).map((item) => item.id);
      setSelectedItemIds(new Set(allIds));
    }
  };

  const handleOpenSendModal = () => {
    if (selectedItemIds.size > 0) {
      setIsSendModalOpen(true);
    }
  };

  const handleSendToContacts = async (chatIds: string[], itemIds: string[]) => {
    try {
      await backendApi.catalog.sendToMultipleChats(chatIds, itemIds);
      addNotification(
        chatIds.length === 1
          ? t("send.sentSuccessfully")
          : t("send.sentMultiple"),
        "success",
      );
      setIsSelectionMode(false);
      setSelectedItemIds(new Set());
    } catch (error) {
      console.error("Error sending catalog items:", error);
      addNotification(t("send.sendFailed"), "error");
      throw error;
    }
  };

  // Get selected items for the modal
  const selectedItems = items.filter((item) => selectedItemIds.has(item.id));

  // Loading state
  if (authLoading) {
    return (
      <PageLayout title={t("title")} description={t("description")}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-lg" />
          ))}
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={t("title")}
      description={t("description")}
      headerActions={
        linkedCatalogId ? (
          <div className="flex items-center gap-2">
            {isSelectionMode ? (
              <>
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  <CheckSquare className="mr-2 h-4 w-4" />
                  {selectedItemIds.size === items.length
                    ? (t("send.deselectAll") ?? "Deselect All")
                    : (t("send.selectAll") ?? "Select All")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSubmitForReview}
                  disabled={selectedItemIds.size === 0}
                >
                  <FileCheck className="mr-2 h-4 w-4" />
                  {t("submitForReview") ?? "Submit for Review"} (
                  {selectedItemIds.size})
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleOpenSendModal}
                  disabled={selectedItemIds.size === 0}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {t("send.send")} ({selectedItemIds.size})
                </Button>
                <Button variant="ghost" size="sm" onClick={toggleSelectionMode}>
                  <X className="mr-2 h-4 w-4" />
                  {t("send.cancel") ?? "Cancel"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectionMode}
                  disabled={items.length === 0}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {t("send.sendTo")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsBulkImportOpen(true)}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {t("bulkImport.title")}
                </Button>
                <Button onClick={handleCreateItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("newItem")}
                </Button>
              </>
            )}
          </div>
        ) : undefined
      }
    >
      {/* Sender Catalog Manager - handles sender selection and catalog linking */}
      <SenderCatalogManager
        onCatalogLinked={(catalogId, senderId) => {
          setLinkedCatalogId(catalogId);
          setSelectedSenderId(senderId);
        }}
        onCatalogUnlinked={() => {
          setLinkedCatalogId(null);
          setItems([]);
          setTotalItems(0);
        }}
      />

      {/* Only show item management when a catalog is linked */}
      {linkedCatalogId && (
        <>
          {/* Filters and search */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6 mt-6">
            <SearchInput
              placeholder={t("searchItems")}
              value={searchQuery}
              onChange={setSearchQuery}
              className="max-w-xs"
            />

            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as FilterTab)}
              className="w-auto"
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pending">{t("status.pending")}</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="ml-auto text-sm text-muted-foreground">
              {t("totalItems", { count: totalItems })}
            </div>
          </div>

          {/* Items grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {searchQuery ? t("noSearchResults") : t("noItems")}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "" : t("createFirstItem")}
              </p>
              {!searchQuery && (
                <Button onClick={handleCreateItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("addItem")}
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map((item) => (
                  <CatalogItemCard
                    key={item.id}
                    item={item}
                    onView={() => handleViewItem(item)}
                    onEdit={() => handleEditItem(item)}
                    onDelete={() => setDeleteItem(item)}
                    selectable={isSelectionMode}
                    selected={selectedItemIds.has(item.id)}
                    onSelect={(selected) => handleItemSelect(item.id, selected)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center mt-6">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === totalPages}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Form Modal */}
      <CatalogItemFormModal
        open={isFormModalOpen}
        onOpenChange={setIsFormModalOpen}
        item={editingItem}
        onSave={handleFormSave}
      />

      {/* Detail Drawer */}
      <CatalogItemDetailDrawer
        open={isDetailDrawerOpen}
        onOpenChange={setIsDetailDrawerOpen}
        item={detailItem}
        onEdit={() => {
          if (detailItem) {
            handleEditItem(detailItem);
            setIsDetailDrawerOpen(false);
          }
        }}
        onStatusChange={handleItemStatusChange}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmationDialog
        isOpen={!!deleteItem}
        onCancel={() => setDeleteItem(null)}
        title={t("deleteItem")}
        description={t("deleteItemConfirmation")}
        onConfirm={handleDeleteItem}
        isLoading={isDeleting}
      />

      {/* Send to Contacts Modal */}
      <CatalogSendToContactsModal
        open={isSendModalOpen}
        onOpenChange={setIsSendModalOpen}
        selectedItems={selectedItems}
        onSend={handleSendToContacts}
      />

      {/* Bulk Import Modal */}
      <CatalogBulkImportModal
        open={isBulkImportOpen}
        onOpenChange={setIsBulkImportOpen}
        onSuccess={fetchItems}
      />
    </PageLayout>
  );
}
