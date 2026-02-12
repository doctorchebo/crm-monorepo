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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  AdoptLibraryTemplateRequest,
  AdoptTemplateResult,
  TemplateLibraryTemplateWithStatus,
} from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle, Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

interface AdoptTemplateModalProps {
  /** The library template being adopted */
  template: TemplateLibraryTemplateWithStatus | null;
  /** Whether the modal is open */
  open: boolean;
  /** Handler for closing the modal */
  onOpenChange: (open: boolean) => void;
  /** Callback fired after successful adoption */
  onAdopted: (result: AdoptTemplateResult) => void;
}

/**
 * Format a template name to a more readable display name.
 * Converts "ORDER_CONFIRMATION" → "Order Confirmation"
 */
function suggestDisplayName(templateName: string): string {
  return templateName
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Modal dialog for adopting a template from Meta's Template Library.
 * Allows the user to provide a display name and fill in any required
 * button/body inputs before creating the template.
 */
export function AdoptTemplateModal({
  template,
  open,
  onOpenChange,
  onAdopted,
}: AdoptTemplateModalProps) {
  const t = useTranslations("templates.library");

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [buttonSuffixes, setButtonSuffixes] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive which buttons need URL suffix input
  const urlButtons = useMemo(() => {
    if (!template?.buttons) return [];
    return template.buttons
      .map((btn, index) => ({ ...btn, originalIndex: index }))
      .filter((btn) => btn.type === "URL" && btn.url);
  }, [template]);

  // Reset form when template changes
  useEffect(() => {
    if (template) {
      setDisplayName(suggestDisplayName(template.name));
      setButtonSuffixes(urlButtons.map(() => ""));
      setError(null);
    }
  }, [template, urlButtons]);

  // Validate the form
  const isValid = useMemo(() => {
    if (!displayName.trim()) return false;
    // All URL buttons with dynamic suffix must have a value
    for (const suffix of buttonSuffixes) {
      if (!suffix.trim()) return false;
    }
    return true;
  }, [displayName, buttonSuffixes]);

  const handleSubmit = useCallback(async () => {
    if (!template || !isValid) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const request: AdoptLibraryTemplateRequest = {
        displayName: displayName.trim(),
        language: template.language,
        libraryTemplateName: template.name,
      };

      // Add button inputs if there are URL buttons
      if (urlButtons.length > 0) {
        request.buttonInputs = urlButtons.map((btn, i) => ({
          type: "URL" as const,
          url: { suffix: buttonSuffixes[i] },
        }));
      }

      const result = await backendApi.templates.adoptFromLibrary(request);

      if (result.templateId) {
        onAdopted(result);
        onOpenChange(false);
      } else {
        setError(t("adoptFailed"));
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message || err?.message || t("adoptFailed");
      setError(typeof message === "string" ? message : t("adoptFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    template,
    isValid,
    displayName,
    urlButtons,
    buttonSuffixes,
    onAdopted,
    onOpenChange,
    t,
  ]);

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t("adoptTitle")}
          </DialogTitle>
          <DialogDescription>{t("adoptDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="displayName">{t("displayNameLabel")}</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("displayNamePlaceholder")}
              className={cn(!displayName.trim() && "border-red-300")}
            />
            <p className="text-xs text-muted-foreground">
              {t("displayNameHint")}
            </p>
          </div>

          {/* Library Template Info (read-only) */}
          <div className="rounded-md border p-3 bg-muted/50 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t("metaName")}</span>
              <span className="font-mono">{template.name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {t("languageLabel")}
              </span>
              <span>{template.language}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {t("categoryLabel")}
              </span>
              <span className="capitalize">{template.category}</span>
            </div>
          </div>

          {/* Body preview */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("bodyPreview")}
            </Label>
            <div className="rounded-md border p-3 bg-muted/30 text-sm leading-relaxed">
              {template.body}
            </div>
          </div>

          {/* URL Button Suffix Inputs */}
          {urlButtons.length > 0 && (
            <div className="space-y-3">
              <Label>{t("buttonInputsLabel")}</Label>
              {urlButtons.map((btn, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    {btn.text || `Button ${i + 1}`} — {btn.url}
                  </div>
                  <Input
                    value={buttonSuffixes[i] || ""}
                    onChange={(e) => {
                      const next = [...buttonSuffixes];
                      next[i] = e.target.value;
                      setButtonSuffixes(next);
                    }}
                    placeholder={t("urlSuffixPlaceholder")}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("adopting")}
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                {t("confirmAdopt")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
