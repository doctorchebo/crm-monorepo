"use client";

/**
 * Chat AI Configuration Modal
 * Per-chat AI settings configuration dialog
 *
 * Features:
 * - Enable/disable AI for specific chat
 * - Configure tone, style, formality
 * - Set rate limits and response length
 * - Custom instructions per chat
 * - Template-only mode toggle
 */

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
  backendApi,
  type ChatAiOverride,
  type SetChatOverrideDto,
} from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  Bot,
  FileText,
  Loader2,
  MessageSquare,
  Settings2,
  Sparkles,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// ============================================================================
// Types
// ============================================================================

interface ChatAiConfigModalProps {
  chatId: string;
  chatName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface ConfigFormData {
  aiEnabled: boolean;
  tone: string | null;
  style: string | null;
  formalityLevel: string | null;
  maxMessagesPerHour: number | null;
  maxResponseLength: number | null;
  customInstructions: string | null;
  useTemplatesOnly: boolean;
  reviewBeforeSend: boolean;
  overrideReason: string | null;
}

// ============================================================================
// Configuration Options
// ============================================================================

const TONE_OPTIONS = [
  {
    value: "friendly",
    label: "Friendly",
    description: "Warm and approachable",
  },
  {
    value: "professional",
    label: "Professional",
    description: "Business-like and formal",
  },
  { value: "casual", label: "Casual", description: "Relaxed and informal" },
  {
    value: "empathetic",
    label: "Empathetic",
    description: "Understanding and supportive",
  },
  {
    value: "enthusiastic",
    label: "Enthusiastic",
    description: "Energetic and positive",
  },
];

const STYLE_OPTIONS = [
  { value: "concise", label: "Concise", description: "Brief and to the point" },
  {
    value: "detailed",
    label: "Detailed",
    description: "Thorough explanations",
  },
  {
    value: "conversational",
    label: "Conversational",
    description: "Natural dialogue style",
  },
  {
    value: "instructional",
    label: "Instructional",
    description: "Step-by-step guidance",
  },
];

const FORMALITY_OPTIONS = [
  { value: "formal", label: "Formal", description: "Proper and respectful" },
  {
    value: "balanced",
    label: "Balanced",
    description: "Mix of formal and casual",
  },
  { value: "informal", label: "Informal", description: "Casual and friendly" },
];

// ============================================================================
// Component
// ============================================================================

export function ChatAiConfigModal({
  chatId,
  chatName,
  open,
  onOpenChange,
  onSaved,
}: ChatAiConfigModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingOverride, setExistingOverride] =
    useState<ChatAiOverride | null>(null);

  const [formData, setFormData] = useState<ConfigFormData>({
    aiEnabled: false, // Default to disabled
    tone: null,
    style: null,
    formalityLevel: null,
    maxMessagesPerHour: null,
    maxResponseLength: null,
    customInstructions: null,
    useTemplatesOnly: false,
    reviewBeforeSend: false,
    overrideReason: null,
  });

  // Fetch existing override
  const fetchOverride = useCallback(async () => {
    if (!chatId || !open) return;

    setLoading(true);
    setError(null);

    try {
      const override = await backendApi.aiConfig.getChatOverride(chatId);
      setExistingOverride(override);

      if (override) {
        setFormData({
          aiEnabled: override.aiEnabled ?? false,
          tone: override.tone,
          style: override.style,
          formalityLevel: override.formalityLevel,
          maxMessagesPerHour: override.maxMessagesPerHour,
          maxResponseLength: override.maxResponseLength,
          customInstructions: override.customInstructions,
          useTemplatesOnly: override.useTemplatesOnly ?? false,
          reviewBeforeSend: override.reviewBeforeSend ?? false,
          overrideReason: override.overrideReason,
        });
      } else {
        // Reset to defaults for new chat (AI disabled by default)
        setFormData({
          aiEnabled: false,
          tone: null,
          style: null,
          formalityLevel: null,
          maxMessagesPerHour: null,
          maxResponseLength: null,
          customInstructions: null,
          useTemplatesOnly: false,
          reviewBeforeSend: false,
          overrideReason: null,
        });
      }
    } catch (err) {
      console.error("Failed to fetch AI override:", err);
      setError("Failed to load AI configuration");
    } finally {
      setLoading(false);
    }
  }, [chatId, open]);

  useEffect(() => {
    fetchOverride();
  }, [fetchOverride]);

  // Save configuration
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const dto: SetChatOverrideDto = {
        chatId,
        aiEnabled: formData.aiEnabled,
        tone: formData.tone,
        style: formData.style,
        formalityLevel: formData.formalityLevel,
        maxMessagesPerHour: formData.maxMessagesPerHour,
        maxResponseLength: formData.maxResponseLength,
        customInstructions: formData.customInstructions,
        useTemplatesOnly: formData.useTemplatesOnly,
        reviewBeforeSend: formData.reviewBeforeSend,
        overrideReason: formData.overrideReason || "User configuration",
      };

