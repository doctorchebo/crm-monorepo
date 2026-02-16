"use client";

import LocationPicker, { type LocationData } from "@/components/location/location-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  backendApi,
  VariableDefinition,
  VariableDefinitionsResponse,
  VariableResolutionResult,
} from "@/lib/api/endpoints";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Pen,
  Phone,
  Send,
  Video,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Template, TemplateLocale } from "../types";
import { TemplateHeaderMedia } from "./template-header-media";

// ============================================================================
// Public types
// ============================================================================

/** Payload emitted from the modal on send */
export interface TemplateSendPayload {
  templateId: string;
  locale: string;
  variables: Record<string, string>;
}

// ============================================================================
// Props
// ============================================================================

interface TemplateSendModalProps {
  open: boolean;
  template: Template | null;
  contactId: string | null;
  senderId?: number;
  chatId?: string;
  customerLanguage?: string;
  onSend: (payload: TemplateSendPayload) => Promise<void>;
  onClose: () => void;
}

// ============================================================================
// Internal types
// ============================================================================

/** How the user chose to provide a variable value */
type SourceMode =
  | "auto" // System auto-resolved (initial state)
  | "freeform" // User typed a literal value
  | `system:${string}` // Mapped to a system variable (e.g. "system:customer.first_name")
  | `custom:${string}`; // Mapped to a custom variable

