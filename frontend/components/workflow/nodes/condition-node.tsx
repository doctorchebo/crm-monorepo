"use client";

import { Badge } from "@/components/ui/badge";
import { getConditionBranches } from "@/lib/workflow/branch-utils";
import type { NodeProps } from "@xyflow/react";
import { Bot, Clock, Filter, User } from "lucide-react";
import { memo, useMemo } from "react";
import { BaseNode } from "./base-node";

interface ConditionNodeData {
  label: string;
  description?: string;
  config?: Record<string, unknown>;
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
  const conditionType = (data.config?.conditionType as string) || "expression";
  const icon = CONDITION_ICONS[conditionType] || CONDITION_ICONS.default;

  // Get branches using centralized utility
  const branchConfig = useMemo(
    () => getConditionBranches(data.config),
    [data.config],
  );

  // Extract type-specific config for display
  const keywordMatch = data.config?.keywordMatch as
    | { keywords?: string[] }
    | undefined;
  const contactField = data.config?.contactField as
    | { fieldPath?: string; operator?: string }
    | undefined;
  const aiClassification = data.config?.aiClassification as
    | { categories?: Array<{ name: string; description?: string }> }
    | undefined;

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
        outputs: branchConfig.branches,
      }}
    >
      <div className="space-y-1.5">
        <Badge variant="outline" className="text-[10px]">
          {conditionType.replace(/_/g, " ")}
        </Badge>

        {/* AI Classification: Show category count and names */}
        {conditionType === "ai_classification" &&
          aiClassification?.categories && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">
                {aiClassification.categories.length} categories
              </p>
              <div className="flex flex-wrap gap-1">
                {aiClassification.categories.slice(0, 3).map((cat, idx) => (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="text-[10px]"
                    style={{
                      borderLeftWidth: 2,
                      borderLeftColor: branchConfig.branches[idx]?.color,
                    }}
                  >
                    {cat.name}
                  </Badge>
                ))}
                {aiClassification.categories.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{aiClassification.categories.length - 3}
                  </span>
                )}
              </div>
            </div>
          )}

        {/* Keyword Match: Show keywords */}
        {conditionType === "keyword_match" && keywordMatch?.keywords && (
          <div className="flex flex-wrap gap-1">
            {keywordMatch.keywords.slice(0, 3).map((kw, idx) => (
              <Badge key={idx} variant="secondary" className="text-[10px]">
                {kw}
              </Badge>
            ))}
            {keywordMatch.keywords.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{keywordMatch.keywords.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Contact Field: Show field and operator */}
        {conditionType === "contact_field" && contactField && (
          <p className="text-[10px] text-muted-foreground truncate">
            {contactField.fieldPath} {contactField.operator}
          </p>
        )}
      </div>
    </BaseNode>
  );
});
