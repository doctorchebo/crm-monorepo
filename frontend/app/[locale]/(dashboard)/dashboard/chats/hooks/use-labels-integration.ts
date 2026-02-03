/**
 * Labels Integration Hook
 * Manages all label-related state and actions for the chats page
 * Centralizes label filtering, selection, and management
 *
 * Flow for labeling chats:
 * 1. User clicks "Label" on a chat menu
 * 2. Enters selection mode with that chat pre-selected
 * 3. User can select additional chats
 * 4. User clicks "Label" on the selection banner
 * 5. Modal opens to select labels
 * 6. Labels are applied to all selected chats
 *
 * Flow for label detail view:
 * 1. User opens management panel and clicks a label
 * 2. Shows chats with that label with selection checkboxes
 * 3. User can select chats and add/remove labels
 */

import type { LabelChatItem } from "@/components/labels";
import {
  useChatLabelActions,
  useLabelActions,
  useLabels,
} from "@/hooks/use-labels";
import type { LabelResponse } from "@/lib/api/endpoints";
import { useCallback, useMemo, useState } from "react";
import { mutate } from "swr";

/**
 * Base type for a chat with labels - any chat type must at least have these fields
 * Uses the same property names as the Chat type from chats/types.ts
 */
interface ChatWithLabels {
  chatId: string;
  /** Contact's display name */
  participantName?: string;
  /** Contact's phone number */
  participantPhone: string;
  lastMessage?: string | null;
  lastMessageTime?: string | null;
  senderId?: number;
  labels?: Array<{
    id: string;
    name: string;
    color: string;
    emoji?: string | null;
  }>;
}

interface UseLabelsIntegrationProps<T extends ChatWithLabels> {
  /** Current chats to filter */
  chats: T[];
  /** Currently selected chat ID */
  selectedChatId: string | null;
  /** Callback when chats need to be refetched (after label changes) */
  onChatsRefetch?: () => void;
}

interface UseLabelsIntegrationReturn<T extends ChatWithLabels> {
  // Labels data
  labels: LabelResponse[];
  isLoadingLabels: boolean;

  // Filter state
  selectedLabelFilter: string | null;
  setSelectedLabelFilter: (labelId: string | null) => void;
  filteredChats: T[];

  // Label selector modal state
  labelModalOpen: boolean;
  labelModalChatIds: string[];
  openLabelModal: () => void;
  closeLabelModal: () => void;

  // Selected labels in modal
  selectedLabelsInModal: string[];

  // Label actions
  handleLabelSelectionChange: (labelIds: string[]) => void;
  handleApplyLabels: () => Promise<void>;
  isApplyingLabels: boolean;

  // Label CRUD (for inline creation in modal)
  handleCreateLabel: (
    name: string,
    color: string,
    emoji?: string,
  ) => Promise<LabelResponse | null>;

  // Management panel state
  managementPanelOpen: boolean;
  openManagementPanel: () => void;
  closeManagementPanel: () => void;
  handleUpdateLabel: (
    id: string,
    data: {
      name?: string;
      color?: string;
      emoji?: string | null;
      description?: string | null;
    },
  ) => Promise<void>;
  handleDeleteLabel: (id: string) => Promise<void>;

  // Selection mode (enter via "Label chat" menu action)
  selectionMode: boolean;
  selectedChatIds: string[];
  enterSelectionMode: (initialChatId: string) => void;
  exitSelectionMode: () => void;
  toggleChatSelection: (chatId: string) => void;
  selectAllChats: () => void;
  clearChatSelection: () => void;

  // Label detail view (chats with a specific label)
  chatsWithViewingLabel: LabelChatItem[];
  isLoadingChatsWithLabel: boolean;
  handleViewLabelChats: (labelId: string) => void;
  handleAddLabelsToChats: (
    chatIds: string[],
    labelIds: string[],
  ) => Promise<void>;
  handleRemoveLabelFromChats: (
    chatIds: string[],
    labelId: string,
  ) => Promise<void>;
}