/** Per-variable state */
interface VariableState {
  /** Variable key as it appears in the template (e.g. "customer.first_name" or "1") */
  name: string;
  /** The current source mode */
  sourceMode: SourceMode;
  /** Freeform text value (only used when sourceMode === "freeform") */
  freeformValue: string;
  /** The resolved display value from the backend (e.g. "John") */
  resolvedValue: string | null;
  /** Whether this variable was auto-filled from the backend */
  autoFilled: boolean;
  /** Popover open state */
  popoverOpen: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const RESOLVE_DEBOUNCE_MS = 500;

/** Pretty labels for system variable categories */
const CATEGORY_LABELS: Record<string, string> = {
  customer: "Customer",
  chat: "Chat",
  sender: "Business",
  system: "System",
  order: "Order",
  property: "Property",
};

// ============================================================================
// Helpers
// ============================================================================

/** Select the best locale for a template given a customer language hint */
function selectBestLocale(
  template: Template,
  customerLanguage?: string,
): TemplateLocale | null {
  const locales = template.locales;
  if (!locales || locales.length === 0) return null;

  if (customerLanguage) {
    const match = locales.find((l) => l.locale === customerLanguage);
    if (match) return match;
  }

  // Fallback: prefer 'en', then first approved, then first
  const en = locales.find((l) => l.locale === "en");
  if (en) return en;

  const approved = locales.find(
    (l) => l.approvalStatus?.toLowerCase() === "approved",
  );
  if (approved) return approved;

  return locales[0];
}

/** Format a variable key for display (customer.first_name → First Name) */
function formatVariableLabel(name: string): string {
  const parts = name.split(".");
  const field = parts.length > 1 ? parts[1] : parts[0];
  return field
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Format a definition for the selector (category.property → Category / Property) */
function formatDefinitionLabel(def: VariableDefinition): string {
  return (
    def.displayName || formatVariableLabel(`${def.category}.${def.property}`)
  );
}

// ── Header variable helpers ────────────────────────────────────────────────

/** Names of synthetic header variables injected by the backend */
const HEADER_VAR_NAMES = new Set([
  "header_location_latitude",
  "header_location_longitude",
  "header_location_name",
  "header_location_address",
  "header_image",
  "header_video",
  "header_document",
  "header_document_filename",
]);

function isHeaderVariable(name: string): boolean {
  return HEADER_VAR_NAMES.has(name);
}

/** Media header vars (IMAGE/VIDEO/DOCUMENT) are pre-filled from the approved template — NOT user-editable */
const MEDIA_HEADER_VAR_NAMES = new Set([
  "header_image",
  "header_video",
  "header_document",
  "header_document_filename",
]);

function isMediaHeaderVariable(name: string): boolean {
  return MEDIA_HEADER_VAR_NAMES.has(name);
}

// ============================================================================
// Sub-component: Variable Source Selector
// ============================================================================

interface VariableRowProps {
  vs: VariableState;
  systemGroups: Record<string, VariableDefinition[]>;
  customDefs: VariableDefinition[];
  resolving: boolean;
  unresolved: boolean;
  onChange: (name: string, update: Partial<VariableState>) => void;
}

function VariableRow({
  vs,
  systemGroups,
  customDefs,
  resolving,
  unresolved,
  onChange,
}: VariableRowProps) {
  const isFreeform = vs.sourceMode === "freeform";

  /** The label shown in the trigger button */
  const triggerLabel = useMemo(() => {
    if (vs.sourceMode === "freeform") return "Custom text";
    if (vs.sourceMode === "auto") return "Auto";
    // system:customer.first_name → customer.first_name
    const ref = vs.sourceMode.replace(/^(system|custom):/, "");
    return ref;
  }, [vs.sourceMode]);

  /** Status indicator on the right */
  const statusContent = useMemo(() => {
    if (resolving) {
      return (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      );
    }
    if (isFreeform && vs.freeformValue) {
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    }
    if (
      vs.resolvedValue !== null &&
      vs.resolvedValue !== undefined &&
      !unresolved
    ) {
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    }
    if (unresolved) {
      return (
        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="text-[11px]">No value</span>
        </span>
      );
    }
    return null;
  }, [resolving, isFreeform, vs.freeformValue, vs.resolvedValue, unresolved]);

  return (
    <div className="rounded-lg border p-3 space-y-2">
      {/* Row header: variable label + status */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {formatVariableLabel(vs.name)}
        </span>
        {statusContent}
      </div>

      {/* Source selector + resolved value */}
      <div className="flex items-center gap-2">
        <Popover
          open={vs.popoverOpen}
          onOpenChange={(open) => onChange(vs.name, { popoverOpen: open })}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs min-w-[140px] justify-between"
              role="combobox"
              aria-expanded={vs.popoverOpen}
            >
              <span className="truncate">{triggerLabel}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search variables..." />
              <CommandList>
                <CommandEmpty>No variable found.</CommandEmpty>

                {/* Freeform text option */}
                <CommandGroup heading="Input">
                  <CommandItem
                    value="__freeform__"
                    onSelect={() => {
                      onChange(vs.name, {
                        sourceMode: "freeform",
                        popoverOpen: false,
                      });
                    }}
                  >
                    <Pen className="mr-2 h-3.5 w-3.5" />
                    Type custom text
                    {vs.sourceMode === "freeform" && (
                      <Check className="ml-auto h-3.5 w-3.5" />
                    )}
                  </CommandItem>
                </CommandGroup>

                <CommandSeparator />

                {/* System variable groups */}
                {Object.entries(systemGroups).map(([category, defs]) => (
                  <CommandGroup
                    key={category}
                    heading={CATEGORY_LABELS[category] || category}
                  >
                    {defs.map((def) => {
                      const ref = `${def.category}.${def.property}`;
                      const isSelected = vs.sourceMode === `system:${ref}`;
                      return (
                        <CommandItem
                          key={def.id}
                          value={`system:${ref}`}
                          onSelect={() => {
                            onChange(vs.name, {
                              sourceMode: `system:${ref}`,
                              popoverOpen: false,
                            });
                          }}
                        >
                          <span className="flex-1 truncate text-xs">
                            {formatDefinitionLabel(def)}
                          </span>
                          {def.description && (
                            <span className="text-[10px] text-muted-foreground truncate ml-1 max-w-[100px]">
                              {def.description}
                            </span>
                          )}
                          {isSelected && (
                            <Check className="ml-auto h-3.5 w-3.5 shrink-0" />
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ))}

                {/* Custom variables section */}
                {customDefs.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Custom Variables">
                      {customDefs.map((def) => {
                        const ref = `${def.category}.${def.property}`;
                        const isSelected = vs.sourceMode === `custom:${ref}`;
                        return (
                          <CommandItem
                            key={def.id}
                            value={`custom:${ref}`}
                            onSelect={() => {
                              onChange(vs.name, {
                                sourceMode: `custom:${ref}`,
                                popoverOpen: false,
                              });
                            }}
                          >
                            <span className="flex-1 truncate text-xs">
                              {formatDefinitionLabel(def)}
                            </span>
                            {isSelected && (
                              <Check className="ml-auto h-3.5 w-3.5 shrink-0" />
                            )}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Show resolved value or freeform input */}
        {isFreeform ? (
          <Input
            value={vs.freeformValue}
            onChange={(e) =>
              onChange(vs.name, { freeformValue: e.target.value })
            }
            placeholder="Enter text..."
            className="h-8 text-sm flex-1"
            autoFocus
          />
        ) : (
          <span className="text-sm text-muted-foreground truncate flex-1">
            {resolving ? (
              "Resolving..."
            ) : vs.resolvedValue !== null && vs.resolvedValue !== undefined ? (
              <span className="text-foreground">{vs.resolvedValue}</span>
            ) : unresolved ? (
              <span className="text-amber-600 dark:text-amber-400 italic">
                Not available
              </span>
            ) : (
              <span className="italic">Pending...</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TemplateSendModal({
  open,
  template,
  contactId,
  senderId,
  chatId,
  customerLanguage,
  onSend,
  onClose,
}: TemplateSendModalProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variableStates, setVariableStates] = useState<VariableState[]>([]);
  const [preview, setPreview] = useState<VariableResolutionResult | null>(null);
  const [definitions, setDefinitions] =
    useState<VariableDefinitionsResponse | null>(null);

  /** Tracks which data combination was last fetched, preventing redundant loads.
   *  Format: "templateId|locale|contactId|senderId|chatId" */
  const lastLoadKeyRef = useRef("");

  // Refs for imperative resolve — avoids effects and infinite loops.
  // variableStatesRef: read fresh state without depending on it in effects.
  // freeformTimerRef: debounce timer for freeform text input.
  // resolveIdRef: monotonic counter to discard stale resolve responses.
  // doResolveRef: always-fresh resolve function (assigned in render body).
  const variableStatesRef = useRef<VariableState[]>([]);
  variableStatesRef.current = variableStates;
  const freeformTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const resolveIdRef = useRef(0);
  const doResolveRef = useRef<(() => Promise<void>) | undefined>(undefined);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedLocale = useMemo(
    () => (template ? selectBestLocale(template, customerLanguage) : null),
    [template, customerLanguage],
  );

  const hasVariables = variableStates.length > 0;

  /** Whether every variable has a value (either resolved or freeform) */
  const canSend = useMemo(() => {
    if (sending || resolving || loading) return false;

    // Defense-in-depth: check that the selected locale is approved
    // (templates should already be disabled in the panel if not approved)
    if (
      selectedLocale &&
      selectedLocale.approvalStatus?.toLowerCase() !== "approved"
    ) {
      return false;
    }

    if (!hasVariables) return true;

    // Optional header variables that don't block sending
    const OPTIONAL_HEADER_VARS = new Set([
      "header_location_name",
      "header_location_address",
      "header_document_filename",
    ]);

    // Check every required variable has a value
    for (const vs of variableStates) {
      // Skip optional header variables
      if (OPTIONAL_HEADER_VARS.has(vs.name)) continue;

      if (vs.sourceMode === "freeform") {
        if (!vs.freeformValue) return false;
      } else if (vs.resolvedValue === null || vs.resolvedValue === undefined) {
        return false;
      }
    }

    // Also check the preview: no unresolved body variables
    // (header variables won't appear in preview.unresolvedVariables
    // because they're not part of the template body text)
    if (preview && preview.unresolvedVariables.length > 0) {
      // Filter out header variables from unresolved check
      const unresolvedBody = preview.unresolvedVariables.filter(
        (v) => !isHeaderVariable(v),
      );
      if (unresolvedBody.length > 0) return false;
    }

    return true;
  }, [
    sending,
    resolving,
    loading,
    selectedLocale,
    hasVariables,
    variableStates,
    preview,
  ]);

  /** Group definitions into system categories and custom */
  const { systemGroups, customDefs } = useMemo(() => {
    if (!definitions)
      return { systemGroups: {}, customDefs: [] as VariableDefinition[] };

    const system: Record<string, VariableDefinition[]> = {};
    const custom: VariableDefinition[] = [];

    for (const def of definitions.definitions) {
      if (def.isSystem) {
        const cat = def.category;
        if (!system[cat]) system[cat] = [];
        system[cat].push(def);
      } else {
        custom.push(def);
      }
    }

    return { systemGroups: system, customDefs: custom };
  }, [definitions]);

  // ── Imperative resolve function ────────────────────────────────────────────
  // Assigned every render to capture fresh props/state in the closure.
  // Called directly by handleVariableChange — NOT via effects — so there is
  // no dependency array that could cause infinite re-triggers.
  doResolveRef.current = async () => {
    if (!template || !selectedLocale) return;
    if (!lastLoadKeyRef.current) return;

    const thisId = ++resolveIdRef.current;
    const currentStates = variableStatesRef.current;

    // Build overrides from current variable states
    const resolveOverrides: Record<string, string> = {};
    for (const vs of currentStates) {
      if (vs.sourceMode === "freeform" && vs.freeformValue) {
        resolveOverrides[vs.name] = vs.freeformValue;
      } else if (vs.sourceMode !== "auto") {
        const ref = vs.sourceMode.replace(/^(system|custom):/, "");
        resolveOverrides[vs.name] = `{{${ref}}}`;
      }
    }

    // Without a contact we can still resolve freeform overrides for preview
    try {
      setResolving(true);

      const result = contactId
        ? await backendApi.templates.resolve(template.id, {
            locale: selectedLocale.locale,
            contactId,
            senderId,
            chatId,
            overrides: resolveOverrides,
          })
        : null;

      // Discard if a newer resolve was triggered while we were awaiting
      if (resolveIdRef.current !== thisId) return;

      if (result) {
        setPreview(result);

        // Write resolved values back without re-triggering anything
        setVariableStates((prev) =>
          prev.map((vs) => {
            if (vs.sourceMode === "freeform") {
              return { ...vs, resolvedValue: vs.freeformValue || null };
            }
            return {
              ...vs,
              resolvedValue:
                result.resolvedVariables[vs.name] ?? vs.resolvedValue,
            };
          }),
        );
      } else {
        // No contact: just update freeform resolved values locally
        setVariableStates((prev) =>
          prev.map((vs) =>
            vs.sourceMode === "freeform"
              ? { ...vs, resolvedValue: vs.freeformValue || null }
              : vs,
          ),
        );
      }
    } catch {
      // Silently fail — keep existing preview
    } finally {
      if (resolveIdRef.current === thisId) setResolving(false);
    }
  };

  // Cleanup freeform debounce timer on unmount
  useEffect(() => {
    return () => clearTimeout(freeformTimerRef.current);
  }, []);

  // ── Load data on open ─────────────────────────────────────────────────────
  // Uses a load-key pattern: a string derived from all inputs that affect the
  // data we fetch. The effect only runs when the key changes, preventing
  // duplicate loads and correctly handling the case where contactId arrives
  // asynchronously after the modal opens.
  useEffect(() => {
    if (!open) {
      // Reset all state when modal closes
      setVariableStates([]);
      setPreview(null);
      setError(null);
      setLoading(true);
      setDefinitions(null);
      clearTimeout(freeformTimerRef.current);
      resolveIdRef.current++; // Cancel any in-flight resolves
      lastLoadKeyRef.current = "";
      return;
    }

    if (!template || !selectedLocale) return;

    // Build a key from every input that changes what data we need to load.
    // When any part changes (e.g. contactId goes from null → real value),
    // the key changes and we re-fetch.
    const loadKey = [
      template.id,
      selectedLocale.locale,
      contactId || "",
      senderId ?? "",
      chatId || "",
    ].join("|");

    if (lastLoadKeyRef.current === loadKey) return; // Already loaded this exact combination

    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Parallel: fetch auto-fill suggestions AND variable definitions.
        // Auto-fill requires contactId; if absent, we extract variables
        // client-side from the template body and header format instead.
        const [autoFillResult, defsResult] = await Promise.all([
          contactId
            ? backendApi.templates
                .getAutoFill(template!.id, {
                  locale: selectedLocale!.locale,
                  contactId,
                  senderId,
                  chatId,
                })
                .catch((err: unknown) => {
                  console.warn(
                    "[TemplateSendModal] Auto-fill request failed:",
                    err,
                  );
                  return {
                    variables: [] as Array<{
                      name: string;
                      value: string | null;
                    }>,
                    suggestions: {} as Record<string, string>,
                    missing: [] as string[],
                  };
                })
            : Promise.resolve({
                variables: [] as Array<{
                  name: string;
                  value: string | null;
                }>,
                suggestions: {} as Record<string, string>,
                missing: [] as string[],
              }),
          backendApi.templates.getVariableDefinitions().catch(() => ({
            definitions: [],
            grouped: {},
            categories: [],
          })),
        ]);

        if (cancelled) return;

        setDefinitions(defsResult as VariableDefinitionsResponse);

        // Build variable states from the backend's auto-fill response.
        // The backend extracts variables directly from the template body,
        // so it's the single source of truth for what variables exist.
        let autoVars: Array<{ name: string; value: string | null }> =
          (autoFillResult as any).variables || [];
        const suggestions = (autoFillResult as any).suggestions || {};

        // If auto-fill returned no variables (no contactId or API failure),
        // extract variables client-side from the template content.
        if (autoVars.length === 0) {
          const body = selectedLocale!.body || "";
          const isPositional = selectedLocale!.parameterFormat === "positional";

          if (isPositional) {
            const seen = new Set<string>();
            for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) {
              if (!seen.has(m[1])) {
                seen.add(m[1]);
                autoVars.push({ name: m[1], value: null });
              }
            }
          } else {
            const seen = new Set<string>();
            for (const m of body.matchAll(/\{\{([^}]+)\}\}/g)) {
              const varName = m[1].trim();
              if (!seen.has(varName)) {
                seen.add(varName);
                autoVars.push({ name: varName, value: null });
              }
            }
          }

          // Add header variables based on headerFormat
          const headerFormat = (
            selectedLocale!.headerFormat || ""
          ).toUpperCase();
          const compHeader = selectedLocale!.components?.header ?? {};

          switch (headerFormat) {
            case "IMAGE":
              autoVars.push({
                name: "header_image",
                value: compHeader.link || null,
              });
              break;
            case "VIDEO":
              autoVars.push({
                name: "header_video",
                value: compHeader.link || null,
              });
              break;
            case "DOCUMENT":
              autoVars.push(
                {
                  name: "header_document",
                  value: compHeader.link || null,
                },
                {
                  name: "header_document_filename",
                  value: compHeader.filename || null,
                },
              );
              break;
            case "LOCATION":
              autoVars.push(
                {
                  name: "header_location_latitude",
                  value:
                    compHeader.latitude != null
                      ? String(compHeader.latitude)
                      : null,
                },
                {
                  name: "header_location_longitude",
                  value:
                    compHeader.longitude != null
                      ? String(compHeader.longitude)
                      : null,
                },
                {
                  name: "header_location_name",
                  value: compHeader.name || null,
                },
                {
                  name: "header_location_address",
                  value: compHeader.address || null,
                },
              );
              break;
          }
        }

        // Build per-variable state from the extracted/auto-filled variables
        const states: VariableState[] = autoVars.map((autoVar: any) => {
          const resolvedValue =
            autoVar?.value ?? suggestions[autoVar.name] ?? null;

          const isHeader = isHeaderVariable(autoVar.name);
          const isMedia = isMediaHeaderVariable(autoVar.name);

          // Media header vars (IMAGE/VIDEO/DOCUMENT) are pre-filled by the
          // backend from the approved template's stored asset URL. They
          // should NOT be user-editable.
          if (isMedia) {
            return {
              name: autoVar.name,
              sourceMode: "freeform" as SourceMode,
              freeformValue: autoVar?.value ?? "",
              resolvedValue: autoVar?.value ?? null,
              autoFilled: !!autoVar?.value,
              popoverOpen: false,
            };
          }

          // Header vars (location, text headers): pre-populate from
          // backend auto-fill when available, otherwise empty for user input.
          if (isHeader) {
            return {
              name: autoVar.name,
              sourceMode: "freeform" as SourceMode,
              freeformValue: autoVar?.value ?? "",
              resolvedValue: autoVar?.value ?? null,
              autoFilled: !!autoVar?.value,
              popoverOpen: false,
            };
          }

          // Body variables — auto-resolve from contact data
          return {
            name: autoVar.name,
            sourceMode: "auto" as SourceMode,
            freeformValue: "",
            resolvedValue,
            autoFilled: resolvedValue !== null,
            popoverOpen: false,
          };
        });

        if (cancelled) return;

        setVariableStates(states);
        lastLoadKeyRef.current = loadKey;

        // Resolve to get the initial preview — only when contactId is available.
        if (contactId) {
          try {
            const resolveResult = await backendApi.templates.resolve(
              template!.id,
              {
                locale: selectedLocale!.locale,
                contactId,
                senderId,
                chatId,
              },
            );
            if (!cancelled) {
              setPreview(resolveResult);
              // Enrich resolved values from the resolution result
              setVariableStates((prev) =>
                prev.map((vs) => ({
                  ...vs,
                  resolvedValue:
                    resolveResult.resolvedVariables[vs.name] ??
                    vs.resolvedValue,
                })),
              );
            }
          } catch {
            // Preview will be shown without initial resolution
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load template data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [open, template, selectedLocale, contactId, senderId, chatId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Update a single variable's state.
   *  - sourceMode change (variable selection) → immediate resolve
   *  - freeformValue change (typing) → debounced resolve
   *  - popoverOpen change → no resolve
   */
  const handleVariableChange = useCallback(
    (name: string, update: Partial<VariableState>) => {
      setVariableStates((prev) => {
        const next = prev.map((vs) =>
          vs.name === name ? { ...vs, ...update } : vs,
        );
        // Write ref synchronously so doResolveRef reads fresh data
        variableStatesRef.current = next;
        return next;
      });

      if ("sourceMode" in update) {
        // Variable selection is a discrete event → resolve immediately.
        // Exception: switching to freeform has no value yet, skip.
        if (update.sourceMode !== "freeform") {
          clearTimeout(freeformTimerRef.current);
          doResolveRef.current?.();
        }
      } else if ("freeformValue" in update) {
        // Typing is continuous → debounce to avoid flooding the API
        clearTimeout(freeformTimerRef.current);
        freeformTimerRef.current = setTimeout(
          () => doResolveRef.current?.(),
          RESOLVE_DEBOUNCE_MS,
        );
      }
    },
    [],
  );

  // ── LocationPicker integration ──────────────────────────────────────
  // Batch-update all 4 location header variables when the user picks a
  // location via the interactive map or search.
  const handleLocationPickerChange = useCallback((loc: LocationData) => {
    setVariableStates((prev) => {
      const updates: Record<string, string> = {
        header_location_latitude: String(loc.latitude),
        header_location_longitude: String(loc.longitude),
        header_location_name: loc.name ?? "",
        header_location_address: loc.address ?? "",
      };
      const next = prev.map((vs) =>
        vs.name in updates
          ? {
              ...vs,
              freeformValue: updates[vs.name],
              sourceMode: "freeform" as SourceMode,
            }
          : vs,
      );
      variableStatesRef.current = next;
      return next;
    });
    // Trigger a debounced resolve so the preview updates
    clearTimeout(freeformTimerRef.current);
    freeformTimerRef.current = setTimeout(
      () => doResolveRef.current?.(),
      RESOLVE_DEBOUNCE_MS,
    );
  }, []);

  /** Derive LocationPicker's `value` from the current variable states */
  const locationPickerValue = useMemo<Partial<LocationData>>(() => {
    const getVal = (name: string) =>
      variableStates.find((v) => v.name === name)?.freeformValue || "";
    const lat = parseFloat(getVal("header_location_latitude"));
    const lng = parseFloat(getVal("header_location_longitude"));
    return {
      latitude: isNaN(lat) ? undefined : lat,
      longitude: isNaN(lng) ? undefined : lng,
      name: getVal("header_location_name") || undefined,
      address: getVal("header_location_address") || undefined,
    };
  }, [variableStates]);

  /** Send the template */
  const handleSend = useCallback(async () => {
    if (!template || !selectedLocale) return;

    try {
      setSending(true);
      setError(null);

      // Build final variables: resolved values for auto/mapped, freeform text for freeform
      const variables: Record<string, string> = {};
      for (const vs of variableStates) {
        if (vs.sourceMode === "freeform") {
          if (vs.freeformValue) variables[vs.name] = vs.freeformValue;
        } else if (
          vs.resolvedValue !== null &&
          vs.resolvedValue !== undefined
        ) {
          variables[vs.name] = vs.resolvedValue;
        }
      }

      await onSend({
        templateId: template.id,
        locale: selectedLocale.locale,
        variables,
      });
    } catch (err: any) {
      setError(err.message || "Failed to send template");
    } finally {
      setSending(false);
    }
  }, [template, selectedLocale, variableStates, onSend]);

  // ── Unresolved set for quick lookup ───────────────────────────────────────
  const unresolvedSet = useMemo(() => {
    const set = new Set<string>();
    if (preview) {
      for (const v of preview.unresolvedVariables) set.add(v);
    }
    // Also add variables with no resolved value and not freeform
    for (const vs of variableStates) {
      if (vs.sourceMode !== "freeform" && vs.resolvedValue === null) {
        set.add(vs.name);
      }
    }
    return set;
  }, [preview, variableStates]);

  // ── Split variables into header and body groups ──────────────────────────
  // Media header vars (IMAGE/VIDEO/DOCUMENT) are pre-filled from the approved
  // template and non-editable. Location header vars are rendered inline with
  // the map preview. Only body variables appear in the editable section.
  const { locationVars, bodyVars } = useMemo(() => {
    const location: VariableState[] = [];
    const body: VariableState[] = [];
    for (const vs of variableStates) {
      if (isMediaHeaderVariable(vs.name)) {
        // Media header vars are intentionally excluded from the editable
        // section — they're pre-filled and shown as media preview only.
        continue;
      } else if (isHeaderVariable(vs.name)) {
        // Location header vars go into the location group (rendered
        // inline in the preview area alongside the map)
        location.push(vs);
      } else {
        body.push(vs);
      }
    }
    return { locationVars: location, bodyVars: body };
  }, [variableStates]);

  // ── Build header preview props ───────────────────────────────────────
  // For IMAGE/VIDEO/DOCUMENT: source from components.header (approved template asset)
  // For LOCATION: source from user-editable header var freeform values
  // For TEXT: source from resolved preview or locale header text
  // ── Build header preview props ───────────────────────────────────────
  // Media URLs come from two sources:
  //   1. Auto-fill response (variableStates) — fresh pre-signed URLs generated
  //      at request time. This is the primary source.
  //   2. components.header (DB snapshot) — may contain expired pre-signed URLs.
  //      Used only as a fallback.
  const headerPreviewProps = useMemo(() => {
    if (!selectedLocale?.headerFormat) return null;
    const fmt = selectedLocale.headerFormat.toUpperCase();
    const compHeader = selectedLocale.components?.header ?? {};

    /** Read a media variable's value from the auto-fill response */
    const getMediaVar = (name: string) =>
      variableStates.find((v) => v.name === name)?.freeformValue ||
      variableStates.find((v) => v.name === name)?.resolvedValue ||
      null;
    const getLocVal = (name: string) =>
      locationVars.find((v) => v.name === name)?.freeformValue || null;

    switch (fmt) {
      case "TEXT":
        return {
          format: "TEXT" as const,
          text: preview?.header || selectedLocale.header || null,
        };
      case "IMAGE":
        return {
          format: "IMAGE" as const,
          imageUrl:
            getMediaVar("header_image") ||
            compHeader.link ||
            compHeader.thumbnailUrl ||
            null,
        };
      case "VIDEO": {
        // After Lambda thumbnail processing, the stored s3Key (and thus
        // the enriched URL) is a thumbnail image — not the original video.
        // Show it as a thumbnail with a play-icon overlay.
        const videoThumb =
          getMediaVar("header_video") ||
          compHeader.thumbnailUrl ||
          compHeader.link ||
          null;
        return {
          format: "VIDEO" as const,
          videoUrl: null, // original video removed from S3 after processing
          thumbnailUrl: videoThumb,
        };
      }
      case "DOCUMENT":
        return {
          format: "DOCUMENT" as const,
          documentUrl:
            getMediaVar("header_document") || compHeader.link || null,
          documentFilename:
            compHeader.filename || compHeader.originalFilename || null,
        };
      case "LOCATION":
        return {
          format: "LOCATION" as const,
          latitude: getLocVal("header_location_latitude"),
          longitude: getLocVal("header_location_longitude"),
          locationName: getLocVal("header_location_name"),
          locationAddress: getLocVal("header_location_address"),
        };
      default:
        return null;
    }
  }, [selectedLocale, variableStates, locationVars, preview]);

  // ── Parse buttons from locale ────────────────────────────────────────────
  const buttons = useMemo(() => {
    if (!selectedLocale?.buttons) return [];
    const btns = selectedLocale.buttons;
    return Array.isArray(btns) ? btns : [];
  }, [selectedLocale]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!template || !selectedLocale) return null;

  const unresolvedCount = unresolvedSet.size;
  const allResolved = hasVariables && unresolvedCount === 0 && !loading;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Send Template
            {template.source === "library" && (
              <Badge variant="secondary" className="text-[10px]">
                Library
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="truncate">
            {template.displayName || template.name}
            <span className="ml-2 text-muted-foreground">
              ({selectedLocale.locale.toUpperCase()})
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto space-y-4 py-2 px-1 -mx-1">
          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              <XCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading template data...
              </span>
            </div>
          )}

          {/* ── Location Header Editor (integrated map + inputs) ──── */}
          {!loading &&
            locationVars.length > 0 &&
            selectedLocale.headerFormat?.toUpperCase() === "LOCATION" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-medium">Location</h4>
                </div>
                <LocationPicker
                  value={locationPickerValue}
                  onChange={handleLocationPickerChange}
                  mapHeight="h-48"
                  showOptionalFields={true}
                  showSearch={true}
                  showCurrentLocation={true}
                  showCoordinates={false}
                  size="sm"
                />
              </div>
            )}

          {/* ── Body Variables Section ──────────────────────────────── */}
          {!loading && bodyVars.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">
                  Variables
                  <span className="ml-1 text-muted-foreground font-normal">
                    ({bodyVars.length})
                  </span>
                </h4>
                {resolving && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Resolving...
                  </span>
                )}
                {allResolved && !resolving && (
                  <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3" />
                    All resolved
                  </span>
                )}
                {!loading && unresolvedCount > 0 && !resolving && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    {unresolvedCount} unmapped
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {bodyVars.map((vs) => (
                  <VariableRow
                    key={vs.name}
                    vs={vs}
                    systemGroups={systemGroups}
                    customDefs={customDefs}
                    resolving={resolving}
                    unresolved={unresolvedSet.has(vs.name)}
                    onChange={handleVariableChange}
                  />
                ))}
              </div>
            </div>
          )}

          {/* No variables — simple confirmation */}
          {!loading && !hasVariables && (
            <div className="text-sm text-muted-foreground">
              This template has no variables. It will be sent as-is.
            </div>
          )}

          {/* ── Full Template Preview ──────────────────────────────── */}
          {!loading && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Preview
              </h4>
              <div
                className={`rounded-lg border overflow-hidden ${
                  preview &&
                  preview.success &&
                  preview.unresolvedVariables.filter(
                    (v) => !isHeaderVariable(v),
                  ).length === 0
                    ? "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800"
                    : "bg-muted/50 border-border"
                }`}
              >
                {/* ── Header Preview (skip for LOCATION — it has its own editor above) ── */}
                {headerPreviewProps &&
                  headerPreviewProps.format !== "LOCATION" && (
                    <div className="px-3 pt-3 pb-2">
                      <TemplateHeaderMedia
                        {...headerPreviewProps}
                        variant="preview"
                      />
                    </div>
                  )}

                {/* ── Body Preview ─────────────────────────────────── */}
                <div className="p-3 text-sm whitespace-pre-wrap">
                  {preview ? preview.body : selectedLocale.body}
                </div>

                {/* ── Footer Preview ───────────────────────────────── */}
                {(preview?.footer || selectedLocale.footer) && (
                  <div className="px-3 pb-2 text-xs text-muted-foreground">
                    {preview?.footer || selectedLocale.footer}
                  </div>
                )}

                {/* ── Buttons Preview ──────────────────────────────── */}
                {buttons.length > 0 && (
                  <div className="border-t border-border">
                    {buttons.map((btn: any, idx: number) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-center gap-2 py-2 px-3 text-xs text-primary ${
                          idx < buttons.length - 1
                            ? "border-b border-border"
                            : ""
                        }`}
                      >
                        {btn.type === "URL" && (
                          <ExternalLink className="h-3 w-3" />
                        )}
                        {btn.type === "PHONE_NUMBER" && (
                          <Phone className="h-3 w-3" />
                        )}
                        {btn.type === "QUICK_REPLY" && (
                          <Send className="h-3 w-3" />
                        )}
                        <span>
                          {btn.text || btn.label || `Button ${idx + 1}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Carousel Preview ─────────────────────────────── */}
                {selectedLocale.carouselCards &&
                  Array.isArray(selectedLocale.carouselCards) &&
                  selectedLocale.carouselCards.length > 0 && (
                    <div className="border-t border-border px-3 py-2 space-y-2">
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Carousel Cards
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {selectedLocale.carouselCards.map(
                          (card: any, idx: number) => (
                            <div
                              key={idx}
                              className="flex-shrink-0 w-[180px] rounded-md border border-border overflow-hidden bg-background"
                            >
                              {/* Card media header */}
                              <div className="h-20 bg-muted/70 flex items-center justify-center">
                                {card.header?.format === "IMAGE" ? (
                                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                ) : card.header?.format === "VIDEO" ? (
                                  <Video className="h-5 w-5 text-muted-foreground" />
                                ) : (
                                  <FileText className="h-5 w-5 text-muted-foreground" />
                                )}
                              </div>
                              {/* Card body */}
                              {card.body?.text && (
                                <div className="px-2 py-1.5 text-[11px] line-clamp-3">
                                  {card.body.text}
                                </div>
                              )}
                              {/* Card buttons */}
                              {card.buttons &&
                                Array.isArray(card.buttons) &&
                                card.buttons.length > 0 && (
                                  <div className="border-t border-border">
                                    {card.buttons.map(
                                      (btn: any, bIdx: number) => (
                                        <div
                                          key={bIdx}
                                          className={`flex items-center justify-center gap-1 py-1 text-[10px] text-primary ${
                                            bIdx < card.buttons.length - 1
                                              ? "border-b border-border"
                                              : ""
                                          }`}
                                        >
                                          {btn.type === "URL" && (
                                            <ExternalLink className="h-2.5 w-2.5" />
                                          )}
                                          <span>
                                            {btn.text || `Button ${bIdx + 1}`}
                                          </span>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                )}
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
              </div>

              {/* Resolution errors */}
              {preview && preview.errors.length > 0 && (
                <div className="space-y-1">
                  {preview.errors.map((err, i) => (
                    <div
                      key={i}
                      className="text-xs text-destructive flex items-center gap-1"
                    >
                      <XCircle className="h-3 w-3 shrink-0" />
                      {err.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!canSend} className="gap-2">
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
