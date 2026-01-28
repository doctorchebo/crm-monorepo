/**
 * ContactProfilePanel
 *
 * A unified component that handles both existing contacts and unknown contacts.
 * It centralizes the contact lookup logic and provides a seamless experience
 * for viewing existing profiles or creating new contacts.
 *
 * Architecture:
 * - Single source of truth for contact state
 * - Handles contact lookup on phone number change
 * - Delegates to CustomerProfile for existing contacts
 * - Provides inline form for creating new contacts
 * - Performance optimized with proper memoization
 */

"use client";

import { Button } from "@/components/ui/button";
import { CountryCodeSelect } from "@/components/ui/country-code-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNotification } from "@/hooks/use-notification";
import {
  backendApi,
  ContactAttribute,
  CreateContactDto,
  LANGUAGE_DISPLAY_NAMES,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
} from "@/lib/api/endpoints";
import { parsePhoneNumber } from "@/lib/utils/phone-number";
import {
  getAllResolvedVariables,
  type ContactData,
  type ResolvedTemplateVariable,
} from "@/lib/utils/template-variables";
import {
  Check,
  Globe,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Save,
  Trash2,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR from "swr";

// =============================================================================
// Types
// =============================================================================

interface ContactProfilePanelProps {
  /** Contact ID if known (takes precedence over phone lookup) */
  contactId?: string | null;
  /** Chat ID for chat-specific attributes */
  chatId?: string;
  /** Phone number for lookup/creation if contactId not provided */
  participantPhone?: string;
  /** Name from WhatsApp profile for pre-filling new contact form */
  participantName?: string;
  /** Callback when a contact is created or found */
  onContactResolved?: (contactId: string) => void;
  /** Callback when profile data is updated */
  onProfileUpdate?: () => void;
}

type ValueType = "string" | "number" | "date" | "phone" | "email";

type PanelMode = "loading" | "profile" | "create" | "empty";

// Suggested attribute keys for autocomplete
const SUGGESTED_KEYS = [
  {
    key: "order_id",
    label: "Order ID",
    category: "order",
    valueType: "string" as ValueType,
  },
  {
    key: "order_total",
    label: "Order Total",
    category: "order",
    valueType: "number" as ValueType,
  },
  {
    key: "order_status",
    label: "Order Status",
    category: "order",
    valueType: "string" as ValueType,
  },
  {
    key: "order_date",
    label: "Order Date",
    category: "order",
    valueType: "date" as ValueType,
  },
  {
    key: "delivery_date",
    label: "Delivery Date",
    category: "order",
    valueType: "date" as ValueType,
  },
  {
    key: "tracking_number",
    label: "Tracking Number",
    category: "order",
    valueType: "string" as ValueType,
  },
  {
    key: "tracking_url",
    label: "Tracking URL",
    category: "order",
    valueType: "string" as ValueType,
  },
  {
    key: "property_address",
    label: "Property Address",
    category: "property",
    valueType: "string" as ValueType,
  },
  {
    key: "property_price",
    label: "Property Price",
    category: "property",
    valueType: "number" as ValueType,
  },
  {
    key: "property_type",
    label: "Property Type",
    category: "property",
    valueType: "string" as ValueType,
  },
  {
    key: "viewing_date",
    label: "Viewing Date",
    category: "property",
    valueType: "date" as ValueType,
  },
  {
    key: "company_name",
    label: "Company Name",
    category: "custom",
    valueType: "string" as ValueType,
  },
  {
    key: "subscription_plan",
    label: "Subscription Plan",
    category: "custom",
    valueType: "string" as ValueType,
  },
  {
    key: "notes",
    label: "Notes",
    category: "custom",
    valueType: "string" as ValueType,
  },
];

// =============================================================================
// Memoized Sub-Components for Performance
// =============================================================================

/**
 * Editable text field with local state management
 * Prevents parent re-renders during typing
 */
interface EditableFieldProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
}

