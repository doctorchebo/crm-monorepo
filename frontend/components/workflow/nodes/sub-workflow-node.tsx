"use client";

import { Badge } from "@/components/ui/badge";
import type { NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { memo } from "react";
import { BaseNode } from "./base-node";

interface SubWorkflowNodeData {
  label: string;
  description?: string;
  config?: {
    workflowId?: string;
    workflowName?: string;
    waitForCompletion?: boolean;
    inputMapping?: Record<string, string>;
    outputMapping?: Record<string, string>;
  };
  isEntryPoint?: boolean;
  isExitPoint?: boolean;
}

export const SubWorkflowNode = memo(function SubWorkflowNode({
  data,
  selected,
}: NodeProps & { data: SubWorkflowNodeData }) {
  const workflowName = data.config?.workflowName || "Select workflow";
  const waitForCompletion = data.config?.waitForCompletion ?? true;

  return (
    <BaseNode
      label={data.label}
      description={data.description}
      icon={<Zap className="h-4 w-4" />}
      color="#8b5cf6"
      selected={selected}
      isEntryPoint={data.isEntryPoint}
      isExitPoint={data.isExitPoint}
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium truncate">{workflowName}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px]">
            {waitForCompletion ? "Sync" : "Async"}
          </Badge>
          {data.config?.inputMapping && (
            <Badge variant="outline" className="text-[10px]">
              {Object.keys(data.config.inputMapping).length} inputs
            </Badge>
          )}
          {data.config?.outputMapping && (
            <Badge variant="outline" className="text-[10px]">
              {Object.keys(data.config.outputMapping).length} outputs
            </Badge>
          )}
        </div>
      </div>
    </BaseNode>
  );
});
