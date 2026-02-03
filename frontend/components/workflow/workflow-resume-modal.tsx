/**
 * Workflow Resume Modal
 *
 * Displayed when AI is re-enabled and a paused workflow needs user input
 * to decide where to continue execution.
 *
 * Features:
 * - Shows a visual representation of the workflow nodes
 * - Highlights the current (paused) node
 * - Allows user to select a valid node to resume from
 * - Options: Resume from selected, Restart from beginning, Cancel workflow
 *
 * Selectable Node Rules:
 * - Action nodes (send_message, send_template, etc.) - YES
 * - Condition nodes (ai_classification, keyword_match, etc.) - YES
 * - Delay nodes - YES
 * - Sub-workflow nodes - YES
 * - Trigger nodes - NO (can only restart from beginning)
 * - End nodes - NO (would immediately end the workflow)
 * - Internal/system nodes - NO
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  GitBranch,
  Hand,
  Loader2,
  Mail,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Tag,
  Timer,
  User,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

// ============================================================================
// Types
// ============================================================================

export interface WorkflowResumeNode {
  id: string;
  nodeType: string;
  label: string | null;
  positionX: number;
  positionY: number;
}

export interface WorkflowResumeConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string | null;
}

export interface WorkflowResumeState {
  workflowId: string | null;
  workflowName: string | null;
  isPaused: boolean;
  pauseReason: string | null;
  currentNodeId: string | null;
  currentNodeLabel: string | null;
  nodes: WorkflowResumeNode[];
  connections: WorkflowResumeConnection[];
}

export type ResumeAction = "resume" | "restart" | "cancel";

interface WorkflowResumeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowState: WorkflowResumeState | null;
  onResume: (nodeId: string | null, action: ResumeAction) => Promise<boolean>;
  isLoading?: boolean;
  /** Optional error message to display */
  error?: string | null;
}

// ============================================================================
// Node Type Utils
// ============================================================================

interface NodeTypeInfo {
  icon: React.ReactNode;
  color: string;
  label: string;
  /** Whether this node type can be selected as a resume point */
  isSelectable: boolean;
  /** Reason why node cannot be selected (if not selectable) */
  unselectableReason?: string;
}

/**
 * Determines if a node type can be selected as a resume point.
 *
 * Selectable: action, condition, delay, branch, sub_workflow
 * Not Selectable: trigger (use restart instead), end (would end immediately)
 */
function isNodeTypeSelectable(nodeType: string): boolean {
  const baseType = nodeType.split("_")[0];

  // Trigger nodes - can only restart from beginning
  if (baseType === "trigger") return false;

  // End nodes - would immediately end the workflow
  if (baseType === "end") return false;

  // All other nodes are selectable
  return true;
}

function getUnselectableReason(nodeType: string): string | undefined {
  const baseType = nodeType.split("_")[0];

  if (baseType === "trigger") {
    return "Trigger nodes cannot be selected. Use 'Restart from Beginning' instead.";
  }

  if (baseType === "end") {
    return "End nodes would immediately complete the workflow.";
  }

  return undefined;
}

