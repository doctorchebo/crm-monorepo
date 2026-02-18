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
import {
  ButtonType,
  CopyCodeButton,
  FlowButton,
  OtpButton,
  PhoneButton,
  QuickReplyButton,
  TemplateButton,
  UrlButton,
} from "@/lib/types/template-components.types";
import {
  Copy,
  ExternalLink,
  GripVertical,
  MessageCircle,
  Phone,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";
import { useCallback, useMemo } from "react";

interface ButtonEditorProps {
  /** Current buttons array */
  value: TemplateButton[];
  /** Callback when buttons change */
  onChange: (buttons: TemplateButton[]) => void;
  /** Whether the editor is disabled */
  disabled?: boolean;
  /** Template category (affects available button types) */
  category?: "utility" | "marketing" | "authentication";
  /** Maximum number of buttons allowed */
  maxButtons?: number;
}

/** Button type options with icons and constraints */
const BUTTON_TYPE_OPTIONS: Array<{
  value: ButtonType;
  label: string;
  icon: typeof Phone;
  description: string;
  /** Categories where this button type is allowed */
  allowedCategories: Array<"utility" | "marketing" | "authentication">;
  /** Max count of this button type per template */
  maxCount: number;
}> = [
  {
    value: "QUICK_REPLY",
    label: "Quick Reply",
    icon: MessageCircle,
    description: "Pre-defined reply option",
    allowedCategories: ["utility", "marketing"],
    maxCount: 10,
  },
  {
    value: "URL",
    label: "Website Link",
    icon: ExternalLink,
    description: "Open a URL",
    allowedCategories: ["utility", "marketing"],
    maxCount: 2,
  },
  {
    value: "PHONE_NUMBER",
    label: "Call Phone",
    icon: Phone,
    description: "Make a phone call",
    allowedCategories: ["utility", "marketing"],
    maxCount: 1,
  },
  {
    value: "COPY_CODE",
    label: "Copy Code",
    icon: Copy,
    description: "Copy a code to clipboard",
    allowedCategories: ["utility", "authentication"],
    maxCount: 1,
  },
  {
    value: "FLOW",
    label: "WhatsApp Flow",
    icon: Workflow,
    description: "Launch a WhatsApp Flow",
    allowedCategories: ["utility", "marketing"],
    maxCount: 1,
  },
];

/**
 * Create a new button with default values
 */
function createButton(type: ButtonType): TemplateButton {
  const baseButton = { type, text: "" };

  switch (type) {
    case "URL":
      return { ...baseButton, type: "URL", url: "" } as UrlButton;
    case "PHONE_NUMBER":
      return {
        ...baseButton,
        type: "PHONE_NUMBER",
        phoneNumber: "",
      } as PhoneButton;
    case "QUICK_REPLY":
      return { ...baseButton, type: "QUICK_REPLY" } as QuickReplyButton;
    case "COPY_CODE":
      return { ...baseButton, type: "COPY_CODE" } as CopyCodeButton;
    case "FLOW":
      return {
        ...baseButton,
        type: "FLOW",
        flowId: "",
        flowAction: "navigate",
      } as FlowButton;
    case "OTP":
      return { ...baseButton, type: "OTP", otpType: "COPY_CODE" } as OtpButton;
    default:
      return { ...baseButton, type: "QUICK_REPLY" } as QuickReplyButton;
  }
}

/**
 * ButtonEditor Component
 *
 * Allows editing template buttons with support for:
 * - Quick replies (up to 10)
 * - URL buttons (up to 2)
 * - Phone number buttons (1)
 * - Copy code buttons (1)
 * - Flow buttons (1)
 *
 * Meta constraints:
 * - Quick replies cannot be mixed with other button types
 * - Maximum 3 buttons total (except quick replies which allow 10)
 */
export function ButtonEditor({
  value,
  onChange,
  disabled = false,
  category = "utility",
  maxButtons = 10,
}: ButtonEditorProps) {
  // Filter available button types based on category
  const availableTypes = useMemo(() => {
    return BUTTON_TYPE_OPTIONS.filter((opt) =>
      opt.allowedCategories.includes(category),
    );
  }, [category]);

  // Check if we have quick replies (can't mix with other types)
  const hasQuickReplies = value.some((b) => b.type === "QUICK_REPLY");
  const hasOtherButtons = value.some((b) => b.type !== "QUICK_REPLY");

  // Calculate which types can still be added
  const canAddType = useCallback(
    (type: ButtonType) => {
      // If we have quick replies, can only add more quick replies
      if (hasQuickReplies && type !== "QUICK_REPLY") return false;
      // If we have other buttons, can't add quick replies
      if (hasOtherButtons && type === "QUICK_REPLY") return false;

      // Check max count for this type
      const option = BUTTON_TYPE_OPTIONS.find((o) => o.value === type);
      if (!option) return false;

      const currentCount = value.filter((b) => b.type === type).length;
      if (currentCount >= option.maxCount) return false;

      // Check total button limit
      if (type === "QUICK_REPLY") {
        return value.length < 10;
      } else {
        return value.filter((b) => b.type !== "QUICK_REPLY").length < 3;
      }
    },
    [value, hasQuickReplies, hasOtherButtons],
  );

  // Add a new button
  const handleAddButton = useCallback(
    (type: ButtonType) => {
      if (!canAddType(type)) return;
      const newButton = createButton(type);
      onChange([...value, newButton]);
    },
    [value, onChange, canAddType],
  );

  // Remove a button
  const handleRemoveButton = useCallback(
    (index: number) => {
      const newButtons = [...value];
      newButtons.splice(index, 1);
      onChange(newButtons);
    },
    [value, onChange],
  );

  // Update a button
  const handleUpdateButton = useCallback(
    (index: number, updates: Partial<TemplateButton>) => {
      const newButtons = [...value];
      newButtons[index] = {
        ...newButtons[index],
        ...updates,
      } as TemplateButton;
      onChange(newButtons);
    },
    [value, onChange],
  );

  // Move button up/down
  const handleMoveButton = useCallback(
    (index: number, direction: "up" | "down") => {
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= value.length) return;

      const newButtons = [...value];
      [newButtons[index], newButtons[newIndex]] = [
        newButtons[newIndex],
        newButtons[index],
      ];
      onChange(newButtons);
    },
    [value, onChange],
  );

  const canAddMore =
    value.length < maxButtons &&
    availableTypes.some((t) => canAddType(t.value));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          Buttons ({value.length}/{hasQuickReplies ? 10 : 3})
        </Label>
        {hasQuickReplies && (
          <span className="text-xs text-muted-foreground">
            Quick replies only
          </span>
        )}
        {hasOtherButtons && (
          <span className="text-xs text-muted-foreground">
            Max 3 interactive buttons
          </span>
        )}
      </div>

      {/* Existing buttons */}
      <div className="space-y-3">
        {value.map((button, index) => (
          <ButtonRow
            key={index}
            button={button}
            index={index}
            totalButtons={value.length}
            disabled={disabled}
            onUpdate={(updates) => handleUpdateButton(index, updates)}
            onRemove={() => handleRemoveButton(index)}
            onMove={(dir) => handleMoveButton(index, dir)}
          />
        ))}
      </div>

      {/* Add button dropdown */}
      {canAddMore && !disabled && (
        <div className="flex flex-wrap gap-2">
          {availableTypes
            .filter((opt) => canAddType(opt.value))
            .map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddButton(opt.value)}
                className="gap-2"
              >
                <Plus className="h-3 w-3" />
                <opt.icon className="h-3 w-3" />
                {opt.label}
              </Button>
            ))}
        </div>
      )}

      {value.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No buttons added. Click above to add interactive buttons.
        </p>
      )}
    </div>
  );
}

