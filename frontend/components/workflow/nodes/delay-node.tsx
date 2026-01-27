"use client";

import { Badge } from "@/components/ui/badge";
import type { NodeProps } from "@xyflow/react";
import { Clock } from "lucide-react";
import { memo } from "react";
import { BaseNode } from "./base-node";

interface DelayNodeData {
  label: string;
  description?: string;
  config?: {
    duration?: number;
    unit?: "seconds" | "minutes" | "hours" | "days";
    resumeCondition?: "timer" | "message_received" | "manual";
  };
  isEntryPoint?: boolean;
  isExitPoint?: boolean;
}

function formatDuration(duration: number, unit: string): string {
  const plural = duration !== 1 ? "s" : "";
  return `${duration} ${unit}${plural}`;
}

export const DelayNode = memo(function DelayNode({
  data,
  selected,
}: NodeProps & { data: DelayNodeData }) {
  const duration = data.config?.duration || 1;
  const unit = data.config?.unit || "minutes";
  const resumeCondition = data.config?.resumeCondition || "timer";

  return (
    <BaseNode
      label={data.label}
      description={data.description}
      icon={<Clock className="h-4 w-4" />}
      color="#8b5cf6"
      selected={selected}
      isEntryPoint={data.isEntryPoint}
      isExitPoint={data.isExitPoint}
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-sm font-medium">
            {formatDuration(duration, unit)}
          </span>
        </div>
        {resumeCondition !== "timer" && (
          <Badge variant="secondary" className="text-[10px]">
            {resumeCondition === "message_received"
              ? "Resume on message"
              : "Manual resume"}
          </Badge>
        )}
      </div>
    </BaseNode>
  );
});
