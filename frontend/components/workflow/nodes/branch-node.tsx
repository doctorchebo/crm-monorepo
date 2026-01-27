"use client";

import { Badge } from "@/components/ui/badge";
import type { NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { memo } from "react";
import { BaseNode } from "./base-node";

interface BranchNodeData {
  label: string;
  description?: string;
  config?: {
    branches?: Array<{
      name: string;
      condition?: Record<string, unknown>;
    }>;
    defaultBranch?: string;
  };
  isEntryPoint?: boolean;
  isExitPoint?: boolean;
}

export const BranchNode = memo(function BranchNode({
  data,
  selected,
}: NodeProps & { data: BranchNodeData }) {
  const branches = data.config?.branches || [];

  // Generate outputs for each branch
  const outputs = branches.map((branch, idx) => ({
    id: branch.name || `branch_${idx}`,
    label: branch.name,
    color: `hsl(${(idx * 60) % 360}, 70%, 50%)`,
  }));

  // Add default branch if specified
  if (data.config?.defaultBranch) {
    outputs.push({
      id: "default",
      label: data.config.defaultBranch,
      color: "#64748b",
    });
  }

  return (
    <BaseNode
      label={data.label}
      description={data.description}
      icon={<GitBranch className="h-4 w-4" />}
      color="#8b5cf6"
      selected={selected}
      isEntryPoint={data.isEntryPoint}
      isExitPoint={data.isExitPoint}
      handles={{
        inputs: [{ id: "input" }],
        outputs: outputs.length > 0 ? outputs : [{ id: "output" }],
      }}
    >
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {branches.length} branch{branches.length !== 1 ? "es" : ""}
        </p>
        <div className="flex flex-wrap gap-1">
          {branches.slice(0, 3).map((branch, idx) => (
            <Badge key={idx} variant="secondary" className="text-[10px]">
              {branch.name}
            </Badge>
          ))}
          {branches.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{branches.length - 3}
            </span>
          )}
        </div>
      </div>
    </BaseNode>
  );
});
