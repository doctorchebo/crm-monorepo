"use client";

import { VariableAutocomplete } from "@/components/templates/variable-autocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useComponentValidation } from "@/hooks/use-component-validation";
import { useNotification } from "@/hooks/use-notification";
import { useTemplateMediaThumbnail } from "@/hooks/use-template-media-thumbnail";
import {
  componentsFromLegacy,
  componentsToLegacy,
  createEmptyComponents,
  isLocationHeader,
  isMediaHeader,
  MediaHeader,
  TemplateComponents,
} from "@/lib/types/template-components.types";
import { cn } from "@/lib/utils";
import { TEMPLATE_LIMITS } from "@/lib/validation/template-components.validation";
import {
  AlertCircle,
  AlertTriangle,
  Eye,
  HelpCircle,
  LayoutGrid,
  Type,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ButtonEditor } from "./button-editor";
import { CarouselEditor } from "./carousel-editor";
import { EnhancedTemplatePreview } from "./enhanced-template-preview";
import { HeaderEditor } from "./header-editor";
import { useMediaUpload } from "./use-media-upload";

interface EnhancedTemplateEditorProps {
  /** Template ID for media uploads */
  templateId?: string;
  /** Locale ID for media uploads */
  localeId?: string;
  /** Initial components data */
  initialComponents?: TemplateComponents;
  /** Legacy form data (header, body, footer strings) */
  legacyData?: {
    header?: string;
    body: string;
    footer?: string;
  };
  /** Template category for button filtering */
  category: "utility" | "marketing" | "authentication";
  /** Whether the form is read-only */
  disabled?: boolean;
  /** Callback when components change */
  onChange?: (components: TemplateComponents) => void;
  /** Callback to get legacy data for form submission */
  onLegacyChange?: (data: {
    header?: string;
    body: string;
    footer?: string;
  }) => void;
  /** Example variables for preview */
  exampleVars?: Record<string, string>;
  /** Show validation errors (default: true) */
  showValidation?: boolean;
}

/**
 * EnhancedTemplateEditor Component
 *
 * A comprehensive editor for WhatsApp template components with:
 * - Header editor (text, media, location)
 * - Body text area with variable support
 * - Footer text
 * - Button editor with Meta constraints
 * - Carousel editor for marketing templates
 * - Live preview
 *
 * Supports both simple (legacy) mode and advanced mode.
 */
