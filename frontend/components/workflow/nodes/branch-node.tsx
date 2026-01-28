"use client";

import { Badge } from "@/components/ui/badge";
import { getBranchNodeBranches } from "@/lib/workflow/branch-utils";
import type { NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { memo, useMemo } from "react";
import { BaseNode } from "./base-node";

interface BranchNodeData {
  label: string;
  description?: string;
  config?: Record<string, unknown>;
  isEntryPoint?: boolean;
  isExitPoint?: boolean;
}

export const BranchNode = memo(function BranchNode({
  data,
  selected,
}: NodeProps & { data: BranchNodeData }) {
  // Get branches using centralized utility
  const branchConfig = useMemo(
    () => getBranchNodeBranches(data.config),
    [data.config],
  );

  // Extract branch names for display (excluding default/fallback)
  const displayBranches = branchConfig.branches.filter(
    (b) => b.id !== "default",
  );

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
        outputs:
          branchConfig.branches.length > 0
            ? branchConfig.branches
            : [{ id: "output", label: "Default", color: "#64748b" }],
      }}
    >
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {displayBranches.length} branch
          {displayBranches.length !== 1 ? "es" : ""}
        </p>
        <div className="flex flex-wrap gap-1">
          {displayBranches.slice(0, 3).map((branch, idx) => (
            <Badge
              key={idx}
              variant="secondary"
              className="text-[10px]"
              style={{
                borderLeftWidth: 2,
                borderLeftColor: branch.color,
              }}
            >
              {branch.label}
            </Badge>
          ))}
          {displayBranches.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{displayBranches.length - 3}
            </span>
          )}
        </div>
      </div>
    </BaseNode>
  );
});
