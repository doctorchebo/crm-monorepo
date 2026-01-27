"use client";

import { Badge } from "@/components/ui/badge";
import type { NodeProps } from "@xyflow/react";
import { MessageSquare, Tag, Target, Webhook, Zap } from "lucide-react";
import { memo } from "react";
import { BaseNode } from "./base-node";

interface TriggerNodeData {
  label: string;
  description?: string;
  config?: {
    triggerType?: string;
    filters?: Array<{ field: string; operator: string; value: string }>;
  };
  isEntryPoint?: boolean;
  isExitPoint?: boolean;
}

const TRIGGER_ICONS: Record<string, React.ReactNode> = {
  message: <MessageSquare className="h-4 w-4" />,
  webhook: <Webhook className="h-4 w-4" />,
  tag_added: <Tag className="h-4 w-4" />,
  stage_entered: <Target className="h-4 w-4" />,
  default: <Zap className="h-4 w-4" />,
};

export const TriggerNode = memo(function TriggerNode({
  data,
  selected,
}: NodeProps & { data: TriggerNodeData }) {
  const triggerType = data.config?.triggerType || "message";
  const icon = TRIGGER_ICONS[triggerType] || TRIGGER_ICONS.default;

  return (
    <BaseNode
      label={data.label}
      description={data.description}
      icon={icon}
      color="#22c55e"
      selected={selected}
      isEntryPoint={data.isEntryPoint}
      handles={{
        inputs: [], // Triggers have no inputs
        outputs: [{ id: "output" }],
      }}
    >
      {data.config?.filters && data.config.filters.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Filters:</p>
          {data.config.filters.slice(0, 2).map((filter, idx) => (
            <Badge key={idx} variant="secondary" className="text-[10px]">
              {filter.field} {filter.operator} {filter.value}
            </Badge>
          ))}
          {data.config.filters.length > 2 && (
            <span className="text-[10px] text-muted-foreground">
              +{data.config.filters.length - 2} more
            </span>
          )}
        </div>
      )}
    </BaseNode>
  );
});
