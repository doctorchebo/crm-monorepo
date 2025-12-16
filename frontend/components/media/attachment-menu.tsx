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
  Paperclip,
  Sticker,
} from "lucide-react";
import React, { useRef } from "react";

export type AttachmentType =
  | "photos-videos"
  | "document"
  | "camera"
  | "contact"
  | "location"
  | "sticker";

interface AttachmentMenuProps {
  onFilesSelected: (files: File[], type: AttachmentType) => void;
  onContactsClick?: () => void;
  disabled?: boolean;
}

export function AttachmentMenu({
  onFilesSelected,
  onContactsClick,
  disabled = false,
}: AttachmentMenuProps) {
  const photoVideoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
    type: AttachmentType
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
        cameraInputRef.current?.click();
        break;
      case "contact":
        // Contact sharing - trigger the contacts modal
        if (onContactsClick) {
          onContactsClick();
        }
        break;
      case "location":
        // Location sharing - not supported in WhatsApp Cloud API
        console.log("Location sharing not supported");
        break;
      case "sticker":
        // Sticker picker - could be implemented later
        console.log("Sticker picker not yet implemented");
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
      <input
        ref={cameraInputRef}
        type="file"
        onChange={(e) => handleFileChange(e, "camera")}
        disabled={disabled}
        accept="image/*"
        capture="environment"
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
          className="w-56 mb-2"
          sideOffset={8}
        >
          <DropdownMenuItem
            onClick={() => handleMenuItemClick("photos-videos")}
            className="cursor-pointer gap-3 py-2.5"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-500 text-white">
              <Image className="h-4 w-4" />
            </div>
            <span>Photos & Videos</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleMenuItemClick("camera")}
            className="cursor-pointer gap-3 py-2.5"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-pink-500 text-white">
              <Camera className="h-4 w-4" />
            </div>
            <span>Camera</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleMenuItemClick("document")}
            className="cursor-pointer gap-3 py-2.5"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500 text-white">
              <FileText className="h-4 w-4" />
            </div>
            <span>Document</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleMenuItemClick("contact")}
            className="cursor-pointer gap-3 py-2.5"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white">
              <Contact className="h-4 w-4" />
            </div>
            <span>Contact</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleMenuItemClick("sticker")}
            className="cursor-pointer gap-3 py-2.5 opacity-50"
            disabled
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-500 text-white">
              <Sticker className="h-4 w-4" />
            </div>
            <span>Sticker</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
