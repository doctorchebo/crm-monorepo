"use client";

/**
 * WhatsApp-style Attachment Menu
 * A button inside the message input that opens a menu with attachment options
 */

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ALLOWED_FILE_TYPES } from "@/lib/media/types";
import {
  Camera,
  Contact,
  FileText,
  Image,
  MapPin,
  Package,
  Paperclip,
} from "lucide-react";
import React, { useRef } from "react";

export type AttachmentType =
  | "photos-videos"
  | "document"
  | "camera"
  | "contact"
  | "location"
  | "catalog";

interface AttachmentMenuProps {
  onFilesSelected: (files: File[], type: AttachmentType) => void;
  onContactsClick?: () => void;
  /** Called when camera option is selected - opens camera capture panel */
  onCameraClick?: () => void;
  /** Called when catalog option is selected - opens catalog selector */
  onCatalogClick?: () => void;
  /** Called when location option is selected - opens location picker modal */
  onLocationClick?: () => void;
  disabled?: boolean;
}

export function AttachmentMenu({
  onFilesSelected,
  onContactsClick,
  onCameraClick,
  onCatalogClick,
  onLocationClick,
  disabled = false,
}: AttachmentMenuProps) {
  const photoVideoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  // Accepted file types
  const photoVideoTypes = [
    ...ALLOWED_FILE_TYPES.image,
    ...ALLOWED_FILE_TYPES.video,
  ].join(",");
  const documentTypes = [
    ...ALLOWED_FILE_TYPES.document,
    ...ALLOWED_FILE_TYPES.audio,
  ].join(",");

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    type: AttachmentType,
  ) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      onFilesSelected(files, type);
    }
    // Reset input so same file can be selected again
    event.target.value = "";
  };

  const handleMenuItemClick = (type: AttachmentType) => {
    switch (type) {
      case "photos-videos":
        photoVideoInputRef.current?.click();
        break;
      case "document":
        documentInputRef.current?.click();
        break;
      case "camera":
        // Camera capture - open camera panel with permission request
        if (onCameraClick) {
          onCameraClick();
        }
        break;
      case "contact":
        // Contact sharing - trigger the contacts modal
        if (onContactsClick) {
          onContactsClick();
        }
        break;
      case "catalog":
        // Catalog item selection
        if (onCatalogClick) {
          onCatalogClick();
        }
        break;
      case "location":
        // Location sharing - opens location picker modal
        if (onLocationClick) {
          onLocationClick();
        }
        break;
    }
  };

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={photoVideoInputRef}
        type="file"
        onChange={(e) => handleFileChange(e, "photos-videos")}
        disabled={disabled}
        multiple
        accept={photoVideoTypes}
        className="hidden"
      />
      <input
        ref={documentInputRef}
        type="file"
        onChange={(e) => handleFileChange(e, "document")}
        disabled={disabled}
        multiple
        accept={documentTypes}
        className="hidden"
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            disabled={disabled}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Attach"
          >
            <Paperclip className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          className="w-56 mb-2 bg-background dark:bg-zinc-900"
          sideOffset={8}
        >
          <DropdownMenuItem
            onClick={() => handleMenuItemClick("photos-videos")}
            className="cursor-pointer gap-3 py-2.5"
          >
            <Image className="h-5 w-5 text-foreground dark:text-white" />
            <span>Photos & Videos</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleMenuItemClick("camera")}
            className="cursor-pointer gap-3 py-2.5"
          >
            <Camera className="h-5 w-5 text-foreground dark:text-white" />
            <span>Camera</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleMenuItemClick("document")}
            className="cursor-pointer gap-3 py-2.5"
          >
            <FileText className="h-5 w-5 text-foreground dark:text-white" />
            <span>Document</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleMenuItemClick("contact")}
            className="cursor-pointer gap-3 py-2.5"
          >
            <Contact className="h-5 w-5 text-foreground dark:text-white" />
            <span>Contact</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleMenuItemClick("location")}
            className="cursor-pointer gap-3 py-2.5"
          >
            <MapPin className="h-5 w-5 text-foreground dark:text-white" />
            <span>Location</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleMenuItemClick("catalog")}
            className="cursor-pointer gap-3 py-2.5"
          >
            <Package className="h-5 w-5 text-foreground dark:text-white" />
            <span>Catalog</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
