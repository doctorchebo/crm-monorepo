"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useNotification } from "@/hooks/use-notification";
import {
  backendApi,
  CommerceSettings,
  MetaCatalog,
  Sender,
} from "@/lib/api/endpoints";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Link2,
  Link2Off,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  Settings,
  ShoppingCart,
  Store,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DeleteCatalogDialog } from "./delete-catalog-dialog";

interface SenderCatalogManagerProps {
  /** Callback when a catalog is successfully linked/created */
  onCatalogLinked?: (catalogId: string, senderId: number) => void;
  /** Callback when catalog is unlinked */
  onCatalogUnlinked?: (senderId: number) => void;
}

type SetupMode = "idle" | "create" | "link";

/**
 * Sender Catalog Manager Component
 *
 * A comprehensive component for managing Meta catalogs per sender:
 * 1. Select a sender (phone number)
 * 2. View commerce settings status
 * 3. Create or link a Meta catalog
 * 4. Configure commerce settings (cart, visibility)
 *
 * This is the entry point for catalog management - items can only be
 * created after a catalog is properly linked to a sender.
 */
export function SenderCatalogManager({
  onCatalogLinked,
  onCatalogUnlinked,
}: SenderCatalogManagerProps) {
  const { addNotification } = useNotification();

  // Refs for callbacks to avoid useEffect dependency issues
  const onCatalogLinkedRef = useRef(onCatalogLinked);
  const onCatalogUnlinkedRef = useRef(onCatalogUnlinked);

  // Track last notified state to prevent duplicate notifications
  const lastNotifiedStateRef = useRef<{
    catalogId: string | null;
    senderId: number | null;
  }>({ catalogId: null, senderId: null });

  // Keep refs updated
  useEffect(() => {
    onCatalogLinkedRef.current = onCatalogLinked;
    onCatalogUnlinkedRef.current = onCatalogUnlinked;
  });

  // Senders state
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<number | null>(null);
  const [isLoadingSenders, setIsLoadingSenders] = useState(true);

  // Commerce settings state
  const [commerceSettings, setCommerceSettings] =
    useState<CommerceSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSyncingSettings, setIsSyncingSettings] = useState(false);

  // Meta catalogs state
  const [availableCatalogs, setAvailableCatalogs] = useState<MetaCatalog[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);

  // Dialog state
  const [setupMode, setSetupMode] = useState<SetupMode>("idle");
  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  // Delete catalog state
  const [catalogToDelete, setCatalogToDelete] = useState<MetaCatalog | null>(
    null,
  );

  // Catalog management expanded state (for showing/hiding catalog list)
  const [isCatalogListExpanded, setIsCatalogListExpanded] = useState(false);

  // Create catalog form
  const [newCatalogName, setNewCatalogName] = useState("");

  // Link catalog form
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("");

  // Fetch active senders
  const fetchSenders = useCallback(async () => {
    setIsLoadingSenders(true);
    try {
      const data = await backendApi.senders.listActive();
      setSenders(data);

      // Auto-select first sender if available
      if (data.length > 0 && !selectedSenderId) {
        setSelectedSenderId(data[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch senders:", error);
      addNotification("Failed to load phone numbers", "error");
    } finally {
      setIsLoadingSenders(false);
    }
  }, [addNotification, selectedSenderId]);

  // Fetch commerce settings for selected sender
  const fetchCommerceSettings = useCallback(async () => {
    if (!selectedSenderId) return;

    setIsLoadingSettings(true);
    try {
      const data =
        await backendApi.senders.getCommerceSettings(selectedSenderId);
      setCommerceSettings(data);
    } catch (error) {
      console.error("Failed to fetch commerce settings:", error);
      // Don't show notification - commerce might not be configured
      setCommerceSettings(null);
    } finally {
      setIsLoadingSettings(false);
    }
  }, [selectedSenderId]);

  // Fetch available Meta catalogs
  const fetchMetaCatalogs = useCallback(async () => {
    setIsLoadingCatalogs(true);
    try {
      const response = await backendApi.catalog.listMetaCatalogs();
      setAvailableCatalogs(response.catalogs);
      setBusinessId(response.businessId || null);
    } catch (error) {
      console.error("Failed to fetch Meta catalogs:", error);
      // Don't show error - might not be configured
    } finally {
      setIsLoadingCatalogs(false);
    }
  }, []);

  // Sync commerce settings from Meta
  const handleSyncSettings = async () => {
    if (!selectedSenderId) return;

    setIsSyncingSettings(true);
    try {
      const data =
        await backendApi.senders.syncCommerceSettings(selectedSenderId);
      setCommerceSettings(data);
      addNotification("Commerce settings synced from Meta", "success");
    } catch (error) {
      console.error("Failed to sync commerce settings:", error);
      addNotification("Failed to sync commerce settings", "error");
    } finally {
      setIsSyncingSettings(false);
    }
  };

  // Update commerce settings
  const handleUpdateSettings = async (updates: {
    isCartEnabled?: boolean;
    isCatalogVisible?: boolean;
  }) => {
    if (!selectedSenderId) return;

    setIsUpdatingSettings(true);
    try {
      const data = await backendApi.senders.updateCommerceSettings(
        selectedSenderId,
        updates,
      );
      setCommerceSettings(data);
      addNotification("Commerce settings updated", "success");
    } catch (error) {
      console.error("Failed to update commerce settings:", error);
      addNotification("Failed to update settings", "error");
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  // Create new Meta catalog and link to sender
  const handleCreateCatalog = async () => {
    if (!newCatalogName.trim() || !selectedSenderId) {
      addNotification("Please enter a catalog name", "error");
      return;
    }

    setIsLinking(true);
    try {
      // Create a commerce catalog on Meta (only commerce is supported for WhatsApp)
      const createdCatalog = await backendApi.catalog.createMetaCatalog({
        name: newCatalogName.trim(),
      });

      // Then link it to the sender
      if (createdCatalog.metaCatalogId) {
        const updatedSettings = await backendApi.senders.linkCatalog(
          selectedSenderId,
          createdCatalog.metaCatalogId,
        );
        setCommerceSettings(updatedSettings);
        onCatalogLinked?.(createdCatalog.metaCatalogId, selectedSenderId);
      }

      addNotification(
        `Created and linked catalog "${newCatalogName}"`,
        "success",
      );
      setSetupMode("idle");
      setNewCatalogName("");
      fetchMetaCatalogs(); // Refresh catalog list
    } catch (error) {
      console.error("Failed to create catalog:", error);
      addNotification(
        error instanceof Error ? error.message : "Failed to create catalog",
        "error",
      );
    } finally {
      setIsLinking(false);
    }
  };

  // Link existing Meta catalog to sender
  const handleLinkCatalog = async () => {
    if (!selectedCatalogId || !selectedSenderId) {
      addNotification("Please select a catalog to link", "error");
      return;
    }

    setIsLinking(true);
    try {
      const updatedSettings = await backendApi.senders.linkCatalog(
        selectedSenderId,
        selectedCatalogId,
      );
      setCommerceSettings(updatedSettings);

      const linkedCatalog = availableCatalogs.find(
        (c) => c.id === selectedCatalogId,
      );
      addNotification(
        `Linked catalog "${linkedCatalog?.name || selectedCatalogId}"`,
        "success",
      );
      setSetupMode("idle");
      setSelectedCatalogId("");
      onCatalogLinked?.(selectedCatalogId, selectedSenderId);
    } catch (error) {
      console.error("Failed to link catalog:", error);
      addNotification(
        error instanceof Error ? error.message : "Failed to link catalog",
        "error",
      );
    } finally {
      setIsLinking(false);
    }
  };

  // Unlink catalog from sender
  const handleUnlinkCatalog = async () => {
    if (!selectedSenderId) return;

    setIsUnlinking(true);
    try {
      const updatedSettings =
        await backendApi.senders.unlinkCatalog(selectedSenderId);
      setCommerceSettings(updatedSettings);
      addNotification("Catalog unlinked", "success");
      onCatalogUnlinked?.(selectedSenderId);
    } catch (error) {
      console.error("Failed to unlink catalog:", error);
      addNotification(
        error instanceof Error ? error.message : "Failed to unlink catalog",
        "error",
      );
    } finally {
      setIsUnlinking(false);
    }
  };

  // Handle catalog deleted callback (from DeleteCatalogDialog)
  const handleCatalogDeleted = async (deletedCatalogId: string) => {
    // Refresh catalog list
    await fetchMetaCatalogs();

    // If this was the linked catalog, refresh commerce settings
    if (commerceSettings?.linkedCatalogId === deletedCatalogId) {
      await fetchCommerceSettings();
      if (selectedSenderId) {
        onCatalogUnlinked?.(selectedSenderId);
      }
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchSenders();
    fetchMetaCatalogs();
  }, [fetchSenders, fetchMetaCatalogs]);

  // Fetch commerce settings when sender changes
  useEffect(() => {
    if (selectedSenderId) {
      fetchCommerceSettings();
    }
  }, [selectedSenderId, fetchCommerceSettings]);

  // Notify parent when a catalog is already linked on initial load or sender change
  // Uses refs to avoid infinite loops from callback dependency changes
  useEffect(() => {
    const catalogId = commerceSettings?.linkedCatalogId || null;
    const lastState = lastNotifiedStateRef.current;

    // Skip if the state hasn't changed
    if (
      lastState.catalogId === catalogId &&
      lastState.senderId === selectedSenderId
    ) {
      return;
    }

    // Update last notified state
    lastNotifiedStateRef.current = {
      catalogId,
      senderId: selectedSenderId,
    };

    // Notify parent
    if (catalogId && selectedSenderId) {
      onCatalogLinkedRef.current?.(catalogId, selectedSenderId);
    } else if (!catalogId && selectedSenderId) {
      onCatalogUnlinkedRef.current?.(selectedSenderId);
    }
  }, [commerceSettings?.linkedCatalogId, selectedSenderId]);

  const selectedSender = senders.find((s) => s.id === selectedSenderId);

  // Find the linked catalog in available catalogs, or create a synthetic one
  // This handles the case where the catalog is linked to the phone but not in the business's owned catalogs
  const linkedCatalogFromList = availableCatalogs.find(
    (c) => c.id === commerceSettings?.linkedCatalogId,
  );
  const linkedCatalog: MetaCatalog | undefined =
    linkedCatalogFromList ??
    (commerceSettings?.linkedCatalogId
      ? {
          id: commerceSettings.linkedCatalogId,
          name: `Catalog ${commerceSettings.linkedCatalogId}`,
          vertical: "commerce",
        }
      : undefined);
  const hasCatalogLinked = !!commerceSettings?.linkedCatalogId;

  // Loading state
  if (isLoadingSenders) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  // No senders available
  if (senders.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No Phone Numbers</AlertTitle>
        <AlertDescription>
          You need to connect a WhatsApp Business phone number before you can
          manage catalogs. Go to Settings → Senders to add a phone number.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Catalog Settings
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              fetchMetaCatalogs();
              if (selectedSenderId) handleSyncSettings();
            }}
            disabled={isSyncingSettings || isLoadingCatalogs}
          >
            <RefreshCw
              className={`h-4 w-4 ${isSyncingSettings || isLoadingCatalogs ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sender Selection */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Phone Number
          </Label>
          <Select
            value={selectedSenderId?.toString() || ""}
            onValueChange={(v) => setSelectedSenderId(parseInt(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a phone number" />
            </SelectTrigger>
            <SelectContent>
              {senders.map((sender) => (
                <SelectItem key={sender.id} value={sender.id.toString()}>
                  <div className="flex items-center gap-2">
                    <span>{sender.displayName || sender.phoneNumber}</span>
                    {sender.linkedCatalogId && (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Commerce Settings Status */}
        {isLoadingSettings ? (
          <Skeleton className="h-24 w-full" />
        ) : selectedSender ? (
          <>
            {/* Catalog Link Status */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      hasCatalogLinked
                        ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Link2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {hasCatalogLinked
                        ? "Catalog Linked"
                        : "No Catalog Linked"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {hasCatalogLinked
                        ? linkedCatalog?.name ||
                          commerceSettings?.linkedCatalogId
                        : "Link a catalog to enable product features"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {hasCatalogLinked ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUnlinkCatalog}
                        disabled={isUnlinking}
                      >
                        {isUnlinking ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Link2Off className="mr-2 h-4 w-4" />
                        )}
                        Unlink
                      </Button>
                      {linkedCatalog && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setCatalogToDelete(linkedCatalog)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSetupMode("link")}
                        disabled={availableCatalogs.length === 0}
                      >
                        <Link2 className="mr-2 h-4 w-4" />
                        Link Existing
                      </Button>
                      <Button size="sm" onClick={() => setSetupMode("create")}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create New
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* No catalog warning */}
              {!hasCatalogLinked && (
                <Alert variant="default" className="mt-3">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Catalog Required</AlertTitle>
                  <AlertDescription>
                    You must link a Meta catalog to this phone number before you
                    can create products or send product messages.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Commerce Settings (only show when catalog is linked) */}
            {hasCatalogLinked && (
              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span className="font-medium">Commerce Options</span>
                </div>

                <div className="space-y-3">
                  {/* Catalog Visibility */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        Catalog Visibility
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Allow customers to browse your catalog in WhatsApp
                      </p>
                    </div>
                    <Switch
                      checked={commerceSettings?.isCatalogEnabled || false}
                      onCheckedChange={(checked) =>
                        handleUpdateSettings({ isCatalogVisible: checked })
                      }
                      disabled={isUpdatingSettings}
                    />
                  </div>

                  {/* Shopping Cart */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <ShoppingCart className="h-4 w-4" />
                          Shopping Cart
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Enable cart functionality for customers
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={commerceSettings?.isCartEnabled || false}
                      onCheckedChange={(checked) =>
                        handleUpdateSettings({ isCartEnabled: checked })
                      }
                      disabled={isUpdatingSettings}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a phone number to view catalog settings
          </p>
        )}

        {/* All Meta Catalogs - Visible catalog management section */}
        {availableCatalogs.length > 0 && (
          <div className="rounded-lg border p-4 space-y-3 mt-4">
            <button
              type="button"
              className="flex items-center justify-between w-full text-left"
              onClick={() => setIsCatalogListExpanded(!isCatalogListExpanded)}
            >
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4" />
                <span className="font-medium">
                  All Meta Catalogs ({availableCatalogs.length})
                </span>
              </div>
              {isCatalogListExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {isCatalogListExpanded && (
              <div className="pt-2 space-y-2">
                {availableCatalogs.map((cat) => {
                  const isLinked = commerceSettings?.linkedCatalogId === cat.id;
                  return (
                    <div
                      key={cat.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        isLinked
                          ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                          : "bg-muted/30"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {cat.name}
                          </p>
                          {isLinked && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                              <CheckCircle className="h-3 w-3" />
                              Linked
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {cat.vertical}
                          {cat.productCount !== undefined &&
                            ` • ${cat.productCount} products`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setCatalogToDelete(cat)}
                        title={`Delete ${cat.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Create Catalog Dialog */}
      <Dialog
        open={setupMode === "create"}
        onOpenChange={(open) => !open && setSetupMode("idle")}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Meta Catalog</DialogTitle>
            <DialogDescription>
              Create a new product catalog on Meta platform. This will be
              automatically linked to the selected phone number.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="catalog-name">Catalog Name</Label>
              <Input
                id="catalog-name"
                placeholder="My WhatsApp Product Catalog"
                value={newCatalogName}
                onChange={(e) => setNewCatalogName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Commerce catalogs are automatically created for WhatsApp product
                messaging compatibility.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSetupMode("idle")}
              disabled={isLinking}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateCatalog}
              disabled={isLinking || !newCatalogName.trim()}
            >
              {isLinking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create & Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Catalog Dialog */}
      <Dialog
        open={setupMode === "link"}
        onOpenChange={(open) => !open && setSetupMode("idle")}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Meta Catalog</DialogTitle>
            <DialogDescription>
              Select an existing Meta catalog to link with{" "}
              {selectedSender?.displayName || selectedSender?.phoneNumber}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {availableCatalogs.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-muted-foreground">
                  No catalogs found in your Meta Business account.
                </p>
                <Button
                  variant="link"
                  className="mt-2"
                  onClick={() => setSetupMode("create")}
                >
                  Create a new catalog instead
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Catalog</Label>
                  <Select
                    value={selectedCatalogId}
                    onValueChange={setSelectedCatalogId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a catalog" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCatalogs.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex flex-col">
                            <span>{cat.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {cat.vertical}
                              {cat.productCount !== undefined &&
                                ` • ${cat.productCount} products`}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {businessId && (
              <p className="text-xs text-muted-foreground">
                Business ID: {businessId}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSetupMode("idle")}
              disabled={isLinking}
            >
              Cancel
            </Button>
            <Button
              onClick={handleLinkCatalog}
              disabled={isLinking || !selectedCatalogId}
            >
              {isLinking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" />
              )}
              Link Catalog
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Catalog Confirmation Dialog - Using shared component */}
      <DeleteCatalogDialog
        catalog={catalogToDelete}
        onClose={() => setCatalogToDelete(null)}
        onDeleted={handleCatalogDeleted}
        onNotification={addNotification}
      />
    </Card>
  );
}
