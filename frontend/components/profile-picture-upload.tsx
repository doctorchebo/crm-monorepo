"use client";

import { SmartAvatar } from "@/components/smart-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useNotification } from "@/hooks/use-notification";
import {
  clearProfilePictureCache,
  useProfilePicture,
} from "@/hooks/use-profile-picture";
import {
  clearUserProfilePicture,
  revalidateUserProfile,
} from "@/hooks/use-user";
import { backendApi } from "@/lib/api/endpoints";
import { Camera, Loader2, Trash2, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import Cropper, { Area } from "react-easy-crop";

/**
 * Maximum file size for profile pictures (5MB)
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Allowed file types for profile pictures
 */
const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * Crop area dimensions (square for circular avatar)
 */
const CROP_SIZE = 400;

interface ProfilePictureUploadProps {
  /** Current user's name for initials fallback */
  userName?: string;
  /** Current user's email for initials fallback */
  userEmail?: string;
  /** Optional callback when profile picture changes */
  onPictureChange?: () => void;
}

/**
 * Creates a canvas element with the cropped image
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  outputSize: number = CROP_SIZE,
): Promise<Blob> {
  const image = new Image();
  image.src = imageSrc;

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No 2d context");
  }

  // Draw the cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  // Convert canvas to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas to blob failed"));
        }
      },
      "image/jpeg",
      0.9, // Quality for JPEG
    );
  });
}

export function ProfilePictureUpload({
  userName,
  userEmail,
  onPictureChange,
}: ProfilePictureUploadProps) {
  const t = useTranslations("settings.profilePicture");
  const { addNotification } = useNotification();

  // Helper methods for notifications
  const showSuccess = (message: string) => addNotification(message, "success");
  const showError = (message: string) => addNotification(message, "error");

  // Use centralized profile picture hook with automatic polling during processing
  const {
    pictureInfo,
    isLoading: isPictureLoading,
    isProcessing,
    isReady,
    hasProfilePicture,
    mutatePictureInfo,
  } = useProfilePicture();

  // State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Reset dialog state after closing animation completes.
   * This prevents the modal flash issue where content changes
   * while the closing animation is still running.
   */
  const resetDialogState = useCallback(() => {
    setSelectedImage(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }, []);

  /**
   * Handle dialog open state changes.
   * Only resets state when dialog is closing (open -> closed).
   */
  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      setIsDialogOpen(open);
      if (!open) {
        // Delay state reset until after closing animation (200ms)
        setTimeout(resetDialogState, 200);
      }
    },
    [resetDialogState],
  );

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      showError(t("invalidFileType"));
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      showError(t("fileTooLarge"));
      return;
    }

    // Read file and open cropper dialog
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      setIsDialogOpen(true);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    event.target.value = "";
  };

  // Handle crop complete
  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    [],
  );

  // Upload cropped image
  const handleUpload = async () => {
    if (!selectedImage || !croppedAreaPixels) return;

    setIsUploading(true);

    try {
      // Get cropped image blob
      const croppedBlob = await getCroppedImg(selectedImage, croppedAreaPixels);
      const file = new File([croppedBlob], "profile-picture.jpg", {
        type: "image/jpeg",
      });

      // Upload directly through backend (CORS-free)
      await backendApi.profilePicture.upload(file);

      // Refresh profile picture info
      await mutatePictureInfo();

      // Also refresh user profile to get updated profilePictureUrl (updates header avatar)
      await revalidateUserProfile();

      showSuccess(t("uploadSuccess"));
      // Close dialog - state reset happens after animation via handleDialogOpenChange
      setIsDialogOpen(false);
      onPictureChange?.();
    } catch (error) {
      console.error("Profile picture upload error:", error);
      showError(t("uploadError"));
    } finally {
      setIsUploading(false);
    }
  };

  // Delete profile picture
  const handleDelete = async () => {
    if (isDeleting) return;

    setIsDeleting(true);

    try {
      // Optimistically clear both caches first for immediate UI update
      // This makes both settings and header avatars show fallback initials immediately
      clearProfilePictureCache();
      clearUserProfilePicture();

      // Delete from server
      await backendApi.profilePicture.delete();

      // After successful delete, revalidate to confirm server state matches
      // The optimistic update already shows the correct UI, this just confirms it
      await Promise.all([mutatePictureInfo(), revalidateUserProfile()]);

      showSuccess(t("deleteSuccess"));
      onPictureChange?.();
    } catch (error) {
      console.error("Profile picture delete error:", error);
      // On error, revalidate to restore correct state from server
      await Promise.all([mutatePictureInfo(), revalidateUserProfile()]);
      showError(t("deleteError"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_FILE_TYPES.join(",")}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Avatar display */}
      <div className="relative group">
        <SmartAvatar
          isLoading={isPictureLoading || isProcessing || isUploading}
          hasProfilePicture={hasProfilePicture}
          profilePictureUrl={pictureInfo?.thumbnailUrl}
          name={userName}
          email={userEmail}
          size="xl"
        />

        {/* Overlay with camera icon */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          disabled={isUploading || isProcessing}
        >
          <Camera className="h-8 w-8 text-white" />
        </button>
      </div>

      {/* Status indicator */}
      {isProcessing && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("processing")}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isProcessing}
        >
          <Upload className="h-4 w-4 mr-2" />
          {hasProfilePicture ? t("change") : t("upload")}
        </Button>

        {hasProfilePicture && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting || isProcessing}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            {t("delete")}
          </Button>
        )}
      </div>

      {/* Crop dialog */}
      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t("cropTitle")}</DialogTitle>
            <DialogDescription>{t("cropDescription")}</DialogDescription>
          </DialogHeader>

          {selectedImage && (
            <div className="flex flex-col gap-4">
              {/* Cropper */}
              <div className="relative h-[300px] w-full bg-muted rounded-lg overflow-hidden">
                <Cropper
                  image={selectedImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>

              {/* Zoom control */}
              <div className="flex items-center gap-4 px-2">
                <ZoomOut className="h-4 w-4 text-muted-foreground" />
                <Slider
                  value={[zoom]}
                  min={1}
                  max={3}
                  step={0.1}
                  onValueChange={(value) => setZoom(value[0])}
                  className="flex-1"
                />
                <ZoomIn className="h-4 w-4 text-muted-foreground" />
              </div>

              <Label className="text-sm text-muted-foreground text-center">
                {t("zoomHint")}
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isUploading}
            >
              {t("cancel")}
            </Button>
            <Button onClick={handleUpload} disabled={isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("uploading")}
                </>
              ) : (
                t("save")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
