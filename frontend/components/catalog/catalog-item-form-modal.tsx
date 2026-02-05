"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useNotification } from "@/hooks/use-notification";
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useForm } from "react-hook-form";
import * as z from "zod";
const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "BRL",
  "MXN",
  "ARS",
  "CLP",
  "COP",
  "PEN",
  "BOB",
  "INR",
  "CNY",
  "JPY",
  "KRW",
  "SGD",
  "MYR",
  "THB",
  "VND",
  "PHP",
  "IDR",
  "AED",
  "SAR",
  "ZAR",
  "NGN",
  "EGP",
  "KES",
];

/**
 * Form schema for catalog item
 * Fields align with Meta Commerce catalog requirements
 */
const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().min(1, "Description is required").max(5000),
  price: z.coerce.number().min(0, "Price must be positive"),
  salePrice: z.coerce.number().min(0).optional().nullable(),
  currency: z.string().min(3).max(3),
  link: z.string().url("Valid URL is required"),
  retailerId: z.string().max(100).optional(),
  availability: z.enum(["in stock", "out of stock", "available for order"]),
  condition: z.enum(["new", "refurbished", "used"]),
  brand: z.string().max(100).optional(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Catalog item image state
 */
interface ImageState {
  id?: string;
  file?: File;
  url: string;
  thumbnailUrl?: string;
  imageKey?: string; // S3 key for the uploaded image
  originalFilename?: string; // Original filename from upload
  fileSize?: number; // File size in bytes from upload
  mimeType?: string; // MIME type from upload
  isMain: boolean;
  sortOrder: number;
  status: "pending" | "uploading" | "processing" | "ready" | "error";
  uploadProgress?: number;
  errorMessage?: string;
}

/**
 * Catalog item type
 * Fields align with Meta Commerce catalog requirements
 */
interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  salePrice: number | null;
  currency: string;
  link: string | null;
  retailerId: string | null;
  availability: string;
  condition: string;
  brand: string | null;
  status: string;
  images: {
    id: string;
    url: string;
    thumbnailUrl: string | null;
    isMain: boolean;
    sortOrder: number;
  }[];
}

interface CatalogItemFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: CatalogItem | null;
  onSave: () => void;
}

const MAX_IMAGES = 10;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"];

/**
 * Catalog Item Form Modal
 *
 * Full-featured form for creating/editing catalog items:
 * - Basic info: name, description, price
 * - Product details: availability, condition, SKU
 * - Image upload with drag & drop
 * - Image reordering
 */
