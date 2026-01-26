"use client";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { useNotification } from "@/hooks/use-notification";
import type { ChatStageAssignment, WorkflowStage } from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import {
  AlertCircle,
  Bot,
  Check,
  Clock,
  GripVertical,
  MessageSquare,
  Pause,
  Pencil,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MIN_STAGES_COUNT = 3;

type EditableStage = WorkflowStage & {
  isEditing?: boolean;
  editName?: string;
};

function formatRelativeTime(time: string | null | undefined): string {
  if (!time) return "";
  const date = new Date(time);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatStageDuration(assignedAt: string | null | undefined): string {
  if (!assignedAt) return "";
  const date = new Date(assignedAt);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d in stage`;
  if (hours > 0) return `${hours}h in stage`;
  return "Just entered";
}

function KanbanCardComponent({
  card,
  onDragStart,
  onClick,
}: {
  card: ChatStageAssignment;
  onDragStart: (
    e: React.DragEvent<HTMLDivElement>,
    chatId: string,
    fromStageId: string,
  ) => void;
  onClick: (chatId: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card.chatId, card.stageId || "")}
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
            Handoff
          </Badge>
        )}
        {(card.aiPaused || card.aiOverrideEnabled === false) && (
          <Badge
            variant="outline"
            className="text-xs bg-red-50 text-red-700 border-red-200"
          >
            <Pause className="h-3 w-3 mr-1" />
            {card.aiOverrideEnabled === false ? "AI Disabled" : "AI Paused"}
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
              AI Active
            </Badge>
          )}
        {card.lastMessageTime && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(card.lastMessageTime)}
          </span>
        )}
      </div>
      {card.assignedAt && (
        <div className="mt-2 pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            {formatStageDuration(card.assignedAt)}
          </span>
        </div>
      )}
    </div>
  );
}

function KanbanColumnComponent({
  stage,
  cards,
  onDragStart,
  onDragOver,
  onDrop,
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
}: {
  stage: EditableStage;
  cards: ChatStageAssignment[];
  onDragStart: (
    e: React.DragEvent<HTMLDivElement>,
    chatId: string,
    fromStageId: string,
  ) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, stageId: string) => void;
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
              <X className="h-4 w-4 text-red-600" />
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
                        ? "Delete stage"
                        : `Cannot delete: minimum ${MIN_STAGES_COUNT} stages required`
                    }
                  >
                    <Trash2
                      className={`h-3.5 w-3.5 ${
                        canDelete
                          ? "text-red-600"
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
            <Badge variant="outline" className="text-xs">
              Default
            </Badge>
          )}
          {stage.isFinal && (
            <Badge variant="outline" className="text-xs">
              Final
            </Badge>
          )}
          {stage.aiAutoReply && (
            <Badge
              variant="outline"
              className="text-xs bg-green-50 text-green-700 border-green-200"
            >
              AI Reply
            </Badge>
          )}
          {stage.aiHandoffRequired && (
            <Badge
              variant="outline"
              className="text-xs bg-orange-50 text-orange-700 border-orange-200"
            >
              Handoff
            </Badge>
          )}
        </div>
      )}
      <div
        onDragOver={editMode ? undefined : onDragOver}
        onDrop={editMode ? undefined : (e) => onDrop(e, stage.id)}
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
              onClick={onCardClick}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground">No chats yet</p>
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
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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
      addNotification(
        "Failed to load workflow stages. Please try again.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    chatId: string,
    fromStageId: string,
  ) => {
    if (editMode) return;
    setDraggedChat({ chatId, fromStageId });
    e.dataTransfer.effectAllowed = "move";
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
    setDragOverStageId(null);
    if (!draggedChat || editMode) return;
    const { chatId, fromStageId } = draggedChat;
    if (fromStageId === toStageId) {
      setDraggedChat(null);
      return;
    }
    const newChatsMap = new Map(chatsByStage);
    const fromChats = newChatsMap.get(fromStageId) || [];
    const toChats = newChatsMap.get(toStageId) || [];
    const chatIndex = fromChats.findIndex((chat) => chat.chatId === chatId);
    if (chatIndex === -1) {
      setDraggedChat(null);
      return;
    }
    const [chat] = fromChats.splice(chatIndex, 1);
    toChats.push({ ...chat, stageId: toStageId });
    newChatsMap.set(fromStageId, fromChats);
    newChatsMap.set(toStageId, toChats);
    setChatsByStage(newChatsMap);
    setDraggedChat(null);
    try {
      const toStage = stages.find((s) => s.id === toStageId);
      await backendApi.stages.transitionChat({
        chatId,
        toStageId,
        reason: `Moved to ${toStage?.name || "stage"} via kanban board`,
      });
      addNotification(`Successfully moved chat to ${toStage?.name}`, "success");
    } catch {
      addNotification("Failed to move chat. Please try again.", "error");
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
      addNotification(`Stage renamed to "${newName}"`, "success");
    } catch {
      addNotification("Failed to rename stage. Please try again.", "error");
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
      addNotification(`Stage "${stageToDelete.name}" deleted`, "success");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to delete stage. Please try again.";
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
      addNotification("Stage order updated", "success");
    } catch {
      addNotification("Failed to save stage order. Please refresh.", "error");
      loadData();
    }
  };

  const handleInitializeDefaults = async () => {
    try {
      await backendApi.stages.initializeDefaults();
      addNotification("Default workflow stages created", "success");
      loadData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to initialize stages";
      addNotification(message, "error");
    }
  };

  const canDeleteStage = stages.length > MIN_STAGES_COUNT;

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4 lg:p-8 h-full overflow-auto">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-shrink-0 w-80">
              <Skeleton className="h-6 w-32 mb-3" />
              <Skeleton className="h-96 w-full" />
            </div>
          ))}
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
              <h3 className="font-medium mb-2">No Workflow Stages Found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Get started by creating default workflow stages for your
                pipeline.
              </p>
              <Button onClick={handleInitializeDefaults}>
                Initialize Default Stages
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-8 h-full overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg lg:text-2xl font-medium">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            onClick={() => setEditMode(!editMode)}
          >
            <Pencil className="h-4 w-4 mr-2" />
            {editMode ? "Done Editing" : "Edit Mode"}
          </Button>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {editMode && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
          <Pencil className="h-4 w-4 text-yellow-600" />
          <span className="text-sm text-yellow-800">
            Edit Mode: Click stage names to rename, drag columns to reorder,
            click trash to delete. Minimum {MIN_STAGES_COUNT} stages required.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Stages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stages.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Chats
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
              Handoffs Pending
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
              AI Paused
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

      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <div
            key={stage.id}
            onDragOver={editMode ? undefined : handleDragOver}
            onDrop={editMode ? undefined : (e) => handleDrop(e, stage.id)}
            onDragEnter={
              editMode ? undefined : () => setDragOverStageId(stage.id)
            }
            onDragLeave={
              editMode
                ? undefined
                : (e) => {
                    if (e.currentTarget === e.target) setDragOverStageId(null);
                  }
            }
          >
            <KanbanColumnComponent
              stage={stage}
              cards={chatsByStage.get(stage.id) || []}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onCardClick={handleCardClick}
              isDragOver={dragOverStageId === stage.id}
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
            />
          </div>
        ))}
      </div>

      <AlertDialog
        open={!!stageToDelete}
        onOpenChange={(open) => !open && setStageToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stage</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the stage &quot;
              {stageToDelete?.name}&quot;?
              {(chatsByStage.get(stageToDelete?.id || "")?.length || 0) > 0 && (
                <span className="block mt-2 text-red-600">
                  Warning: This stage contains{" "}
                  {chatsByStage.get(stageToDelete?.id || "")?.length} chat(s).
                  They will need to be reassigned.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStage}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
