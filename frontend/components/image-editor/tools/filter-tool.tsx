/**
 * Filter Tool Component
 * Shows filter presets with preview thumbnails
 */

"use client";

import { cn } from "@/lib/utils";
import { useEditorContext } from "../editor-context";
import { IMAGE_FILTERS } from "../types";

interface FilterToolProps {
  className?: string;
  /** Thumbnail preview image URL */
  thumbnailUrl?: string;
}

export function FilterTool({ className, thumbnailUrl }: FilterToolProps) {
  const { state, setFilter } = useEditorContext();

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 overflow-x-auto pb-2",
        className
      )}
    >
      {IMAGE_FILTERS.map((filter) => (
        <FilterPreview
          key={filter.id}
          filter={filter}
          imageUrl={thumbnailUrl || state.originalImage}
          isSelected={state.filter === filter.id}
          onSelect={() => setFilter(filter.id)}
        />
      ))}
    </div>
  );
}

interface FilterPreviewProps {
  filter: (typeof IMAGE_FILTERS)[number];
  imageUrl: string;
  isSelected: boolean;
  onSelect: () => void;
}

function FilterPreview({
  filter,
  imageUrl,
  isSelected,
  onSelect,
}: FilterPreviewProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex flex-col items-center gap-1 p-1 rounded-lg transition-all flex-shrink-0",
        isSelected ? "ring-2 ring-primary bg-white/10" : "hover:bg-white/10"
      )}
    >
      <div
        className="w-14 h-14 rounded-md overflow-hidden bg-black"
        style={{
          filter: filter.cssFilter === "none" ? undefined : filter.cssFilter,
        }}
      >
        <img
          src={imageUrl}
          alt={filter.label}
          className="w-full h-full object-cover"
        />
      </div>
      <span
        className={cn(
          "text-xs",
          isSelected ? "text-primary font-medium" : "text-white/80"
        )}
      >
        {filter.label}
      </span>
    </button>
  );
}
