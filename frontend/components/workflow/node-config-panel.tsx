"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type {
  WorkflowNode,
  WorkflowNodeType,
} from "@/lib/types/workflow.types";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface NodeConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
  onClose: () => void;
}

// Trigger type options
const TRIGGER_TYPES = [
  { value: "message", label: "Message Received" },
  { value: "webhook", label: "Webhook Triggered" },
  { value: "tag_added", label: "Tag Added" },
  { value: "stage_entered", label: "Stage Entered" },
  { value: "time_based", label: "Time-Based" },
];

// Action type options
const ACTION_TYPES = [
  { value: "send_message", label: "Send Message" },
  { value: "send_template", label: "Send Template" },
  { value: "move_stage", label: "Move to Stage" },
  { value: "assign_agent", label: "Assign Agent" },
  { value: "add_tag", label: "Add Tag" },
  { value: "remove_tag", label: "Remove Tag" },
  { value: "update_ai_instructions", label: "Update AI Instructions" },
  { value: "pause_ai", label: "Pause AI" },
  { value: "resume_ai", label: "Resume AI" },
  { value: "request_handoff", label: "Request Handoff" },
  { value: "http_webhook", label: "HTTP Webhook" },
];

// Condition type options
const CONDITION_TYPES = [
  { value: "message_contains", label: "Message Contains" },
  { value: "tag_exists", label: "Tag Exists" },
  { value: "stage_is", label: "Stage Is" },
  { value: "variable_equals", label: "Variable Equals" },
  { value: "ai_intent_detected", label: "AI Intent Detected" },
  { value: "time_condition", label: "Time Condition" },
  { value: "custom_expression", label: "Custom Expression" },
];

// Delay unit options
const DELAY_UNITS = [
  { value: "seconds", label: "Seconds" },
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
];

// End node completion types
const END_TYPES = [
  { value: "completed", label: "Completed Successfully" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "transferred", label: "Transferred" },
];

