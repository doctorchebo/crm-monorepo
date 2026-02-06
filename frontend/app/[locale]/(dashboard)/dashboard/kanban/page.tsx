"use client";

import { AddStageDivider } from "@/components/kanban/add-stage-button";
import { CreateStageModal } from "@/components/kanban/create-stage-modal";
import { ActivityHistorySheet } from "@/components/ui/activity-history-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/user-avatar";
import { useNotification } from "@/hooks/use-notification";
import type { ChatStageAssignment, WorkflowStage } from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Bot,
  Check,
  Clock,
  GripVertical,
  History,
  MessageSquare,
  Pause,
  Pencil,
  RefreshCw,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const MIN_STAGES_COUNT = 3;

type EditableStage = WorkflowStage & {
  isEditing?: boolean;
  editName?: string;
};

function formatRelativeTime(
  time: string | null | undefined,
): { key: string; count: number } | null {
  if (!time) return null;
  const date = new Date(time);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 60) return { key: "minutesAgo", count: minutes };
  if (hours < 24) return { key: "hoursAgo", count: hours };
  return { key: "daysAgo", count: days };
}

type TranslationTimeResult = {
  key: "daysInStage" | "hoursInStage" | "justEntered";
  count: number;
};

function formatStageDuration(
  assignedAt: string | null | undefined,
): TranslationTimeResult | null {
  if (!assignedAt) return null;
  const date = new Date(assignedAt);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return { key: "daysInStage", count: days };
  if (hours > 0) return { key: "hoursInStage", count: hours };
  return { key: "justEntered", count: 0 };
}