      await backendApi.aiConfig.setChatOverride(dto);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save AI configuration:", err);
      setError("Failed to save AI configuration");
    } finally {
      setSaving(false);
    }
  };

  // Reset to defaults (delete override)
  const handleResetToDefaults = async () => {
    if (!existingOverride) return;

    setSaving(true);
    setError(null);

    try {
      await backendApi.aiConfig.deleteChatOverride(chatId);
      setExistingOverride(null);
      setFormData({
        aiEnabled: false,
        tone: null,
        style: null,
        formalityLevel: null,
        maxMessagesPerHour: null,
        maxResponseLength: null,
        customInstructions: null,
        useTemplatesOnly: false,
        reviewBeforeSend: false,
        overrideReason: null,
      });
      onSaved?.();
    } catch (err) {
      console.error("Failed to reset AI configuration:", err);
      setError("Failed to reset AI configuration");
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof ConfigFormData>(
    field: K,
    value: ConfigFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Configuration
            {chatName && (
              <span className="text-muted-foreground font-normal">
                — {chatName}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Configure AI behavior for this specific chat. These settings
            override your default AI configuration.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* AI Enabled Toggle - Most Important */}
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "p-2 rounded-full",
                    formData.aiEnabled
                      ? "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  )}
                >
                  {formData.aiEnabled ? (
                    <Sparkles className="h-5 w-5" />
                  ) : (
                    <Bot className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <Label className="text-base font-medium">
                    AI Auto-Replies
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {formData.aiEnabled
                      ? "AI will automatically respond to customer messages"
                      : "AI responses are disabled - manual replies only"}
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.aiEnabled}
                onCheckedChange={(checked) => updateField("aiEnabled", checked)}
              />
            </div>

            {/* Rest of settings - only shown when AI is enabled */}
            {formData.aiEnabled && (
              <>
                {/* Style Settings */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-sm font-medium">
                    <MessageSquare className="h-4 w-4" />
                    Response Style
                  </h4>

                  <div className="grid gap-4 sm:grid-cols-3">
                    {/* Tone */}
                    <div className="space-y-2">
                      <Label>Tone</Label>
                      <Select
                        value={formData.tone || "default"}
                        onValueChange={(v) =>
                          updateField("tone", v === "default" ? null : v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Use default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Use default</SelectItem>
                          {TONE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Style */}
                    <div className="space-y-2">
                      <Label>Style</Label>
                      <Select
                        value={formData.style || "default"}
                        onValueChange={(v) =>
                          updateField("style", v === "default" ? null : v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Use default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Use default</SelectItem>
                          {STYLE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Formality */}
                    <div className="space-y-2">
                      <Label>Formality</Label>
                      <Select
                        value={formData.formalityLevel || "default"}
                        onValueChange={(v) =>
                          updateField(
                            "formalityLevel",
                            v === "default" ? null : v
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Use default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Use default</SelectItem>
                          {FORMALITY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Rate Limits */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-sm font-medium">
                    <Zap className="h-4 w-4" />
                    Rate Limits
                  </h4>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Max Messages Per Hour</Label>
                      <Input
                        type="number"
                        placeholder="Use default"
                        value={formData.maxMessagesPerHour ?? ""}
                        onChange={(e) =>
                          updateField(
                            "maxMessagesPerHour",
                            e.target.value ? parseInt(e.target.value) : null
                          )
                        }
                        min={1}
                        max={100}
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave empty to use default limit
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Max Response Length (chars)</Label>
                      <Input
                        type="number"
                        placeholder="Use default"
                        value={formData.maxResponseLength ?? ""}
                        onChange={(e) =>
                          updateField(
                            "maxResponseLength",
                            e.target.value ? parseInt(e.target.value) : null
                          )
                        }
                        min={50}
                        max={2000}
                      />
                    </div>
                  </div>
                </div>

                {/* Template Mode */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4" />
                    Response Mode
                  </h4>

                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <Label>Templates Only Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Only allow pre-approved template messages
                      </p>
                    </div>
                    <Switch
                      checked={formData.useTemplatesOnly}
                      onCheckedChange={(checked) =>
                        updateField("useTemplatesOnly", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20">
                    <div>
                      <Label className="text-violet-700 dark:text-violet-300">Review Before Send</Label>
                      <p className="text-sm text-muted-foreground">
                        Preview and edit AI responses before they are sent
                      </p>
                    </div>
                    <Switch
                      checked={formData.reviewBeforeSend}
                      onCheckedChange={(checked) =>
                        updateField("reviewBeforeSend", checked)
                      }
                    />
                  </div>
                </div>

                {/* Custom Instructions */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-sm font-medium">
                    <Settings2 className="h-4 w-4" />
                    Custom Instructions
                  </h4>

                  <div className="space-y-2">
                    <Label>Additional Context for AI</Label>
                    <Textarea
                      placeholder="e.g., This customer prefers Spanish responses. They are interested in Product X."
                      value={formData.customInstructions || ""}
                      onChange={(e) =>
                        updateField(
                          "customInstructions",
                          e.target.value || null
                        )
                      }
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      Provide specific context or instructions for AI when
                      responding to this chat
                    </p>
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {existingOverride && (
            <Button
              variant="outline"
              onClick={handleResetToDefaults}
              disabled={saving}
              className="sm:mr-auto"
            >
              Reset to Defaults
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Configuration"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
