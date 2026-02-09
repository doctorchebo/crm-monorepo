"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CarouselCard,
  TemplateButton,
} from "@/lib/types/template-components.types";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Image,
  Plus,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { useCallback, useState } from "react";
import { ButtonEditor } from "./button-editor";

interface CarouselEditorProps {
  /** Current carousel cards */
  value: CarouselCard[];
  /** Callback when cards change */
  onChange: (cards: CarouselCard[]) => void;
  /** Whether the editor is disabled */
  disabled?: boolean;
  /** Callback to upload media file */
  onMediaUpload?: (
    cardIndex: number,
    file: File,
  ) => Promise<{ assetHandle?: string; error?: string }>;
  /** Map of card indices to upload status */
  uploadingCards?: Set<number>;
}

/** Maximum cards allowed in a carousel */
const MAX_CARDS = 10;
/** Minimum cards required for a carousel */
const MIN_CARDS = 2;

/**
 * Create an empty carousel card
 */
function createEmptyCard(): CarouselCard {
  return {
    header: { format: "IMAGE" },
    body: { text: "" },
    buttons: [],
  };
}

/**
 * CarouselEditor Component
 *
 * Allows editing carousel template cards with support for:
 * - 2-10 cards per carousel
 * - Image or video header per card
 * - Body text per card
 * - Up to 2 buttons per card
 *
 * All cards must have consistent button configuration.
 */