export function useLabelsIntegration<T extends ChatWithLabels>({
  chats,
  selectedChatId,
  onChatsRefetch,
}: UseLabelsIntegrationProps<T>): UseLabelsIntegrationReturn<T> {
  // ============================================================
  // Core hooks for labels data and actions
  // ============================================================

  const {
    labels,
    isLoading: isLoadingLabels,
    revalidate: revalidateLabels,
  } = useLabels();

  const { createLabel, updateLabel, deleteLabel } = useLabelActions();

  const {
    applyLabels,
    removeLabels,
    isLoading: isApplyingLabels,
  } = useChatLabelActions();

  // ============================================================
  // Filter state - for filtering chat list by label
  // ============================================================

  const [selectedLabelFilter, setSelectedLabelFilter] = useState<string | null>(
    null,
  );

  const filteredChats = useMemo(() => {
    if (!selectedLabelFilter) return chats;
    return chats.filter((chat) =>
      chat.labels?.some((label) => label.id === selectedLabelFilter),
    );
  }, [chats, selectedLabelFilter]);

  // ============================================================
  // Selection mode state - for selecting chats to label
  // ============================================================

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);

  // ============================================================
  // Label modal state
  // ============================================================

  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelModalChatIds, setLabelModalChatIds] = useState<string[]>([]);
  const [selectedLabelsInModal, setSelectedLabelsInModal] = useState<string[]>(
    [],
  );

  // ============================================================
  // Management panel state
  // ============================================================

  const [managementPanelOpen, setManagementPanelOpen] = useState(false);

  // ============================================================
  // Label detail view state - for viewing chats with a specific label
  // ============================================================

  const [viewingLabelId, setViewingLabelId] = useState<string | null>(null);
  const [isLoadingChatsWithLabel, setIsLoadingChatsWithLabel] = useState(false);

  /**
   * Get chats that have the currently viewing label
   * Transforms them into LabelChatItem format for the management panel
   */
  const chatsWithViewingLabel = useMemo((): LabelChatItem[] => {
    if (!viewingLabelId) return [];
    return chats
      .filter((chat) =>
        chat.labels?.some((label) => label.id === viewingLabelId),
      )
      .map((chat) => ({
        chatId: chat.chatId,
        contactName: chat.participantName || chat.participantPhone || "Unknown",
        contactPhone: chat.participantPhone,
        lastMessage: chat.lastMessage ?? undefined,
        lastMessageTime: chat.lastMessageTime ?? undefined,
        labels: chat.labels,
      }));
  }, [chats, viewingLabelId]);

  // ============================================================
  // Selection mode handlers
  // ============================================================

  /**
   * Enter selection mode with an initial chat pre-selected
   * Called when user clicks "Label" on a chat menu
   */
  const enterSelectionMode = useCallback((initialChatId: string) => {
    setSelectionMode(true);
    setSelectedChatIds([initialChatId]);
  }, []);

  /**
   * Exit selection mode and clear selections
   */
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedChatIds([]);
  }, []);

  /**
   * Toggle a chat's selection state
   */
  const toggleChatSelection = useCallback((chatId: string) => {
    setSelectedChatIds((prev) =>
      prev.includes(chatId)
        ? prev.filter((id) => id !== chatId)
        : [...prev, chatId],
    );
  }, []);

  /**
   * Select all visible chats
   */
  const selectAllChats = useCallback(() => {
    setSelectedChatIds(filteredChats.map((c) => c.chatId));
  }, [filteredChats]);

  /**
   * Clear all chat selections
   */
  const clearChatSelection = useCallback(() => {
    setSelectedChatIds([]);
  }, []);

  // ============================================================
  // Modal handlers
  // ============================================================

  /**
   * Open the label modal for the currently selected chats
   * Called when user clicks "Label" on the selection banner
   */
  const openLabelModal = useCallback(() => {
    if (selectedChatIds.length === 0) return;

    setLabelModalChatIds([...selectedChatIds]);
    setSelectedLabelsInModal([]); // Start fresh
    setLabelModalOpen(true);
  }, [selectedChatIds]);

  /**
   * Close modal and reset modal state
   */
  const closeLabelModal = useCallback(() => {
    setLabelModalOpen(false);
    setLabelModalChatIds([]);
    setSelectedLabelsInModal([]);
  }, []);

  // ============================================================
  // Label selection handlers
  // ============================================================

  const handleLabelSelectionChange = useCallback((labelIds: string[]) => {
    setSelectedLabelsInModal(labelIds);
  }, []);

  /**
   * Apply selected labels to all selected chats (additive)
   */
  const handleApplyLabels = useCallback(async () => {
    if (labelModalChatIds.length === 0 || selectedLabelsInModal.length === 0) {
      return;
    }

    try {
      await applyLabels(labelModalChatIds, selectedLabelsInModal);

      // Revalidate all affected chats
      labelModalChatIds.forEach((chatId) => {
        mutate(`/labels/chat/${chatId}`);
      });

      // Refresh chat list to show updated labels
      onChatsRefetch?.();

      // Close modal and exit selection mode
      closeLabelModal();
      exitSelectionMode();
    } catch (error) {
      console.error("Failed to apply labels:", error);
      throw error;
    }
  }, [
    labelModalChatIds,
    selectedLabelsInModal,
    applyLabels,
    onChatsRefetch,
    closeLabelModal,
    exitSelectionMode,
  ]);

  // ============================================================
  // Label CRUD handlers
  // ============================================================

  const handleCreateLabel = useCallback(
    async (
      name: string,
      color: string,
      emoji?: string,
    ): Promise<LabelResponse | null> => {
      const result = await createLabel({ name, color, emoji });
      if (result) {
        await revalidateLabels();
        // Auto-select the newly created label in the modal
        setSelectedLabelsInModal((prev) => [...prev, result.id]);
      }
      return result;
    },
    [createLabel, revalidateLabels],
  );

  const openManagementPanel = useCallback(
    () => setManagementPanelOpen(true),
    [],
  );

  const closeManagementPanel = useCallback(
    () => setManagementPanelOpen(false),
    [],
  );

  const handleUpdateLabel = useCallback(
    async (
      id: string,
      data: {
        name?: string;
        color?: string;
        emoji?: string | null;
        description?: string | null;
      },
    ) => {
      // Build update data, preserving explicit null values for emoji/description
      // to allow clearing these fields (null = clear, undefined = don't update)
      const updateData: {
        name?: string;
        color?: string;
        emoji?: string | null;
        description?: string | null;
      } = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.color !== undefined) updateData.color = data.color;
      // Preserve null to explicitly clear emoji, only omit if undefined
      if (data.emoji !== undefined) updateData.emoji = data.emoji;
      if (data.description !== undefined)
        updateData.description = data.description;

      await updateLabel(id, updateData);
      await revalidateLabels();
      onChatsRefetch?.();
    },
    [updateLabel, revalidateLabels, onChatsRefetch],
  );

  const handleDeleteLabel = useCallback(
    async (id: string) => {
      await deleteLabel(id);
      await revalidateLabels();
      if (selectedLabelFilter === id) {
        setSelectedLabelFilter(null);
      }
      // Reset viewing label if we just deleted it
      if (viewingLabelId === id) {
        setViewingLabelId(null);
      }
      onChatsRefetch?.();
    },
    [
      deleteLabel,
      revalidateLabels,
      selectedLabelFilter,
      viewingLabelId,
      onChatsRefetch,
    ],
  );

  // ============================================================
  // Label detail view handlers
  // ============================================================

  /**
   * Called when user clicks a label to view its chats
   */
  const handleViewLabelChats = useCallback((labelId: string) => {
    setViewingLabelId(labelId);
    // Chats are filtered from the existing chats array via memo
    // so no API call is needed - just show loading briefly for UX
    setIsLoadingChatsWithLabel(true);
    setTimeout(() => setIsLoadingChatsWithLabel(false), 200);
  }, []);

  /**
   * Add multiple labels to selected chats (from detail view)
   */
  const handleAddLabelsToChats = useCallback(
    async (chatIds: string[], labelIds: string[]) => {
      if (chatIds.length === 0 || labelIds.length === 0) return;

      try {
        await applyLabels(chatIds, labelIds);

        // Revalidate affected chats
        chatIds.forEach((chatId) => {
          mutate(`/labels/chat/${chatId}`);
        });

        // Refresh chat list
        onChatsRefetch?.();
      } catch (error) {
        console.error("Failed to add labels to chats:", error);
        throw error;
      }
    },
    [applyLabels, onChatsRefetch],
  );

  /**
   * Remove a label from selected chats (from detail view)
   */
  const handleRemoveLabelFromChats = useCallback(
    async (chatIds: string[], labelId: string) => {
      if (chatIds.length === 0) return;

      try {
        await removeLabels(chatIds, [labelId]);

        // Revalidate affected chats
        chatIds.forEach((chatId) => {
          mutate(`/labels/chat/${chatId}`);
        });

        // Refresh chat list
        onChatsRefetch?.();
      } catch (error) {
        console.error("Failed to remove label from chats:", error);
        throw error;
      }
    },
    [removeLabels, onChatsRefetch],
  );

  // ============================================================
  // Return interface
  // ============================================================

  return {
    // Labels data
    labels,
    isLoadingLabels,

    // Filter state
    selectedLabelFilter,
    setSelectedLabelFilter,
    filteredChats,

    // Selection mode
    selectionMode,
    selectedChatIds,
    enterSelectionMode,
    exitSelectionMode,
    toggleChatSelection,
    selectAllChats,
    clearChatSelection,

    // Label modal
    labelModalOpen,
    labelModalChatIds,
    openLabelModal,
    closeLabelModal,

    // Selected labels in modal
    selectedLabelsInModal,

    // Label actions
    handleLabelSelectionChange,
    handleApplyLabels,
    isApplyingLabels,

    // Label CRUD
    handleCreateLabel,

    // Management panel
    managementPanelOpen,
    openManagementPanel,
    closeManagementPanel,
    handleUpdateLabel,
    handleDeleteLabel,

    // Label detail view
    chatsWithViewingLabel,
    isLoadingChatsWithLabel,
    handleViewLabelChats,
    handleAddLabelsToChats,
    handleRemoveLabelFromChats,
  };
}