export function NodeConfigPanel({
  node,
  onUpdate,
  onClose,
}: NodeConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(
    (node.config as Record<string, unknown>) || {},
  );
  const [localName, setLocalName] = useState(node.name);
  const [localDescription, setLocalDescription] = useState(
    node.description || "",
  );

  /**
   * Reset local state ONLY when the selected node changes (different node.id).
   * This ensures:
   * 1. User's local edits are preserved while they're editing the same node
   * 2. State is properly initialized when switching to a different node
   *
   * IMPORTANT: Do NOT include node.name, node.description, or node.config in dependencies.
   * Those props are updated via onUpdate() which already updates the workflow state.
   * Including them would cause a circular update: user types → onUpdate → prop changes → effect resets state.
   */
  useEffect(() => {
    setLocalConfig((node.config as Record<string, unknown>) || {});
    setLocalName(node.name);
    setLocalDescription(node.description || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const updateConfig = useCallback(
    (key: string, value: unknown) => {
      const newConfig = { ...localConfig, [key]: value };
      setLocalConfig(newConfig);
      onUpdate(node.id, { config: newConfig });
    },
    [localConfig, node.id, onUpdate],
  );

  const handleNameChange = useCallback(
    (name: string) => {
      setLocalName(name);
      onUpdate(node.id, { name });
    },
    [node.id, onUpdate],
  );

  const handleDescriptionChange = useCallback(
    (description: string) => {
      setLocalDescription(description);
      onUpdate(node.id, { description: description || null });
    },
    [node.id, onUpdate],
  );

  const renderConfigFields = () => {
    switch (node.type as WorkflowNodeType) {
      case "trigger":
        return (
          <TriggerConfig config={localConfig} updateConfig={updateConfig} />
        );
      case "action":
        return (
          <ActionConfig config={localConfig} updateConfig={updateConfig} />
        );
      case "condition":
        return (
          <ConditionConfig config={localConfig} updateConfig={updateConfig} />
        );
      case "delay":
        return <DelayConfig config={localConfig} updateConfig={updateConfig} />;
      case "branch":
        return (
          <BranchConfig config={localConfig} updateConfig={updateConfig} />
        );
      case "sub_workflow":
        return (
          <SubWorkflowConfig config={localConfig} updateConfig={updateConfig} />
        );
      case "end":
        return <EndConfig config={localConfig} updateConfig={updateConfig} />;
      default:
        return null;
    }
  };

  return (
    <div className="w-80 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-semibold">Node Configuration</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Basic Info */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="node-name">Name</Label>
              <Input
                id="node-name"
                value={localName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Node name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="node-description">Description</Label>
              <Textarea
                id="node-description"
                value={localDescription}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder="Optional description"
                rows={2}
              />
            </div>
          </div>

          <Separator />

          {/* Type-specific config */}
          <div className="space-y-3">{renderConfigFields()}</div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ============================================================================
// Type-Specific Configuration Components
// ============================================================================

interface ConfigProps {
  config: Record<string, unknown>;
  updateConfig: (key: string, value: unknown) => void;
}

function TriggerConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <div className="space-y-2">
        <Label>Trigger Type</Label>
        <Select
          value={(config.triggerType as string) || "message"}
          onValueChange={(value) => updateConfig("triggerType", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select trigger type" />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {config.triggerType === "message" && (
        <div className="space-y-2">
          <Label>Filter Keywords (optional)</Label>
          <Input
            value={(config.keywords as string) || ""}
            onChange={(e) => updateConfig("keywords", e.target.value)}
            placeholder="Comma-separated keywords"
          />
        </div>
      )}

      {config.triggerType === "webhook" && (
        <div className="space-y-2">
          <Label>Webhook URL</Label>
          <Input
            value={(config.webhookUrl as string) || ""}
            onChange={(e) => updateConfig("webhookUrl", e.target.value)}
            placeholder="https://..."
          />
        </div>
      )}

      {config.triggerType === "tag_added" && (
        <div className="space-y-2">
          <Label>Tag Name</Label>
          <Input
            value={(config.tagName as string) || ""}
            onChange={(e) => updateConfig("tagName", e.target.value)}
            placeholder="Enter tag name"
          />
        </div>
      )}
    </>
  );
}

function ActionConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <div className="space-y-2">
        <Label>Action Type</Label>
        <Select
          value={(config.actionType as string) || "send_message"}
          onValueChange={(value) => updateConfig("actionType", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select action type" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {config.actionType === "send_message" && (
        <div className="space-y-2">
          <Label>Message</Label>
          <Textarea
            value={(config.sendMessage as { message?: string })?.message || ""}
            onChange={(e) =>
              updateConfig("sendMessage", { message: e.target.value })
            }
            placeholder="Enter message to send..."
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Use {"{"}variableName{"}"} for dynamic values
          </p>
        </div>
      )}

      {config.actionType === "update_ai_instructions" && (
        <>
          <div className="space-y-2">
            <Label>AI Instructions</Label>
            <Textarea
              value={(config.aiInstructions as string) || ""}
              onChange={(e) => updateConfig("aiInstructions", e.target.value)}
              placeholder="Enter AI instructions..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>AI Tone</Label>
            <Select
              value={(config.aiTone as string) || "professional"}
              onValueChange={(value) => updateConfig("aiTone", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>AI Goal</Label>
            <Input
              value={(config.aiGoal as string) || ""}
              onChange={(e) => updateConfig("aiGoal", e.target.value)}
              placeholder="E.g., Schedule appointment"
            />
          </div>
        </>
      )}

      {config.actionType === "add_tag" && (
        <div className="space-y-2">
          <Label>Tag Name</Label>
          <Input
            value={(config.tagName as string) || ""}
            onChange={(e) => updateConfig("tagName", e.target.value)}
            placeholder="Enter tag name"
          />
        </div>
      )}

      {config.actionType === "http_webhook" && (
        <>
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input
              value={(config.webhookUrl as string) || ""}
              onChange={(e) => updateConfig("webhookUrl", e.target.value)}
              placeholder="https://api.example.com/webhook"
            />
          </div>
          <div className="space-y-2">
            <Label>HTTP Method</Label>
            <Select
              value={(config.httpMethod as string) || "POST"}
              onValueChange={(value) => updateConfig("httpMethod", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </>
  );
}

function ConditionConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <div className="space-y-2">
        <Label>Condition Type</Label>
        <Select
          value={(config.conditionType as string) || "message_contains"}
          onValueChange={(value) => updateConfig("conditionType", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select condition type" />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {config.conditionType === "message_contains" && (
        <div className="space-y-2">
          <Label>Keywords</Label>
          <Input
            value={(config.keywords as string) || ""}
            onChange={(e) => updateConfig("keywords", e.target.value)}
            placeholder="word1, word2, word3"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated keywords (any match = true)
          </p>
        </div>
      )}

      {config.conditionType === "variable_equals" && (
        <>
          <div className="space-y-2">
            <Label>Variable Name</Label>
            <Input
              value={(config.variableName as string) || ""}
              onChange={(e) => updateConfig("variableName", e.target.value)}
              placeholder="variableName"
            />
          </div>
          <div className="space-y-2">
            <Label>Expected Value</Label>
            <Input
              value={(config.expectedValue as string) || ""}
              onChange={(e) => updateConfig("expectedValue", e.target.value)}
              placeholder="value"
            />
          </div>
        </>
      )}

      {config.conditionType === "ai_intent_detected" && (
        <div className="space-y-2">
          <Label>Intent</Label>
          <Input
            value={(config.intent as string) || ""}
            onChange={(e) => updateConfig("intent", e.target.value)}
            placeholder="E.g., purchase_intent, support_request"
          />
        </div>
      )}

      {config.conditionType === "custom_expression" && (
        <div className="space-y-2">
          <Label>Expression</Label>
          <Textarea
            value={(config.expression as string) || ""}
            onChange={(e) => updateConfig("expression", e.target.value)}
            placeholder="{{contact.tags}}.includes('vip')"
            rows={3}
          />
        </div>
      )}
    </>
  );
}

function DelayConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <div className="space-y-2">
        <Label>Delay Duration</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            value={(config.duration as number) || 1}
            onChange={(e) =>
              updateConfig("duration", parseInt(e.target.value) || 1)
            }
            className="w-24"
          />
          <Select
            value={(config.unit as string) || "minutes"}
            onValueChange={(value) => updateConfig("unit", value)}
          >
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DELAY_UNITS.map((unit) => (
                <SelectItem key={unit.value} value={unit.value}>
                  {unit.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Wait Until (optional)</Label>
        <Select
          value={(config.waitUntil as string) || "none"}
          onValueChange={(value) =>
            updateConfig("waitUntil", value === "none" ? null : value)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="No specific time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No specific time</SelectItem>
            <SelectItem value="business_hours">Business Hours</SelectItem>
            <SelectItem value="morning">Morning (9 AM)</SelectItem>
            <SelectItem value="afternoon">Afternoon (2 PM)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function BranchConfig({ config, updateConfig }: ConfigProps) {
  const branches = (config.branches as string[]) || ["Branch A", "Branch B"];

  const addBranch = () => {
    updateConfig("branches", [...branches, `Branch ${branches.length + 1}`]);
  };

  const updateBranch = (index: number, value: string) => {
    const newBranches = [...branches];
    newBranches[index] = value;
    updateConfig("branches", newBranches);
  };

  const removeBranch = (index: number) => {
    if (branches.length > 2) {
      updateConfig(
        "branches",
        branches.filter((_, i) => i !== index),
      );
    }
  };

  return (
    <>
      <div className="space-y-2">
        <Label>Branches</Label>
        <div className="space-y-2">
          {branches.map((branch, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={branch}
                onChange={(e) => updateBranch(index, e.target.value)}
                placeholder={`Branch ${index + 1}`}
              />
              {branches.length > 2 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeBranch(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={addBranch}>
          Add Branch
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Default Branch</Label>
        <Select
          value={(config.defaultBranch as string) || branches[0]}
          onValueChange={(value) => updateConfig("defaultBranch", value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {branches.map((branch) => (
              <SelectItem key={branch} value={branch}>
                {branch}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function SubWorkflowConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <div className="space-y-2">
        <Label>Sub-Workflow ID</Label>
        <Input
          value={(config.subWorkflowId as string) || ""}
          onChange={(e) => updateConfig("subWorkflowId", e.target.value)}
          placeholder="Select a workflow"
        />
        <p className="text-xs text-muted-foreground">
          The sub-workflow will be executed when this node is reached
        </p>
      </div>

      <div className="space-y-2">
        <Label>Wait for Completion</Label>
        <Select
          value={(config.waitForCompletion as boolean) ? "yes" : "no"}
          onValueChange={(value) =>
            updateConfig("waitForCompletion", value === "yes")
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Yes - Wait for sub-workflow</SelectItem>
            <SelectItem value="no">No - Continue immediately</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Pass Variables</Label>
        <Textarea
          value={(config.passVariables as string) || ""}
          onChange={(e) => updateConfig("passVariables", e.target.value)}
          placeholder="var1, var2, var3"
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated list of variables to pass
        </p>
      </div>
    </>
  );
}

function EndConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <div className="space-y-2">
        <Label>Completion Status</Label>
        <Select
          value={(config.endType as string) || "completed"}
          onValueChange={(value) => updateConfig("endType", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select completion status" />
          </SelectTrigger>
          <SelectContent>
            {END_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Completion Message (optional)</Label>
        <Textarea
          value={(config.completionMessage as string) || ""}
          onChange={(e) => updateConfig("completionMessage", e.target.value)}
          placeholder="Message to log when workflow ends"
          rows={2}
        />
      </div>

      {config.endType === "transferred" && (
        <div className="space-y-2">
          <Label>Transfer to Workflow</Label>
          <Input
            value={(config.transferWorkflowId as string) || ""}
            onChange={(e) => updateConfig("transferWorkflowId", e.target.value)}
            placeholder="Workflow ID to transfer to"
          />
        </div>
      )}
    </>
  );
}
