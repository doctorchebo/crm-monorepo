"use client";

/**
 * Labels Management Panel
 * A slide-over panel for managing labels (create, edit, delete)
 *
 * Features:
 * - Search and filter labels
 * - Create new labels via modal
 * - Edit existing labels via modal (includes color picker)
 * - Delete labels with confirmation
 * - View chats with a specific label (detail view)
 * - Select chats to add/remove labels in bulk
 *
 * Architecture:
 * - Uses LabelFormModal for both create and edit operations
 * - Separates system labels from custom labels
 * - Two-view system: list view and detail view
 */

import { ConfirmationDialog } from "@/components/dialogs/confirmation-dialog";
import { DeleteConfirmationDialog } from "@/components/dialogs/delete-confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LabelResponse } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  formatChatListTime,
  type ChatListTimeTranslations,
} from "@/lib/utils/date-formatter";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Edit2,
  Loader2,
  Minus,
  MoreVertical,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LabelColorDot } from "./label-color-picker";
import { getNextAvailableColor, MAX_LABELS } from "./label-colors";
import { LabelFormModal, type LabelFormData } from "./label-form-modal";
import { LabelSelectorModal } from "./label-selector-modal";

/**
 * Simplified chat type for display in the label detail view
 */
export interface LabelChatItem {
  chatId: string;
  contactName: string;
  contactPhone?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  avatarUrl?: string;
  labels?: Array<{
    id: string;
    name: string;
    color: string;
    emoji?: string | null;
  }>;
}

interface LabelsManagementPanelProps {
  isOpen: boolean;
  onClose: () => void;
  labels: LabelResponse[];
  isLoading: boolean;
  onCreateLabel: (name: string, color: string, emoji?: string) => Promise<void>;
  onUpdateLabel: (
    id: string,
    data: {
      name?: string;
      color?: string;
      emoji?: string | null;
      description?: string | null;
    },
  ) => Promise<void>;
  onDeleteLabel: (id: string) => Promise<void>;
  /** Chats to display when viewing a label's detail */
  chatsWithLabel?: LabelChatItem[];
  /** Loading state for chats */
  isLoadingChats?: boolean;
  /** Callback when user wants to view chats for a label */
  onViewLabelChats?: (labelId: string) => void;
  /** Callback to add labels to selected chats */
  onAddLabelsToChats?: (chatIds: string[], labelIds: string[]) => Promise<void>;
  /** Callback to remove a label from selected chats */
  onRemoveLabelFromChats?: (
    chatIds: string[],
    labelId: string,
  ) => Promise<void>;
}

// State for the label being edited
interface EditingLabel {
  id: string;
  name: string;
  color: string;
  emoji: string | null;
}

// View modes for the panel
type ViewMode = "list" | "detail";

