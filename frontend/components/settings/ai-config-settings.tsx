"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAiConfig } from "@/hooks/use-ai-config";
import { useTabState } from "@/hooks/use-tab-state";
import type { UpdateAiConfigurationDto } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  Bot,
  Crosshair,
  Languages,
  MessageSquare,
  Settings2,
  Zap,
} from "lucide-react";
import { useCallback, useState } from "react";

// Simple toast replacement until sonner is installed
const toast = {
  success: (msg: string) => console.log(`✓ ${msg}`),
  error: (msg: string) => console.error(`✗ ${msg}`),
};

interface AiConfigSettingsProps {
  /**
   * Display variant:
   * - "card" (default): Wrapped in a Card component with header
   * - "embedded": No card wrapper, for use inside SettingsCategory
   */
  variant?: "card" | "embedded";

  /**
   * Query parameter name to store the selected tab.
   * Useful when multiple tabbed components exist on the same page.
   * @default "tab"
   */
  tabParamName?: string;
}

/**
 * AI Configuration Settings Component
 * Allows users to configure AI behavior defaults
 *
 * These settings serve as defaults that can be overridden
 * per individual chat (via AI Settings modal in chat header).
 *
 * Priority order: Chat Override > User Defaults > System Defaults
 */
export function AiConfigSettings({
  variant = "card",
  tabParamName = "tab",
}: AiConfigSettingsProps) {
  const {
    options,
    loadingOptions,
    userConfig,
    loadingUserConfig,
    updateUserConfig,
  } = useAiConfig();

  const [saving, setSaving] = useState(false);
  const [currentTab, setCurrentTab] = useTabState({
    defaultValue: "goals",
    paramName: tabParamName,
  });

  const handleUpdate = useCallback(
    async (field: keyof UpdateAiConfigurationDto, value: unknown) => {
      try {
        setSaving(true);
        await updateUserConfig({ [field]: value });
        toast.success("AI configuration updated");
      } catch {
        toast.error("Failed to update AI configuration");
      } finally {
        setSaving(false);
      }
    },
    [updateUserConfig],
  );

  // Loading state
  if (loadingOptions || loadingUserConfig) {
    const loadingContent = (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );

    if (variant === "embedded") {
      return loadingContent;
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>{loadingContent}</CardContent>
      </Card>
    );
  }

  // Error state
  if (!options || !userConfig) {
    const errorContent = (
      <p className="text-muted-foreground py-4">
        Unable to load AI configuration. Please try again.
      </p>
    );

    if (variant === "embedded") {
      return errorContent;
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>{errorContent}</CardContent>
      </Card>
    );
  }

  // Main content - the tabs with all the settings
  const settingsContent = (
    <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="goals" className="flex items-center gap-2">
          <Crosshair className="h-4 w-4" />
          Goals
        </TabsTrigger>
        <TabsTrigger value="style" className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Style
        </TabsTrigger>
        <TabsTrigger value="limits" className="flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Limits
        </TabsTrigger>
        <TabsTrigger value="language" className="flex items-center gap-2">
          <Languages className="h-4 w-4" />
          Language
        </TabsTrigger>
        <TabsTrigger value="advanced" className="flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Advanced
        </TabsTrigger>
      </TabsList>

      {/* Goals Tab */}
      <TabsContent value="goals" className="space-y-6 mt-6">
        {/* Goal Type */}
        <div className="space-y-2">
          <Label>AI Goal</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Choose the primary objective for your AI assistant. This determines
            how it responds to customers.
          </p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                value: "answer_faq",
                label: "Answer FAQs",
                description: "Answer questions using your knowledge base data",
                icon: "💬",
              },
              {
                value: "qualify_lead",
                label: "Qualify Leads",
                description:
                  "Ask discovery questions to qualify potential leads",
                icon: "🎯",
              },
              {
                value: "book_appointment",
                label: "Book Appointments",
                description: "Help customers schedule meetings or appointments",
                icon: "📅",
              },
              {
                value: "handle_support",
                label: "Handle Support",
                description: "Provide customer support and resolve issues",
                icon: "🛠️",
              },
              {
                value: "custom",
                label: "Custom Goal",
                description: "Define your own custom AI instructions below",
                icon: "✨",
              },
            ].map((goal) => (
              <button
                key={goal.value}
                type="button"
                onClick={() => handleUpdate("goalType", goal.value)}
                disabled={saving}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-all hover:bg-accent/50",
                  userConfig.goalType === goal.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border",
                )}
              >
                <span className="text-xl">{goal.icon}</span>
                <span className="font-medium text-sm">{goal.label}</span>
                <span className="text-xs text-muted-foreground">
                  {goal.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Goal Description */}
        <div className="space-y-2">
          <Label>
            {userConfig.goalType === "custom"
              ? "Custom Instructions"
              : "Additional Goal Context"}
          </Label>
          <Textarea
            value={userConfig.goalDescription || ""}
            onChange={(e) =>
              handleUpdate("goalDescription", e.target.value || null)
            }
            placeholder={
              userConfig.goalType === "custom"
                ? "Describe exactly what you want your AI to do..."
                : "Optional: Add specific context about how the AI should pursue this goal..."
            }
            disabled={saving}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            {userConfig.goalType === "custom"
              ? "This is the primary source of instructions for your AI. Be specific about what it should do."
              : "Provide extra context to refine the AI's behavior beyond the selected goal preset."}
          </p>
        </div>

        {/* Conversation Strategy */}
        <div className="space-y-2">
          <Label>Conversation Strategy</Label>
          <Select
            value={userConfig.conversationStrategy}
            onValueChange={(v) =>
              handleUpdate(
                "conversationStrategy",
                v as "direct" | "qualifying" | "guided",
              )
            }
            disabled={saving}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">
                <div className="flex flex-col">
                  <span>Direct</span>
                  <span className="text-xs text-muted-foreground">
                    Provide information immediately from the knowledge base
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="qualifying">
                <div className="flex flex-col">
                  <span>Qualifying</span>
                  <span className="text-xs text-muted-foreground">
                    Ask clarifying questions before providing detailed info
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="guided">
                <div className="flex flex-col">
                  <span>Guided</span>
                  <span className="text-xs text-muted-foreground">
                    Walk customers through a discovery process step by step
                  </span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Controls how the AI handles initial or vague messages from
            customers.
          </p>
        </div>
      </TabsContent>

      {/* Style Tab */}
      <TabsContent value="style" className="space-y-6 mt-6">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Tone */}
          <div className="space-y-2">
            <Label>Tone</Label>
            <Select
              value={userConfig.defaultTone}
              onValueChange={(v) => handleUpdate("defaultTone", v)}
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.tones.map((tone) => (
                  <SelectItem key={tone.value} value={tone.value}>
                    <div className="flex flex-col">
                      <span>{tone.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {tone.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Style */}
          <div className="space-y-2">
            <Label>Style</Label>
            <Select
              value={userConfig.defaultStyle}
              onValueChange={(v) => handleUpdate("defaultStyle", v)}
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.styles.map((style) => (
                  <SelectItem key={style.value} value={style.value}>
                    <div className="flex flex-col">
                      <span>{style.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {style.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Formality */}
          <div className="space-y-2">
            <Label>Formality</Label>
            <Select
              value={userConfig.formalityLevel}
              onValueChange={(v) => handleUpdate("formalityLevel", v)}
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.formalities.map((formality) => (
                  <SelectItem key={formality.value} value={formality.value}>
                    <div className="flex flex-col">
                      <span>{formality.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {formality.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Temperature Control */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Creativity (Temperature): {userConfig.temperature}%</Label>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="range"
              value={userConfig.temperature}
              onChange={(e) =>
                handleUpdate("temperature", parseInt(e.target.value))
              }
              min={0}
              max={100}
              step={5}
              disabled={saving}
              className={cn(
                "w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700",
                "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
                "[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full",
              )}
            />
            <span className="text-sm w-12 text-right">
              {userConfig.temperature}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Lower values make responses more focused and deterministic. Higher
            values make responses more creative and varied.
          </p>
        </div>

        {/* Max Response Length */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>
              Max Response Length: {userConfig.maxResponseLength} chars
            </Label>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="range"
              value={userConfig.maxResponseLength}
              onChange={(e) =>
                handleUpdate("maxResponseLength", parseInt(e.target.value))
              }
              min={100}
              max={2000}
              step={50}
              disabled={saving}
              className={cn(
                "w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700",
                "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
                "[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full",
              )}
            />
            <span className="text-sm w-16 text-right">
              {userConfig.maxResponseLength}
            </span>
          </div>
        </div>
      </TabsContent>

      {/* Limits Tab */}
      <TabsContent value="limits" className="space-y-6 mt-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Messages Per Hour */}
          <div className="space-y-2">
            <Label>Max AI Messages Per Hour</Label>
            <Input
              type="number"
              value={userConfig.maxMessagesPerHour}
              onChange={(e) =>
                handleUpdate("maxMessagesPerHour", parseInt(e.target.value))
              }
              min={1}
              max={100}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Limits the number of AI-generated messages per hour to prevent
              spam.
            </p>
          </div>

          {/* Messages Per Day */}
          <div className="space-y-2">
            <Label>Max AI Messages Per Day</Label>
            <Input
              type="number"
              value={userConfig.maxMessagesPerDay}
              onChange={(e) =>
                handleUpdate("maxMessagesPerDay", parseInt(e.target.value))
              }
              min={1}
              max={1000}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Daily limit for AI-generated messages.
            </p>
          </div>
        </div>

        {/* Min Delay */}
        <div className="space-y-2">
          <Label>
            Minimum Delay Between Messages (ms):{" "}
            {userConfig.minDelayBetweenMessagesMs}ms
          </Label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              value={userConfig.minDelayBetweenMessagesMs}
              onChange={(e) =>
                handleUpdate(
                  "minDelayBetweenMessagesMs",
                  parseInt(e.target.value),
                )
              }
              min={0}
              max={30000}
              step={500}
              disabled={saving}
              className={cn(
                "w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700",
                "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
                "[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full",
              )}
            />
            <span className="text-sm w-20 text-right">
              {userConfig.minDelayBetweenMessagesMs}ms
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Minimum time to wait between AI messages to seem more natural.
          </p>
        </div>
      </TabsContent>

      {/* Language Tab */}
      <TabsContent value="language" className="space-y-6 mt-6">
        <div className="space-y-2">
          <Label>Preferred Language</Label>
          <Select
            value={userConfig.languagePreference || "auto"}
            onValueChange={(v) =>
              handleUpdate("languagePreference", v === "auto" ? null : v)
            }
            disabled={saving}
          >
            <SelectTrigger>
              <SelectValue placeholder="Auto-detect" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="pt">Portuguese</SelectItem>
              <SelectItem value="fr">French</SelectItem>
              <SelectItem value="de">German</SelectItem>
              <SelectItem value="it">Italian</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Set a preferred language for AI responses, or let it auto-detect
            from the conversation.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Auto-translate Responses</Label>
            <p className="text-xs text-muted-foreground">
              Automatically translate AI responses to match the customer's
              language.
            </p>
          </div>
          <Switch
            checked={userConfig.autoTranslateResponses}
            onCheckedChange={(v) => handleUpdate("autoTranslateResponses", v)}
            disabled={saving}
          />
        </div>
      </TabsContent>

      {/* Advanced Tab */}
      <TabsContent value="advanced" className="space-y-6 mt-6">
        {/* Template behavior */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Template Behavior</h4>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Allow Free-text Replies (within 24h)</Label>
              <p className="text-xs text-muted-foreground">
                Allow AI to send free-text messages within the 24-hour window.
              </p>
            </div>
            <Switch
              checked={userConfig.allowFreeTextRepliesWithin24h}
              onCheckedChange={(v) =>
                handleUpdate("allowFreeTextRepliesWithin24h", v)
              }
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Prefer Templates After 24h</Label>
              <p className="text-xs text-muted-foreground">
                Prioritize template messages when outside the 24-hour window.
              </p>
            </div>
            <Switch
              checked={userConfig.preferTemplatesOver24h}
              onCheckedChange={(v) => handleUpdate("preferTemplatesOver24h", v)}
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-suggest Templates</Label>
              <p className="text-xs text-muted-foreground">
                Automatically suggest relevant templates based on conversation
                context.
              </p>
            </div>
            <Switch
              checked={userConfig.autoSuggestTemplates}
              onCheckedChange={(v) => handleUpdate("autoSuggestTemplates", v)}
              disabled={saving}
            />
          </div>
        </div>

        {/* Signature */}
        <div className="space-y-2">
          <Label>Required Signature</Label>
          <Textarea
            value={userConfig.requiredSignature || ""}
            onChange={(e) =>
              handleUpdate("requiredSignature", e.target.value || null)
            }
            placeholder="e.g., — Your Company Name"
            disabled={saving}
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            Optional signature to append to all AI messages.
          </p>
        </div>

        {/* Topics to avoid */}
        <div className="space-y-2">
          <Label>Topics to Avoid</Label>
          <Textarea
            value={(userConfig.avoidTopics || []).join(", ")}
            onChange={(e) =>
              handleUpdate(
                "avoidTopics",
                e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              )
            }
            placeholder="e.g., politics, religion, competitors"
            disabled={saving}
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated list of topics the AI should avoid discussing.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );

  // Return embedded variant (just the content)
  if (variant === "embedded") {
    return <div className="p-6">{settingsContent}</div>;
  }

  // Return card variant (default)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Behavior Configuration
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure how AI responds to your customers. These are default
          settings that can be overridden per chat.
        </p>
      </CardHeader>
      <CardContent>{settingsContent}</CardContent>
    </Card>
  );
}