export function CatalogItemFormModal({
  open,
  onOpenChange,
  item,
  onSave,
}: CatalogItemFormModalProps) {
  const t = useTranslations("catalog");
  const { addNotification } = useNotification();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [images, setImages] = useState<ImageState[]>([]);

  // Track active upload operations to prevent duplicate uploads
  const activeUploadsRef = useRef<Set<string>>(new Set());

  // Initialize form with Meta-required fields
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      salePrice: null,
      currency: "USD",
      link: "",
      retailerId: "",
      availability: "in stock",
      condition: "new",
      brand: "",
    },
  });

  // Reset form when item changes
  useEffect(() => {
    if (item) {
      form.reset({
        name: item.name,
        description: item.description || "",
        price: item.price / 100, // Convert from cents
        salePrice: item.salePrice ? item.salePrice / 100 : null,
        currency: item.currency,
        link: item.link || "",
        retailerId: item.retailerId || "",
        availability: item.availability as any,
        condition: item.condition as any,
        brand: item.brand || "",
      });

      // Set images
      setImages(
        item.images.map((img) => ({
          id: img.id,
          url: img.url,
          thumbnailUrl: img.thumbnailUrl || undefined,
          isMain: img.isMain,
          sortOrder: img.sortOrder,
          status: "ready" as const,
        })),
      );
    } else {
      form.reset();
      setImages([]);
    }
  }, [item, form, open]);

  /**
   * Upload a single image directly to backend (CORS-free)
   * The backend proxies the upload to S3
   * Runs asynchronously in the background - does NOT block UI
   */
  const uploadImageAsync = useCallback(
    async (imageUrl: string, file: File, catalogItemId?: string) => {
      // Prevent duplicate uploads using ref
      if (activeUploadsRef.current.has(imageUrl)) {
        return;
      }
      activeUploadsRef.current.add(imageUrl);

      try {
        // Update status to uploading
        setImages((prev) =>
          prev.map((img) =>
            img.url === imageUrl
              ? { ...img, status: "uploading" as const }
              : img,
          ),
        );

        // Upload file directly to backend (which proxies to S3)
        const uploadResult = await backendApi.catalog.uploadImage(
          file,
          catalogItemId,
        );

        // Update image state with upload result
        setImages((prev) =>
          prev.map((img) => {
            if (img.url !== imageUrl) return img;

            if (catalogItemId) {
              // Image was saved to database and thumbnail generation started
              return {
                id: uploadResult.imageId,
                url: uploadResult.imageKey,
                isMain: img.isMain,
                sortOrder: img.sortOrder,
                status: "ready" as const,
              };
            } else {
              // For new items, store the result for later association
              // Include file metadata needed for the association call
              return {
                id: uploadResult.imageId,
                url: img.url, // Keep the preview URL for display
                imageKey: uploadResult.imageKey,
                originalFilename: uploadResult.originalFilename,
                fileSize: uploadResult.fileSize,
                mimeType: uploadResult.mimeType,
                file: undefined, // Clear the file since it's uploaded
                isMain: img.isMain,
                sortOrder: img.sortOrder,
                status: "ready" as const,
              };
            }
          }),
        );
      } catch (error) {
        console.error("Image upload failed:", error);
        setImages((prev) =>
          prev.map((img) =>
            img.url === imageUrl
              ? {
                  ...img,
                  status: "error" as const,
                  errorMessage: "Upload failed",
                }
              : img,
          ),
        );
        addNotification(t("images.uploadFailed"), "error");
      } finally {
        activeUploadsRef.current.delete(imageUrl);
      }
    },
    [addNotification, t],
  );

  // Handle image drop - uploads start immediately in background
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const remainingSlots = MAX_IMAGES - images.length;
      const filesToUpload = acceptedFiles.slice(0, remainingSlots);

      // Process each file and start upload immediately
      filesToUpload.forEach((file, index) => {
        // Validate file
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
          addNotification(t("images.allowedFormats"), "error");
          return;
        }

        if (file.size > MAX_IMAGE_SIZE) {
          addNotification(t("images.maxSize"), "error");
          return;
        }

        // Create local preview with uploading status (upload starts immediately)
        const objectUrl = URL.createObjectURL(file);
        const newImage: ImageState = {
          file,
          url: objectUrl,
          isMain: images.length + index === 0,
          sortOrder: images.length + index,
          status: "uploading", // Start as uploading since we begin immediately
        };

        setImages((prev) => [...prev, newImage]);

        // Start upload immediately in background (non-blocking)
        // For existing items, pass the item ID; for new items, upload without association
        const catalogItemId = item?.id;
        uploadImageAsync(objectUrl, file, catalogItemId);
      });
    },
    [images, addNotification, t, item?.id, uploadImageAsync],
  );

  /**
   * Retry a failed image upload
   */
  const retryUpload = useCallback(
    (image: ImageState) => {
      if (!image.file) {
        addNotification("Cannot retry - file data not available", "error");
        return;
      }
      uploadImageAsync(image.url, image.file, item?.id);
    },
    [item?.id, uploadImageAsync, addNotification],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
    },
    maxFiles: MAX_IMAGES - images.length,
    disabled: images.length >= MAX_IMAGES,
  });

  // Track removed image IDs for deletion on save
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);

  // Reset removed images when modal opens/closes
  useEffect(() => {
    if (open) {
      setRemovedImageIds([]);
    }
  }, [open]);

  // Remove image
  const removeImage = async (index: number) => {
    const imageToRemove = images[index];

    // If it's an existing image (has ID), track for deletion
    if (imageToRemove.id) {
      setRemovedImageIds((prev) => [...prev, imageToRemove.id!]);
    }

    // Revoke object URL if it's a local preview
    if (imageToRemove.file) {
      URL.revokeObjectURL(imageToRemove.url);
    }

    setImages((prev) => {
      const newImages = prev.filter((_, i) => i !== index);
      // If removed was main, make first image main
      if (imageToRemove.isMain && newImages.length > 0) {
        newImages[0].isMain = true;
      }
      // Update sort orders
      return newImages.map((img, i) => ({ ...img, sortOrder: i }));
    });
  };

  // Set as main image
  const setMainImage = (index: number) => {
    setImages((prev) =>
      prev.map((img, i) => ({
        ...img,
        isMain: i === index,
      })),
    );
  };

  // Submit form
  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);

    try {
      // Payload with Meta Commerce catalog required fields only
      const payload = {
        name: values.name,
        description: values.description,
        price: Math.round(values.price * 100), // Convert to cents
        salePrice: values.salePrice
          ? Math.round(values.salePrice * 100)
          : undefined,
        currency: values.currency,
        link: values.link,
        retailerId: values.retailerId || undefined,
        availability: values.availability,
        condition: values.condition,
        brand: values.brand || undefined,
      };

      let savedItemId: string;

      if (item) {
        // Update existing item
        const result = await backendApi.catalog.updateItem(item.id, payload);
        savedItemId = result.id;

        // Delete removed images
        for (const imageId of removedImageIds) {
          try {
            await backendApi.catalog.deleteImage(imageId);
          } catch (error) {
            console.error(`Failed to delete image ${imageId}:`, error);
          }
        }
      } else {
        // Create new item
        const result = await backendApi.catalog.createItem(payload);
        savedItemId = result.id;
      }

      // Check if there are any images still uploading
      const uploadingImages = images.filter(
        (img) => img.status === "uploading",
      );

      if (uploadingImages.length > 0) {
        // Notify user that uploads are still in progress
        addNotification(
          t("images.uploadingInBackground", { count: uploadingImages.length }),
          "info",
        );
      }

      // For new items, associate any already-uploaded images with the item
      const readyImages = images.filter(
        (img) => img.status === "ready" && img.imageKey && !item,
      );

      if (readyImages.length > 0) {
        // Associate uploaded images with the new item in parallel
        await Promise.all(
          readyImages.map(async (image) => {
            try {
              await backendApi.catalog.associateImage(savedItemId, {
                imageKey: image.imageKey!,
                originalFilename: image.originalFilename,
                fileSize: image.fileSize,
                mimeType: image.mimeType,
                isMain: image.isMain,
                sortOrder: image.sortOrder,
              });
            } catch (error) {
              console.error(`Failed to associate image:`, error);
            }
          }),
        );
      }

      // Update image order and main image for all ready images
      const allReadyImages = images.filter(
        (img) => img.status === "ready" && img.id,
      );
      if (allReadyImages.length > 0) {
        const imageIds = allReadyImages
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((img) => img.id!);

        await backendApi.catalog.reorderImages(savedItemId, imageIds);
      }

      // Check for any failed uploads
      const failedImages = images.filter((img) => img.status === "error");
      if (failedImages.length > 0) {
        addNotification(
          t("images.someUploadsFailed", { count: failedImages.length }),
          "warning",
        );
      }

      // Auto-submit for Meta approval after successful creation (only for new items)
      // Item must have at least one ready image to be eligible for submission
      const isNewItem = !item;
      const hasReadyImages = allReadyImages.length > 0;

      if (isNewItem && hasReadyImages) {
        try {
          const submitResult = await backendApi.catalog.submitForReview([
            savedItemId,
          ]);
          if (submitResult.submittedCount > 0) {
            addNotification(t("itemCreatedAndSubmitted"), "success");
          } else if (submitResult.failures.length > 0) {
            // Item created but submission failed validation
            addNotification(t("itemCreated"), "success");
            addNotification(
              t("autoSubmitFailed", {
                reason: submitResult.failures[0]?.reason || "Validation failed",
              }),
              "warning",
            );
          }
        } catch (submitError) {
          // Item was created successfully, just the submission failed
          console.error("Auto-submit for review failed:", submitError);
          addNotification(t("itemCreated"), "success");
        }
      } else {
        addNotification(item ? t("itemUpdated") : t("itemCreated"), "success");
      }

      onSave();
    } catch (error) {
      console.error("Error saving item:", error);
      addNotification("Failed to save item. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{item ? t("editItem") : t("addItem")}</DialogTitle>
          <DialogDescription>
            {item
              ? "Update the product details below"
              : "Fill in the product details to add it to your catalog"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6 px-1 py-4"
            >
              {/* Images Section - First */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">
                    {t("images.title")} ({images.length}/{MAX_IMAGES})
                  </h3>
                </div>

                {/* Dropzone */}
                <div
                  {...getRootProps()}
                  className={cn(
                    "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                    isDragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50",
                    images.length >= MAX_IMAGES &&
                      "opacity-50 cursor-not-allowed",
                  )}
                >
                  <input {...getInputProps()} />
                  <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {t("images.dragDrop")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("images.orBrowse")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("images.recommended")}
                  </p>
                  {images.length >= MAX_IMAGES && (
                    <p className="text-xs text-destructive mt-2">
                      {t("images.maxImages", { max: MAX_IMAGES })}
                    </p>
                  )}
                </div>

                {/* Image Grid */}
                {images.length > 0 && (
                  <div className="grid grid-cols-5 gap-2">
                    {images.map((image, index) => (
                      <div
                        key={index}
                        className={cn(
                          "relative group aspect-square rounded-lg overflow-hidden border-2",
                          image.isMain
                            ? "border-primary"
                            : "border-transparent",
                        )}
                      >
                        <Image
                          src={image.url}
                          alt={`Product image ${index + 1}`}
                          fill
                          className="object-cover"
                        />

                        {/* Loading overlay */}
                        {image.status === "uploading" && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="h-5 w-5 text-white animate-spin" />
                          </div>
                        )}

                        {/* Error overlay with retry */}
                        {image.status === "error" && (
                          <div className="absolute inset-0 bg-red-500/80 flex flex-col items-center justify-center gap-1">
                            <AlertCircle className="h-4 w-4 text-white" />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => retryUpload(image)}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              {t("images.retryUpload")}
                            </Button>
                          </div>
                        )}

                        {/* Main badge */}
                        {image.isMain && (
                          <div className="absolute top-0.5 left-0.5 bg-primary text-primary-foreground text-[10px] px-1 py-0.5 rounded">
                            {t("images.main")}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                          {!image.isMain && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => setMainImage(index)}
                            >
                              {t("images.setAsMain")}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeImage(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Product Details */}
              <div className="space-y-4">
                {/* Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.name")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("form.namePlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Description */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.description")}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t("form.descriptionPlaceholder")}
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Price & Sale Price */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.price")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={t("form.pricePlaceholder")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="salePrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.salePrice")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={t("form.salePricePlaceholder")}
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? parseFloat(e.target.value)
                                  : null,
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Currency */}
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.currency")}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CURRENCIES.map((currency) => (
                            <SelectItem key={currency} value={currency}>
                              {currency}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Item Code (Retailer ID) */}
                <FormField
                  control={form.control}
                  name="retailerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.itemCode")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("form.itemCodePlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Product Link (Required by Meta) */}
                <FormField
                  control={form.control}
                  name="link"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("form.link")} <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="url"
                          placeholder={t("form.linkPlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Required for Meta catalog - URL to product page
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Availability & Condition */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="availability"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.availability")}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="in stock">
                              {t("form.inStock")}
                            </SelectItem>
                            <SelectItem value="out of stock">
                              {t("form.outOfStock")}
                            </SelectItem>
                            <SelectItem value="available for order">
                              {t("form.preorder")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="condition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.condition")}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="new">{t("form.new")}</SelectItem>
                            <SelectItem value="refurbished">
                              {t("form.refurbished")}
                            </SelectItem>
                            <SelectItem value="used">
                              {t("form.used")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Brand */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="brand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.brand")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("form.brandPlaceholder")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </form>
          </Form>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t("form.cancel")}
          </Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("form.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