function KanbanCardComponent({
  card,
  onDragStart,
  onDragEnd,
  onClick,
  t,
}: {
  card: ChatStageAssignment;
  onDragStart: (
    e: React.DragEvent<HTMLDivElement>,
    chatId: string,
    fromStageId: string,
  ) => void;
  onDragEnd: () => void;
  onClick: (chatId: string) => void;
  t: ReturnType<typeof useTranslations<"kanban">>;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card.chatId, card.stageId || "")}
      onDragEnd={onDragEnd}
      onClick={() => onClick(card.chatId)}
      className="group p-3 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer active:opacity-50 select-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {card.participantName || card.participantPhone || card.chatId}
          </p>
          {card.participantPhone && card.participantName && (
            <p className="text-xs text-muted-foreground truncate">
              {card.participantPhone}
            </p>
          )}
          {card.lastMessage && (
            <p className="text-xs text-muted-foreground truncate mt-1">
              {card.lastMessage}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {card.unreadCount && card.unreadCount > 0 && (
            <Badge variant="destructive" className="h-5 px-1.5 text-xs">
              {card.unreadCount}
            </Badge>
          )}
          {card.assignedToId && (
            <UserAvatar
              name={card.assignedToName}
              profilePictureUrl={card.assignedToProfilePictureUrl}
              size="xs"
            />
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {card.awaitingHandoff && (
          <Badge
            variant="outline"
            className="text-xs bg-orange-50 text-orange-700 border-orange-200"
          >
            <Users className="h-3 w-3 mr-1" />
            {t("cardHandoff")}
          </Badge>
        )}
        {(card.aiPaused || card.aiOverrideEnabled === false) && (
          <Badge
            variant="outline"
            className="text-xs bg-red-50 text-red-700 border-red-200"
          >
            <Pause className="h-3 w-3 mr-1" />
            {card.aiOverrideEnabled === false
              ? t("cardAiDisabled")
              : t("cardAiPaused")}
          </Badge>
        )}
        {!card.aiPaused &&
          card.aiOverrideEnabled !== false &&
          !card.awaitingHandoff && (
            <Badge
              variant="outline"
              className="text-xs bg-green-50 text-green-700 border-green-200"
            >
              <Bot className="h-3 w-3 mr-1" />
              {t("cardAiActive")}
            </Badge>
          )}
        {card.lastMessageTime &&
          (() => {
            const relTime = formatRelativeTime(card.lastMessageTime);
            return relTime ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {t(relTime.key as "minutesAgo" | "hoursAgo" | "daysAgo", {
                  count: relTime.count,
                })}
              </span>
            ) : null;
          })()}
      </div>
      {(() => {
        const stageDuration = formatStageDuration(card.assignedAt);
        if (!stageDuration) return null;
        return (
          <div className="mt-2 pt-2 border-t">
            <span className="text-xs text-muted-foreground">
              {t(stageDuration.key, { count: stageDuration.count })}
            </span>
          </div>
        );
      })()}
    </div>
  );
}

function KanbanColumnComponent({
  stage,
  cards,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onDragEnter,
  onDragLeave,
  onCardClick,
  isDragOver,
  editMode,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onEditNameChange,
  canDelete,
  onStageDragStart,
  onStageDragOver,
  onStageDrop,
  isStageDragging,
  onSetDefault,
  t,
}: {
  stage: EditableStage;
  cards: ChatStageAssignment[];
  onDragStart: (
    e: React.DragEvent<HTMLDivElement>,
    chatId: string,
    fromStageId: string,
  ) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, stageId: string) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onCardClick: (chatId: string) => void;
  isDragOver: boolean;
  editMode: boolean;
  onStartEdit: (stageId: string) => void;
  onCancelEdit: (stageId: string) => void;
  onSaveEdit: (stageId: string) => void;
  onDelete: (stageId: string) => void;
  onEditNameChange: (stageId: string, name: string) => void;
  canDelete: boolean;
  onStageDragStart: (
    e: React.DragEvent<HTMLDivElement>,
    stageId: string,
  ) => void;
  onStageDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onStageDrop: (e: React.DragEvent<HTMLDivElement>, stageId: string) => void;
  isStageDragging: boolean;
  onSetDefault: (stageId: string) => void;
  t: ReturnType<typeof useTranslations<"kanban">>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (stage.isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [stage.isEditing]);

  return (
    <div
      className={`flex-shrink-0 w-80 flex flex-col transition-opacity ${
        isStageDragging ? "opacity-50" : ""
      }`}
      draggable={editMode}
      onDragStart={(e) => {
        if (editMode) {
          e.stopPropagation();
          onStageDragStart(e, stage.id);
        }
      }}
      onDragOver={(e) => {
        if (editMode) {
          e.preventDefault();
          onStageDragOver(e);
        }
      }}
      onDrop={(e) => {
        if (editMode) {
          e.stopPropagation();
          onStageDrop(e, stage.id);
        }
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        {editMode && (
          <div className="cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        {stage.isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: stage.color }}
            />
            <Input
              ref={inputRef}
              value={stage.editName ?? stage.name}
              onChange={(e) => onEditNameChange(stage.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit(stage.id);
                if (e.key === "Escape") onCancelEdit(stage.id);
              }}
              className="h-7 text-sm"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onSaveEdit(stage.id)}
            >
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onCancelEdit(stage.id)}
            >
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: stage.color }}
              />
              <h2 className="font-semibold text-sm truncate">{stage.name}</h2>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="secondary" className="text-xs">
                {cards.length}
              </Badge>
              {editMode && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onStartEdit(stage.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onDelete(stage.id)}
                    disabled={!canDelete}
                    title={
                      canDelete
                        ? t("deleteStage")
                        : t("cannotDeleteMinStages", {
                            minStages: MIN_STAGES_COUNT,
                          })
                    }
                  >
                    <Trash2
                      className={`h-3.5 w-3.5 ${
                        canDelete
                          ? "text-destructive"
                          : "text-muted-foreground opacity-50"
                      }`}
                    />
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
      {stage.description && !editMode && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
          {stage.description}
        </p>
      )}
      {!editMode && (
        <div className="mb-3 flex gap-1.5 flex-wrap">
          {stage.isDefault && (
            <Badge
              variant="outline"
              className="text-xs bg-primary/10 text-primary border-primary/30"
            >
              <Star className="h-3 w-3 mr-1 fill-primary" />
              {t("defaultBadge")}
            </Badge>
          )}
          {stage.isFinal && (
            <Badge variant="outline" className="text-xs">
              {t("finalBadge")}
            </Badge>
          )}
          {stage.aiAutoReply && (
            <Badge
              variant="outline"
              className="text-xs bg-green-50 text-green-700 border-green-200"
            >
              {t("aiReplyBadge")}
            </Badge>
          )}
          {stage.aiHandoffRequired && (
            <Badge
              variant="outline"
              className="text-xs bg-orange-50 text-orange-700 border-orange-200"
            >
              {t("handoffBadge")}
            </Badge>
          )}
        </div>
      )}
      {editMode && (
        <div className="mb-3 flex gap-1.5 flex-wrap">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs cursor-pointer transition-all",
                    stage.isDefault
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "hover:bg-primary/5 hover:border-primary/20",
                  )}
                  onClick={() => !stage.isDefault && onSetDefault(stage.id)}
                >
                  <Star
                    className={cn(
                      "h-3 w-3 mr-1",
                      stage.isDefault ? "fill-primary" : "",
                    )}
                  />
                  {stage.isDefault ? t("defaultBadge") : t("setAsDefault")}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {stage.isDefault ? t("isDefaultStage") : t("clickToSetDefault")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      <div
        onDragOver={editMode ? undefined : onDragOver}
        onDrop={editMode ? undefined : (e) => onDrop(e, stage.id)}
        onDragEnter={editMode ? undefined : onDragEnter}
        onDragLeave={editMode ? undefined : onDragLeave}
        className={`flex-1 rounded-lg p-3 space-y-3 min-h-[400px] transition-colors ${
          isDragOver
            ? "bg-primary/10 border-2 border-dashed border-primary"
            : "bg-muted/20"
        }`}
      >
        {cards.length > 0 ? (
          cards.map((card) => (
            <KanbanCardComponent
              key={card.chatId}
              card={card}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onClick={onCardClick}
              t={t}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground">{t("noChatsYet")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const t = useTranslations("kanban");
  const router = useRouter();
  const { addNotification } = useNotification();

  const [stages, setStages] = useState<EditableStage[]>([]);
  const [chatsByStage, setChatsByStage] = useState<
    Map<string, ChatStageAssignment[]>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [stageToDelete, setStageToDelete] = useState<EditableStage | null>(
    null,
  );
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [draggedChat, setDraggedChat] = useState<{
    chatId: string;
    fromStageId: string;
  } | null>(null);

  // Ref to track dragged chat immediately (state updates are async)
  const draggedChatRef = useRef<{
    chatId: string;
    fromStageId: string;
  } | null>(null);

  // Create stage modal state
  const [createStageModalOpen, setCreateStageModalOpen] = useState(false);
  const [createStagePosition, setCreateStagePosition] = useState(0);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [showActivity, setShowActivity] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const stagesData = await backendApi.stages.getStages();
      setStages(stagesData.sort((a, b) => a.sortOrder - b.sortOrder));
      const chatsMap = new Map<string, ChatStageAssignment[]>();
      await Promise.all(
        stagesData.map(async (stage) => {
          try {
            const chats = await backendApi.stages.getChatsByStage(stage.id, 50);
            chatsMap.set(stage.id, chats);
          } catch {
            chatsMap.set(stage.id, []);
          }
        }),
      );
      setChatsByStage(chatsMap);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load data";
      setError(message);
      addNotification(t("loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    chatId: string,
    fromStageId: string,
  ) => {
    if (editMode) return;
    const dragData = { chatId, fromStageId };
    draggedChatRef.current = dragData;
    setDraggedChat(dragData);
    e.dataTransfer.effectAllowed = "move";
    // Store data in dataTransfer as backup
    e.dataTransfer.setData("application/json", JSON.stringify(dragData));
  };

  const handleDragEnd = () => {
    // Clean up drag state when drag operation ends (cancelled or completed)
    draggedChatRef.current = null;
    setDraggedChat(null);
    setDragOverStageId(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (
    e: React.DragEvent<HTMLDivElement>,
    toStageId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling to parent drop zones
    setDragOverStageId(null);

    if (editMode) return;

    // Use ref for immediate access (state updates are async and may be stale)
    const dragData = draggedChatRef.current;

    // If ref is null, try to get data from dataTransfer as fallback
    let chatId: string;
    let fromStageId: string;

    if (dragData) {
      chatId = dragData.chatId;
      fromStageId = dragData.fromStageId;
    } else {
      // Try to recover from dataTransfer
      try {
        const transferData = e.dataTransfer.getData("application/json");
        if (!transferData) return;
        const parsed = JSON.parse(transferData);
        chatId = parsed.chatId;
        fromStageId = parsed.fromStageId;
        if (!chatId || !fromStageId) return;
      } catch {
        return;
      }
    }

    // Clear ref and state immediately to prevent double processing
    draggedChatRef.current = null;
    setDraggedChat(null);

    // Don't do anything if dropping on the same stage
    if (fromStageId === toStageId) {
      return;
    }

    // Use functional update to ensure we're working with latest state
    setChatsByStage((currentChatsMap) => {
      const originalFromChats = currentChatsMap.get(fromStageId) || [];
      const originalToChats = currentChatsMap.get(toStageId) || [];

      // Find the chat to move
      const chatIndex = originalFromChats.findIndex(
        (chat) => chat.chatId === chatId,
      );
      if (chatIndex === -1) {
        // Chat not found, return current state unchanged
        return currentChatsMap;
      }

      // Get the chat being moved
      const chatToMove = originalFromChats[chatIndex];

      // Create NEW arrays (immutable update pattern)
      const newFromChats = [
        ...originalFromChats.slice(0, chatIndex),
        ...originalFromChats.slice(chatIndex + 1),
      ];
      const newToChats = [
        ...originalToChats,
        { ...chatToMove, stageId: toStageId },
      ];

      // Create a new Map with the updated arrays
      const newChatsMap = new Map(currentChatsMap);
      newChatsMap.set(fromStageId, newFromChats);
      newChatsMap.set(toStageId, newToChats);

      return newChatsMap;
    });

    // Call API to persist the change
    try {
      const toStage = stages.find((s) => s.id === toStageId);
      const stageName = toStage?.name ?? "stage";
      await backendApi.stages.transitionChat({
        chatId,
        toStageId,
        reason: t("chatMovedReason", { stageName }),
      });
      addNotification(t("chatMoved", { stageName }), "success");
    } catch {
      addNotification(t("chatMoveFailed"), "error");
      // Reload data to restore correct state on failure
      loadData();
    }
  };

  const handleCardClick = (chatId: string) => {
    if (!editMode) router.push(`/dashboard/chats?selectedChatId=${chatId}`);
  };

  const handleStartEdit = (stageId: string) => {
    setStages((prev) =>
      prev.map((s) =>
        s.id === stageId ? { ...s, isEditing: true, editName: s.name } : s,
      ),
    );
  };
  const handleCancelEdit = (stageId: string) => {
    setStages((prev) =>
      prev.map((s) =>
        s.id === stageId ? { ...s, isEditing: false, editName: undefined } : s,
      ),
    );
  };
  const handleEditNameChange = (stageId: string, name: string) => {
    setStages((prev) =>
      prev.map((s) => (s.id === stageId ? { ...s, editName: name } : s)),
    );
  };
  const handleSaveEdit = async (stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage || !stage.editName || stage.editName.trim() === "") {
      handleCancelEdit(stageId);
      return;
    }
    const newName = stage.editName.trim();
    if (newName === stage.name) {
      handleCancelEdit(stageId);
      return;
    }
    try {
      await backendApi.stages.updateStage(stageId, { name: newName });
      setStages((prev) =>
        prev.map((s) =>
          s.id === stageId
            ? { ...s, name: newName, isEditing: false, editName: undefined }
            : s,
        ),
      );
      addNotification(t("stageRenamed", { name: newName }), "success");
    } catch {
      addNotification(t("stageRenameFailed"), "error");
      handleCancelEdit(stageId);
    }
  };
  const handleDeleteStage = async () => {
    if (!stageToDelete) return;
    try {
      await backendApi.stages.deleteStage(stageToDelete.id);
      setStages((prev) => prev.filter((s) => s.id !== stageToDelete.id));
      setChatsByStage((prev) => {
        const newMap = new Map(prev);
        newMap.delete(stageToDelete.id);
        return newMap;
      });
      addNotification(
        t("stageDeleted", { name: stageToDelete.name }),
        "success",
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("stageDeleteFailed");
      addNotification(message, "error");
    } finally {
      setStageToDelete(null);
    }
  };

  const handleStageDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    stageId: string,
  ) => {
    setDraggedStageId(stageId);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleStageDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };
  const handleStageDrop = async (
    e: React.DragEvent<HTMLDivElement>,
    targetStageId: string,
  ) => {
    e.preventDefault();
    if (!draggedStageId || draggedStageId === targetStageId) {
      setDraggedStageId(null);
      return;
    }
    const draggedIndex = stages.findIndex((s) => s.id === draggedStageId);
    const targetIndex = stages.findIndex((s) => s.id === targetStageId);
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedStageId(null);
      return;
    }
    const newStages = [...stages];
    const [removed] = newStages.splice(draggedIndex, 1);
    newStages.splice(targetIndex, 0, removed);
    const updatedStages = newStages.map((s, idx) => ({ ...s, sortOrder: idx }));
    setStages(updatedStages);
    setDraggedStageId(null);
    try {
      await Promise.all(
        updatedStages.map((s) =>
          backendApi.stages.updateStage(s.id, { sortOrder: s.sortOrder }),
        ),
      );
      addNotification(t("stageOrderUpdated"), "success");
    } catch {
      addNotification(t("stageOrderFailed"), "error");
      loadData();
    }
  };

  const handleInitializeDefaults = async () => {
    try {
      await backendApi.stages.initializeDefaults();
      addNotification(t("defaultStagesCreated"), "success");
      loadData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("initializeFailed");
      addNotification(message, "error");
    }
  };

  // Open create stage modal at a specific position
  const handleOpenCreateStageModal = useCallback((position: number) => {
    setCreateStagePosition(position);
    setCreateStageModalOpen(true);
  }, []);

  // Handle stage created - add to stages list and refresh sort orders
  const handleStageCreated = useCallback(
    async (newStage: WorkflowStage) => {
      // Reload data to get correct sort orders
      await loadData();
    },
    [loadData],
  );

  // Set a stage as default
  const handleSetDefault = useCallback(
    async (stageId: string) => {
      const stage = stages.find((s) => s.id === stageId);
      if (!stage || stage.isDefault) return;

      try {
        await backendApi.stages.updateStage(stageId, { isDefault: true });
        // Update local state - unset previous default, set new one
        setStages((prev) =>
          prev.map((s) => ({
            ...s,
            isDefault: s.id === stageId,
          })),
        );
        addNotification(
          t("defaultStageChanged", { name: stage.name }),
          "success",
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("defaultStageChangeFailed");
        addNotification(message, "error");
      }
    },
    [stages, addNotification, t],
  );

  // Get the default stage name for the delete dialog
  const getDefaultStageName = useCallback(() => {
    const defaultStage = stages.find((s) => s.isDefault);
    return defaultStage?.name || stages[0]?.name || "default";
  }, [stages]);

  const canDeleteStage = stages.length > MIN_STAGES_COUNT;

  if (loading) {
    return (
      <div className="flex h-full overflow-hidden">
        <div className="flex-1 flex flex-col gap-4 p-4 lg:p-8 min-w-0 overflow-hidden">
          {/* Header Section Skeleton */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <Skeleton className="h-7 lg:h-8 w-40 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>

          {/* Stats Cards Skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-12" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Kanban Columns Skeleton */}
          <div className="flex-1 min-h-0 relative">
            <div className="absolute inset-0 overflow-x-auto overflow-y-hidden">
              <div className="flex gap-2 pb-4 items-stretch h-full">
                {[1, 2, 3, 4, 5].map((i) => {
                  // Deterministic card count pattern to avoid hydration mismatch
                  const cardCounts = [2, 3, 1, 2, 1];
                  return (
                    <div
                      key={i}
                      className="flex-shrink-0 w-72 lg:w-80 rounded-lg border bg-muted/30 p-3 flex flex-col"
                    >
                      {/* Column Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-3 w-3 rounded-full" />
                          <Skeleton className="h-5 w-24" />
                          <Skeleton className="h-5 w-6 rounded-full" />
                        </div>
                      </div>
                      {/* Column Cards */}
                      <div className="flex-1 space-y-2">
                        {Array.from({ length: cardCounts[i - 1] }).map(
                          (_, j) => (
                            <div
                              key={j}
                              className="p-3 rounded-lg border bg-card"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <Skeleton className="h-4 w-32 mb-1" />
                                  <Skeleton className="h-3 w-24" />
                                </div>
                                <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <Skeleton className="h-5 w-16 rounded-full" />
                                <Skeleton className="h-3 w-12" />
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || stages.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 lg:p-8 h-full">
        <div>
          <h1 className="text-lg lg:text-2xl font-medium">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Card className="p-6">
          <div className="flex flex-col items-center justify-center text-center gap-4">
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="font-medium mb-2">{t("noStagesTitle")}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("noStagesDescription")}
              </p>
              <Button onClick={handleInitializeDefaults}>
                {t("initializeDefaults")}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main Kanban Content */}
      <div className="flex-1 flex flex-col gap-4 p-4 lg:p-8 min-w-0 overflow-hidden">
        {/* Header Section - no horizontal scroll */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h1 className="text-lg lg:text-2xl font-medium truncate">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground truncate">
              {t("description")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowActivity(true)}
            >
              <History className="h-4 w-4 mr-2" />
              {t("history")}
            </Button>
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              onClick={() => setEditMode(!editMode)}
            >
              <Pencil className="h-4 w-4 mr-2" />
              {editMode ? t("doneEditing") : t("editMode")}
            </Button>
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t("refresh")}
            </Button>
          </div>
        </div>

        {editMode && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-center gap-2 shrink-0">
            <Pencil className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <span className="text-sm text-yellow-800 dark:text-yellow-200">
              {t("editModeInstructions", { minStages: MIN_STAGES_COUNT })}
            </span>
          </div>
        )}

        {/* Stats Cards - no horizontal scroll */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("statTotalStages")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stages.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("statTotalChats")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {Array.from(chatsByStage.values()).reduce(
                  (sum, chats) => sum + chats.length,
                  0,
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("statHandoffsPending")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {Array.from(chatsByStage.values()).reduce(
                  (sum, chats) =>
                    sum + chats.filter((c) => c.awaitingHandoff).length,
                  0,
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("statAiPaused")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {Array.from(chatsByStage.values()).reduce(
                  (sum, chats) =>
                    sum +
                    chats.filter(
                      (c) => c.aiPaused || c.aiOverrideEnabled === false,
                    ).length,
                  0,
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Stages Container - horizontal scroll allowed here only */}
        <div className="flex-1 min-h-0 relative">
          <div className="absolute inset-0 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-2 pb-4 items-stretch h-full">
              {/* Add stage button at the start (in edit mode) */}
              {editMode && (
                <AddStageDivider
                  onClick={() => handleOpenCreateStageModal(0)}
                  isEditMode={editMode}
                />
              )}

              {stages.map((stage, index) => (
                <div key={stage.id} className="flex items-stretch">
                  <KanbanColumnComponent
                    stage={stage}
                    cards={chatsByStage.get(stage.id) || []}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onCardClick={handleCardClick}
                    isDragOver={dragOverStageId === stage.id}
                    onDragEnter={() => setDragOverStageId(stage.id)}
                    onDragLeave={() => setDragOverStageId(null)}
                    editMode={editMode}
                    onStartEdit={handleStartEdit}
                    onCancelEdit={handleCancelEdit}
                    onSaveEdit={handleSaveEdit}
                    onDelete={(id) =>
                      setStageToDelete(stages.find((s) => s.id === id) || null)
                    }
                    onEditNameChange={handleEditNameChange}
                    canDelete={canDeleteStage}
                    onStageDragStart={handleStageDragStart}
                    onStageDragOver={handleStageDragOver}
                    onStageDrop={handleStageDrop}
                    isStageDragging={draggedStageId === stage.id}
                    onSetDefault={handleSetDefault}
                    t={t}
                  />

                  {/* Add stage divider between columns (in edit mode) */}
                  {editMode && (
                    <AddStageDivider
                      onClick={() => handleOpenCreateStageModal(index + 1)}
                      isEditMode={editMode}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <AlertDialog
          open={!!stageToDelete}
          onOpenChange={(open) => !open && setStageToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteStage")}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    {t("deleteStageConfirm", {
                      name: stageToDelete?.name ?? "",
                    })}
                  </p>
                  {(chatsByStage.get(stageToDelete?.id || "")?.length || 0) >
                    0 && (
                    <p className="text-destructive font-medium">
                      {t("deleteStageWarning", {
                        count:
                          chatsByStage.get(stageToDelete?.id || "")?.length ??
                          0,
                        defaultStage: getDefaultStageName(),
                      })}
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteStage}
                className={buttonVariants({ variant: "destructive" })}
              >
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Create Stage Modal */}
        <CreateStageModal
          open={createStageModalOpen}
          onOpenChange={setCreateStageModalOpen}
          insertAtPosition={createStagePosition}
          onStageCreated={handleStageCreated}
          isFirstStage={stages.length === 0}
        />

        {/* Activity History Sheet */}
        <ActivityHistorySheet
          open={showActivity}
          onOpenChange={setShowActivity}
          onChatClick={(chatId) =>
            router.push(`/dashboard/chats?selectedChatId=${chatId}`)
          }
        />
      </div>
    </div>
  );
}
