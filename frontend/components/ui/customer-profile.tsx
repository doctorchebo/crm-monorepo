"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { backendApi, ContactAttribute } from "@/lib/api/endpoints";
import {
  getAllResolvedVariables,
  type ContactData,
  type ResolvedTemplateVariable,
} from "@/lib/utils/template-variables";
import {
  Check,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

interface CustomerProfileProps {
  contactId: string;
  onProfileUpdate?: () => void;
}

type ValueType = "string" | "number" | "date" | "phone" | "email";

// Suggested attribute keys based on common CRM patterns and variable definitions
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

export function CustomerProfile({
  contactId,
  onProfileUpdate,
}: CustomerProfileProps) {
  const t = useTranslations("customerProfile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contact, setContact] = useState<ContactData | null>(null);
  const [attributes, setAttributes] = useState<ContactAttribute[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editKey, setEditKey] = useState("");
  const [newAttributeMode, setNewAttributeMode] = useState(false);
  const [newAttribute, setNewAttribute] = useState({
    key: "",
    value: "",
    valueType: "string" as ValueType,
  });
  const [showKeySuggestions, setShowKeySuggestions] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);

  // Fetch variable definitions for autocomplete
  const { data: variableData } = useSWR(
    "variable-definitions",
    () => backendApi.templates.getVariableDefinitions(),
    { revalidateOnFocus: false }
  );

  // Get filtered suggestions based on current input
  const getFilteredSuggestions = useCallback(
    (input: string) => {
      const existingKeys = attributes.map((a) => a.key);
      return SUGGESTED_KEYS.filter(
        (s) =>
          !existingKeys.includes(s.key) &&
          (s.key.toLowerCase().includes(input.toLowerCase()) ||
            s.label.toLowerCase().includes(input.toLowerCase()))
      );
    },
    [attributes]
  );

  // Load profile data
  const loadProfile = useCallback(async () => {
    if (!contactId) return;

    try {
      setLoading(true);
      const profile = await backendApi.contacts.getProfile(contactId);
      setContact({
        contactId: profile.contact.contactId,
        firstName: profile.contact.firstName,
        lastName: profile.contact.lastName,
        email: profile.contact.email,
        phoneNumber: profile.contact.phoneNumber,
      });
      setAttributes(profile.attributes);
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Auto-save contact field
  const saveContactField = async (
    field: "firstName" | "lastName" | "email",
    value: string
  ) => {
    if (!contact) return;

    try {
      setSaving(true);
      await backendApi.contacts.update(contactId, {
        [field]: value || null,
      });
      setContact((prev) => (prev ? { ...prev, [field]: value || null } : null));
      setEditingField(null);
      onProfileUpdate?.();
    } catch (error) {
      console.error("Failed to save contact field:", error);
    } finally {
      setSaving(false);
    }
  };

  // Save attribute value
  const saveAttribute = async (key: string, value: string) => {
    try {
      setSaving(true);
      const updated = await backendApi.contacts.upsertAttribute(contactId, {
        key,
        value,
      });
      setAttributes((prev) =>
        prev.map((attr) => (attr.key === key ? updated : attr))
      );
      setEditingField(null);
      onProfileUpdate?.();
    } catch (error) {
      console.error("Failed to save attribute:", error);
    } finally {
      setSaving(false);
    }
  };

  // Update attribute (key and/or value)
  const updateAttribute = async (
    oldKey: string,
    newKey: string,
    value: string
  ) => {
    try {
      setSaving(true);
      const normalizedKey = newKey.toLowerCase().replace(/\s+/g, "_");

      // If key changed, delete old and create new
      if (oldKey !== normalizedKey) {
        await backendApi.contacts.deleteAttribute(contactId, oldKey);
      }

      const updated = await backendApi.contacts.upsertAttribute(contactId, {
        key: normalizedKey,
        value,
      });

      setAttributes((prev) =>
        prev.map((attr) => (attr.key === oldKey ? updated : attr))
      );
      setEditingField(null);
      setEditKey("");
      setEditValue("");
      onProfileUpdate?.();
    } catch (error) {
      console.error("Failed to update attribute:", error);
    } finally {
      setSaving(false);
    }
  };

  // Add new attribute
  const addAttribute = async () => {
    if (!newAttribute.key.trim()) return;

    try {
      setSaving(true);
      const created = await backendApi.contacts.upsertAttribute(contactId, {
        key: newAttribute.key.toLowerCase().replace(/\s+/g, "_"),
        value: newAttribute.value,
        valueType: newAttribute.valueType,
      });
      setAttributes((prev) => [...prev, created]);
      setNewAttributeMode(false);
      setNewAttribute({ key: "", value: "", valueType: "string" });
      onProfileUpdate?.();
    } catch (error) {
      console.error("Failed to add attribute:", error);
    } finally {
      setSaving(false);
    }
  };

  // Delete attribute
  const deleteAttribute = async (key: string) => {
    try {
      setSaving(true);
      await backendApi.contacts.deleteAttribute(contactId, key);
      setAttributes((prev) => prev.filter((attr) => attr.key !== key));
      onProfileUpdate?.();
    } catch (error) {
      console.error("Failed to delete attribute:", error);
    } finally {
      setSaving(false);
    }
  };

  // Start editing
  const startEditing = (
    fieldId: string,
    currentValue: string,
    currentKey?: string
  ) => {
    setEditingField(fieldId);
    setEditValue(currentValue || "");
    setEditKey(currentKey || "");
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingField(null);
    setEditValue("");
    setEditKey("");
  };

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
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <User className="h-4 w-4" />
          {t("title")}
        </h3>
        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Core Fields Section */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t("contactInfo")}
          </h4>

          {/* First Name */}
          <EditableField
            label={t("firstName")}
            value={contact.firstName}
            fieldId="firstName"
            icon={<User className="h-3 w-3" />}
            editing={editingField === "firstName"}
            editValue={editValue}
            onStartEdit={() => startEditing("firstName", contact.firstName)}
            onCancel={cancelEditing}
            onSave={(value) => saveContactField("firstName", value)}
            onEditValueChange={setEditValue}
          />

          {/* Last Name */}
          <EditableField
            label={t("lastName")}
            value={contact.lastName || ""}
            fieldId="lastName"
            icon={<User className="h-3 w-3" />}
            editing={editingField === "lastName"}
            editValue={editValue}
            onStartEdit={() => startEditing("lastName", contact.lastName || "")}
            onCancel={cancelEditing}
            onSave={(value) => saveContactField("lastName", value)}
            onEditValueChange={setEditValue}
            placeholder={t("addLastName")}
          />

          {/* Email */}
          <EditableField
            label={t("email")}
            value={contact.email || ""}
            fieldId="email"
            icon={<Mail className="h-3 w-3" />}
            editing={editingField === "email"}
            editValue={editValue}
            onStartEdit={() => startEditing("email", contact.email || "")}
            onCancel={cancelEditing}
            onSave={(value) => saveContactField("email", value)}
            onEditValueChange={setEditValue}
            placeholder={t("addEmail")}
            type="email"
          />

          {/* Phone (read-only) */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {t("phone")}
            </Label>
            <p className="text-sm px-2 py-1 bg-muted/50 rounded">
              {contact.phoneNumber}
            </p>
          </div>
        </div>

        {/* Custom Attributes Section */}
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

          {/* New Attribute Form */}
          {newAttributeMode && (
            <div className="p-3 border rounded-lg space-y-2 bg-muted/30">
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <Label className="text-xs">{t("key")}</Label>
                  <Input
                    ref={keyInputRef}
                    value={newAttribute.key}
                    onChange={(e) => {
                      setNewAttribute((prev) => ({
                        ...prev,
                        key: e.target.value,
                      }));
                      setShowKeySuggestions(true);
                    }}
                    onFocus={() => setShowKeySuggestions(true)}
                    onBlur={() => {
                      // Delay to allow click on suggestion
                      setTimeout(() => setShowKeySuggestions(false), 200);
                    }}
                    placeholder="e.g., order_id"
                    className="h-8 text-xs"
                  />
                  {/* Autocomplete Dropdown */}
                  {showKeySuggestions &&
                    getFilteredSuggestions(newAttribute.key).length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {getFilteredSuggestions(newAttribute.key).map(
                          (suggestion) => (
                            <button
                              key={suggestion.key}
                              type="button"
                              className="w-full px-2 py-1.5 text-left text-xs hover:bg-accent flex items-center justify-between"
                              onClick={() => {
                                setNewAttribute((prev) => ({
                                  ...prev,
                                  key: suggestion.key,
                                  valueType: suggestion.valueType,
                                }));
                                setShowKeySuggestions(false);
                              }}
                            >
                              <span className="flex items-center gap-1">
                                <span className="font-medium">
                                  {suggestion.label}
                                </span>
                                <span className="text-muted-foreground">
                                  ({suggestion.key})
                                </span>
                              </span>
                              <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">
                                {suggestion.category}
                              </span>
                            </button>
                          )
                        )}
                      </div>
                    )}
                </div>
                <div>
                  <Label className="text-xs">{t("type")}</Label>
                  <Select
                    value={newAttribute.valueType}
                    onValueChange={(value: ValueType) =>
                      setNewAttribute((prev) => ({ ...prev, valueType: value }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="string">
                        {t("valueTypes.string")}
                      </SelectItem>
                      <SelectItem value="number">
                        {t("valueTypes.number")}
                      </SelectItem>
                      <SelectItem value="date">
                        {t("valueTypes.date")}
                      </SelectItem>
                      <SelectItem value="phone">
                        {t("valueTypes.phone")}
                      </SelectItem>
                      <SelectItem value="email">
                        {t("valueTypes.email")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">{t("value")}</Label>
                <Input
                  value={newAttribute.value}
                  onChange={(e) =>
                    setNewAttribute((prev) => ({
                      ...prev,
                      value: e.target.value,
                    }))
                  }
                  placeholder={t("enterValue")}
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setNewAttributeMode(false);
                    setShowKeySuggestions(false);
                    setNewAttribute({
                      key: "",
                      value: "",
                      valueType: "string",
                    });
                  }}
                >
                  {t("cancel")}
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={addAttribute}
                  disabled={!newAttribute.key.trim() || saving}
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    t("add")
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Attributes List */}
          {attributes.length > 0 ? (
            <div className="space-y-2">
              {attributes.map((attr) => (
                <AttributeRow
                  key={attr.id}
                  attribute={attr}
                  editing={editingField === `attr_${attr.key}`}
                  editValue={editValue}
                  editKey={editKey}
                  emptyLabel={t("empty")}
                  onStartEdit={() =>
                    startEditing(`attr_${attr.key}`, attr.value || "", attr.key)
                  }
                  onCancel={cancelEditing}
                  onSave={(newKey, value) =>
                    updateAttribute(attr.key, newKey, value)
                  }
                  onDelete={() => deleteAttribute(attr.key)}
                  onEditValueChange={setEditValue}
                  onEditKeyChange={setEditKey}
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

        {/* Template Variables Section */}
        <TemplateVariablesSection contact={contact} attributes={attributes} />
      </div>
    </div>
  );
}

// Template Variables Section Component
interface TemplateVariablesSectionProps {
  contact: ContactData | null;
  attributes: ContactAttribute[];
}

function TemplateVariablesSection({
  contact,
  attributes,
}: TemplateVariablesSectionProps) {
  const t = useTranslations("customerProfile");

  // Compute resolved variables using the utility
  const resolvedVariables = useMemo(
    () =>
      getAllResolvedVariables(contact, attributes, {
        maxAttributes: 5,
        includeCustomer: true,
        includeAttributes: true,
      }),
    [contact, attributes]
  );

  // Don't show the section if there are no variables with values
  if (resolvedVariables.length === 0) {
    return null;
  }

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
}

// Template Variable Row Component
interface TemplateVariableRowProps {
  variable: ResolvedTemplateVariable;
}

function TemplateVariableRow({ variable }: TemplateVariableRowProps) {
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
}

// Editable Field Component
interface EditableFieldProps {
  label: string;
  value: string;
  fieldId: string;
  icon?: React.ReactNode;
  editing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: (value: string) => void;
  onEditValueChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}

function EditableField({
  label,
  value,
  fieldId,
  icon,
  editing,
  editValue,
  onStartEdit,
  onCancel,
  onSave,
  onEditValueChange,
  placeholder = "Add value",
  type = "text",
}: EditableFieldProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSave(editValue);
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </Label>
      {editing ? (
        <div className="flex items-center gap-1">
          <Input
            type={type}
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 text-xs"
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onSave(editValue)}
          >
            <Check className="h-3 w-3 text-green-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onCancel}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div
          className="group flex items-center justify-between px-2 py-1 bg-muted/50 rounded cursor-pointer hover:bg-muted"
          onClick={onStartEdit}
        >
          <span className={`text-sm ${!value ? "text-muted-foreground" : ""}`}>
            {value || placeholder}
          </span>
          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

// Attribute Row Component
interface AttributeRowProps {
  attribute: ContactAttribute;
  editing: boolean;
  editValue: string;
  editKey: string;
  emptyLabel: string;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: (newKey: string, value: string) => void;
  onDelete: () => void;
  onEditValueChange: (value: string) => void;
  onEditKeyChange: (key: string) => void;
}

function AttributeRow({
  attribute,
  editing,
  editValue,
  editKey,
  emptyLabel,
  onStartEdit,
  onCancel,
  onSave,
  onDelete,
  onEditValueChange,
  onEditKeyChange,
}: AttributeRowProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSave(editKey, editValue);
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const formatKey = (key: string) => {
    return key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Determine the template variable prefix for this attribute
  const getSuggestedPrefix = (key: string) => {
    const suggestion = SUGGESTED_KEYS.find((s) => s.key === key);
    return suggestion?.category || "custom";
  };

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
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </div>
      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <div className="flex-1">
              <Label className="text-[10px] text-muted-foreground">Key</Label>
              <Input
                value={editKey}
                onChange={(e) => onEditKeyChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-7 text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="flex-1">
              <Label className="text-[10px] text-muted-foreground">Value</Label>
              <Input
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-7 text-xs"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-1 pt-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onSave(editKey, editValue)}
              >
                <Check className="h-3 w-3 text-green-600" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={onCancel}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="text-sm text-muted-foreground cursor-pointer hover:text-foreground"
          onClick={onStartEdit}
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
}
