"use client";

import { Badge } from "@/components/ui/badge";
import type { NodeProps } from "@xyflow/react";
import { CheckCircle, CircleSlash, XCircle } from "lucide-react";
import { memo } from "react";
import { BaseNode } from "./base-node";

interface EndNodeData {
  label: string;
  description?: string;
  config?: {
    exitType?: "success" | "failure" | "cancelled";
    message?: string;
  };
  isEntryPoint?: boolean;
  isExitPoint?: boolean;
}

const EXIT_ICONS: Record<string, React.ReactNode> = {
  success: <CheckCircle className="h-4 w-4" />,
  failure: <XCircle className="h-4 w-4" />,
  cancelled: <CircleSlash className="h-4 w-4" />,
};

const EXIT_COLORS: Record<string, string> = {
  success: "#22c55e",
  failure: "#ef4444",
  cancelled: "#64748b",
};

export const EndNode = memo(function EndNode({
  data,
  selected,
}: NodeProps & { data: EndNodeData }) {
  const exitType = data.config?.exitType || "success";
  const icon = EXIT_ICONS[exitType] || EXIT_ICONS.success;
  const color = EXIT_COLORS[exitType] || EXIT_COLORS.success;

  return (
    <BaseNode
      label={data.label}
      description={data.description}
      icon={icon}
      color={color}
      selected={selected}
      isEntryPoint={data.isEntryPoint}
      isExitPoint={true}
      handles={{
        inputs: [{ id: "input" }],
        outputs: [], // End nodes have no outputs
      }}
    >
      <div className="space-y-1.5">
        <Badge
          variant="secondary"
          className="text-[10px]"
          style={{
            backgroundColor: `${color}20`,
            color: color,
          }}
        >
          {exitType}
        </Badge>
        {data.config?.message && (
          <p className="text-[10px] text-muted-foreground truncate">
            {data.config.message}
          </p>
        )}
      </div>
    </BaseNode>
  );
});
