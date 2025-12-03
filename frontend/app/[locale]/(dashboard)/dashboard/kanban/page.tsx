"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface KanbanCard {
  id: string;
  title: string;
  emotion?: string;
  emotionColor?: string;
}

interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
}

const initialColumns: KanbanColumn[] = [
  {
    id: "lead",
    title: "Lead",
    cards: [
      {
        id: "1",
        title: "New Inquiry - John",
        emotion: "Interested",
        emotionColor: "green",
      },
      {
        id: "2",
        title: "Follow-up - Sarah",
        emotion: "Neutral",
        emotionColor: "gray",
      },
    ],
  },
  {
    id: "qualified",
    title: "Qualified",
    cards: [
      {
        id: "3",
        title: "Demo Scheduled - Mike",
        emotion: "Excited",
        emotionColor: "green",
      },
    ],
  },
  {
    id: "demo",
    title: "Demo",
    cards: [
      {
        id: "4",
        title: "In Demo - Lisa",
        emotion: "Engaged",
        emotionColor: "blue",
      },
    ],
  },
  {
    id: "closed",
    title: "Closed",
    cards: [
      {
        id: "5",
        title: "Closed Deal - David",
        emotion: "Happy",
        emotionColor: "green",
      },
    ],
  },
];

function KanbanCardComponent({
  card,
  columnId,
  onDragStart,
}: {
  card: KanbanCard;
  columnId: string;
  onDragStart: (
    e: React.DragEvent<HTMLDivElement>,
    cardId: string,
    fromColumnId: string
  ) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card.id, columnId)}
      className="p-3 rounded-lg border bg-card hover:shadow-md transition-shadow cursor-move active:opacity-50 select-none"
    >
      <p className="text-sm font-medium">{card.title}</p>
      {card.emotion && (
        <div className="mt-2 flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs ${
              card.emotionColor === "green"
                ? "bg-green-50 text-green-700 border-green-200"
                : card.emotionColor === "blue"
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-gray-50 text-gray-700 border-gray-200"
            }`}
          >
            {card.emotion}
          </Badge>
        </div>
      )}
    </div>
  );
}

function KanbanColumnComponent({
  column,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}: {
  column: KanbanColumn;
  onDragStart: (
    e: React.DragEvent<HTMLDivElement>,
    cardId: string,
    fromColumnId: string
  ) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, columnId: string) => void;
  isDragOver: boolean;
}) {
  return (
    <div className="flex-shrink-0 w-80 flex flex-col">
      {/* Column Header */}
      <div className="mb-3">
        <h2 className="font-semibold text-sm">{column.title}</h2>
        <p className="text-xs text-muted-foreground">
          {column.cards.length} {column.cards.length === 1 ? "item" : "items"}
        </p>
      </div>

      {/* Column Content */}
      <div
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, column.id)}
        className={`flex-1 rounded-lg p-3 space-y-3 min-h-[500px] transition-colors ${
          isDragOver
            ? "bg-primary/10 border-2 border-dashed border-primary"
            : "bg-muted/20"
        }`}
      >
        {column.cards.length > 0 ? (
          column.cards.map((card) => (
            <KanbanCardComponent
              key={card.id}
              card={card}
              columnId={column.id}
              onDragStart={onDragStart}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground">No items yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const t = useTranslations("kanban");
  const [columns, setColumns] = useState<KanbanColumn[]>(initialColumns);
  const [draggedCard, setDraggedCard] = useState<{
    cardId: string;
    fromColumnId: string;
  } | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    cardId: string,
    fromColumnId: string
  ) => {
    setDraggedCard({ cardId, fromColumnId });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    toColumnId: string
  ) => {
    e.preventDefault();
    setDragOverColumnId(null);

    if (!draggedCard) return;

    const { cardId, fromColumnId } = draggedCard;

    // Don't do anything if dropping in the same column at the same position
    if (fromColumnId === toColumnId) {
      setDraggedCard(null);
      return;
    }

    // Update columns
    setColumns((prevColumns) => {
      const newColumns = prevColumns.map((col) => ({
        ...col,
        cards: [...col.cards],
      }));

      // Find the card in the source column
      const fromColumn = newColumns.find((col) => col.id === fromColumnId);
      const toColumn = newColumns.find((col) => col.id === toColumnId);

      if (!fromColumn || !toColumn) return prevColumns;

      // Find and remove the card from source column
      const cardIndex = fromColumn.cards.findIndex(
        (card) => card.id === cardId
      );
      if (cardIndex === -1) return prevColumns;

      const [card] = fromColumn.cards.splice(cardIndex, 1);

      // Add card to target column
      toColumn.cards.push(card);

      return newColumns;
    });

    setDraggedCard(null);
  };

  const handleDragLeave = () => {
    setDragOverColumnId(null);
  };

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-8 h-full overflow-auto">
      <div>
        <h1 className="text-lg lg:text-2xl font-medium">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div
            key={column.id}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
            onDragLeave={handleDragLeave}
            onDragEnter={() => setDragOverColumnId(column.id)}
          >
            <KanbanColumnComponent
              column={column}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              isDragOver={dragOverColumnId === column.id}
            />
          </div>
        ))}
      </div>

      {/* Info Card */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">{t("features")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>✓ {t("dragCards")}</li>
            <li>✓ {t("highlight")}</li>
            <li>✓ {t("emotionBadges")}</li>
            <li>✓ {t("colorCoded")}</li>
            <li>✓ {t("trackPipeline")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
