"use client";

import { Badge } from "@/components/ui/badge";
import type { NodeProps } from "@xyflow/react";
import { Bot, Clock, Filter, User } from "lucide-react";
import { memo } from "react";
import { BaseNode } from "./base-node";

interface ConditionNodeData {
  label: string;
  description?: string;
  config?: {
    conditionType?: string;
    aiClassification?: {
      categories?: Array<{ name: string }>;
    };
    keywordMatch?: {
      keywords?: string[];
    };
    contactField?: {
      fieldPath?: string;
      operator?: string;
    };
  };
  isEntryPoint?: boolean;
  isExitPoint?: boolean;
}

const CONDITION_ICONS: Record<string, React.ReactNode> = {
  ai_classification: <Bot className="h-4 w-4" />,
  keyword_match: <Filter className="h-4 w-4" />,
  contact_field: <User className="h-4 w-4" />,
  time_based: <Clock className="h-4 w-4" />,
  default: <Filter className="h-4 w-4" />,
};

export const ConditionNode = memo(function ConditionNode({
  data,
  selected,
}: NodeProps & { data: ConditionNodeData }) {
  const conditionType = data.config?.conditionType || "expression";
  const icon = CONDITION_ICONS[conditionType] || CONDITION_ICONS.default;

  // Determine outputs based on condition type
  let outputs = [
    { id: "true", label: "Yes", color: "#22c55e" },
    { id: "false", label: "No", color: "#ef4444" },
  ];

  // AI classification has multiple outputs
  if (
    conditionType === "ai_classification" &&
    data.config?.aiClassification?.categories
  ) {
    outputs = data.config.aiClassification.categories.map((cat) => ({
      id: cat.name,
      label: cat.name,
      color: "#3b82f6",
    }));
    outputs.push({ id: "fallback", label: "Other", color: "#64748b" });
  }

  return (
    <BaseNode
      label={data.label}
      description={data.description}
      icon={icon}
      color="#f59e0b"
      selected={selected}
      isEntryPoint={data.isEntryPoint}
      handles={{
        inputs: [{ id: "input" }],
        outputs,
      }}
    >
      <div className="space-y-1.5">
        <Badge variant="outline" className="text-[10px]">
          {conditionType.replace("_", " ")}
        </Badge>

        {conditionType === "keyword_match" &&
          data.config?.keywordMatch?.keywords && (
            <div className="flex flex-wrap gap-1">
              {data.config.keywordMatch.keywords.slice(0, 3).map((kw, idx) => (
                <Badge key={idx} variant="secondary" className="text-[10px]">
                  {kw}
                </Badge>
              ))}
              {data.config.keywordMatch.keywords.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{data.config.keywordMatch.keywords.length - 3}
                </span>
              )}
            </div>
          )}

        {conditionType === "contact_field" && data.config?.contactField && (
          <p className="text-[10px] text-muted-foreground truncate">
            {data.config.contactField.fieldPath}{" "}
            {data.config.contactField.operator}
          </p>
        )}
      </div>
    </BaseNode>
  );
});