export function CarouselEditor({
  value,
  onChange,
  disabled = false,
  onMediaUpload,
  uploadingCards = new Set(),
}: CarouselEditorProps) {
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  // Add a new card
  const handleAddCard = useCallback(() => {
    if (value.length >= MAX_CARDS) return;
    const newCard = createEmptyCard();
    onChange([...value, newCard]);
    setActiveCardIndex(value.length);
  }, [value, onChange]);

  // Remove a card
  const handleRemoveCard = useCallback(
    (index: number) => {
      if (value.length <= MIN_CARDS) return;
      const newCards = [...value];
      newCards.splice(index, 1);
      onChange(newCards);
      if (activeCardIndex >= newCards.length) {
        setActiveCardIndex(Math.max(0, newCards.length - 1));
      }
    },
    [value, onChange, activeCardIndex],
  );

  // Duplicate a card
  const handleDuplicateCard = useCallback(
    (index: number) => {
      if (value.length >= MAX_CARDS) return;
      const newCards = [...value];
      const duplicated = JSON.parse(JSON.stringify(value[index]));
      // Clear the media handle for the duplicate (user must upload new media)
      duplicated.header.handle = undefined;
      newCards.splice(index + 1, 0, duplicated);
      onChange(newCards);
      setActiveCardIndex(index + 1);
    },
    [value, onChange],
  );

  // Update a specific card
  const handleUpdateCard = useCallback(
    (index: number, updates: Partial<CarouselCard>) => {
      const newCards = [...value];
      newCards[index] = { ...newCards[index], ...updates };
      onChange(newCards);
    },
    [value, onChange],
  );

  // Update card header format
  const handleHeaderFormatChange = useCallback(
    (index: number, format: "IMAGE" | "VIDEO") => {
      const newCards = [...value];
      newCards[index] = {
        ...newCards[index],
        header: { format, handle: undefined, url: undefined },
      };
      onChange(newCards);
    },
    [value, onChange],
  );

  // Handle media upload for a card
  const handleCardMediaUpload = useCallback(
    async (cardIndex: number, file: File) => {
      if (!onMediaUpload) return;
      const result = await onMediaUpload(cardIndex, file);
      if (result.assetHandle) {
        const newCards = [...value];
        newCards[cardIndex] = {
          ...newCards[cardIndex],
          header: {
            ...newCards[cardIndex].header,
            handle: result.assetHandle,
          },
        };
        onChange(newCards);
      }
    },
    [value, onChange, onMediaUpload],
  );

  // Update card buttons
  const handleButtonsChange = useCallback(
    (index: number, buttons: TemplateButton[]) => {
      const newCards = [...value];
      newCards[index] = { ...newCards[index], buttons };
      onChange(newCards);
    },
    [value, onChange],
  );

  // Navigate between cards
  const handleNavigate = (direction: "prev" | "next") => {
    if (direction === "prev" && activeCardIndex > 0) {
      setActiveCardIndex(activeCardIndex - 1);
    } else if (direction === "next" && activeCardIndex < value.length - 1) {
      setActiveCardIndex(activeCardIndex + 1);
    }
  };

  const activeCard = value[activeCardIndex];
  const canAddCard = value.length < MAX_CARDS;
  const canRemoveCard = value.length > MIN_CARDS;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          Carousel Cards ({value.length}/{MAX_CARDS})
        </Label>
        <p className="text-xs text-muted-foreground">
          Minimum {MIN_CARDS} cards required
        </p>
      </div>

      {/* Card navigation */}
      <div className="flex items-center justify-center gap-2 py-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => handleNavigate("prev")}
          disabled={activeCardIndex === 0 || disabled}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Card indicators */}
        <div className="flex items-center gap-1">
          {value.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActiveCardIndex(index)}
              className={`
                h-2 w-2 rounded-full transition-all
                ${
                  index === activeCardIndex
                    ? "bg-primary w-6"
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }
              `}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => handleNavigate("next")}
          disabled={activeCardIndex === value.length - 1 || disabled}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Active card editor */}
      {activeCard && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Card {activeCardIndex + 1}</h4>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDuplicateCard(activeCardIndex)}
                disabled={!canAddCard || disabled}
                className="gap-1"
              >
                <Copy className="h-3 w-3" />
                Duplicate
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveCard(activeCardIndex)}
                disabled={!canRemoveCard || disabled}
                className="gap-1 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </Button>
            </div>
          </div>

          {/* Card header (media) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Card Media</Label>
              <Select
                value={activeCard.header.format}
                onValueChange={(v) =>
                  handleHeaderFormatChange(
                    activeCardIndex,
                    v as "IMAGE" | "VIDEO",
                  )
                }
                disabled={disabled}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IMAGE">
                    <div className="flex items-center gap-2">
                      <Image className="h-3 w-3" />
                      Image
                    </div>
                  </SelectItem>
                  <SelectItem value="VIDEO">
                    <div className="flex items-center gap-2">
                      <Video className="h-3 w-3" />
                      Video
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Media upload zone */}
            <div
              className={`
                relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
                ${disabled || uploadingCards.has(activeCardIndex) ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50"}
                ${activeCard.header.handle ? "border-primary/30 bg-primary/5" : "border-muted-foreground/25"}
              `}
              onClick={() => {
                if (!disabled && !uploadingCards.has(activeCardIndex)) {
                  document
                    .getElementById(`card-media-input-${activeCardIndex}`)
                    ?.click();
                }
              }}
            >
              <input
                id={`card-media-input-${activeCardIndex}`}
                type="file"
                accept={
                  activeCard.header.format === "IMAGE"
                    ? "image/jpeg,image/png"
                    : "video/mp4"
                }
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleCardMediaUpload(activeCardIndex, e.target.files[0]);
                  }
                }}
                disabled={disabled || uploadingCards.has(activeCardIndex)}
              />

              {uploadingCards.has(activeCardIndex) ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                </div>
              ) : activeCard.header.handle ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    {activeCard.header.format === "IMAGE" ? (
                      <Image className="h-6 w-6 text-primary" />
                    ) : (
                      <Video className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <p className="text-sm font-medium">Media uploaded</p>
                  <p className="text-xs text-muted-foreground">
                    Click to replace
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Click to upload {activeCard.header.format.toLowerCase()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Card body */}
          <div className="space-y-2">
            <Label htmlFor={`card-body-${activeCardIndex}`}>Card Body</Label>
            <Textarea
              id={`card-body-${activeCardIndex}`}
              value={activeCard.body.text}
              onChange={(e) =>
                handleUpdateCard(activeCardIndex, {
                  body: { ...activeCard.body, text: e.target.value },
                })
              }
              placeholder="Enter card body text (max 160 chars)"
              maxLength={160}
              rows={3}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              {activeCard.body.text.length}/160 characters
            </p>
          </div>

          {/* Card buttons */}
          <div className="space-y-2">
            <Label>Card Buttons (max 2)</Label>
            <ButtonEditor
              value={activeCard.buttons || []}
              onChange={(buttons) =>
                handleButtonsChange(activeCardIndex, buttons)
              }
              disabled={disabled}
              maxButtons={2}
            />
          </div>
        </Card>
      )}

      {/* Add card button */}
      {canAddCard && !disabled && (
        <Button
          type="button"
          variant="outline"
          onClick={handleAddCard}
          className="w-full gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Card
        </Button>
      )}

      {/* Consistency warning */}
      {value.length >= MIN_CARDS && (
        <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
          ⚠️ All cards must have the same button configuration for Meta
          approval.
        </p>
      )}
    </div>
  );
}

export default CarouselEditor;