const EditableField = memo(function EditableField({
  label,
  value,
  icon,
  onSave,
  placeholder = "Add value",
  type = "text",
  readOnly = false,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  // Sync local value when prop changes (and not editing)
  useEffect(() => {
    if (!isEditing) {
      setLocalValue(value);
    }
  }, [value, isEditing]);

  const handleSave = useCallback(async () => {
    if (localValue === value) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onSave(localValue);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setIsSaving(false);
    }
  }, [localValue, value, onSave]);

  const handleCancel = useCallback(() => {
    setLocalValue(value);
    setIsEditing(false);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSave();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  if (readOnly) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          {icon}
          {label}
        </Label>
        <p className="text-sm px-2 py-1 bg-muted/50 rounded">{value || "-"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </Label>
      {isEditing ? (
        <div className="flex items-center gap-1">
          <Input
            type={type}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 text-xs"
            autoFocus
            disabled={isSaving}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3 text-green-600" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleCancel}
            disabled={isSaving}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div
          className="group flex items-center justify-between px-2 py-1 bg-muted/50 rounded cursor-pointer hover:bg-muted"
          onClick={() => setIsEditing(true)}
        >
          <span className={`text-sm ${!value ? "text-muted-foreground" : ""}`}>
            {value || placeholder}
          </span>
          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
        </div>
      )}
    </div>
  );
});

/**
 * Attribute row with inline editing
 */
interface AttributeRowProps {
  attribute: ContactAttribute;
  emptyLabel: string;
  onSave: (oldKey: string, newKey: string, value: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
}

const AttributeRow = memo(function AttributeRow({
  attribute,
  emptyLabel,
  onSave,
  onDelete,
}: AttributeRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localKey, setLocalKey] = useState(attribute.key);
  const [localValue, setLocalValue] = useState(attribute.value || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setLocalKey(attribute.key);
      setLocalValue(attribute.value || "");
    }
  }, [attribute.key, attribute.value, isEditing]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave(attribute.key, localKey, localValue);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save attribute:", error);
    } finally {
      setIsSaving(false);
    }
  }, [attribute.key, localKey, localValue, onSave]);

  const handleCancel = useCallback(() => {
    setLocalKey(attribute.key);
    setLocalValue(attribute.value || "");
    setIsEditing(false);
  }, [attribute.key, attribute.value]);

  const handleDelete = useCallback(async () => {
    setIsSaving(true);
    try {
      await onDelete(attribute.key);
    } catch (error) {
      console.error("Failed to delete attribute:", error);
    } finally {
      setIsSaving(false);
    }
  }, [attribute.key, onDelete]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSave();
      else if (e.key === "Escape") handleCancel();
    },
    [handleSave, handleCancel]
  );

  const formatKey = (key: string) =>
    key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  const getSuggestedPrefix = (key: string) =>
    SUGGESTED_KEYS.find((s) => s.key === key)?.category || "custom";

  const prefix = getSuggestedPrefix(attribute.key);
  const templateVar = `{{${prefix}.${attribute.key}}}`;

  return (
    <div className="p-2 border rounded-lg space-y-1 group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">
            {formatKey(attribute.key)}
          </span>
          <code className="text-[9px] text-muted-foreground bg-muted px-1 rounded">
            {templateVar}
          </code>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">
            {attribute.valueType}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={handleDelete}
            disabled={isSaving}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </div>
      {isEditing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <div className="flex-1">
              <Label className="text-[10px] text-muted-foreground">Key</Label>
              <Input
                value={localKey}
                onChange={(e) => setLocalKey(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-7 text-xs"
                disabled={isSaving}
              />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="flex-1">
              <Label className="text-[10px] text-muted-foreground">Value</Label>
              <Input
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-7 text-xs"
                autoFocus
                disabled={isSaving}
              />
            </div>
            <div className="flex items-center gap-1 pt-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3 text-green-600" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleCancel}
                disabled={isSaving}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="text-sm text-muted-foreground cursor-pointer hover:text-foreground"
          onClick={() => setIsEditing(true)}
        >
          {attribute.value || (
            <span className="italic text-muted-foreground/50">
              {emptyLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

/**
 * Template variable display row
 */
const TemplateVariableRow = memo(function TemplateVariableRow({
  variable,
}: {
  variable: ResolvedTemplateVariable;
}) {
  return (
    <div className="flex items-center gap-2">
      <code className="bg-muted px-1 rounded text-[10px]">
        {variable.variable}
      </code>
      <span className="text-[10px] text-muted-foreground">
        → {variable.value}
      </span>
    </div>
  );
});

/**
 * Template variables section
 */
interface TemplateVariablesSectionProps {
  contact: ContactData | null;
  attributes: ContactAttribute[];
}

const TemplateVariablesSection = memo(function TemplateVariablesSection({
  contact,
  attributes,
}: TemplateVariablesSectionProps) {
  const t = useTranslations("customerProfile");

  const resolvedVariables = useMemo(
    () =>
      getAllResolvedVariables(contact, attributes, {
        maxAttributes: 5,
        includeCustomer: true,
        includeAttributes: true,
      }),
    [contact, attributes]
  );

  if (resolvedVariables.length === 0) return null;

  return (
    <div className="p-3 bg-muted/30 rounded-lg space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground">
        {t("templateVariables")}
      </h4>
      <p className="text-[10px] text-muted-foreground mb-2">
        {t("useInTemplates")}
      </p>
      <div className="text-xs space-y-1">
        {resolvedVariables.map((variable) => (
          <TemplateVariableRow
            key={`${variable.category}.${variable.property}`}
            variable={variable}
          />
        ))}
      </div>
    </div>
  );
});

/**
 * New attribute form
 */
interface NewAttributeFormProps {
  onAdd: (key: string, value: string, valueType: ValueType) => Promise<void>;
  onCancel: () => void;
  existingKeys: string[];
  saving: boolean;
}

const NewAttributeForm = memo(function NewAttributeForm({
  onAdd,
  onCancel,
  existingKeys,
  saving,
}: NewAttributeFormProps) {
  const t = useTranslations("customerProfile");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [valueType, setValueType] = useState<ValueType>("string");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filteredSuggestions = useMemo(
    () =>
      SUGGESTED_KEYS.filter(
        (s) =>
          !existingKeys.includes(s.key) &&
          (s.key.toLowerCase().includes(key.toLowerCase()) ||
            s.label.toLowerCase().includes(key.toLowerCase()))
      ),
    [key, existingKeys]
  );

  const handleAdd = useCallback(async () => {
    if (!key.trim()) return;
    await onAdd(key, value, valueType);
    setKey("");
    setValue("");
    setValueType("string");
  }, [key, value, valueType, onAdd]);

  const handleSelectSuggestion = useCallback(
    (suggestion: (typeof SUGGESTED_KEYS)[0]) => {
      setKey(suggestion.key);
      setValueType(suggestion.valueType);
      setShowSuggestions(false);
    },
    []
  );

  return (
    <div className="p-3 border rounded-lg space-y-2 bg-muted/30">
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <Label className="text-xs">{t("key")}</Label>
          <Input
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="e.g., order_id"
            className="h-8 text-xs"
          />
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion.key}
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-xs hover:bg-accent flex items-center justify-between"
                  onClick={() => handleSelectSuggestion(suggestion)}
                >
                  <span className="flex items-center gap-1">
                    <span className="font-medium">{suggestion.label}</span>
                    <span className="text-muted-foreground">
                      ({suggestion.key})
                    </span>
                  </span>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">
                    {suggestion.category}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <Label className="text-xs">{t("type")}</Label>
          <Select
            value={valueType}
            onValueChange={(v: ValueType) => setValueType(v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">{t("valueTypes.string")}</SelectItem>
              <SelectItem value="number">{t("valueTypes.number")}</SelectItem>
              <SelectItem value="date">{t("valueTypes.date")}</SelectItem>
              <SelectItem value="phone">{t("valueTypes.phone")}</SelectItem>
              <SelectItem value="email">{t("valueTypes.email")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">{t("value")}</Label>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("enterValue")}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onCancel}
        >
          {t("cancel")}
        </Button>
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleAdd}
          disabled={!key.trim() || saving}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : t("add")}
        </Button>
      </div>
    </div>
  );
});

/**
 * Form input with local state for new contact creation
 * Uses uncontrolled-like pattern with ref for maximum performance
 */
interface CreateFormInputProps {
  id: string;
  defaultValue: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  hasError?: boolean;
  type?: string;
  /**
   * When true, only allows numeric digits (0-9) to be entered.
   * Used for phone number fields.
   */
  numericOnly?: boolean;
}

const CreateFormInput = memo(function CreateFormInput({
  id,
  defaultValue,
  onValueChange,
  placeholder,
  disabled = false,
  hasError = false,
  type = "text",
  numericOnly = false,
}: CreateFormInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(defaultValue);

  // Sync from prop only on mount or when defaultValue changes significantly
  useEffect(() => {
    const valueToSet = numericOnly ? defaultValue.replace(/\D/g, "") : defaultValue;
    setLocalValue(valueToSet);
    if (inputRef.current) {
      inputRef.current.value = valueToSet;
    }
  }, [defaultValue, numericOnly]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value;
    // Filter to digits only if numericOnly is true
    if (numericOnly) {
      newValue = newValue.replace(/\D/g, "");
      e.target.value = newValue;
    }
    setLocalValue(newValue);
  }, [numericOnly]);

  // Prevent non-digit keys when numericOnly is true
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!numericOnly) return;
    
    const allowedKeys = [
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
      "Home",
      "End",
    ];

    if (allowedKeys.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return;
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  }, [numericOnly]);

  // Handle paste for numericOnly mode
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    if (!numericOnly) return;
    
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    const filteredText = pastedText.replace(/\D/g, "");
    
    const input = e.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const currentValue = input.value;
    const newValue =
      currentValue.substring(0, start) +
      filteredText +
      currentValue.substring(end);
    
    input.value = newValue;
    setLocalValue(newValue);
    
    const newCursorPosition = start + filteredText.length;
    requestAnimationFrame(() => {
      input.setSelectionRange(newCursorPosition, newCursorPosition);
    });
  }, [numericOnly]);

  // Only notify parent on blur to minimize re-renders
  const handleBlur = useCallback(() => {
    onValueChange(localValue);
  }, [localValue, onValueChange]);

  return (
    <Input
      ref={inputRef}
      id={id}
      type={type}
      inputMode={numericOnly ? "numeric" : undefined}
      pattern={numericOnly ? "[0-9]*" : undefined}
      value={localValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={`h-8 text-sm ${hasError ? "border-red-500" : ""}`}
      disabled={disabled}
    />
  );
});

// =============================================================================
// Create Contact Form Sub-Component
// =============================================================================

interface CreateContactFormProps {
  participantPhone: string;
  participantName?: string;
  onContactCreated: (contactId: string) => void;
}

const CreateContactForm = memo(function CreateContactForm({
  participantPhone,
  participantName,
  onContactCreated,
}: CreateContactFormProps) {
  const t = useTranslations("unknownContact");
  const tCommon = useTranslations("customerProfile");
  const { addNotification } = useNotification();

  // Parse phone on mount
  const parsedPhone = useMemo(
    () => parsePhoneNumber(participantPhone),
    [participantPhone]
  );

  // Parse name - but avoid using phone number as name
  const parsedName = useMemo(() => {
    if (!participantName) return { firstName: "", lastName: "" };

    // Check if participantName looks like a phone number (only digits, possibly with +)
    const cleanedName = participantName.trim();
    const looksLikePhone = /^[+\d\s-()]+$/.test(cleanedName);

    if (looksLikePhone) {
      // Don't use phone number as name
      return { firstName: "", lastName: "" };
    }

    const parts = cleanedName.split(/\s+/);
    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || "",
    };
  }, [participantName]);

  // Form state - using refs for values to avoid re-renders
  const formRef = useRef({
    firstName: parsedName.firstName,
    lastName: parsedName.lastName,
    email: "",
    countryCode: parsedPhone.countryCode || "",
    phoneNumber: parsedPhone.nationalNumber || "",
    language: "" as SupportedLanguage | "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const updateFormField = useCallback((field: string, value: string) => {
    formRef.current = { ...formRef.current, [field]: value };
    // Clear error for this field
    setErrors((prev) => {
      if (prev[field]) {
        const next = { ...prev };
        delete next[field];
        return next;
      }
      return prev;
    });
  }, []);

  const validateForm = useCallback((): boolean => {
    const form = formRef.current;
    const newErrors: Record<string, string> = {};

    if (!form.firstName.trim()) {
      newErrors.firstName = t("errors.firstNameRequired");
    }
    if (!form.countryCode.trim()) {
      newErrors.countryCode = t("errors.countryCodeRequired");
    } else if (!/^\+\d{1,3}$/.test(form.countryCode)) {
      newErrors.countryCode = t("errors.invalidCountryCode");
    }
    if (!form.phoneNumber.trim()) {
      newErrors.phoneNumber = t("errors.phoneNumberRequired");
    } else if (!/^\d{6,15}$/.test(form.phoneNumber.replace(/\D/g, ""))) {
      newErrors.phoneNumber = t("errors.invalidPhoneNumber");
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = t("errors.invalidEmail");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [t]);

  const handleSave = useCallback(async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    const form = formRef.current;

    try {
      const fullPhoneNumber = `${form.countryCode}${form.phoneNumber.replace(
        /\D/g,
        ""
      )}`;

      const payload: CreateContactDto = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        email: form.email.trim() || undefined,
        countryCode: form.countryCode,
        phoneNumber: fullPhoneNumber,
        language: (form.language as SupportedLanguage) || undefined,
      };

      const result = await backendApi.contacts.create(payload);

      addNotification(t("success.contactCreated"), "success");

      if (result && typeof result === "object" && "contactId" in result) {
        onContactCreated((result as { contactId: string }).contactId);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : t("errors.failedToCreateContact");

      // If contact already exists, try to fetch it
      if (
        errorMessage.toLowerCase().includes("already exists") ||
        errorMessage.toLowerCase().includes("phone number")
      ) {
        try {
          const fullPhoneNumber = `${
            form.countryCode
          }${form.phoneNumber.replace(/\D/g, "")}`;
          const existing = await backendApi.contacts.getByPhone(
            fullPhoneNumber
          );
          if (
            existing &&
            typeof existing === "object" &&
            "contactId" in existing
          ) {
            addNotification(t("success.contactFound"), "success");
            onContactCreated((existing as { contactId: string }).contactId);
            return;
          }
        } catch {
          // Fall through to show error
        }
      }

      setErrors({ general: errorMessage });
      addNotification(errorMessage, "error");
    } finally {
      setIsSaving(false);
    }
  }, [validateForm, onContactCreated, addNotification, t]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          {t("title")}
        </h3>
        {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            {t("infoBanner")}
          </p>
        </div>

        {errors.general && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
            <p className="text-xs text-red-700 dark:text-red-300">
              {errors.general}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {tCommon("contactInfo")}
          </h4>

          {/* First Name */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" />
              {tCommon("firstName")} <span className="text-red-500">*</span>
            </Label>
            <CreateFormInput
              id="firstName"
              defaultValue={parsedName.firstName}
              onValueChange={(v) => updateFormField("firstName", v)}
              placeholder={t("placeholders.firstName")}
              disabled={isSaving}
              hasError={!!errors.firstName}
            />
            {errors.firstName && (
              <p className="text-xs text-red-500">{errors.firstName}</p>
            )}
          </div>

          {/* Last Name */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" />
              {tCommon("lastName")}
            </Label>
            <CreateFormInput
              id="lastName"
              defaultValue={parsedName.lastName}
              onValueChange={(v) => updateFormField("lastName", v)}
              placeholder={t("placeholders.lastName")}
              disabled={isSaving}
            />
          </div>

          {/* Email */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {tCommon("email")}
            </Label>
            <CreateFormInput
              id="email"
              type="email"
              defaultValue=""
              onValueChange={(v) => updateFormField("email", v)}
              placeholder={t("placeholders.email")}
              disabled={isSaving}
              hasError={!!errors.email}
            />
            {errors.email && (
              <p className="text-xs text-red-500">{errors.email}</p>
            )}
          </div>

          {/* Phone Number */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {tCommon("phone")} <span className="text-red-500">*</span>
            </Label>
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-2">
                <CountryCodeSelect
                  value={parsedPhone.countryCode || ""}
                  onChange={(code) => updateFormField("countryCode", code)}
                  disabled={isSaving}
                />
              </div>
              <div className="col-span-3">
                <CreateFormInput
                  id="phoneNumber"
                  defaultValue={parsedPhone.nationalNumber || ""}
                  onValueChange={(v) => updateFormField("phoneNumber", v)}
                  placeholder={t("placeholders.phoneNumber")}
                  disabled={isSaving}
                  hasError={!!errors.phoneNumber || !!errors.countryCode}
                  numericOnly
                />
              </div>
            </div>
            {(errors.countryCode || errors.phoneNumber) && (
              <p className="text-xs text-red-500">
                {errors.countryCode || errors.phoneNumber}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("phoneNumberHint")}
            </p>
          </div>

          {/* Language */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {tCommon("language")}
            </Label>
            <Select
              defaultValue=""
              onValueChange={(v) => updateFormField("language", v)}
              disabled={isSaving}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={tCommon("selectLanguage")} />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {LANGUAGE_DISPLAY_NAMES[lang]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="pt-2">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full"
            size="sm"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("saving")}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {t("saveContact")}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// Profile View Sub-Component
// =============================================================================

interface ProfileViewProps {
  contactId: string;
  /** Chat ID for chat-specific attributes */
  chatId?: string;
  onProfileUpdate?: () => void;
}

const ProfileView = memo(function ProfileView({
  contactId,
  chatId,
  onProfileUpdate,
}: ProfileViewProps) {
  const t = useTranslations("customerProfile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contact, setContact] = useState<ContactData | null>(null);
  const [attributes, setAttributes] = useState<ContactAttribute[]>([]);
  const [newAttributeMode, setNewAttributeMode] = useState(false);

  // Cache variable definitions
  useSWR(
    "variable-definitions",
    () => backendApi.templates.getVariableDefinitions(),
    {
      revalidateOnFocus: false,
    }
  );

  // Load profile
  const loadProfile = useCallback(async () => {
    if (!contactId) return;
    try {
      setLoading(true);
      const profile = await backendApi.contacts.getProfile(contactId, chatId);
      setContact({
        contactId: profile.contact.contactId,
        firstName: profile.contact.firstName,
        lastName: profile.contact.lastName,
        email: profile.contact.email,
        phoneNumber: profile.contact.phoneNumber,
        language: profile.contact.language || null,
      });
      setAttributes(profile.attributes);
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setLoading(false);
    }
  }, [contactId, chatId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Save contact field
  const saveContactField = useCallback(
    async (
      field: "firstName" | "lastName" | "email" | "language",
      value: string | null
    ) => {
      if (!contact) return;
      try {
        setSaving(true);
        await backendApi.contacts.update(contactId, { [field]: value || null });
        setContact((prev) =>
          prev ? { ...prev, [field]: value || null } : null
        );
        onProfileUpdate?.();
      } catch (error) {
        console.error("Failed to save contact field:", error);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [contact, contactId, onProfileUpdate]
  );

  // Update attribute
  const updateAttribute = useCallback(
    async (oldKey: string, newKey: string, value: string) => {
      try {
        setSaving(true);
        const normalizedKey = newKey.toLowerCase().replace(/\s+/g, "_");
        if (oldKey !== normalizedKey) {
          await backendApi.contacts.deleteAttribute(contactId, oldKey, chatId);
        }
        const updated = await backendApi.contacts.upsertAttribute(contactId, {
          key: normalizedKey,
          value,
          chatId,
        });
        setAttributes((prev) =>
          prev.map((attr) => (attr.key === oldKey ? updated : attr))
        );
        onProfileUpdate?.();
      } catch (error) {
        console.error("Failed to update attribute:", error);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [contactId, chatId, onProfileUpdate]
  );

  // Add attribute
  const addAttribute = useCallback(
    async (key: string, value: string, valueType: ValueType) => {
      try {
        setSaving(true);
        const created = await backendApi.contacts.upsertAttribute(contactId, {
          key: key.toLowerCase().replace(/\s+/g, "_"),
          value,
          valueType,
          chatId,
        });
        setAttributes((prev) => [...prev, created]);
        setNewAttributeMode(false);
        onProfileUpdate?.();
      } catch (error) {
        console.error("Failed to add attribute:", error);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [contactId, chatId, onProfileUpdate]
  );

  // Delete attribute
  const deleteAttribute = useCallback(
    async (key: string) => {
      try {
        setSaving(true);
        await backendApi.contacts.deleteAttribute(contactId, key, chatId);
        setAttributes((prev) => prev.filter((attr) => attr.key !== key));
        onProfileUpdate?.();
      } catch (error) {
        console.error("Failed to delete attribute:", error);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [contactId, chatId, onProfileUpdate]
  );

  const existingKeys = useMemo(
    () => attributes.map((a) => a.key),
    [attributes]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        {t("noContactData")}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <User className="h-4 w-4" />
          {t("title")}
        </h3>
        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Core Fields */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t("contactInfo")}
          </h4>

          <EditableField
            label={t("firstName")}
            value={contact.firstName}
            icon={<User className="h-3 w-3" />}
            onSave={(value) => saveContactField("firstName", value)}
          />

          <EditableField
            label={t("lastName")}
            value={contact.lastName || ""}
            icon={<User className="h-3 w-3" />}
            onSave={(value) => saveContactField("lastName", value)}
            placeholder={t("addLastName")}
          />

          <EditableField
            label={t("email")}
            value={contact.email || ""}
            icon={<Mail className="h-3 w-3" />}
            onSave={(value) => saveContactField("email", value)}
            placeholder={t("addEmail")}
            type="email"
          />

          <EditableField
            label={t("phone")}
            value={contact.phoneNumber}
            icon={<Phone className="h-3 w-3" />}
            onSave={async () => {}}
            readOnly
          />

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {t("language")}
            </Label>
            <Select
              value={contact.language || ""}
              onValueChange={(value) =>
                saveContactField("language", value || null)
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={t("selectLanguage")} />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {LANGUAGE_DISPLAY_NAMES[lang]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Custom Attributes */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t("customAttributes")}
            </h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setNewAttributeMode(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t("add")}
            </Button>
          </div>

          {newAttributeMode && (
            <NewAttributeForm
              onAdd={addAttribute}
              onCancel={() => setNewAttributeMode(false)}
              existingKeys={existingKeys}
              saving={saving}
            />
          )}

          {attributes.length > 0 ? (
            <div className="space-y-2">
              {attributes.map((attr) => (
                <AttributeRow
                  key={attr.id}
                  attribute={attr}
                  emptyLabel={t("empty")}
                  onSave={updateAttribute}
                  onDelete={deleteAttribute}
                />
              ))}
            </div>
          ) : (
            !newAttributeMode && (
              <p className="text-xs text-muted-foreground text-center py-2">
                {t("noCustomAttributes")}
              </p>
            )
          )}
        </div>

        <TemplateVariablesSection contact={contact} attributes={attributes} />
      </div>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export function ContactProfilePanel({
  contactId,
  chatId,
  participantPhone,
  participantName,
  onContactResolved,
  onProfileUpdate,
}: ContactProfilePanelProps) {
  const t = useTranslations("unknownContact");

  // Determine mode based on props
  const [mode, setMode] = useState<PanelMode>("loading");
  const [resolvedContactId, setResolvedContactId] = useState<string | null>(
    contactId || null
  );

  // Check for existing contact when phone is provided but contactId is not
  useEffect(() => {
    // If contactId is provided, use it directly
    if (contactId) {
      setResolvedContactId(contactId);
      setMode("profile");
      return;
    }

    // If no phone number, show empty state
    if (!participantPhone) {
      setMode("empty");
      return;
    }

    // Look up contact by phone
    const lookupContact = async () => {
      setMode("loading");
      try {
        const contact = await backendApi.contacts.getByPhone(participantPhone);
        if (contact && typeof contact === "object" && "contactId" in contact) {
          const id = (contact as { contactId: string }).contactId;
          setResolvedContactId(id);
          setMode("profile");
          onContactResolved?.(id);
        } else {
          setResolvedContactId(null);
          setMode("create");
        }
      } catch {
        // Contact not found - show create form
        setResolvedContactId(null);
        setMode("create");
      }
    };

    lookupContact();
  }, [contactId, participantPhone, onContactResolved]);

  // Handle contact creation
  const handleContactCreated = useCallback(
    (newContactId: string) => {
      setResolvedContactId(newContactId);
      setMode("profile");
      onContactResolved?.(newContactId);
    },
    [onContactResolved]
  );

  // Render based on mode
  switch (mode) {
    case "loading":
      return (
        <div className="flex flex-col h-full">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <User className="h-4 w-4" />
              {t("title")}
            </h3>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      );

    case "profile":
      return resolvedContactId ? (
        <ProfileView
          contactId={resolvedContactId}
          chatId={chatId}
          onProfileUpdate={onProfileUpdate}
        />
      ) : null;

    case "create":
      return participantPhone ? (
        <CreateContactForm
          participantPhone={participantPhone}
          participantName={participantName}
          onContactCreated={handleContactCreated}
        />
      ) : null;

    case "empty":
    default:
      return (
        <div className="flex flex-col h-full">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <User className="h-4 w-4" />
              {t("title")}
            </h3>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-sm text-muted-foreground text-center">
              No contact information available
            </p>
          </div>
        </div>
      );
  }
}