export function LabelsManagementPanel({
  isOpen,
  onClose,
  labels,
  isLoading,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
  chatsWithLabel = [],
  isLoadingChats = false,
  onViewLabelChats,
  onAddLabelsToChats,
  onRemoveLabelFromChats,
}: LabelsManagementPanelProps) {
  const t = useTranslations("labels");
  const tc = useTranslations("common");
  const tChatList = useTranslations("chats.chatList");

  // ============================================================
  // Time formatting translations
  // ============================================================
  const timeTranslations: ChatListTimeTranslations = useMemo(
    () => ({
      now: tChatList("dates.now"),
      minutesAgo: (count: number) => tChatList("dates.minutesAgo", { count }),
      hoursAgo: (count: number) => tChatList("dates.hoursAgo", { count }),
      yesterday: tChatList("dates.yesterday"),
      daysAgo: (count: number) => tChatList("dates.daysAgo", { count }),
    }),
    [tChatList],
  );

  // ============================================================
  // View state
  // ============================================================
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [viewingLabel, setViewingLabel] = useState<LabelResponse | null>(null);

  // ============================================================
  // UI states
  // ============================================================
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingLabel, setDeletingLabel] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // ============================================================
  // Modal states
  // ============================================================
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<EditingLabel | null>(null);
  const [limitWarningOpen, setLimitWarningOpen] = useState(false);
  const [addLabelModalOpen, setAddLabelModalOpen] = useState(false);
  const [removeLabelConfirmOpen, setRemoveLabelConfirmOpen] = useState(false);

  // ============================================================
  // Chat selection state (for detail view)
  // ============================================================
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [selectedLabelsInModal, setSelectedLabelsInModal] = useState<string[]>(
    [],
  );
  // Track initial labels when modal opens to compute diff on save
  const [initialLabelsInModal, setInitialLabelsInModal] = useState<string[]>(
    [],
  );

  // Check if label limit is reached (only count non-system labels)
  const customLabelCount = useMemo(
    () => labels.filter((l) => !l.isSystem).length,
    [labels],
  );
  const isLimitReached = customLabelCount >= MAX_LABELS;

  // ============================================================
  // Reset state when panel closes
  // ============================================================
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setDeletingLabel(null);
      setCreateModalOpen(false);
      setEditModalOpen(false);
      setEditingLabel(null);
      setLimitWarningOpen(false);
      setViewMode("list");
      setViewingLabel(null);
      setSelectedChatIds([]);
      setAddLabelModalOpen(false);
      setSelectedLabelsInModal([]);
      setInitialLabelsInModal([]);
      setRemoveLabelConfirmOpen(false);
    }
  }, [isOpen]);

  // ============================================================
  // Filter labels based on search
  // ============================================================
  const filteredLabels = searchQuery
    ? labels.filter(
        (label) =>
          label.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          label.description?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : labels;

  // Separate system labels from custom labels
  const systemLabels = filteredLabels.filter((l) => l.isSystem);
  const customLabels = filteredLabels.filter((l) => !l.isSystem);

  // Get next color for new label
  const nextColor = getNextAvailableColor(labels.map((l) => l.color));

  // ============================================================
  // View mode handlers
  // ============================================================
  const handleViewLabelChats = useCallback(
    (label: LabelResponse) => {
      setViewingLabel(label);
      setViewMode("detail");
      setSelectedChatIds([]);
      onViewLabelChats?.(label.id);
    },
    [onViewLabelChats],
  );

  const handleBackToList = useCallback(() => {
    setViewMode("list");
    setViewingLabel(null);
    setSelectedChatIds([]);
  }, []);

  // ============================================================
  // Chat selection handlers
  // ============================================================
  const toggleChatSelection = useCallback((chatId: string) => {
    setSelectedChatIds((prev) =>
      prev.includes(chatId)
        ? prev.filter((id) => id !== chatId)
        : [...prev, chatId],
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedChatIds([]);
  }, []);

  const isSelectionMode = selectedChatIds.length > 0;

  // ============================================================
  // Label modal handlers
  // ============================================================
  const openCreateModal = useCallback(() => {
    if (isLimitReached) {
      setLimitWarningOpen(true);
      return;
    }
    setCreateModalOpen(true);
  }, [isLimitReached]);

  const openEditModal = useCallback((label: LabelResponse) => {
    setEditingLabel({
      id: label.id,
      name: label.name,
      color: label.color,
      emoji: label.emoji || null,
    });
    setEditModalOpen(true);
  }, []);

  const openAddLabelModal = useCallback(() => {
    // Collect all labels from selected chats
    // This ensures we show all existing labels when opening the modal
    const labelsFromSelectedChats = new Set<string>();

    selectedChatIds.forEach((chatId) => {
      const chat = chatsWithLabel.find((c) => c.chatId === chatId);
      if (chat?.labels) {
        chat.labels.forEach((label) => labelsFromSelectedChats.add(label.id));
      }
    });

    const initialLabels = Array.from(labelsFromSelectedChats);
    setInitialLabelsInModal(initialLabels);
    setSelectedLabelsInModal(initialLabels);
    setAddLabelModalOpen(true);
  }, [selectedChatIds, chatsWithLabel]);

  // ============================================================
  // Form submission handlers
  // ============================================================
  const handleCreateSubmit = useCallback(
    async (data: LabelFormData) => {
      await onCreateLabel(data.name, data.color, data.emoji || undefined);
    },
    [onCreateLabel],
  );

  const handleEditSubmit = useCallback(
    async (data: LabelFormData) => {
      if (!editingLabel) return;

      await onUpdateLabel(editingLabel.id, {
        name: data.name,
        color: data.color,
        emoji: data.emoji,
      });

      // Update viewingLabel if we edited it
      if (viewingLabel && viewingLabel.id === editingLabel.id) {
        setViewingLabel((prev) =>
          prev
            ? {
                ...prev,
                name: data.name,
                color: data.color,
                emoji: data.emoji || null,
              }
            : null,
        );
      }
    },
    [editingLabel, onUpdateLabel, viewingLabel],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingLabel) return;

    setIsSaving(true);
    try {
      await onDeleteLabel(deletingLabel.id);
      setDeletingLabel(null);

      // If we deleted the viewing label, go back to list
      if (viewingLabel && viewingLabel.id === deletingLabel.id) {
        handleBackToList();
      }
    } finally {
      setIsSaving(false);
    }
  }, [deletingLabel, onDeleteLabel, viewingLabel, handleBackToList]);

  // ============================================================
  // Bulk label actions
  // ============================================================
  /**
   * Apply label changes to selected chats.
   * Computes the diff between initial and current selection:
   * - Labels that are new (in current but not initial) -> ADD
   * - Labels that were removed (in initial but not current) -> REMOVE
   */
  const handleApplyLabelsToChats = useCallback(async () => {
    if (selectedChatIds.length === 0) return;

    // Compute labels to add (in current selection but not in initial)
    const labelsToAdd = selectedLabelsInModal.filter(
      (id) => !initialLabelsInModal.includes(id),
    );

    // Compute labels to remove (in initial but not in current selection)
    const labelsToRemove = initialLabelsInModal.filter(
      (id) => !selectedLabelsInModal.includes(id),
    );

    // If no changes, just close the modal
    if (labelsToAdd.length === 0 && labelsToRemove.length === 0) {
      setAddLabelModalOpen(false);
      setSelectedLabelsInModal([]);
      setInitialLabelsInModal([]);
      clearSelection();
      return;
    }

    setIsSaving(true);
    try {
      // Apply additions if any
      if (labelsToAdd.length > 0 && onAddLabelsToChats) {
        await onAddLabelsToChats(selectedChatIds, labelsToAdd);
      }

      // Apply removals if any - need to remove each label individually
      // since removeLabels expects one label at a time
      if (labelsToRemove.length > 0 && onRemoveLabelFromChats) {
        for (const labelId of labelsToRemove) {
          await onRemoveLabelFromChats(selectedChatIds, labelId);
        }
      }

      setAddLabelModalOpen(false);
      setSelectedLabelsInModal([]);
      setInitialLabelsInModal([]);
      clearSelection();
      // Refresh the chats for this label
      if (viewingLabel) {
        onViewLabelChats?.(viewingLabel.id);
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    selectedChatIds,
    selectedLabelsInModal,
    initialLabelsInModal,
    onAddLabelsToChats,
    onRemoveLabelFromChats,
    clearSelection,
    viewingLabel,
    onViewLabelChats,
  ]);

  /**
   * Opens the confirmation dialog for removing the current label from selected chats
   */
  const openRemoveLabelConfirmation = useCallback(() => {
    if (selectedChatIds.length === 0 || !viewingLabel) return;
    setRemoveLabelConfirmOpen(true);
  }, [selectedChatIds.length, viewingLabel]);

  /**
   * Executes the removal of the current label from selected chats
   * Called after user confirms in the confirmation dialog
   */
  const handleRemoveLabelFromChats = useCallback(async () => {
    if (selectedChatIds.length === 0 || !viewingLabel) return;

    setIsSaving(true);
    try {
      await onRemoveLabelFromChats?.(selectedChatIds, viewingLabel.id);
      setRemoveLabelConfirmOpen(false);
      clearSelection();
      // Refresh the chats for this label
      onViewLabelChats?.(viewingLabel.id);
    } finally {
      setIsSaving(false);
    }
  }, [
    selectedChatIds,
    viewingLabel,
    onRemoveLabelFromChats,
    clearSelection,
    onViewLabelChats,
  ]);

  // ============================================================
  // Render helpers
  // ============================================================

  // Label row in list view (clickable to view chats)
  const renderLabelRow = (label: LabelResponse) => (
    <div
      key={label.id}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 rounded-lg group transition-colors cursor-pointer"
      onClick={() => handleViewLabelChats(label)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          handleViewLabelChats(label);
        }
      }}
    >
      <LabelColorDot color={label.color} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {label.emoji && <span>{label.emoji}</span>}
          <span className="font-medium truncate">{label.name}</span>
          {label.isSystem && (
            <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
              {t("system")}
            </span>
          )}
        </div>
        {label.description && (
          <p className="text-xs text-muted-foreground truncate">
            {label.description}
          </p>
        )}
      </div>
      {!label.isSystem && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(label);
              }}
            >
              <Edit2 className="h-4 w-4 mr-2" />
              {tc("edit")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/50"
              onClick={(e) => {
                e.stopPropagation();
                setDeletingLabel({ id: label.id, name: label.name });
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {tc("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  // Chat row in detail view (with checkbox)
  const renderChatRow = (chat: LabelChatItem) => {
    const isSelected = selectedChatIds.includes(chat.chatId);

    // Format the time using the utility function
    const formattedTime = chat.lastMessageTime
      ? formatChatListTime(new Date(chat.lastMessageTime), timeTranslations)
      : undefined;

    return (
      <div
        key={chat.chatId}
        className={cn(
          "flex items-center gap-3 px-4 py-3 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer",
          isSelected && "bg-muted/50",
        )}
        onClick={() => toggleChatSelection(chat.chatId)}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => toggleChatSelection(chat.chatId)}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{chat.contactName}</div>
          {chat.lastMessage && (
            <p className="text-xs text-muted-foreground truncate">
              {chat.lastMessage}
            </p>
          )}
        </div>
        {formattedTime && (
          <span className="text-xs text-muted-foreground">{formattedTime}</span>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="absolute inset-0 z-10 bg-background flex flex-col">
        {viewMode === "list" ? (
          // ============================================================
          // LIST VIEW
          // ============================================================
          <>
            {/* Header */}
            <div className="p-4 border-b flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1">
                <h2 className="font-semibold flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  {t("manageLabels")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("labelsUsed", {
                    count: customLabelCount,
                    max: MAX_LABELS,
                  })}
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("searchLabels")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-9"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Create new label button */}
            <div className="p-4 border-b">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={openCreateModal}
              >
                <Plus className="h-4 w-4" />
                {t("createNewLabel")}
              </Button>
            </div>

            {/* Labels list */}
            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLabels.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                  <Tag className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
                  <p className="text-muted-foreground">
                    {searchQuery ? t("noLabelsFound") : t("noLabelsYet")}
                  </p>
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {/* Custom labels */}
                  {customLabels.length > 0 && (
                    <div className="space-y-1">
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 mb-2">
                        {t("customLabels")}
                      </h3>
                      {customLabels.map(renderLabelRow)}
                    </div>
                  )}

                  {/* System labels */}
                  {systemLabels.length > 0 && (
                    <div className="space-y-1">
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 mb-2">
                        {t("systemLabels")}
                      </h3>
                      {systemLabels.map(renderLabelRow)}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          // ============================================================
          // DETAIL VIEW (Chats with label)
          // ============================================================
          <>
            {/* Header - changes based on selection mode */}
            {isSelectionMode ? (
              // Selection mode header
              <div className="p-4 border-b flex items-center gap-3 bg-primary text-primary-foreground">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearSelection}
                  className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                >
                  <X className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                  <span className="font-medium">
                    {t("selected", { count: selectedChatIds.length })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Add label button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={openAddLabelModal}
                    className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                    title={t("addLabel")}
                  >
                    <Tag className="h-4 w-4" />
                  </Button>
                  {/* Remove label button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={openRemoveLabelConfirmation}
                    disabled={isSaving}
                    className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                    title={t("removeLabelFromChats")}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <div className="relative">
                        <Tag className="h-4 w-4" />
                        <Minus className="h-2.5 w-2.5 absolute -bottom-0.5 -right-0.5 stroke-[3]" />
                      </div>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              // Normal header
              <div className="p-4 border-b flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBackToList}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 flex items-center gap-2">
                  {viewingLabel && (
                    <>
                      <LabelColorDot color={viewingLabel.color} size="md" />
                      {viewingLabel.emoji && <span>{viewingLabel.emoji}</span>}
                      <span className="font-semibold truncate">
                        {viewingLabel.name}
                      </span>
                    </>
                  )}
                </div>
                {viewingLabel && !viewingLabel.isSystem && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => openEditModal(viewingLabel)}
                      >
                        <Edit2 className="h-4 w-4 mr-2" />
                        {tc("edit")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/50"
                        onClick={() =>
                          setDeletingLabel({
                            id: viewingLabel.id,
                            name: viewingLabel.name,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {tc("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}

            {/* Chats list */}
            <ScrollArea className="flex-1">
              {isLoadingChats ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : chatsWithLabel.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                  <Tag className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
                  <p className="text-muted-foreground">
                    {t("noChatsWithLabel")}
                  </p>
                </div>
              ) : (
                <div className="p-4 space-y-1">
                  {chatsWithLabel.map(renderChatRow)}
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </div>

      {/* Create Label Modal */}
      <LabelFormModal
        mode="create"
        open={createModalOpen}
        onOpenChange={(open: boolean) => {
          setCreateModalOpen(open);
        }}
        defaultColor={nextColor}
        onSubmit={handleCreateSubmit}
      />

      {/* Edit Label Modal */}
      {editingLabel && (
        <LabelFormModal
          mode="edit"
          open={editModalOpen}
          onOpenChange={(open: boolean) => {
            setEditModalOpen(open);
            if (!open) setEditingLabel(null);
          }}
          initialData={{
            name: editingLabel.name,
            color: editingLabel.color,
            emoji: editingLabel.emoji,
          }}
          onSubmit={handleEditSubmit}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationDialog
        isOpen={!!deletingLabel}
        title={t("deleteConfirmation")}
        description={t("deleteWarning")}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingLabel(null)}
        isLoading={isSaving}
      />

      {/* Label Limit Warning Modal */}
      <Dialog open={limitWarningOpen} onOpenChange={setLimitWarningOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <DialogTitle>{t("maxLabelsReached")}</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              {t("maxLabelsReachedDescription", { max: MAX_LABELS })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setLimitWarningOpen(false)}>
              {tc("ok")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Label to Selected Chats Modal */}
      <LabelSelectorModal
        open={addLabelModalOpen}
        onOpenChange={setAddLabelModalOpen}
        labels={labels}
        selectedLabelIds={selectedLabelsInModal}
        onSelectionChange={setSelectedLabelsInModal}
        onConfirm={handleApplyLabelsToChats}
        title={t("addLabel")}
        description={t("selectLabels")}
      />

      {/* Remove Label Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={removeLabelConfirmOpen}
        onOpenChange={setRemoveLabelConfirmOpen}
        title={t("removeLabelConfirmTitle")}
        description={t("removeLabelConfirmDescription", {
          count: selectedChatIds.length,
          label: viewingLabel?.name || "",
        })}
        onConfirm={handleRemoveLabelFromChats}
        isLoading={isSaving}
        confirmText={tc("remove")}
        confirmVariant="destructive"
        icon={
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
        }
      />
    </>
  );
}
