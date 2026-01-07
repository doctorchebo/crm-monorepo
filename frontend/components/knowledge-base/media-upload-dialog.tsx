/**
 * Knowledge Base Media Upload Dialog
 *
 * Dialog for uploading media to knowledge base objects with mandatory
 * caption and AI permission settings. Uses native HTML5 drag and drop.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  kbMediaApi,
  MEDIA_ROLE_OPTIONS,
  type KbMedia,
  type MediaRole,
  type UploadPhase,
} from "@/lib/api/kb-media";
import { validateWhatsAppMedia } from "@/lib/constants/whatsapp-media-limits";
import {
  AlertCircle,
  Bot,
  FileImage,
  FileText,
  FileVideo,
  HelpCircle,
  Loader2,
  Music,
  Upload,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";

interface MediaUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objectId: string;
  fieldId?: string;
  onSuccess?: (media: KbMedia) => void;
}

/**
 * Form state for controlled inputs (select, switch, badges)
 * Text inputs use uncontrolled refs to prevent re-renders on keystroke
 */
interface ControlledFormState {
  mediaRole: MediaRole;
  aiEnabled: boolean;
  allowedLanguages: string[];
}

const ALLOWED_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "nl", label: "Dutch" },
  { value: "ar", label: "Arabic" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "hi", label: "Hindi" },
];

// Accepted file extensions (WhatsApp supported)
const ACCEPTED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp", // images
  ".mp4",
  ".3gp", // video
  ".mp3",
  ".ogg",
  ".amr", // audio
  ".pdf",
  ".xls",
  ".xlsx",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx", // documents
];

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.startsWith("video/")) return FileVideo;
  if (mimeType.startsWith("audio/")) return Music;
  return FileText;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidFileType(file: File): boolean {
  const extension = "." + file.name.split(".").pop()?.toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(extension);
}

