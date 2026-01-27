"use client";

import { Badge } from "@/components/ui/badge";
import type { NodeProps } from "@xyflow/react";
import {
  AlertCircle,
  ArrowRightLeft,
  Bot,
  Mail,
  MessageSquare,
  Tag,
  User,
  Webhook,
} from "lucide-react";
import { memo } from "react";
import { BaseNode } from "./base-node";

interface ActionNodeData {
  label: string;
  description?: string;
  config?: {
    actionType?: string;
    aiInstructions?: string;
    aiTone?: string;
    aiGoal?: string;
    moveStage?: { stageId: number };
    sendTemplate?: { templateId: number };
    sendMessage?: { message: string };
    assignAgent?: { agentId?: number; assignmentStrategy?: string };
  };
  isEntryPoint?: boolean;
  isExitPoint?: boolean;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  move_stage: <ArrowRightLeft className="h-4 w-4" />,
  send_template: <MessageSquare className="h-4 w-4" />,
  send_message: <MessageSquare className="h-4 w-4" />,
  assign_agent: <User className="h-4 w-4" />,
  add_tag: <Tag className="h-4 w-4" />,
  remove_tag: <Tag className="h-4 w-4" />,
  update_ai_instructions: <Bot className="h-4 w-4" />,
  pause_ai: <Bot className="h-4 w-4" />,
  resume_ai: <Bot className="h-4 w-4" />,
  request_handoff: <AlertCircle className="h-4 w-4" />,
  send_email: <Mail className="h-4 w-4" />,
  http_webhook: <Webhook className="h-4 w-4" />,
  default: <MessageSquare className="h-4 w-4" />,
};

export const ActionNode = memo(function ActionNode({
  data,
  selected,
}: NodeProps & { data: ActionNodeData }) {
  const actionType = data.config?.actionType || "send_message";
  const icon = ACTION_ICONS[actionType] || ACTION_ICONS.default;

  return (
    <BaseNode
      label={data.label}
      description={data.description}
      icon={icon}
      color="#3b82f6"
      selected={selected}
      isEntryPoint={data.isEntryPoint}
      isExitPoint={data.isExitPoint}
      handles={{
        inputs: [{ id: "input" }],
        outputs: data.isExitPoint ? [] : [{ id: "output" }],
      }}
    >
      <div className="space-y-1.5">
        <Badge variant="outline" className="text-[10px]">
          {actionType.replace(/_/g, " ")}
        </Badge>

        {/* AI Instructions preview */}
        {data.config?.aiInstructions && (
          <div className="text-[10px] text-muted-foreground">
            <span className="font-medium">AI:</span>{" "}
            {data.config.aiInstructions.slice(0, 50)}
            {data.config.aiInstructions.length > 50 && "..."}
          </div>
        )}

        {/* Send message preview */}
        {actionType === "send_message" && data.config?.sendMessage?.message && (
          <div className="text-[10px] text-muted-foreground truncate">
            "{data.config.sendMessage.message.slice(0, 40)}
            {data.config.sendMessage.message.length > 40 && "..."}"
          </div>
        )}

        {/* AI Tone badge */}
        {data.config?.aiTone && (
          <Badge variant="secondary" className="text-[10px]">
            {data.config.aiTone} tone
          </Badge>
        )}
      </div>
    </BaseNode>
  );
});