export function EnhancedTemplateEditor({
  templateId,
  localeId,
  initialComponents,
  legacyData,
  category,
  disabled = false,
  onChange,
  onLegacyChange,
  exampleVars = {},
  showValidation = true,
}: EnhancedTemplateEditorProps) {
  const t = useTranslations("templates");
  const { addNotification } = useNotification();

  /**
   * Determines if components require advanced mode.
   * Advanced mode is needed for:
   * - Media headers (IMAGE, VIDEO, DOCUMENT)
   * - Location headers
   * - Buttons
   * - Carousel cards
   */
  const requiresAdvancedMode = useCallback(
    (components: TemplateComponents | undefined): boolean => {
      if (!components) return false;

      // Check for media or location headers
      if (
        isMediaHeader(components.header) ||
        isLocationHeader(components.header)
      ) {
        return true;
      }

      // Check for buttons
      if (components.buttons && components.buttons.length > 0) {
        return true;
      }

      // Check for carousel
      if (components.carousel && components.carousel.length > 0) {
        return true;
      }

      return false;
    },
    [],
  );

  // Track if we've received initial data to prevent overwriting user edits
  const hasReceivedInitialData = useRef(false);
  // Track the initial body text to detect if initialComponents actually changed
  const initialBodyTextRef = useRef<string | undefined>(undefined);

  // Compute initial mode from initialComponents
  const computedInitialMode = useMemo(
    () => (requiresAdvancedMode(initialComponents) ? "advanced" : "simple"),
    [initialComponents, requiresAdvancedMode],
  );

  // Mode: simple uses legacy string fields, advanced uses full components
  const [mode, setMode] = useState<"simple" | "advanced">(computedInitialMode);

  // Active tab in advanced mode
  const [activeTab, setActiveTab] = useState("header");

  // Preview modal state
  const [showPreview, setShowPreview] = useState(false);

  // Components state
  const [components, setComponents] = useState<TemplateComponents>(() => {
    if (initialComponents) {
      return initialComponents;
    }
    if (legacyData) {
      return componentsFromLegacy(
        legacyData.header,
        legacyData.body,
        legacyData.footer,
      );
    }
    return createEmptyComponents();
  });

  /**
   * Sync mode and components when initialComponents prop changes.
   * This handles the async loading case where version data arrives after initial render.
   *
   * Key insight: We need to sync when initialComponents has meaningful data that differs
   * from what we last synced, but NOT when the user is actively editing.
   */
  useEffect(() => {
    // Check if initialComponents has meaningful data (not just empty defaults)
    const hasComponentData =
      initialComponents &&
      (initialComponents.body?.text ||
        initialComponents.header ||
        initialComponents.buttons?.length ||
        initialComponents.carousel?.length);

    const currentInitialBodyText = initialComponents?.body?.text || "";

    console.log("[EnhancedTemplateEditor] Sync useEffect:", {
      hasReceivedInitialData: hasReceivedInitialData.current,
      initialBodyTextRef: initialBodyTextRef.current?.substring(0, 30),
      currentInitialBodyText: currentInitialBodyText.substring(0, 30),
      currentComponentsBodyText: components.body?.text?.substring(0, 30),
      hasComponentData,
    });

    // Case 1: First time receiving meaningful data
    if (!hasReceivedInitialData.current && hasComponentData) {
      console.log("[EnhancedTemplateEditor] First sync from initialComponents");
      hasReceivedInitialData.current = true;
      initialBodyTextRef.current = currentInitialBodyText;
      setComponents(initialComponents);

      if (requiresAdvancedMode(initialComponents)) {
        setMode("advanced");
      }
      return;
    }

    // Case 2: initialComponents changed after initial load (e.g., page refresh with new data)
    // Only sync if the new initialComponents is different from what we last synced
    if (
      hasReceivedInitialData.current &&
      hasComponentData &&
      initialBodyTextRef.current !== currentInitialBodyText
    ) {
      console.log(
        "[EnhancedTemplateEditor] Re-syncing due to changed initialComponents",
      );
      initialBodyTextRef.current = currentInitialBodyText;
      setComponents(initialComponents);

      if (requiresAdvancedMode(initialComponents)) {
        setMode("advanced");
      }
    }
  }, [initialComponents, requiresAdvancedMode]);

  // Validation hook - real-time component validation
  const {
    hasFieldError,
    getFieldErrors,
    visibleErrorCount,
    visibleWarningCount,
    touchField,
  } = useComponentValidation(components, {
    category,
    debounceMs: 300,
    validateOnMount: false,
    showOnlyTouched: true,
  });

  // Media upload hook
  const { upload, isUploading, uploadProgress } = useMediaUpload(
    templateId,
    localeId,
  );

  // Template media thumbnail WebSocket hook (for video/document thumbnails)
  const { registerPendingThumbnail, unregisterPendingThumbnail } =
    useTemplateMediaThumbnail({ debug: true });

  // Track current pending thumbnail tempId for cleanup
  const pendingThumbnailTempIdRef = useRef<string | null>(null);

  // Cleanup pending thumbnail on unmount
  useEffect(() => {
    return () => {
      if (pendingThumbnailTempIdRef.current) {
        unregisterPendingThumbnail(pendingThumbnailTempIdRef.current);
      }
    };
  }, [unregisterPendingThumbnail]);

  // Tracking which carousel cards are uploading
  const [uploadingCards, setUploadingCards] = useState<Set<number>>(new Set());

  // Handle component changes
  const handleComponentsChange = useCallback(
    (newComponents: TemplateComponents) => {
      console.log("[EnhancedTemplateEditor] handleComponentsChange:", {
        bodyText: newComponents.body?.text?.substring(0, 50),
        hasOnChange: !!onChange,
      });
      // Update the ref so useEffect knows this is an internal change, not external
      initialBodyTextRef.current = newComponents.body?.text || "";
      setComponents(newComponents);
      onChange?.(newComponents);

      // Also update legacy data for backward compatibility
      const legacy = componentsToLegacy(newComponents);
      onLegacyChange?.(legacy);
    },
    [onChange, onLegacyChange],
  );

  // Handle header change
  const handleHeaderChange = useCallback(
    (header: TemplateComponents["header"]) => {
      touchField("header");
      handleComponentsChange({ ...components, header });
    },
    [components, handleComponentsChange, touchField],
  );

  // Handle body change
  const handleBodyChange = useCallback(
    (text: string) => {
      touchField("body.text");
      handleComponentsChange({
        ...components,
        body: { text },
      });
    },
    [components, handleComponentsChange, touchField],
  );

  // Handle footer change
  const handleFooterChange = useCallback(
    (text: string) => {
      touchField("footer.text");
      handleComponentsChange({
        ...components,
        footer: text ? { text } : undefined,
      });
    },
    [components, handleComponentsChange, touchField],
  );

  // Handle button change
  const handleButtonsChange = useCallback(
    (buttons: TemplateComponents["buttons"]) => {
      touchField("buttons");
      handleComponentsChange({ ...components, buttons });
    },
    [components, handleComponentsChange, touchField],
  );

  // Handle carousel change
  const handleCarouselChange = useCallback(
    (carousel: TemplateComponents["carousel"]) => {
      touchField("carousel");
      handleComponentsChange({ ...components, carousel });
    },
    [components, handleComponentsChange, touchField],
  );

  // Handle header media upload
  const handleHeaderMediaUpload = useCallback(
    async (
      file: File,
    ): Promise<{
      assetHandle?: string;
      url?: string;
      error?: string;
      tempId?: string;
    }> => {
      try {
        // Determine media type from file
        let mediaType: "IMAGE" | "VIDEO" | "DOCUMENT" = "IMAGE";
        if (file.type.startsWith("video/")) {
          mediaType = "VIDEO";
        } else if (file.type === "application/pdf") {
          mediaType = "DOCUMENT";
        }

        const result = await upload(file, "header", mediaType);

        // For videos and documents, register for thumbnail WebSocket event
        if (
          result.success &&
          result.tempId &&
          (mediaType === "VIDEO" || mediaType === "DOCUMENT")
        ) {
          // Clean up any previous pending thumbnail
          if (pendingThumbnailTempIdRef.current) {
            unregisterPendingThumbnail(pendingThumbnailTempIdRef.current);
          }

          // Store the tempId for cleanup
          pendingThumbnailTempIdRef.current = result.tempId;

          // Register callback for when thumbnail is ready
          registerPendingThumbnail(result.tempId, (thumbnailUrl: string) => {
            console.log(
              `[EnhancedTemplateEditor] Thumbnail ready for tempId ${result.tempId}: ${thumbnailUrl}`,
            );

            // Update the header with the thumbnail URL
            // Use functional update to get latest state, then notify parent in a separate effect
            setComponents((currentComponents) => {
              const currentHeader = currentComponents.header;
              if (currentHeader && isMediaHeader(currentHeader)) {
                const updatedHeader: MediaHeader = {
                  ...currentHeader,
                  url: thumbnailUrl,
                };
                const newComponents = {
                  ...currentComponents,
                  header: updatedHeader,
                };

                // Defer parent notification to avoid "Cannot update while rendering" error
                setTimeout(() => {
                  onChange?.(newComponents);
                  const legacy = componentsToLegacy(newComponents);
                  onLegacyChange?.(legacy);
                }, 0);

                return newComponents;
              }
              return currentComponents;
            });

            // Clear the pending ref
            pendingThumbnailTempIdRef.current = null;
          });
        }

        // Note: We don't call handleHeaderChange here anymore.
        // The header-editor handles the state update using the returned url.
        // This prevents race conditions between local preview and final URL.
        return {
          assetHandle: result.assetHandle,
          url: result.url,
          error: result.error,
          tempId: result.tempId,
        };
      } catch (error) {
        console.error("Header media upload failed:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        return { error: errorMessage };
      }
    },
    [
      upload,
      registerPendingThumbnail,
      unregisterPendingThumbnail,
      onChange,
      onLegacyChange,
    ],
  );

  // Handle carousel card media upload
  const handleCarouselMediaUpload = useCallback(
    async (
      cardIndex: number,
      file: File,
    ): Promise<{ assetHandle?: string; error?: string }> => {
      setUploadingCards((prev) => new Set(prev).add(cardIndex));

      try {
        const card = components.carousel?.[cardIndex];
        if (!card) {
          return { error: "Card not found" };
        }

        const result = await upload(
          file,
          `carousel_${cardIndex}`,
          card.header.format,
        );

        if (result.success) {
          const newCarousel = [...(components.carousel || [])];
          newCarousel[cardIndex] = {
            ...card,
            header: {
              ...card.header,
              url: result.url,
              assetHandle: result.assetHandle,
            },
          };
          handleCarouselChange(newCarousel);
        }

        return {
          assetHandle: result.assetHandle,
          error: result.error,
        };
      } catch (error) {
        console.error("Carousel media upload failed:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        return { error: errorMessage };
      } finally {
        setUploadingCards((prev) => {
          const next = new Set(prev);
          next.delete(cardIndex);
          return next;
        });
      }
    },
    [upload, components.carousel, handleCarouselChange],
  );

  // Mode toggle handler
  const handleModeChange = useCallback(
    (advanced: boolean) => {
      const newMode = advanced ? "advanced" : "simple";
      setMode(newMode);

      // If switching to simple mode and has complex features, warn
      if (
        !advanced &&
        (components.buttons?.length || components.carousel?.length)
      ) {
        addNotification(
          t("advancedFeaturesWillBeHidden") ||
            "Buttons and carousel will be hidden in simple mode but preserved",
          "info",
          4000,
        );
      }
    },
    [components.buttons, components.carousel, addNotification, t],
  );

  // Determine if carousel is available (marketing category only)
  const canUseCarousel = category === "marketing";

  // Helper: render field validation errors
  const renderFieldErrors = (fieldName: string) => {
    if (!showValidation) return null;
    const errors = getFieldErrors(fieldName);
    if (errors.length === 0) return null;

    return (
      <div className="mt-1 space-y-1">
        {errors.map((error, i) => (
          <div
            key={error.code || i}
            className={cn(
              "flex items-center gap-1 text-xs",
              error.severity === "error"
                ? "text-destructive"
                : "text-yellow-600 dark:text-yellow-500",
            )}
          >
            {error.severity === "error" ? (
              <AlertCircle className="h-3 w-3" />
            ) : (
              <AlertTriangle className="h-3 w-3" />
            )}
            <span>{error.message}</span>
          </div>
        ))}
      </div>
    );
  };

  // Helper: get tab error count for badge (respects touched state via getFieldErrors)
  const getTabErrorCount = (tabField: string): number => {
    if (!showValidation) return 0;
    return getFieldErrors(tabField).length;
  };

  return (
    <div className="space-y-6">
      {/* Mode Toggle with Validation Summary */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {t("simpleMode") || "Simple"}
              </span>
            </div>
            <Switch
              checked={mode === "advanced"}
              onCheckedChange={handleModeChange}
              disabled={disabled}
            />
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {t("advancedMode") || "Advanced"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Validation summary badges - show only visible (touched) errors */}
            {showValidation &&
              (visibleErrorCount > 0 || visibleWarningCount > 0) && (
                <div className="flex items-center gap-2">
                  {visibleErrorCount > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {visibleErrorCount}{" "}
                      {visibleErrorCount === 1 ? "error" : "errors"}
                    </Badge>
                  )}
                  {visibleWarningCount > 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs text-yellow-600 border-yellow-500"
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {visibleWarningCount}{" "}
                      {visibleWarningCount === 1 ? "warning" : "warnings"}
                    </Badge>
                  )}
                </div>
              )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-sm">
                    {t("modeHelpText") ||
                      "Simple mode: Basic text-only templates. Advanced mode: Add buttons, media headers, carousels, and more."}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </Card>

      {/* Simple Mode - Just text fields */}
      {mode === "simple" && (
        <Card className="p-6 space-y-4">
          <div>
            <Label htmlFor="simple-header">
              {t("header") || "Header (Optional)"}
            </Label>
            <input
              id="simple-header"
              type="text"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={
                components.header?.format === "TEXT"
                  ? components.header.text || ""
                  : ""
              }
              onChange={(e) =>
                handleHeaderChange(
                  e.target.value
                    ? { format: "TEXT", text: e.target.value }
                    : undefined,
                )
              }
              placeholder={t("headerPlaceholder") || "e.g., Order Update"}
              disabled={disabled}
            />
          </div>

          <div>
            <Label htmlFor="simple-body">
              {t("messageBody") || "Message Body"}
            </Label>
            <VariableAutocomplete
              id="simple-body"
              className={cn(hasFieldError("body.text") && "border-destructive")}
              value={components.body.text}
              onChange={handleBodyChange}
              placeholder={
                t("bodyPlaceholder") ||
                "Hello {{1}}, your order is ready for pickup!"
              }
              disabled={disabled}
              rows={6}
            />
            <div className="flex items-center justify-between mt-1">
              <span
                className={cn(
                  "text-xs text-muted-foreground",
                  components.body.text.length >
                    TEMPLATE_LIMITS.BODY_MAX_LENGTH && "text-destructive",
                )}
              >
                {components.body.text.length}/{TEMPLATE_LIMITS.BODY_MAX_LENGTH}
              </span>
            </div>
            {renderFieldErrors("body.text")}
          </div>

          <div>
            <Label htmlFor="simple-footer">
              {t("footer") || "Footer (Optional)"}
            </Label>
            <input
              id="simple-footer"
              type="text"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={components.footer?.text || ""}
              onChange={(e) => handleFooterChange(e.target.value)}
              placeholder={
                t("footerPlaceholder") || "Thank you for your business!"
              }
              disabled={disabled}
            />
          </div>
        </Card>
      )}

      {/* Advanced Mode - Full component editors */}
      {mode === "advanced" && (
        <Card className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="header" className="relative">
                {t("header") || "Header"}
                {getTabErrorCount("header") > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                    {getTabErrorCount("header")}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="content" className="relative">
                {t("content") || "Content"}
                {(getTabErrorCount("body") > 0 ||
                  getTabErrorCount("footer") > 0) && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                    {getTabErrorCount("body") + getTabErrorCount("footer")}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="buttons" className="relative">
                {t("buttons") || "Buttons"}
                {getTabErrorCount("buttons") > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                    {getTabErrorCount("buttons")}
                  </span>
                )}
              </TabsTrigger>
              {canUseCarousel && (
                <TabsTrigger value="carousel" className="relative">
                  {t("carousel") || "Carousel"}
                  {getTabErrorCount("carousel") > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                      {getTabErrorCount("carousel")}
                    </span>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="header" className="mt-4">
              <HeaderEditor
                value={components.header}
                onChange={handleHeaderChange}
                disabled={disabled}
                onMediaUpload={handleHeaderMediaUpload}
                isUploading={isUploading}
              />
            </TabsContent>

            <TabsContent value="content" className="mt-4 space-y-4">
              <div>
                <Label htmlFor="adv-body" className="mb-2 block">
                  {t("messageBody") || "Message Body"}
                  <span className="text-xs text-muted-foreground ml-2">
                    {t("useVariablesHint") ||
                      "Type {{ to see available variables"}
                  </span>
                </Label>
                <VariableAutocomplete
                  id="adv-body"
                  className={cn(
                    hasFieldError("body.text") && "border-destructive",
                  )}
                  value={components.body.text}
                  onChange={handleBodyChange}
                  placeholder={
                    t("bodyPlaceholder") ||
                    "Hello {{1}}, your order {{2}} is ready!"
                  }
                  disabled={disabled}
                  rows={8}
                />
                <p
                  className={cn(
                    "text-xs text-muted-foreground mt-1",
                    components.body.text.length >
                      TEMPLATE_LIMITS.BODY_MAX_LENGTH && "text-destructive",
                  )}
                >
                  {components.body.text.length}/
                  {TEMPLATE_LIMITS.BODY_MAX_LENGTH}{" "}
                  {t("characters") || "characters"}
                </p>
                {renderFieldErrors("body.text")}
              </div>

              <div>
                <Label htmlFor="adv-footer" className="mb-2 block">
                  {t("footer") || "Footer (Optional)"}
                </Label>
                <input
                  id="adv-footer"
                  type="text"
                  className={cn(
                    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    hasFieldError("footer.text") && "border-destructive",
                  )}
                  value={components.footer?.text || ""}
                  onChange={(e) => handleFooterChange(e.target.value)}
                  placeholder={t("footerPlaceholder") || "Your business name"}
                  disabled={disabled}
                  maxLength={TEMPLATE_LIMITS.FOOTER_MAX_LENGTH}
                />
                <p
                  className={cn(
                    "text-xs text-muted-foreground mt-1",
                    (components.footer?.text?.length || 0) >
                      TEMPLATE_LIMITS.FOOTER_MAX_LENGTH && "text-destructive",
                  )}
                >
                  {(components.footer?.text || "").length}/
                  {TEMPLATE_LIMITS.FOOTER_MAX_LENGTH}{" "}
                  {t("characters") || "characters"}
                </p>
                {renderFieldErrors("footer.text")}
              </div>
            </TabsContent>

            <TabsContent value="buttons" className="mt-4">
              <ButtonEditor
                value={components.buttons || []}
                onChange={handleButtonsChange}
                disabled={disabled}
                category={category}
                maxButtons={category === "marketing" ? 10 : 3}
              />
              {renderFieldErrors("buttons")}
            </TabsContent>

            {canUseCarousel && (
              <TabsContent value="carousel" className="mt-4">
                <CarouselEditor
                  value={components.carousel || []}
                  onChange={handleCarouselChange}
                  disabled={disabled}
                  onMediaUpload={handleCarouselMediaUpload}
                  uploadingCards={uploadingCards}
                />
                {renderFieldErrors("carousel")}
              </TabsContent>
            )}
          </Tabs>
        </Card>
      )}

      {/* Preview Button */}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowPreview(true)}
        >
          <Eye className="h-4 w-4 mr-2" />
          {t("preview") || "Preview"}
        </Button>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-lg w-full">
            <EnhancedTemplatePreview
              components={components}
              exampleVars={exampleVars}
              showPhoneFrame={true}
            />
            <div className="flex justify-center mt-4">
              <Button variant="outline" onClick={() => setShowPreview(false)}>
                {t("closePreview") || "Close Preview"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EnhancedTemplateEditor;
