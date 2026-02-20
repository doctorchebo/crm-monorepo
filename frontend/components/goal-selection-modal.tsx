"use client";

/**
 * Goal Selection Modal
 *
 * Shown when user resumes AI to let them select the AI goal for the conversation.
 * This ensures the AI knows what to focus on when resuming communication.
 *
 * Goals:
 * - answer_faq: Answer questions using knowledge base
 * - qualify_lead: Ask discovery questions to qualify leads
 * - book_appointment: Help customers schedule appointments
 * - handle_support: Provide customer support
 * - custom: Custom user-defined goal
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Bot, Loader2 } from "lucide-react";
import { useState } from "react";

export type GoalType =
  | "answer_faq"
  | "qualify_lead"
  | "book_appointment"
  | "handle_support"
  | "custom";

export interface GoalOption {
  value: GoalType;
  label: string;
  description: string;
  icon: string;
}

export const GOAL_OPTIONS: GoalOption[] = [
  {
    value: "answer_faq",
    label: "Answer FAQs",
    description: "Answer questions using your knowledge base data",
    icon: "💬",
  },
  {
    value: "qualify_lead",
    label: "Qualify Leads",
    description: "Ask discovery questions to qualify potential leads",
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
    description: "Define your own custom AI instructions",
    icon: "✨",
  },
];

interface GoalSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (goalType: GoalType, goalDescription?: string) => Promise<void>;
  chatName?: string;
  /** Initial goal type if previously set */
  initialGoalType?: GoalType;
}

export function GoalSelectionModal({
  open,
  onOpenChange,
  onConfirm,
  chatName,
  initialGoalType,
}: GoalSelectionModalProps) {
  const [selectedGoal, setSelectedGoal] = useState<GoalType>(
    initialGoalType || "answer_faq",
  );
  const [customDescription, setCustomDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(
        selectedGoal,
        selectedGoal === "custom" ? customDescription : undefined,
      );
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to resume AI with goal:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    // Reset to initial values
    setSelectedGoal(initialGoalType || "answer_faq");
    setCustomDescription("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-violet-500" />
            Resume AI Assistant
          </DialogTitle>
          <DialogDescription>
            {chatName
              ? `Select a goal for the AI when handling ${chatName}'s conversation.`
              : "Select a goal for the AI to focus on in this conversation."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Goal Selection Grid */}
          <div className="space-y-2">
            <Label>AI Goal</Label>
            <div className="grid gap-2 grid-cols-1">
              {GOAL_OPTIONS.map((goal) => (
                <button
                  key={goal.value}
                  type="button"
                  onClick={() => setSelectedGoal(goal.value)}
                  disabled={isSubmitting}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 text-left transition-all hover:bg-accent/50",
                    selectedGoal === goal.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border",
                  )}
                >
                  <span className="text-xl">{goal.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm block">
                      {goal.label}
                    </span>
                    <span className="text-xs text-muted-foreground block truncate">
                      {goal.description}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Goal Description */}
          {selectedGoal === "custom" && (
            <div className="space-y-2">
              <Label>Custom Instructions</Label>
              <Textarea
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="Describe exactly what you want the AI to do..."
                className="min-h-[80px]"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resuming...
              </>
            ) : (
              "Resume AI"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