/** Individual button row editor */
interface ButtonRowProps {
  button: TemplateButton;
  index: number;
  totalButtons: number;
  disabled: boolean;
  onUpdate: (updates: Partial<TemplateButton>) => void;
  onRemove: () => void;
  onMove: (direction: "up" | "down") => void;
}

function ButtonRow({
  button,
  index,
  totalButtons,
  disabled,
  onUpdate,
  onRemove,
  onMove,
}: ButtonRowProps) {
  const typeOption = BUTTON_TYPE_OPTIONS.find((o) => o.value === button.type);
  const Icon = typeOption?.icon || MessageCircle;

  return (
    <div className="flex items-start gap-2 p-3 rounded-lg border bg-card">
      {/* Drag handle and reorder */}
      <div className="flex flex-col gap-1 pt-1">
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
        {totalButtons > 1 && (
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => onMove("up")}
              disabled={index === 0 || disabled}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => onMove("down")}
              disabled={index === totalButtons - 1 || disabled}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              ▼
            </button>
          </div>
        )}
      </div>

      {/* Button content */}
      <div className="flex-1 space-y-3">
        {/* Type indicator and button text */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted text-xs font-medium">
            <Icon className="h-3 w-3" />
            {typeOption?.label}
          </div>
          <Input
            value={button.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            placeholder="Button text (max 25 chars)"
            maxLength={25}
            disabled={disabled}
            className="flex-1"
          />
        </div>

        {/* Type-specific fields */}
        {button.type === "URL" && (
          <div className="space-y-2">
            <Input
              value={(button as UrlButton).url}
              onChange={(e) => onUpdate({ url: e.target.value })}
              placeholder="https://example.com/page/{{1}}"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Use {"{{1}}"} for dynamic URL parameters
            </p>
          </div>
        )}

        {button.type === "PHONE_NUMBER" && (
          <Input
            value={(button as PhoneButton).phoneNumber}
            onChange={(e) => onUpdate({ phoneNumber: e.target.value })}
            placeholder="+1234567890"
            disabled={disabled}
          />
        )}

        {button.type === "FLOW" && (
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={(button as FlowButton).flowId}
              onChange={(e) => onUpdate({ flowId: e.target.value })}
              placeholder="Flow ID"
              disabled={disabled}
            />
            <Select
              value={(button as FlowButton).flowAction}
              onValueChange={(v) =>
                onUpdate({ flowAction: v as "navigate" | "data_exchange" })
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="navigate">Navigate</SelectItem>
                <SelectItem value="data_exchange">Data Exchange</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {button.type === "COPY_CODE" && (
          <Input
            value={(button as CopyCodeButton).example || ""}
            onChange={(e) => onUpdate({ example: e.target.value })}
            placeholder="Example code (for preview)"
            disabled={disabled}
          />
        )}
      </div>

      {/* Remove button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default ButtonEditor;
