"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  backendApi,
  type SystemAiGoalPrompt,
  type UpdateGoalPromptDto,
} from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  Bot,
  Calendar,
  FileQuestion,
  HeadphonesIcon,
  Loader2,
  RefreshCw,
  Save,
  Shield,
  Target,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// Simple toast replacement
const toast = {
  success: (msg: string) => console.log(`✓ ${msg}`),
  error: (msg: string) => console.error(`✗ ${msg}`),
};

interface SystemAiPromptsSettingsProps {
  /**
   * Display variant:
   * - "card" (default): Wrapped in a Card component with header
   * - "embedded": No card wrapper, for use inside SettingsCategory
   */
  variant?: "card" | "embedded";
}

const GOAL_TYPE_ICONS: Record<string, React.ReactNode> = {
  answer_faq: <FileQuestion className="h-4 w-4" />,
  qualify_lead: <Target className="h-4 w-4" />,
  book_appointment: <Calendar className="h-4 w-4" />,
  handle_support: <HeadphonesIcon className="h-4 w-4" />,
  custom: <Wand2 className="h-4 w-4" />,
};

const GOAL_TYPE_COLORS: Record<string, string> = {
  answer_faq:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  qualify_lead:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  book_appointment:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  handle_support:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  custom: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

/**
 * System AI Prompts Settings Component
 *
 * Only visible to system administrators.
 * Allows modification of global AI goal prompts that apply to all users and teams.
 */
export function SystemAiPromptsSettings({
  variant = "card",
}: SystemAiPromptsSettingsProps) {
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prompts, setPrompts] = useState<SystemAiGoalPrompt[]>([]);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<UpdateGoalPromptDto>({});
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  // Check admin status and load prompts
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Check if user is system admin
        const adminCheck = await backendApi.systemAiPrompts.checkAdmin();
        setIsSystemAdmin(adminCheck.isSystemAdmin);

        if (adminCheck.isSystemAdmin) {
          // Load all prompts
          const promptsData = await backendApi.systemAiPrompts.getAllPrompts();
          setPrompts(promptsData);
        }
      } catch (error) {
        console.error("Failed to load system AI prompts:", error);
        setIsSystemAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleStartEdit = useCallback((prompt: SystemAiGoalPrompt) => {
    setEditingPrompt(prompt.goalType);
    setEditValues({
      displayName: prompt.displayName,
      description: prompt.description || "",
      promptTemplate: prompt.promptTemplate,
      isActive: prompt.isActive,
    });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingPrompt(null);
    setEditValues({});
  }, []);

  const handleSave = useCallback(
    async (goalType: string) => {
      try {
        setSaving(true);
        const updated = await backendApi.systemAiPrompts.updatePrompt(
          goalType,
          editValues,
        );
        setPrompts((prev) =>
          prev.map((p) => (p.goalType === goalType ? updated : p)),
        );
        setEditingPrompt(null);
        setEditValues({});
        toast.success("Prompt updated successfully");
      } catch (error) {
        console.error("Failed to update prompt:", error);
        toast.error("Failed to update prompt");
      } finally {
        setSaving(false);
      }
    },
    [editValues],
  );

  const handleReset = useCallback(async (goalType: string) => {
    try {
      setResetting(goalType);
      const reset = await backendApi.systemAiPrompts.resetPrompt(goalType);
      setPrompts((prev) =>
        prev.map((p) => (p.goalType === goalType ? reset : p)),
      );
      toast.success("Prompt reset to default");
    } catch (error) {
      console.error("Failed to reset prompt:", error);
      toast.error("Failed to reset prompt");
    } finally {
      setResetting(null);
    }
  }, []);

  // Loading state
  if (loading) {
    const loadingContent = (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );

    if (variant === "embedded") {
      return <div className="p-6">{loadingContent}</div>;
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            System AI Prompts
          </CardTitle>
        </CardHeader>
        <CardContent>{loadingContent}</CardContent>
      </Card>
    );
  }

  // Not a system admin - don't render anything
  if (!isSystemAdmin) {
    return null;
  }

  const content = (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 text-sm text-muted-foreground">
        <Shield className="h-4 w-4" />
        <span>
          These prompts apply globally to all users and teams. Changes take
          effect immediately.
        </span>
      </div>

      <Accordion type="single" collapsible className="w-full space-y-2">
        {prompts.map((prompt) => {
          const isEditing = editingPrompt === prompt.goalType;
          const isResettingThis = resetting === prompt.goalType;

          return (
            <AccordionItem
              key={prompt.goalType}
              value={prompt.goalType}
              className="border rounded-lg px-4"
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "p-2 rounded-md",
                      GOAL_TYPE_COLORS[prompt.goalType] ||
                        GOAL_TYPE_COLORS.custom,
                    )}
                  >
                    {GOAL_TYPE_ICONS[prompt.goalType] || (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className="font-medium">{prompt.displayName}</div>
                    <div className="text-sm text-muted-foreground">
                      {prompt.goalType}
                    </div>
                  </div>
                  {!prompt.isActive && (
                    <Badge variant="secondary" className="ml-2">
                      Inactive
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4 pb-2">
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`name-${prompt.goalType}`}>
                        Display Name
                      </Label>
                      <Input
                        id={`name-${prompt.goalType}`}
                        value={editValues.displayName || ""}
                        onChange={(e) =>
                          setEditValues((prev) => ({
                            ...prev,
                            displayName: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`desc-${prompt.goalType}`}>
                        Description
                      </Label>
                      <Input
                        id={`desc-${prompt.goalType}`}
                        value={editValues.description || ""}
                        onChange={(e) =>
                          setEditValues((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        placeholder="Brief description of this goal type"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`template-${prompt.goalType}`}>
                        Prompt Template
                      </Label>
                      <Textarea
                        id={`template-${prompt.goalType}`}
                        value={editValues.promptTemplate || ""}
                        onChange={(e) =>
                          setEditValues((prev) => ({
                            ...prev,
                            promptTemplate: e.target.value,
                          }))
                        }
                        className="min-h-[200px] font-mono text-sm"
                        placeholder="Enter the AI prompt instructions..."
                      />
                      <p className="text-xs text-muted-foreground">
                        This prompt defines how the AI behaves when this goal
                        type is selected by users.
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`active-${prompt.goalType}`}
                          checked={editValues.isActive ?? true}
                          onCheckedChange={(checked) =>
                            setEditValues((prev) => ({
                              ...prev,
                              isActive: checked,
                            }))
                          }
                        />
                        <Label htmlFor={`active-${prompt.goalType}`}>
                          Active
                        </Label>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSave(prompt.goalType)}
                          disabled={saving}
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Save className="h-4 w-4 mr-1" />
                          )}
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {prompt.description && (
                      <p className="text-sm text-muted-foreground">
                        {prompt.description}
                      </p>
                    )}
                    <div className="rounded-md bg-muted p-4">
                      <pre className="text-sm whitespace-pre-wrap font-mono">
                        {prompt.promptTemplate}
                      </pre>
                    </div>
                    <div className="flex justify-end gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isResettingThis}
                          >
                            {isResettingThis ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <RefreshCw className="h-4 w-4 mr-1" />
                            )}
                            Reset to Default
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Reset Prompt to Default?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This will restore the prompt for &quot;
                              {prompt.displayName}&quot; to its original default
                              value. Any custom changes will be lost. This
                              action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleReset(prompt.goalType)}
                            >
                              Reset to Default
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button size="sm" onClick={() => handleStartEdit(prompt)}>
                        Edit Prompt
                      </Button>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );

  if (variant === "embedded") {
    return <div className="p-6">{content}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          System AI Prompts
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
