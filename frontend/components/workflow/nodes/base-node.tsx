"use client";

import { cn } from "@/lib/utils";
import { Handle, Position } from "@xyflow/react";
import { memo, type ReactNode } from "react";

interface BaseNodeProps {
  label: string;
  description?: string;
  icon: ReactNode;
  color: string;
  selected?: boolean;
  isEntryPoint?: boolean;
  isExitPoint?: boolean;
  handles?: {
    inputs?: Array<{ id: string; label?: string }>;
    outputs?: Array<{ id: string; label?: string; color?: string }>;
  };
  children?: ReactNode;
}

export const BaseNode = memo(function BaseNode({
  label,
  description,
  icon,
  color,
  selected,
  isEntryPoint,
  isExitPoint,
  handles,
  children,
}: BaseNodeProps) {
  const defaultInputs = handles?.inputs || [{ id: "input" }];
  const defaultOutputs = handles?.outputs || [{ id: "output" }];

  return (
    <div
      className={cn(
        "relative min-w-[180px] max-w-[280px] rounded-lg border-2 bg-background shadow-md transition-all",
        selected
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:border-primary/50",
      )}
    >
      {/* Entry point indicator */}
      {isEntryPoint && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-medium bg-green-500 text-white rounded-full">
          START
        </div>
      )}

      {/* Input handles */}
      {!isEntryPoint &&
        defaultInputs.map((input, idx) => (
          <Handle
            key={input.id}
            type="target"
            position={Position.Top}
            id={input.id}
            className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
            style={{
              left:
                defaultInputs.length > 1
                  ? `${((idx + 1) / (defaultInputs.length + 1)) * 100}%`
                  : "50%",
            }}
          />
        ))}

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-lg"
        style={{ backgroundColor: `${color}15` }}
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-white"
          style={{ backgroundColor: color }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{label}</p>
          {description && (
            <p className="text-xs text-muted-foreground truncate">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      {children && (
        <div className="px-3 py-2 border-t border-border/50">{children}</div>
      )}

      {/* Output handles */}
      {!isExitPoint &&
        defaultOutputs.map((output, idx) => (
          <Handle
            key={output.id}
            type="source"
            position={Position.Bottom}
            id={output.id}
            className={cn(
              "!w-3 !h-3 !border-2 !border-background",
              output.color ? "" : "!bg-muted-foreground",
            )}
            style={{
              left:
                defaultOutputs.length > 1
                  ? `${((idx + 1) / (defaultOutputs.length + 1)) * 100}%`
                  : "50%",
              backgroundColor: output.color,
            }}
          />
        ))}

      {/* Exit point indicator */}
      {isExitPoint && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-medium bg-red-500 text-white rounded-full">
          END
        </div>
      )}
    </div>
  );
});
