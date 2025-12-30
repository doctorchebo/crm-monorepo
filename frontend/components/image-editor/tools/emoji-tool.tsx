/**
 * Emoji Tool Component
 * Shows selected emoji with delete option when an emoji element is selected.
 * The emoji picker itself is rendered as an overlay from the toolbar button.
 */

"use client";

import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { useEditorContext } from "../editor-context";

interface EmojiToolProps {
  className?: string;
  /** Canvas dimensions (unused but kept for API consistency) */
  canvasWidth: number;
  canvasHeight: number;
  /** The currently selected emoji element ID */
  selectedEmojiId: string | null;
}

/**
 * EmojiTool - Shows delete controls when an emoji is selected
 * The emoji picker overlay is rendered in the toolbar, not here
 */
export function EmojiTool({ className, selectedEmojiId }: EmojiToolProps) {
  const { removeEmoji, setActiveTool, setSelectedElement } = useEditorContext();

  // Handle delete selected emoji
  const handleDeleteEmoji = () => {
    if (selectedEmojiId) {
      removeEmoji(selectedEmojiId);
      setSelectedElement(null);
      setActiveTool("none");
    }
  };

  // This component should only render when an emoji is selected
  if (!selectedEmojiId) {
    return null;
  }

  return (
    <div className={cn("flex items-center justify-center", className)}>
      {/* Delete Button - just the trash icon */}
      <button
        onClick={handleDeleteEmoji}
        className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
        title="Delete emoji"
      >
        <Trash2 className="w-5 h-5" />
      </button>
    </div>
  );
}
