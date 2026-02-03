/**
 * Knowledge Base Object Media List
 *
 * Displays media attached to an object with AI eligibility indicators
 * and management actions.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useCompressionProgress,
  useCompressionUpdates,
} from "@/hooks/use-compression-updates";
import {
  kbMediaApi,
  MEDIA_ROLE_OPTIONS,
  type CompressionStatus,
  type KbMedia,
  type MediaRole,
} from "@/lib/api/kb-media";
import { KB_OBJECT_MEDIA_LIMIT } from "@/lib/constants/whatsapp-media-limits";
import {
  AlertCircle,
  Bot,
  BotOff,
  CheckCircle2,
  Download,
  Edit2,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  HelpCircle,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { MediaUploadDialog } from "./media-upload-dialog";

interface ObjectMediaListProps {
  objectId?: string | null;
  fieldId?: string;
  editable?: boolean;
  onEnsureObject?: () => Promise<string>;
}

function getMediaIcon(mimeType: string) {
  // Image types
  if (mimeType.startsWith("image/")) return FileImage;
  // Video types
  if (mimeType.startsWith("video/")) return FileVideo;
  // Audio types
  if (mimeType.startsWith("audio/")) return FileAudio;
  // PDF documents
  if (mimeType === "application/pdf") return FileText;
  // Spreadsheets
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv"
  )
    return FileSpreadsheet;
  // Archives
  if (
    mimeType.includes("zip") ||
    mimeType.includes("rar") ||
    mimeType.includes("tar") ||
    mimeType.includes("gzip")
  )
    return FileArchive;
  // Word documents
  if (mimeType.includes("word") || mimeType.includes("document"))
    return FileText;
  // Generic file
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compression status indicator component
 * Shows the status of video compression with visual feedback and real-time progress
 */
interface CompressionStatusIndicatorProps {
  status: CompressionStatus | null;
  originalFileSize: number | null;
  compressedFileSize: number | null;
  error: string | null;
  /** Real-time progress from WebSocket (0-100) */
  progress?: number;
}