export function MediaUploadDialog({
  open,
  onOpenChange,
  objectId,
  fieldId,
  onSuccess,
}: MediaUploadDialogProps) {
  const t = useTranslations("knowledgeBase.media");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs for uncontrolled text inputs - prevents re-render on keystroke
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const altTextRef = useRef<HTMLInputElement>(null);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  // Controlled form state - only for inputs needing immediate visual feedback
  const [controlledState, setControlledState] = useState<ControlledFormState>({
    mediaRole: "gallery_image",
    aiEnabled: true,
    allowedLanguages: [],
  });

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("uploading");
  const [error, setError] = useState<string | null>(null);
  const [compressionWarning, setCompressionWarning] = useState<string | null>(
    null
  );

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      // Reset refs
      if (captionRef.current) captionRef.current.value = "";
      if (altTextRef.current) altTextRef.current.value = "";
      // Reset controlled state
      setControlledState({
        mediaRole: "gallery_image",
        aiEnabled: true,
        allowedLanguages: [],
      });
      setValidationErrors({});
      setError(null);
    }
  }, [open]);

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    if (!isValidFileType(file)) {
      setError("Unsupported file type");
      return;
    }

    // Validate against WhatsApp limits
    const whatsAppValidation = validateWhatsAppMedia(
      file.type,
      file.size,
      file.name
    );

    if (!whatsAppValidation.isValid) {
      setError(whatsAppValidation.errors.join(" "));
      setCompressionWarning(null);
      return;
    }

    // Show compression warning if video needs compression
    if (whatsAppValidation.needsCompression) {
      setCompressionWarning(
        `This video (${formatFileSize(
          file.size
        )}) will be automatically compressed after upload to meet WhatsApp's 16 MB limit.`
      );
    } else {
      setCompressionWarning(null);
    }

    // Log other warnings
    if (whatsAppValidation.warnings.length > 0) {
      console.warn(
        "[KB Media Upload] WhatsApp warnings:",
        whatsAppValidation.warnings
      );
    }

    setSelectedFile(file);
    setError(null);

    // Generate preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }

    // Auto-suggest media role based on file type
    if (file.type.startsWith("video/")) {
      setControlledState((prev) => ({ ...prev, mediaRole: "video_tour" }));
    } else if (file.type === "application/pdf") {
      setControlledState((prev) => ({ ...prev, mediaRole: "brochure" }));
    } else if (file.type.startsWith("audio/")) {
      setControlledState((prev) => ({
        ...prev,
        mediaRole: "audio_description",
      }));
    }
  }, []);

  // Handle drag events
  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect]
  );

  // Handle file input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect]
  );

  // Validate form - read values from refs
  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    const caption = captionRef.current?.value || "";

    if (!selectedFile) {
      errors.file = t("errors.fileRequired");
    }

    if (!caption.trim()) {
      errors.caption = t("errors.captionRequired");
    } else if (caption.length < 10) {
      errors.caption = t("errors.captionTooShort");
    }

    if (!controlledState.mediaRole) {
      errors.mediaRole = t("errors.roleRequired");
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle upload - collect values from refs
  const handleUpload = async () => {
    if (!validate() || !selectedFile) return;

    const caption = captionRef.current?.value || "";
    const altText = altTextRef.current?.value || "";

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);
    setUploadPhase("uploading");

    try {
      const media = await kbMediaApi.uploadMedia(
        selectedFile,
        {
          objectId,
          fieldId,
          mediaRole: controlledState.mediaRole,
          caption: caption.trim(),
          altText: altText.trim() || undefined,
          aiEnabled: controlledState.aiEnabled,
          allowedLanguages:
            controlledState.allowedLanguages.length > 0
              ? controlledState.allowedLanguages
              : undefined,
        },
        undefined,
        // Phase-aware progress callback
        ({ progress, phase }) => {
          setUploadProgress(progress);
          setUploadPhase(phase);
        }
      );

      onSuccess?.(media);
      handleClose();
    } catch (err) {
      console.error("Upload failed:", err);
      setError(err instanceof Error ? err.message : t("errors.uploadFailed"));
    } finally {
      setIsUploading(false);
    }
  };

  // Reset and close
  const handleClose = () => {
    setSelectedFile(null);
    setPreview(null);
    // Reset refs
    if (captionRef.current) captionRef.current.value = "";
    if (altTextRef.current) altTextRef.current.value = "";
    // Reset controlled state
    setControlledState({
      mediaRole: "gallery_image",
      aiEnabled: true,
      allowedLanguages: [],
    });
    setValidationErrors({});
    setError(null);
    setCompressionWarning(null);
    setUploadProgress(0);
    setUploadPhase("uploading");
    onOpenChange(false);
  };

  // Clear validation error when caption input changes
  const handleCaptionChange = useCallback(() => {
    if (validationErrors.caption) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.caption;
        return newErrors;
      });
    }
  }, [validationErrors.caption]);

  // Handle role change - auto-update AI setting based on role defaults
  const handleRoleChange = (role: MediaRole) => {
    const roleOption = MEDIA_ROLE_OPTIONS.find((r) => r.value === role);
    setControlledState((prev) => ({
      ...prev,
      mediaRole: role,
      aiEnabled: roleOption?.defaultAiEnabled ?? prev.aiEnabled,
    }));
    // Clear validation error
    if (validationErrors.mediaRole) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.mediaRole;
        return newErrors;
      });
    }
  };

  // Toggle language selection
  const toggleLanguage = (lang: string) => {
    setControlledState((prev) => ({
      ...prev,
      allowedLanguages: prev.allowedLanguages.includes(lang)
        ? prev.allowedLanguages.filter((l) => l !== lang)
        : [...prev.allowedLanguages, lang],
    }));
  };

  const FileIcon = selectedFile ? getFileIcon(selectedFile.type) : FileImage;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t("uploadTitle")}
          </DialogTitle>
          <DialogDescription>{t("uploadDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* File Drop Zone */}
          {!selectedFile ? (
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors
                ${
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25"
                }
                hover:border-primary hover:bg-primary/5
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(",")}
                onChange={handleInputChange}
                className="hidden"
              />
              <FileImage className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm font-medium">
                {isDragActive ? t("dropHere") : t("dragOrClick")}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {t("supportedFormats")}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg p-4">
              <div className="flex items-start gap-4">
                {preview ? (
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-24 h-24 object-cover rounded-lg"
                  />
                ) : (
                  <div className="w-24 h-24 bg-muted rounded-lg flex items-center justify-center">
                    <FileIcon className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                  <Badge variant="outline" className="mt-2">
                    {selectedFile.type}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedFile(null);
                    setPreview(null);
                  }}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {validationErrors.file && (
                <p className="text-sm text-destructive mt-2 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.file}
                </p>
              )}
              {compressionWarning && (
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                  <p className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{compressionWarning}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Caption (Required) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              {t("caption")}
              <span className="text-destructive">*</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">{t("captionHint")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Textarea
              ref={captionRef}
              onChange={handleCaptionChange}
              placeholder={t("captionPlaceholder")}
              rows={3}
              disabled={isUploading}
            />
            {validationErrors.caption && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {validationErrors.caption}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t("captionHelp")}</p>
          </div>

          {/* Alt Text */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              {t("altText")}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">{t("altTextHint")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input
              ref={altTextRef}
              placeholder={t("altTextPlaceholder")}
              disabled={isUploading}
            />
          </div>

          {/* Media Role */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              {t("mediaRole")}
              <span className="text-destructive">*</span>
            </Label>
            <Select
              value={controlledState.mediaRole}
              onValueChange={handleRoleChange}
              disabled={isUploading}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("selectRole")} />
              </SelectTrigger>
              <SelectContent>
                {MEDIA_ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <div className="flex items-center gap-2">
                      <span>{role.label}</span>
                      {role.defaultAiEnabled && (
                        <Bot className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validationErrors.mediaRole && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {validationErrors.mediaRole}
              </p>
            )}
            {controlledState.mediaRole && (
              <p className="text-xs text-muted-foreground">
                {
                  MEDIA_ROLE_OPTIONS.find(
                    (r) => r.value === controlledState.mediaRole
                  )?.description
                }
              </p>
            )}
          </div>

          {/* AI Settings Section */}
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="font-medium">{t("aiSettings")}</span>
            </div>

            {/* AI Enabled Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t("aiEnabled")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("aiEnabledDescription")}
                </p>
              </div>
              <Switch
                checked={controlledState.aiEnabled}
                onCheckedChange={(checked) =>
                  setControlledState((prev) => ({
                    ...prev,
                    aiEnabled: checked,
                  }))
                }
                disabled={isUploading}
              />
            </div>

            {/* Language Restrictions (only show if AI enabled) */}
            {controlledState.aiEnabled && (
              <div className="space-y-2">
                <Label>{t("languageRestrictions")}</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  {t("languageRestrictionsDescription")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {ALLOWED_LANGUAGES.map((lang) => (
                    <Badge
                      key={lang.value}
                      variant={
                        controlledState.allowedLanguages.includes(lang.value)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer"
                      onClick={() => !isUploading && toggleLanguage(lang.value)}
                    >
                      {lang.label}
                    </Badge>
                  ))}
                </div>
                {controlledState.allowedLanguages.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("allLanguagesAllowed")}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {uploadPhase === "uploading" && t("phaseUploading")}
                  {uploadPhase === "processing" && t("phaseProcessing")}
                  {uploadPhase === "complete" && t("phaseComplete")}
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("uploading")}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                {t("upload")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MediaUploadDialog;