const getNodeTypeInfo = (nodeType: string): NodeTypeInfo => {
  const isSelectable = isNodeTypeSelectable(nodeType);
  const unselectableReason = getUnselectableReason(nodeType);

  const typeMap: Record<
    string,
    Omit<NodeTypeInfo, "isSelectable" | "unselectableReason">
  > = {
    // Trigger nodes
    trigger: {
      icon: <Zap className="h-4 w-4" />,
      color:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
      label: "Trigger",
    },
    trigger_message: {
      icon: <MessageSquare className="h-4 w-4" />,
      color:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
      label: "Message Trigger",
    },
    trigger_time: {
      icon: <Clock className="h-4 w-4" />,
      color:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
      label: "Time Trigger",
    },
    trigger_webhook: {
      icon: <Zap className="h-4 w-4" />,
      color:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
      label: "Webhook Trigger",
    },
    trigger_manual: {
      icon: <Hand className="h-4 w-4" />,
      color:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
      label: "Manual Trigger",
    },
    trigger_tag: {
      icon: <Tag className="h-4 w-4" />,
      color:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
      label: "Tag Trigger",
    },
    trigger_stage_enter: {
      icon: <ChevronRight className="h-4 w-4" />,
      color:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
      label: "Stage Enter Trigger",
    },

    // Action nodes
    action: {
      icon: <Play className="h-4 w-4" />,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      label: "Action",
    },
    action_send_message: {
      icon: <Send className="h-4 w-4" />,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      label: "Send Message",
    },
    action_send_template: {
      icon: <Mail className="h-4 w-4" />,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      label: "Send Template",
    },
    action_move_stage: {
      icon: <ChevronRight className="h-4 w-4" />,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      label: "Move Stage",
    },
    action_assign_agent: {
      icon: <User className="h-4 w-4" />,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      label: "Assign Agent",
    },
    action_add_tag: {
      icon: <Tag className="h-4 w-4" />,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      label: "Add Tag",
    },
    action_remove_tag: {
      icon: <Tag className="h-4 w-4" />,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      label: "Remove Tag",
    },
    action_pause_ai: {
      icon: <Pause className="h-4 w-4" />,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      label: "Pause AI",
    },
    action_resume_ai: {
      icon: <Bot className="h-4 w-4" />,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      label: "Resume AI",
    },
    action_request_handoff: {
      icon: <Hand className="h-4 w-4" />,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      label: "Request Handoff",
    },
    action_send_email: {
      icon: <Mail className="h-4 w-4" />,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      label: "Send Email",
    },
    action_http_webhook: {
      icon: <Zap className="h-4 w-4" />,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      label: "HTTP Webhook",
    },

    // Condition nodes
    condition: {
      icon: <GitBranch className="h-4 w-4" />,
      color:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
      label: "Condition",
    },
    condition_ai_classification: {
      icon: <Bot className="h-4 w-4" />,
      color:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
      label: "AI Classification",
    },
    condition_keyword: {
      icon: <AlertCircle className="h-4 w-4" />,
      color:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
      label: "Keyword Match",
    },
    condition_keyword_match: {
      icon: <AlertCircle className="h-4 w-4" />,
      color:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
      label: "Keyword Match",
    },
    condition_contact_field: {
      icon: <User className="h-4 w-4" />,
      color:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
      label: "Contact Field",
    },
    condition_time: {
      icon: <Clock className="h-4 w-4" />,
      color:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
      label: "Time Condition",
    },
    condition_chat_property: {
      icon: <MessageSquare className="h-4 w-4" />,
      color:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
      label: "Chat Property",
    },
    condition_expression: {
      icon: <AlertCircle className="h-4 w-4" />,
      color:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
      label: "Expression",
    },

    // Delay nodes
    delay: {
      icon: <Timer className="h-4 w-4" />,
      color:
        "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
      label: "Delay",
    },

    // Branch nodes
    branch: {
      icon: <GitBranch className="h-4 w-4" />,
      color:
        "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300",
      label: "Branch",
    },

    // Sub-workflow nodes
    sub_workflow: {
      icon: <Workflow className="h-4 w-4" />,
      color:
        "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
      label: "Sub Workflow",
    },

    // End nodes
    end: {
      icon: <XCircle className="h-4 w-4" />,
      color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
      label: "End",
    },
  };

  const baseType = nodeType.split("_")[0];
  const info = typeMap[nodeType] ||
    typeMap[baseType] || {
      icon: <ChevronRight className="h-4 w-4" />,
      color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
      label: nodeType
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    };

  return {
    ...info,
    isSelectable,
    unselectableReason,
  };
};

// ============================================================================
// Component
// ============================================================================