function CompressionStatusIndicator({
  status,
  originalFileSize,
  compressedFileSize,
  error,
  progress,
}: CompressionStatusIndicatorProps) {
  // Don't show anything if no compression is needed/done
  if (!status || status === "none") {
    return null;
  }

  // Calculate compression ratio if we have both sizes
  const compressionRatio =
    originalFileSize && compressedFileSize
      ? ((1 - compressedFileSize / originalFileSize) * 100).toFixed(0)
      : null;

  switch (status) {
    case "pending":
      return (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 mt-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Compression queued...</span>
        </div>
      );

    case "processing":
      return (
        <div className="space-y-1 mt-1">
          <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>
              Compressing{progress !== undefined ? ` ${progress}%` : "..."}
            </span>
          </div>
          <Progress
            value={progress !== undefined ? progress : undefined}
            className="h-1"
          />
          <p className="text-[10px] text-muted-foreground">
            Not ready for AI replies yet
          </p>
        </div>
      );

    case "completed":
      return (
        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 mt-1">
          <CheckCircle2 className="h-3 w-3" />
          <span>
            Compressed
            {compressionRatio && ` (-${compressionRatio}%)`}
            {originalFileSize &&
              compressedFileSize &&
              ` ${formatFileSize(originalFileSize)} → ${formatFileSize(
                compressedFileSize,
              )}`}
          </span>
        </div>
      );

    case "failed":
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 text-xs text-destructive mt-1 cursor-help">
                <XCircle className="h-3 w-3" />
                <span>Compression failed</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="text-xs">
                {error || "Unknown error during compression"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                The original video can still be used but may exceed WhatsApp
                limits.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

    default:
      return null;
  }
}

interface MediaCardProps {
  media: KbMedia;
  editable?: boolean;
  /** Real-time compression progress (0-100) */
  compressionProgress?: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggleAi: () => void;
  onDownload: () => void;
}

function MediaCard({
  media,
  editable,
  compressionProgress,
  onEdit,
  onDelete,
  onToggleAi,
  onDownload,
}: MediaCardProps) {
  const t = useTranslations("knowledgeBase.media");
  const MediaIcon = getMediaIcon(media.mimeType);
  const [isLoadingImage, setIsLoadingImage] = useState(true);
  const [imageError, setImageError] = useState(false);

  // TODO: Add aiEnabled to KbMedia type once backend returns it
  // For now, we assume all media is AI-eligible unless it has a specific marker
  const isAiEnabled = true; // media.aiEnabled ?? true;

  const roleOption = MEDIA_ROLE_OPTIONS.find(
    (r) => r.value === media.mediaType,
  );

  // Determine if we have a valid thumbnail or image URL to display
  // thumbnailUrl is available for images, videos, and PDFs after processing
  const imageUrl = media.thumbnailUrl || media.s3Url;
  const isImageType = media.mimeType.startsWith("image/");
  const isVideoType = media.mimeType.startsWith("video/");
  const isPdfType = media.mimeType === "application/pdf";

  // Show preview if we have a thumbnail (any supported type) or for images with s3Url
  const hasThumbnail = !!media.thumbnailUrl;
  const canShowPreview =
    (hasThumbnail || isImageType) && imageUrl && !imageError;

  return (
    <div className="group relative border rounded-lg overflow-hidden bg-card hover:shadow-md transition-shadow">
      {/* Thumbnail / Preview */}
      <div className="aspect-square bg-muted relative">
        {canShowPreview ? (
          <>
            {isLoadingImage && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Skeleton className="w-full h-full" />
              </div>
            )}
            <img
              src={imageUrl}
              alt={media.altText || media.caption || media.fileName}
              className="w-full h-full object-cover"
              onLoad={() => setIsLoadingImage(false)}
              onError={() => {
                setIsLoadingImage(false);
                setImageError(true);
              }}
            />
            {/* Video overlay indicator */}
            {isVideoType && hasThumbnail && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/50 rounded-full p-3">
                  <Play className="h-8 w-8 text-white fill-white" />
                </div>
              </div>
            )}
            {/* PDF overlay indicator */}
            {isPdfType && hasThumbnail && (
              <div className="absolute bottom-2 left-2 pointer-events-none">
                <Badge variant="secondary" className="bg-red-500/90 text-white">
                  PDF
                </Badge>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
            <MediaIcon className="h-16 w-16 text-muted-foreground" />
            <span className="text-xs text-muted-foreground text-center truncate max-w-full px-2">
              {media.originalFileName || media.fileName}
            </span>
          </div>
        )}

        {/* AI Status Badge */}
        <div className="absolute top-2 left-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant={isAiEnabled ? "default" : "secondary"}
                  className="gap-1"
                >
                  {isAiEnabled ? (
                    <Bot className="h-3 w-3" />
                  ) : (
                    <BotOff className="h-3 w-3" />
                  )}
                  <span className="sr-only">
                    {isAiEnabled ? t("aiEnabled") : t("aiDisabled")}
                  </span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {isAiEnabled ? t("aiEnabledTooltip") : t("aiDisabledTooltip")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Role Badge */}
        <div className="absolute top-2 right-2">
          <Badge variant="outline" className="bg-background/80">
            {roleOption?.label || media.mediaType}
          </Badge>
        </div>

        {/* Hover Actions */}
        {editable && (
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8"
              onClick={onDownload}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8"
              onClick={onEdit}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Compression Status Overlay */}
        {media.compressionStatus &&
          ["pending", "processing"].includes(media.compressionStatus) && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 pointer-events-none">
              <Loader2 className="h-8 w-8 text-white animate-spin" />
              <span className="text-white text-sm font-medium">
                {media.compressionStatus === "pending"
                  ? "Compression queued..."
                  : "Compressing video..."}
              </span>
              <span className="text-white/80 text-xs">
                Video will be ready for AI replies once complete
              </span>
            </div>
          )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1">
        <p className="text-sm font-medium truncate" title={media.fileName}>
          {media.originalFileName || media.fileName}
        </p>
        {media.caption && (
          <p
            className="text-xs text-muted-foreground line-clamp-2"
            title={media.caption}
          >
            {media.caption}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatFileSize(media.fileSize)}</span>
          {media.width && media.height && (
            <span>
              {media.width} × {media.height}
            </span>
          )}
        </div>

        {/* Compression Status Indicator */}
        <CompressionStatusIndicator
          status={media.compressionStatus}
          originalFileSize={media.originalFileSize}
          compressedFileSize={media.compressedFileSize}
          error={media.compressionError}
          progress={compressionProgress}
        />
      </div>

      {/* Context Menu */}
      {editable && (
        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onDownload}>
                <Download className="h-4 w-4 mr-2" />
                {t("download")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Edit2 className="h-4 w-4 mr-2" />
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onToggleAi}>
                {isAiEnabled ? (
                  <>
                    <BotOff className="h-4 w-4 mr-2" />
                    {t("disableAi")}
                  </>
                ) : (
                  <>
                    <Bot className="h-4 w-4 mr-2" />
                    {t("enableAi")}
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

interface EditMediaDialogProps {
  media: KbMedia;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/**
 * Optimized Edit Media Dialog
 *
 * Uses uncontrolled inputs with refs for text fields to prevent re-renders
 * on every keystroke. Only select/switch maintain controlled state since
 * they need immediate visual feedback.
 */
function EditMediaDialog({
  media,
  open,
  onOpenChange,
  onSuccess,
}: EditMediaDialogProps) {
  const t = useTranslations("knowledgeBase.media");

  // Refs for uncontrolled text inputs - prevents re-render on keystroke
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const altTextRef = useRef<HTMLInputElement>(null);
  const aiInstructionsRef = useRef<HTMLTextAreaElement>(null);

  // Only these need controlled state (for immediate visual feedback)
  const [mediaRole, setMediaRole] = useState<MediaRole>(
    media.mediaType as MediaRole,
  );
  const [aiEnabled, setAiEnabled] = useState(media.aiEnabled ?? true);

  // Submission state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset refs when media changes
  useEffect(() => {
    if (open && captionRef.current) {
      captionRef.current.value = media.caption || "";
    }
    if (open && altTextRef.current) {
      altTextRef.current.value = media.altText || "";
    }
    if (open && aiInstructionsRef.current) {
      aiInstructionsRef.current.value = media.aiInstructions || "";
    }
    if (open) {
      setMediaRole(media.mediaType as MediaRole);
      setAiEnabled(media.aiEnabled ?? true);
      setError(null);
    }
  }, [open, media]);

  const handleSave = async () => {
    const caption = captionRef.current?.value || "";
    const altText = altTextRef.current?.value || "";
    const aiInstructions = aiInstructionsRef.current?.value || "";

    if (!caption.trim()) {
      setError(t("errors.captionRequired"));
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await kbMediaApi.updateMedia(media.id, {
        caption: caption.trim(),
        altText: altText.trim() || undefined,
        mediaRole,
        aiEnabled,
        aiInstructions: aiInstructions.trim() || undefined,
      });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to update media:", err);
      setError(err instanceof Error ? err.message : t("errors.updateFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editMedia")}</DialogTitle>
          <DialogDescription>{t("editMediaDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>
              {t("caption")}
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Textarea
              ref={captionRef}
              defaultValue={media.caption || ""}
              placeholder={t("captionPlaceholder")}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("altText")}</Label>
            <Input
              ref={altTextRef}
              defaultValue={media.altText || ""}
              placeholder={t("altTextPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("mediaRole")}</Label>
            <Select
              value={mediaRole}
              onValueChange={(v) => setMediaRole(v as MediaRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEDIA_ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>{t("aiEnabled")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("aiEnabledDescription")}
              </p>
            </div>
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
          </div>

          {/* AI Instructions - shown only when AI is enabled */}
          {aiEnabled && (
            <div className="space-y-2">
              <Label>{t("aiInstructions")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("aiInstructionsDescription")}
              </p>
              <Textarea
                ref={aiInstructionsRef}
                defaultValue={media.aiInstructions || ""}
                placeholder={t("aiInstructionsPlaceholder")}
                rows={3}
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteMediaDialogProps {
  media: KbMedia;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function DeleteMediaDialog({
  media,
  open,
  onOpenChange,
  onSuccess,
}: DeleteMediaDialogProps) {
  const t = useTranslations("knowledgeBase.media");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await kbMediaApi.deleteMedia(media.id);
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to delete media:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">
            {t("deleteMedia")}
          </DialogTitle>
          <DialogDescription>{t("deleteMediaConfirm")}</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <FileImage className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">
                {media.originalFileName || media.fileName}
              </p>
              <p className="text-sm text-muted-foreground">{media.caption}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            {t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ObjectMediaList({
  objectId,
  fieldId,
  editable = true,
  onEnsureObject,
}: ObjectMediaListProps) {
  const t = useTranslations("knowledgeBase.media");

  // Handle upload click - ensure object exists first
  const handleUploadClick = async () => {
    if (!objectId && onEnsureObject) {
      try {
        await onEnsureObject();
      } catch (err) {
        console.error("Failed to ensure object existence:", err);
        return;
      }
    }
    setUploadDialogOpen(true);
  };

  // Stable cache key - memoize to prevent SWR from re-fetching on every render
  // SWR uses stable-hash internally, but we need the reference to be stable
  // for our manual mutate() calls and useEffect dependencies
  const cacheKey = useMemo(
    () => (objectId ? ["object-media", objectId] : null),
    [objectId],
  );

  // Fetch media for object
  // Disable automatic revalidation to prevent unnecessary refetches when:
  // - Opening/closing dialogs (which might trigger focus events)
  // - Switching browser tabs
  // We manually trigger refresh via mutate() when data changes
  const { data: mediaList, isLoading } = useSWR<KbMedia[]>(
    cacheKey,
    () => kbMediaApi.listObjectMedia(objectId!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  // Calculate media limit status from the media list
  // This avoids an extra API call and stays in sync with the displayed list
  const mediaCount = mediaList?.length ?? 0;
  const canUploadMore = mediaCount < KB_OBJECT_MEDIA_LIMIT;
  const remainingSlots = Math.max(0, KB_OBJECT_MEDIA_LIMIT - mediaCount);

  // Subscribe to compression status updates
  // This will automatically refresh the media list when compression status changes
  useCompressionUpdates({
    objectId,
    onComplete: () => {
      // Refresh media list when compression completes
      mutate(cacheKey);
    },
    onError: () => {
      // Also refresh on error to show the failed status
      mutate(cacheKey);
    },
  });

  // Track real-time compression progress for individual media items
  const { getProgress, getStatus } = useCompressionProgress();

  // Poll for compression status when webhook might have failed (local dev)
  // This is a fallback mechanism that checks S3 directly
  useEffect(() => {
    // Find media items that are pending or processing
    const pendingMedia = mediaList?.filter(
      (m) =>
        m.compressionStatus === "pending" ||
        m.compressionStatus === "processing",
    );

    if (!pendingMedia || pendingMedia.length === 0) {
      return;
    }

    // Poll every 5 seconds for each pending item
    const pollInterval = setInterval(async () => {
      let anyUpdated = false;

      for (const media of pendingMedia) {
        try {
          const result = await kbMediaApi.checkCompressionStatus(media.id);
          if (result.updated) {
            anyUpdated = true;
            console.log(
              `🎬 Compression completed for ${media.id}:`,
              result.status,
              result.compressionRatio
                ? `(${result.compressionRatio.toFixed(1)}x reduction)`
                : "",
            );
          }
        } catch (err) {
          console.error(
            `Failed to check compression status for ${media.id}:`,
            err,
          );
        }
      }

      // If any status was updated, refresh the media list
      // cacheKey is stable since it's memoized based on objectId
      if (anyUpdated) {
        mutate(cacheKey);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
    // Note: cacheKey is derived from objectId via useMemo, so we only need objectId here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaList, objectId]);

  // Dialog states
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<KbMedia | null>(null);
  const [deletingMedia, setDeletingMedia] = useState<KbMedia | null>(null);

  // Handle download
  const handleDownload = async (media: KbMedia) => {
    try {
      const { url } = await kbMediaApi.getDownloadUrl(media.id);
      window.open(url, "_blank");
    } catch (err) {
      console.error("Failed to get download URL:", err);
    }
  };

  // Handle AI toggle
  const handleToggleAi = async (media: KbMedia) => {
    try {
      // TODO: Get current AI status from media
      const currentlyEnabled = true;
      await kbMediaApi.updateAiPermission(media.id, {
        aiEnabled: !currentlyEnabled,
      });
      mutate(cacheKey);
    } catch (err) {
      console.error("Failed to toggle AI:", err);
    }
  };

  // Refresh after changes
  const handleRefresh = () => {
    mutate(cacheKey);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{t("mediaTitle")}</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p className="text-sm">
                      {t("mediaLimitHelp", { limit: KB_OBJECT_MEDIA_LIMIT })}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <CardDescription>
              {mediaList?.length
                ? t("mediaCountWithLimit", {
                    count: mediaList.length,
                    limit: KB_OBJECT_MEDIA_LIMIT,
                  })
                : t("noMedia")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Show warning badge when limit reached */}
            {!canUploadMore && editable && (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                {t("limitReached")}
              </Badge>
            )}
            {editable && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        onClick={handleUploadClick}
                        disabled={!canUploadMore}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {t("addMedia")}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canUploadMore && (
                    <TooltipContent>
                      <p>
                        {t("limitReachedTooltip", {
                          limit: KB_OBJECT_MEDIA_LIMIT,
                        })}
                      </p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {mediaList && mediaList.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {mediaList.map((media) => (
                <MediaCard
                  key={media.id}
                  media={media}
                  editable={editable}
                  compressionProgress={
                    // Use real-time progress from WebSocket if available,
                    // otherwise fall back to status-based display
                    getStatus(media.id) === "processing" ||
                    media.compressionStatus === "processing"
                      ? getProgress(media.id)
                      : undefined
                  }
                  onEdit={() => setEditingMedia(media)}
                  onDelete={() => setDeletingMedia(media)}
                  onToggleAi={() => handleToggleAi(media)}
                  onDownload={() => handleDownload(media)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileImage className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("noMediaDescription")}</p>
              {editable && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={handleUploadClick}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t("uploadFirst")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <MediaUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        objectId={objectId || ""} // Ensure string, though dialog might check validity
        fieldId={fieldId}
        onSuccess={handleRefresh}
      />

      {/* Edit Dialog */}
      {editingMedia && (
        <EditMediaDialog
          media={editingMedia}
          open={!!editingMedia}
          onOpenChange={(open) => !open && setEditingMedia(null)}
          onSuccess={handleRefresh}
        />
      )}

      {/* Delete Dialog */}
      {deletingMedia && (
        <DeleteMediaDialog
          media={deletingMedia}
          open={!!deletingMedia}
          onOpenChange={(open) => !open && setDeletingMedia(null)}
          onSuccess={handleRefresh}
        />
      )}
    </>
  );
}

export default ObjectMediaList;
