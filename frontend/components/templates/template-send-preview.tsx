"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { backendApi, VariableResolutionResult } from "@/lib/api/endpoints";
import {
  AlertCircle,
  Check,
  CheckCircle,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface TemplateVariable {
  name: string;
  value: string | null;
  isRequired: boolean;
  source: string;
}

interface TemplateSendPreviewProps {
  templateId: string;
  locale: string;
  contactId: string;
  senderId?: number;
  chatId?: string;
  onSend: (resolvedBody: string, variables: Record<string, string>) => void;
  onCancel: () => void;
}

export function TemplateSendPreview({
  templateId,
  locale,
  contactId,
  senderId,
  chatId,
  onSend,
  onCancel,
}: TemplateSendPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<VariableResolutionResult | null>(null);

  // Load auto-fill suggestions
  const loadAutoFill = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = (await backendApi.templates.getAutoFill(templateId, {
        locale,
        contactId,
        senderId,
        chatId,
      })) as {
        variables?: TemplateVariable[];
        suggestions?: Record<string, string>;
        missing?: string[];
      };

      setVariables(result.variables || []);
      // Pre-fill suggestions into overrides for missing values
      const initialOverrides: Record<string, string> = {};
      for (const v of result.variables || []) {
        if (v.value) {
          initialOverrides[v.name] = v.value;
        }
      }
      setOverrides(initialOverrides);
    } catch (err: any) {
      setError(err.message || "Failed to load template variables");
    } finally {
      setLoading(false);
    }
  }, [templateId, locale, contactId, senderId, chatId]);

  useEffect(() => {
    loadAutoFill();
  }, [loadAutoFill]);

  // Resolve template with current overrides
  const resolveTemplate = useCallback(async () => {
    try {
      setResolving(true);
      setError(null);

      const result = await backendApi.templates.resolve(templateId, {
        locale,
        contactId,
        senderId,
        chatId,
        overrides,
      });

      setPreview(result);
      return result;
    } catch (err: any) {
      setError(err.message || "Failed to resolve template");
      return null;
    } finally {
      setResolving(false);
    }
  }, [templateId, locale, contactId, senderId, chatId, overrides]);

  // Auto-resolve when overrides change
  useEffect(() => {
    if (!loading && Object.keys(overrides).length > 0) {
      const debounce = setTimeout(() => {
        resolveTemplate();
      }, 500);
      return () => clearTimeout(debounce);
    }
  }, [overrides, loading, resolveTemplate]);

  // Handle variable input change
  const handleVariableChange = (name: string, value: string) => {
    setOverrides((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle send
  const handleSend = async () => {
    const resolved = await resolveTemplate();
    if (resolved && resolved.success) {
      onSend(resolved.body, overrides);
    }
  };

  // Check if can send
  const canSend =
    preview?.success && preview.unresolvedVariables.length === 0 && !resolving;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <h3 className="font-semibold">Send Template</h3>
        {resolving && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Variables Form */}
      {variables.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">
            Template Variables
          </h4>
          <div className="space-y-3">
            {variables.map((variable) => (
              <div key={variable.name} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-medium">
                    {formatVariableName(variable.name)}
                    {variable.isRequired && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </Label>
                  {overrides[variable.name] ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : variable.isRequired ? (
                    <XCircle className="h-3 w-3 text-destructive" />
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={overrides[variable.name] || ""}
                    onChange={(e) =>
                      handleVariableChange(variable.name, e.target.value)
                    }
                    placeholder={
                      variable.value
                        ? `Auto-filled: ${variable.value}`
                        : `Enter ${formatVariableName(variable.name)}`
                    }
                    className="h-8 text-sm"
                  />
                  {variable.source !== "override" && variable.value && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">
                      {variable.source}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Message Preview
          </h4>
          <div
            className={`p-3 rounded-lg text-sm whitespace-pre-wrap ${
              preview.success
                ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800"
                : "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800"
            }`}
          >
            {preview.body}
          </div>

          {/* Unresolved Variables Warning */}
          {preview.unresolvedVariables.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Missing required variables:</p>
                <ul className="list-disc list-inside mt-1">
                  {preview.unresolvedVariables.map((v) => (
                    <li key={v}>{formatVariableName(v)}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Resolution Errors */}
          {preview.errors.length > 0 && (
            <div className="space-y-1">
              {preview.errors.map((err, i) => (
                <div
                  key={i}
                  className="text-xs text-destructive flex items-center gap-1"
                >
                  <XCircle className="h-3 w-3" />
                  {err.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-3 border-t">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!canSend}
          className="gap-2"
        >
          {resolving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send Message
        </Button>
      </div>
    </div>
  );
}

// Format variable name for display
function formatVariableName(name: string): string {
  // customer.first_name -> First Name
  // custom.webinar_date -> Webinar Date
  const parts = name.split(".");
  const field = parts.length > 1 ? parts[1] : parts[0];
  return field
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Compact variable list for template selection
interface TemplateVariableChipsProps {
  variables: Array<{
    name: string;
    isRequired: boolean;
    resolved: boolean;
  }>;
}

export function TemplateVariableChips({
  variables,
}: TemplateVariableChipsProps) {
  if (variables.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {variables.map((v) => (
        <span
          key={v.name}
          className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${
            v.resolved
              ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
              : v.isRequired
              ? "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {v.resolved && <Check className="h-2 w-2" />}
          {formatVariableName(v.name)}
          {v.isRequired && !v.resolved && "*"}
        </span>
      ))}
    </div>
  );
}