export function WorkflowResumeModal({
  open,
  onOpenChange,
  workflowState,
  onResume,
  isLoading = false,
  error = null,
}: WorkflowResumeModalProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset selection when modal opens/closes
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setSelectedNodeId(null);
      } else {
        // Auto-select current node when opening (if it's selectable)
        const currentNode = workflowState?.nodes.find(
          (n) => n.id === workflowState?.currentNodeId,
        );
        if (currentNode) {
          const typeInfo = getNodeTypeInfo(currentNode.nodeType);
          if (typeInfo.isSelectable) {
            setSelectedNodeId(workflowState?.currentNodeId ?? null);
          }
        }
      }
      onOpenChange(open);
    },
    [onOpenChange, workflowState?.currentNodeId, workflowState?.nodes],
  );

  const handleAction = useCallback(
    async (action: ResumeAction) => {
      setIsSubmitting(true);
      try {
        await onResume(selectedNodeId, action);
        handleOpenChange(false);
      } finally {
        setIsSubmitting(false);
      }
    },
    [selectedNodeId, onResume, handleOpenChange],
  );

  // Sort nodes by position for display (top to bottom, left to right)
  const sortedNodes = useMemo(() => {
    return [...(workflowState?.nodes ?? [])].sort((a, b) => {
      // Sort by Y position first (top to bottom), then X (left to right)
      if (Math.abs(a.positionY - b.positionY) > 50) {
        return a.positionY - b.positionY;
      }
      return a.positionX - b.positionX;
    });
  }, [workflowState?.nodes]);

  // Count selectable nodes
  const selectableNodesCount = useMemo(() => {
    return sortedNodes.filter((node) => {
      const typeInfo = getNodeTypeInfo(node.nodeType);
      return typeInfo.isSelectable;
    }).length;
  }, [sortedNodes]);

  // Determine if the selected node is valid
  const isSelectedNodeValid = useMemo(() => {
    if (!selectedNodeId) return false;
    const node = workflowState?.nodes.find((n) => n.id === selectedNodeId);
    if (!node) return false;
    const typeInfo = getNodeTypeInfo(node.nodeType);
    return typeInfo.isSelectable;
  }, [selectedNodeId, workflowState?.nodes]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Resume Workflow
          </DialogTitle>
          <DialogDescription>
            {workflowState?.workflowName
              ? `The workflow "${workflowState.workflowName}" needs your input to continue.`
              : "A workflow needs your input to continue."}{" "}
            Select where the AI should resume execution.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Error Message */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3">
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Current State Info */}
            {workflowState?.currentNodeLabel && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="font-normal">
                    {workflowState.isPaused ? "Paused at" : "Current step"}
                  </Badge>
                  <span className="font-medium">
                    {workflowState.currentNodeLabel}
                  </span>
                </div>
                {workflowState.pauseReason && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Reason: {workflowState.pauseReason}
                  </p>
                )}
              </div>
            )}

            {/* Node Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">
                  Select a step to resume from:
                </label>
                <span className="text-xs text-muted-foreground">
                  {selectableNodesCount} selectable step
                  {selectableNodesCount !== 1 ? "s" : ""}
                </span>
              </div>
              <ScrollArea className="h-[300px] rounded-lg border">
                <div className="p-2 space-y-1">
                  {sortedNodes.map((node) => {
                    const typeInfo = getNodeTypeInfo(node.nodeType);
                    const isCurrent = node.id === workflowState?.currentNodeId;
                    const isSelected = node.id === selectedNodeId;
                    const canSelect = typeInfo.isSelectable;

                    return (
                      <TooltipProvider key={node.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "w-full flex items-center gap-3 p-3 rounded-lg transition-colors",
                                canSelect &&
                                  "hover:bg-accent hover:text-accent-foreground cursor-pointer",
                                !canSelect && "opacity-50 cursor-not-allowed",
                                isSelected &&
                                  canSelect &&
                                  "bg-primary/10 border-2 border-primary",
                                isCurrent &&
                                  !isSelected &&
                                  "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800",
                              )}
                              onClick={() =>
                                canSelect && setSelectedNodeId(node.id)
                              }
                              disabled={!canSelect}
                            >
                              <div
                                className={cn(
                                  "flex items-center justify-center h-8 w-8 rounded-lg shrink-0",
                                  typeInfo.color,
                                )}
                              >
                                {typeInfo.icon}
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                <div className="font-medium truncate">
                                  {node.label || typeInfo.label}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {typeInfo.label}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {isCurrent && (
                                  <Badge
                                    variant="outline"
                                    className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-600"
                                  >
                                    {workflowState?.isPaused
                                      ? "Paused Here"
                                      : "Current"}
                                  </Badge>
                                )}
                                {!canSelect && (
                                  <Badge
                                    variant="outline"
                                    className="text-gray-500 border-gray-300"
                                  >
                                    Not Selectable
                                  </Badge>
                                )}
                                {isSelected && canSelect && (
                                  <CheckCircle2 className="h-5 w-5 text-primary" />
                                )}
                              </div>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {canSelect ? (
                              <p>Click to select this step as resume point</p>
                            ) : (
                              <p>{typeInfo.unselectableReason}</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Help text */}
            <p className="text-xs text-muted-foreground">
              Select a step to continue the workflow from that point, or use the
              buttons below to restart or cancel.
            </p>
          </>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => handleAction("cancel")}
            disabled={isSubmitting || isLoading}
            className="text-destructive hover:text-destructive"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Cancel Workflow
          </Button>
          <Button
            variant="outline"
            onClick={() => handleAction("restart")}
            disabled={isSubmitting || isLoading}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restart from Beginning
          </Button>
          <Button
            onClick={() => handleAction("resume")}
            disabled={!isSelectedNodeValid || isSubmitting || isLoading}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Resume from Selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default WorkflowResumeModal;
